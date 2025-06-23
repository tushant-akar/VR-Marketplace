/**
 * User Registration Endpoint
 * POST /api/auth/register
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
const { generateTokens, extractUserInfo, logUserActivity } = require('./utils/auth');
const userService = require('./services/userService');

/**
 * Main handler function
 */
exports.handler = async (event, context) => {
  // Handle CORS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return createCorsResponse();
  }
  
  // Only allow POST method
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
    
    // Extract user information for logging
    const userInfo = extractUserInfo(event);
    
    // Create user account
    const user = await userService.createUser(sanitizedData, userInfo);
    
    // Generate authentication tokens
    const tokens = generateTokens(user.id, user.email, {
      name: user.name,
      emailVerified: user.email_verified
    });
    
    // Log successful registration
    await logUserActivity(user.id, 'registration_completed', {
      registrationMethod: 'email',
      userAgent: userInfo.userAgent
    }, userInfo);
    
    // Return success response with user data and tokens
    return createSuccessResponse({
      user,
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.accessTokenExpiresIn,
      tokenType: 'Bearer'
    }, 'Account created successfully! Welcome aboard!');
    
  } catch (error) {
    console.error('Registration error:', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      userAgent: event.headers?.['user-agent'],
      ip: event.headers?.['x-forwarded-for']
    });
    
    // Handle specific error types
    if (error.message.includes('already exists')) {
      return createConflictResponse('An account with this email address already exists');
    }
    
    if (error.message.includes('Auth creation failed')) {
      return createErrorResponse(400, 'Account creation failed. Please try again.');
    }
    
    if (error.message.includes('Profile creation failed')) {
      return createErrorResponse(500, 'Account setup failed. Please contact support.');
    }
    
    // Generic server error for unexpected issues
    return createInternalServerErrorResponse(
      process.env.NODE_ENV === 'development' 
        ? error.message 
        : 'Registration failed. Please try again.'
    );
  }
};