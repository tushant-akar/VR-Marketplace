/**
 * User Login Endpoint
 * POST /api/auth/login
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
const { validateLoginData, sanitizeUserInput } = require('./utils/validation');
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
    const allowedFields = ['email', 'password', 'rememberMe'];
    const sanitizedData = sanitizeUserInput(body, allowedFields);
    
    // Validate input data
    const validation = validateLoginData(sanitizedData);
    if (!validation.isValid) {
      return createValidationErrorResponse(validation.errors, 'Please provide valid login credentials');
    }
    
    // Extract user information for logging
    const userInfo = extractUserInfo(event);
    
    // Authenticate user
    const user = await userService.authenticateUser(
      sanitizedData.email, 
      sanitizedData.password, 
      userInfo
    );
    
    // Check if account is active
    if (!user.is_active) {
      await logUserActivity(user.id, 'login_failed', {
        reason: 'account_inactive'
      }, userInfo);
      
      return createUnauthorizedResponse('Your account has been deactivated. Please contact support.');
    }
    
    // Generate authentication tokens
    const tokenExpiry = sanitizedData.rememberMe ? '30d' : process.env.JWT_EXPIRES_IN;
    const tokens = generateTokens(user.id, user.email, {
      name: user.name,
      emailVerified: user.email_verified,
      rememberMe: sanitizedData.rememberMe || false
    });
    
    // Log successful login
    await logUserActivity(user.id, 'login_success', {
      loginMethod: 'email_password',
      rememberMe: sanitizedData.rememberMe || false,
      userAgent: userInfo.userAgent
    }, userInfo);
    
    // Return success response with user data and tokens
    return createSuccessResponse({
      user,
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.accessTokenExpiresIn,
      tokenType: 'Bearer'
    }, `Welcome back, ${user.name}!`);
    
  } catch (error) {
    console.error('Login error:', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      userAgent: event.headers?.['user-agent'],
      ip: event.headers?.['x-forwarded-for']
    });
    
    // Handle specific error types
    if (error.message === 'Invalid email or password') {
      return createUnauthorizedResponse('Invalid email or password. Please check your credentials and try again.');
    }
    
    if (error.message.includes('User not found')) {
      return createUnauthorizedResponse('Invalid email or password. Please check your credentials and try again.');
    }
    
    if (error.message.includes('too many requests')) {
      return createErrorResponse(429, 'Too many login attempts. Please try again later.');
    }
    
    // Generic server error for unexpected issues
    return createInternalServerErrorResponse(
      process.env.NODE_ENV === 'development' 
        ? error.message 
        : 'Login failed. Please try again.'
    );
  }
};