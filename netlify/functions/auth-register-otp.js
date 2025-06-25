/**
 * Registration OTP Sending Endpoint
 * POST /api/auth-register-otp
 * Step 1: Validate user data and send OTP to email
 */

const { 
  createSuccessResponse, 
  createErrorResponse, 
  createValidationErrorResponse,
  createConflictResponse,
  createCorsResponse,
  createMethodNotAllowedResponse,
  createInternalServerErrorResponse
} = require('./utils/response');
const { validateRegistrationData, sanitizeUserInput } = require('./utils/validation');
const { extractUserInfo } = require('./utils/auth');
const { supabaseAdmin } = require('./config/supabase');
const sgMail = require('@sendgrid/mail');

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

/**
 * Generate 4-digit OTP
 */
function generateOTP() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

/**
 * Send OTP email using SendGrid
 */
async function sendOTPEmail(email, otp, name) {
  const msg = {
    to: email,
    from: {
      email: process.env.SENDGRID_FROM_EMAIL || 'noreply@yourdomain.com',
      name: process.env.SENDGRID_FROM_NAME || 'Your App Name'
    },
    subject: 'Verify Your Email - Registration OTP',
    text: `Hello ${name},\n\nYour verification code is: ${otp}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this, please ignore this email.\n\nBest regards,\nYour App Team`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Verification</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            max-width: 600px; 
            margin: 0 auto; 
            padding: 20px; 
          }
          .container { 
            background: #f9f9f9; 
            padding: 30px; 
            border-radius: 10px; 
            text-align: center; 
          }
          .otp-box { 
            background: #667eea; 
            color: white; 
            font-size: 32px; 
            font-weight: bold; 
            padding: 20px; 
            margin: 20px 0; 
            border-radius: 8px; 
            letter-spacing: 5px; 
          }
          .warning { 
            background: #fff3cd; 
            color: #856404; 
            padding: 15px; 
            border-radius: 5px; 
            margin-top: 20px; 
          }
          .footer { 
            margin-top: 30px; 
            font-size: 14px; 
            color: #666; 
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>🔐 Email Verification</h2>
          <p>Hello <strong>${name}</strong>,</p>
          <p>Thank you for registering! Please use the verification code below to complete your registration:</p>
          
          <div class="otp-box">${otp}</div>
          
          <p>Enter this code in the verification form to activate your account.</p>
          
          <div class="warning">
            <strong>⏰ Important:</strong> This code will expire in 10 minutes for security reasons.
          </div>
          
          <div class="footer">
            <p>If you didn't request this verification, please ignore this email.</p>
            <p>For support, contact us at support@yourdomain.com</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    await sgMail.send(msg);
    return { success: true };
  } catch (error) {
    console.error('SendGrid error:', error);
    if (error.response) {
      console.error('SendGrid response:', error.response.body);
    }
    return { success: false, error: error.message };
  }
}

/**
 * Main handler function
 */
exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createCorsResponse();
  }
  
  if (event.httpMethod !== 'POST') {
    return createMethodNotAllowedResponse(['POST', 'OPTIONS']);
  }
  
  try {
    // Parse and validate request body
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return createErrorResponse(400, 'Invalid JSON in request body');
    }
    
    // Sanitize user input
    const allowedFields = ['email', 'password', 'name', 'phoneNumber', 'dateOfBirth', 'profileImageUrl'];
    const sanitizedData = sanitizeUserInput(body, allowedFields);
    
    // Validate input data
    const validation = validateRegistrationData(sanitizedData);
    if (!validation.isValid) {
      return createValidationErrorResponse(validation.errors, 'Please correct the following errors');
    }
    
    // Check if user already exists
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('email', sanitizedData.email.toLowerCase())
      .single();
    
    if (existingUser) {
      return createConflictResponse('An account with this email address already exists');
    }
    
    // Check if there's a pending OTP for this email (less than 10 minutes old)
    const tenMinutesAgo = new Date();
    tenMinutesAgo.setMinutes(tenMinutesAgo.getMinutes() - 10);
    
    const { data: existingOTP } = await supabaseAdmin
      .from('registration_otps')
      .select('*')
      .eq('email', sanitizedData.email.toLowerCase())
      .gte('created_at', tenMinutesAgo.toISOString())
      .single();
    
    if (existingOTP) {
      const timeSinceCreated = new Date() - new Date(existingOTP.created_at);
      const remainingTime = Math.ceil((10 * 60 * 1000 - timeSinceCreated) / 1000 / 60); // minutes
      
      return createErrorResponse(429, `OTP already sent to this email. Please wait ${remainingTime} minutes before requesting a new one.`);
    }
    
    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // 10 minutes expiry
    
    // Store OTP and user data temporarily
    const otpData = {
      email: sanitizedData.email.toLowerCase(),
      otp_hash: require('bcryptjs').hashSync(otp, 10), // Hash OTP for security
      user_data: sanitizedData,
      expires_at: expiresAt.toISOString(),
      created_at: new Date().toISOString(),
      attempts: 0,
      verified: false
    };
    
    // Store in database (temporary table)
    const { error: otpError } = await supabaseAdmin
      .from('registration_otps')
      .upsert([otpData], {
        onConflict: 'email'
      });
    
    if (otpError) {
      console.error('OTP storage error:', otpError);
      return createInternalServerErrorResponse('Failed to process registration. Please try again.');
    }
    
    // Send OTP email
    const emailResult = await sendOTPEmail(sanitizedData.email, otp, sanitizedData.name);
    
    if (!emailResult.success) {
      // Clean up OTP record if email failed
      await supabaseAdmin
        .from('registration_otps')
        .delete()
        .eq('email', sanitizedData.email.toLowerCase());
      
      return createInternalServerErrorResponse('Failed to send verification email. Please try again.');
    }
    
    // Extract user info for logging
    const userInfo = extractUserInfo(event);
    
    // Log OTP generation (without storing the actual OTP)
    console.log('OTP sent for registration:', {
      email: sanitizedData.email,
      timestamp: new Date().toISOString(),
      ip: userInfo.ipAddress,
      userAgent: userInfo.userAgent
    });
    
    return createSuccessResponse({
      email: sanitizedData.email,
      message: 'Verification code sent successfully',
      expiresIn: '10 minutes'
    }, `Verification code sent to ${sanitizedData.email}. Please check your inbox and enter the 4-digit code to complete registration.`);
    
  } catch (error) {
    console.error('Registration OTP error:', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      userAgent: event.headers?.['user-agent'],
      ip: event.headers?.['x-forwarded-for']
    });
    
    return createInternalServerErrorResponse('Failed to process registration. Please try again.');
  }
};