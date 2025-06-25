/**
 * OTP Resend Endpoint with Advanced Management
 * netlify/functions/auth-resend-otp.js
 * Implements 1-minute OTP expiry with proper rate limiting and security
 */

const { createResponse, createErrorResponse, createSuccessResponse } = require('./utils/response');
const { supabaseAdmin } = require('./config/supabase');
const { validateEmail } = require('./utils/validation');
const bcrypt = require('bcryptjs');
const sgMail = require('@sendgrid/mail');

// Configure SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const OTP_EXPIRY_MINUTES = 1; // 1 minute expiry
const MAX_RESEND_ATTEMPTS = 3; // Max resends per hour
const RESEND_COOLDOWN_SECONDS = 30; // 30 seconds between resends
const MAX_VERIFICATION_ATTEMPTS = 5; // Max verification attempts per OTP

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, null, 'CORS preflight successful');
  }

  if (event.httpMethod !== 'POST') {
    return createErrorResponse(405, 'Method not allowed');
  }

  try {
    const { email } = JSON.parse(event.body || '{}');

    // Validate input
    const validation = validateResendOTPRequest({ email });
    if (!validation.isValid) {
      return createErrorResponse(400, { validationErrors: validation.errors }, 'Validation failed');
    }

    const sanitizedEmail = email.toLowerCase().trim();

    // Check rate limiting
    const rateLimitCheck = await checkRateLimit(sanitizedEmail);
    if (!rateLimitCheck.allowed) {
      return createErrorResponse(429, {
        code: 'RATE_LIMIT_EXCEEDED',
        message: rateLimitCheck.message,
        retryAfter: rateLimitCheck.retryAfter
      }, 'Too many requests');
    }

    // Check if there's a pending registration
    const { data: existingOTP, error: fetchError } = await supabaseAdmin
      .from('registration_otps')
      .select('*')
      .eq('email', sanitizedEmail)
      .eq('verified', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error fetching existing OTP:', fetchError);
      return createErrorResponse(500, 'Failed to check existing registration');
    }

    if (!existingOTP) {
      return createErrorResponse(404, {
        code: 'NO_PENDING_REGISTRATION',
        message: 'No pending registration found for this email'
      }, 'No pending registration found');
    }

    // Check if user has exceeded verification attempts
    if (existingOTP.attempts >= MAX_VERIFICATION_ATTEMPTS) {
      // Delete the expired/failed OTP record
      await supabaseAdmin
        .from('registration_otps')
        .delete()
        .eq('id', existingOTP.id);

      return createErrorResponse(400, {
        code: 'MAX_ATTEMPTS_EXCEEDED',
        message: 'Maximum verification attempts exceeded. Please start registration again.'
      }, 'Verification attempts exceeded');
    }

    // Generate new OTP
    const otpCode = generateOTP();
    const hashedOTP = await bcrypt.hash(otpCode, 12);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Update existing OTP record with new code and expiry
    const { error: updateError } = await supabaseAdmin
      .from('registration_otps')
      .update({
        otp_hash: hashedOTP,
        expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
        attempts: 0 // Reset attempts for new OTP
      })
      .eq('id', existingOTP.id);

    if (updateError) {
      console.error('Error updating OTP:', updateError);
      return createErrorResponse(500, 'Failed to generate new OTP');
    }

    // Log resend attempt
    await logOTPActivity(sanitizedEmail, 'otp_resent', {
      otp_id: existingOTP.id,
      previous_attempts: existingOTP.attempts,
      expiry_minutes: OTP_EXPIRY_MINUTES
    });

    // Send OTP via email
    const emailSent = await sendOTPEmail(sanitizedEmail, otpCode, existingOTP.user_data?.name);

    if (!emailSent) {
      return createErrorResponse(500, {
        code: 'EMAIL_SEND_FAILED',
        message: 'Failed to send OTP email. Please try again.'
      }, 'Failed to send OTP email');
    }

    // Get updated rate limit info for response
    const remainingAttempts = await getRemainingResendAttempts(sanitizedEmail);

    return createSuccessResponse({
      message: 'OTP resent successfully',
      expiryMinutes: OTP_EXPIRY_MINUTES,
      remainingResendAttempts: remainingAttempts,
      nextResendAllowedAt: new Date(Date.now() + RESEND_COOLDOWN_SECONDS * 1000).toISOString()
    }, 'OTP resent successfully');

  } catch (error) {
    console.error('Resend OTP error:', error);
    return createErrorResponse(500, 'Internal server error', error.message);
  }
};

/**
 * Validate resend OTP request
 */
function validateResendOTPRequest(data) {
  const errors = [];

  if (!data.email) {
    errors.push('Email is required');
  } else if (!validateEmail(data.email)) {
    errors.push('Valid email address is required');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Check rate limiting for OTP resends
 */
async function checkRateLimit(email) {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const cooldownTime = new Date(Date.now() - RESEND_COOLDOWN_SECONDS * 1000);

    // Check resends in the last hour
    const { data: hourlyResends, error: hourlyError } = await supabaseAdmin
      .from('vr_activity_logs')
      .select('*')
      .eq('activity_type', 'otp_resent')
      .contains('activity_data', { email })
      .gte('timestamp', oneHourAgo.toISOString());

    if (hourlyError) {
      console.error('Error checking hourly rate limit:', hourlyError);
      return { allowed: true }; // Allow if we can't check (fail open)
    }

    // Check if exceeded hourly limit
    if (hourlyResends && hourlyResends.length >= MAX_RESEND_ATTEMPTS) {
      const oldestResend = hourlyResends.reduce((oldest, current) => 
        new Date(current.timestamp) < new Date(oldest.timestamp) ? current : oldest
      );
      const resetTime = new Date(new Date(oldestResend.timestamp).getTime() + 60 * 60 * 1000);
      
      return {
        allowed: false,
        message: `Maximum ${MAX_RESEND_ATTEMPTS} resend attempts per hour exceeded`,
        retryAfter: Math.ceil((resetTime.getTime() - Date.now()) / 1000)
      };
    }

    // Check cooldown period
    const { data: recentResends, error: cooldownError } = await supabaseAdmin
      .from('vr_activity_logs')
      .select('*')
      .eq('activity_type', 'otp_resent')
      .contains('activity_data', { email })
      .gte('timestamp', cooldownTime.toISOString())
      .order('timestamp', { ascending: false })
      .limit(1);

    if (cooldownError) {
      console.error('Error checking cooldown:', cooldownError);
      return { allowed: true }; // Allow if we can't check
    }

    if (recentResends && recentResends.length > 0) {
      const lastResend = new Date(recentResends[0].timestamp);
      const remainingCooldown = RESEND_COOLDOWN_SECONDS - Math.floor((Date.now() - lastResend.getTime()) / 1000);
      
      if (remainingCooldown > 0) {
        return {
          allowed: false,
          message: `Please wait ${remainingCooldown} seconds before requesting another OTP`,
          retryAfter: remainingCooldown
        };
      }
    }

    return { allowed: true };
  } catch (error) {
    console.error('Rate limit check error:', error);
    return { allowed: true }; // Fail open
  }
}

/**
 * Get remaining resend attempts for the hour
 */
async function getRemainingResendAttempts(email) {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const { data: resends, error } = await supabaseAdmin
      .from('vr_activity_logs')
      .select('id')
      .eq('activity_type', 'otp_resent')
      .contains('activity_data', { email })
      .gte('timestamp', oneHourAgo.toISOString());

    if (error) {
      console.error('Error getting remaining attempts:', error);
      return MAX_RESEND_ATTEMPTS; // Return max if we can't check
    }

    return Math.max(0, MAX_RESEND_ATTEMPTS - (resends?.length || 0));
  } catch (error) {
    console.error('Error calculating remaining attempts:', error);
    return MAX_RESEND_ATTEMPTS;
  }
}

/**
 * Generate 6-digit OTP code
 */
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Send OTP via email using SendGrid
 */
async function sendOTPEmail(email, otpCode, userName = 'User') {
  if (!process.env.SENDGRID_API_KEY) {
    console.log('SendGrid not configured, OTP code:', otpCode);
    return true; // Return true for development
  }

  try {
    const msg = {
      to: email,
      from: {
        email: process.env.FROM_EMAIL || 'noreply@vr-supermarket.com',
        name: 'VR Supermarket'
      },
      subject: 'VR Supermarket - New Verification Code',
      html: generateOTPEmailTemplate(otpCode, userName),
      text: `Hi ${userName},\n\nYour new VR Supermarket verification code is: ${otpCode}\n\nThis code will expire in ${OTP_EXPIRY_MINUTES} minute.\n\nIf you didn't request this code, please ignore this email.\n\nBest regards,\nVR Supermarket Team`
    };

    await sgMail.send(msg);
    return true;
  } catch (error) {
    console.error('SendGrid email error:', error);
    return false;
  }
}

/**
 * Generate professional OTP email template
 */
function generateOTPEmailTemplate(otpCode, userName) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>VR Supermarket - New Verification Code</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: white; padding: 40px; border: 1px solid #e0e0e0; }
            .otp-code { background: #f8f9fa; border: 2px solid #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0; }
            .otp-number { font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 8px; font-family: monospace; }
            .warning { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 15px; margin: 20px 0; }
            .footer { background: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 10px 10px; font-size: 14px; color: #666; }
            .btn { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🛒 VR Supermarket</h1>
                <p>New Verification Code</p>
            </div>
            <div class="content">
                <h2>Hi ${userName},</h2>
                <p>You requested a new verification code for your VR Supermarket account. Here's your new code:</p>
                
                <div class="otp-code">
                    <p style="margin: 0; font-size: 16px; color: #666;">Your Verification Code</p>
                    <div class="otp-number">${otpCode}</div>
                    <p style="margin: 10px 0 0 0; font-size: 14px; color: #999;">Expires in ${OTP_EXPIRY_MINUTES} minute</p>
                </div>
                
                <div class="warning">
                    <strong>⏰ Important:</strong> This code expires in ${OTP_EXPIRY_MINUTES} minute for your security. Please use it immediately.
                </div>
                
                <p>Enter this code in your VR Supermarket app to complete your registration and start your virtual shopping experience!</p>
                
                <p>If you didn't request this code, please ignore this email. Your account remains secure.</p>
                
                <p>Need help? Contact our support team or visit our help center.</p>
                
                <p>Best regards,<br>The VR Supermarket Team</p>
            </div>
            <div class="footer">
                <p>© 2025 VR Supermarket. All rights reserved.</p>
                <p>This is an automated message. Please do not reply to this email.</p>
            </div>
        </div>
    </body>
    </html>
  `;
}

/**
 * Log OTP activity for monitoring and analytics
 */
async function logOTPActivity(email, activityType, activityData = {}) {
  try {
    await supabaseAdmin
      .from('vr_activity_logs')
      .insert([{
        user_id: null, // No user_id for OTP activities
        session_id: null,
        activity_type: activityType,
        activity_data: {
          email,
          ...activityData,
          timestamp: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      }]);
  } catch (error) {
    console.error('Failed to log OTP activity:', error);
    // Don't throw error for logging failures
  }
}

// =============================================
// Enhanced OTP Cleanup Function (add to database schema)
// =============================================

/** 
-- Add this function to your database schema for automatic cleanup
CREATE OR REPLACE FUNCTION cleanup_expired_otps()
RETURNS INTEGER AS $
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete expired and old OTPs
    DELETE FROM registration_otps 
    WHERE expires_at < NOW() 
    OR (verified = FALSE AND created_at < NOW() - INTERVAL '1 hour')
    OR (verified = TRUE AND created_at < NOW() - INTERVAL '24 hours');
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Log cleanup activity
    INSERT INTO vr_activity_logs (user_id, session_id, activity_type, activity_data, timestamp)
    VALUES (NULL, NULL, 'otp_cleanup', jsonb_build_object('deleted_count', deleted_count), NOW());
    
    RETURN deleted_count;
END;
$ LANGUAGE plpgsql;

-- Schedule cleanup to run every 5 minutes
-- Note: This would typically be done with a cron job or scheduled function
*/
//SELECT cron.schedule('cleanup-expired-otps', '*/5 * * * *', 'SELECT cleanup_expired_otps();');