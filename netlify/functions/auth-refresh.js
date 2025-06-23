/**
 * Token Refresh Endpoint
 * POST /api/auth/refresh
 */

const { 
  createSuccessResponse, 
  createErrorResponse,
  createUnauthorizedResponse,
  createCorsResponse,
  createMethodNotAllowedResponse,
  createInternalServerErrorResponse
} = require('./utils/response');
const { verifyRefreshToken, generateTokens, extractUserInfo, logUserActivity } = require('./utils/auth');
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
    
    // Validate refresh token presence
    if (!body.refreshToken || typeof body.refreshToken !== 'string') {
      return createErrorResponse(400, 'Refresh token is required');
    }
    
    // Extract user information for logging
    const userInfo = extractUserInfo(event);
    
    // Verify refresh token
    const verificationResult = await verifyRefreshToken(body.refreshToken);
    
    if (!verificationResult.success) {
      // Log failed refresh attempt if we have user info
      if (verificationResult.decoded && verificationResult.decoded.userId) {
        await logUserActivity(verificationResult.decoded.userId, 'token_refresh_failed', {
          reason: verificationResult.code,
          error: verificationResult.error
        }, userInfo);
      }
      
      return createUnauthorizedResponse(verificationResult.error);
    }
    
    const { user, tokenInfo } = verificationResult;
    
    // Double-check that user is still active
    if (!user.is_active) {
      await logUserActivity(user.id, 'token_refresh_failed', {
        reason: 'account_inactive'
      }, userInfo);
      
      return createUnauthorizedResponse('Account has been deactivated');
    }
    
    // Generate new token pair
    const tokens = generateTokens(user.id, user.email, {
      name: user.name,
      emailVerified: user.email_verified,
      previousTokenId: tokenInfo.tokenId
    });
    
    // Log successful token refresh
    await logUserActivity(user.id, 'token_refreshed', {
      previousTokenId: tokenInfo.tokenId,
      newTokenGenerated: true
    }, userInfo);
    
    // Return new tokens
    return createSuccessResponse({
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.accessTokenExpiresIn,
      tokenType: 'Bearer',
      user: userService.sanitizeUser(user)
    }, 'Token refreshed successfully');
    
  } catch (error) {
    console.error('Token refresh error:', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      userAgent: event.headers?.['user-agent'],
      ip: event.headers?.['x-forwarded-for']
    });
    
    // Handle specific error types
    if (error.message.includes('User not found')) {
      return createUnauthorizedResponse('User account no longer exists');
    }
    
    if (error.message.includes('Token verification failed')) {
      return createUnauthorizedResponse('Token verification failed. Please login again.');
    }
    
    if (error.message.includes('expired')) {
      return createUnauthorizedResponse('Refresh token has expired. Please login again.');
    }
    
    // Generic server error for unexpected issues
    return createInternalServerErrorResponse(
      process.env.NODE_ENV === 'development' 
        ? error.message 
        : 'Token refresh failed. Please login again.'
    );
  }
};