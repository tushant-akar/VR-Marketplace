/**
 * Registration OTP Verification Endpoint
 * POST /api/auth-register-verify
 * Step 2: Verify OTP and complete user registration
 */

const { 
  createSuccessResponse, 
  createErrorResponse, 
  createValidationErrorResponse,
  createUnauthorizedResponse,
  createCorsResponse,
  createMethodNotAllowedResponse,
  createInternalServerErrorResponse
} = require('./utils/response');
const { sanitizeUserInput } = require('./utils/validation');
const { generateTokens, extractUserInfo, logUserActivity } = require('./utils/auth');
const userService = require('./services/userService');
const { supabaseAdmin } = require('./config/supabase');
const bcrypt = require('bcryptjs');

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
    const sanitizedData = sanitizeUserInput(body, ['email', 'otp']);
    
    // Validate required fields
    if (!sanitizedData.email || !sanitizedData.otp) {
      return createValidationErrorResponse(['Email and OTP are required'], 'Missing required fields');
    }
    
    // Validate OTP format (4 digits)
    if (!/^\d{4}$/.test(sanitizedData.otp)) {
      return createValidationErrorResponse(['OTP must be a 4-digit number'], 'Invalid OTP format');
    }
    
    const email = sanitizedData.email.toLowerCase();
    const enteredOTP = sanitizedData.otp;
    
    // Get OTP record from database
    const { data: otpRecord, error: otpError } = await supabaseAdmin
      .from('registration_otps')
      .select('*')
      .eq('email', email)
      .eq('verified', false)
      .single();
    
    if (otpError || !otpRecord) {
      return createUnauthorizedResponse('Invalid or expired verification code. Please request a new one.');
    }
    
    // Check if OTP is expired
    const now = new Date();
    const expiresAt = new Date(otpRecord.expires_at);
    
    if (now > expiresAt) {
      // Clean up expired OTP
      await supabaseAdmin
        .from('registration_otps')
        .delete()
        .eq('email', email);
      
      return createUnauthorizedResponse('Verification code has expired. Please request a new one.');
    }
    
    // Check attempt limit (max 5 attempts)
    if (otpRecord.attempts >= 5) {
      // Clean up OTP record after too many attempts
      await supabaseAdmin
        .from('registration_otps')
        .delete()
        .eq('email', email);
      
      return createUnauthorizedResponse('Too many invalid attempts. Please request a new verification code.');
    }
    
    // Verify OTP
    const isValidOTP = bcrypt.compareSync(enteredOTP, otpRecord.otp_hash);
    
    if (!isValidOTP) {
      // Increment attempt count
      await supabaseAdmin
        .from('registration_otps')
        .update({ 
          attempts: otpRecord.attempts + 1,
          updated_at: new Date().toISOString()
        })
        .eq('email', email);
      
      const remainingAttempts = 5 - (otpRecord.attempts + 1);
      
      return createUnauthorizedResponse(
        remainingAttempts > 0 
          ? `Invalid verification code. ${remainingAttempts} attempts remaining.`
          : 'Invalid verification code. No attempts remaining.'
      );
    }
    
    // OTP is valid - proceed with user registration
    const userData = otpRecord.user_data;
    const userInfo = extractUserInfo(event);
    
    try {
      // Create user account
      const user = await userService.createUser(userData, userInfo);
      
      // Mark OTP as verified and clean up
      await supabaseAdmin
        .from('registration_otps')
        .update({ 
          verified: true,
          verified_at: new Date().toISOString()
        })
        .eq('email', email);
      
      // Clean up OTP record after successful registration (optional)
      setTimeout(async () => {
        await supabaseAdmin
          .from('registration_otps')
          .delete()
          .eq('email', email);
      }, 5000); // Delete after 5 seconds
      
      // Generate authentication tokens
      const tokens = generateTokens(user.id, user.email, {
        name: user.name,
        emailVerified: true,
        registrationMethod: 'email_otp'
      });
      
      // Log successful registration
      await logUserActivity(user.id, 'registration_completed_otp', {
        registrationMethod: 'email_otp',
        emailVerified: true,
        userAgent: userInfo.userAgent
      }, userInfo);
      
      return createSuccessResponse({
        user,
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.accessTokenExpiresIn,
        tokenType: 'Bearer'
      }, `Account created successfully! Welcome aboard, ${user.name}!`);
      
    } catch (registrationError) {
      console.error('User registration error:', registrationError);
      
      // Handle specific registration errors
      if (registrationError.message.includes('already exists')) {
        // Clean up OTP if user somehow already exists
        await supabaseAdmin
          .from('registration_otps')
          .delete()
          .eq('email', email);
        
        return createErrorResponse(409, 'An account with this email address already exists');
      }
      
      return createInternalServerErrorResponse('Registration failed after verification. Please contact support.');
    }
    
  } catch (error) {
    console.error('Registration verification error:', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      userAgent: event.headers?.['user-agent'],
      ip: event.headers?.['x-forwarded-for']
    });
    
    return createInternalServerErrorResponse('Verification failed. Please try again.');
  }
};