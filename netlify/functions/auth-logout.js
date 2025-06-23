/**
 * User Logout Endpoint
 * POST /api/auth/logout
 */

const { 
  createSuccessResponse, 
  createErrorResponse,
  createCorsResponse,
  createMethodNotAllowedResponse
} = require('./utils/response');
const { authenticateUser, extractUserInfo, logUserActivity } = require('./utils/auth');
const { supabaseAdmin } = require('./config/supabase');

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
    const userInfo = extractUserInfo(event);
    let userId = null;
    
    // Try to authenticate user (optional for logout)
    const authResult = await authenticateUser(event.headers.authorization);
    
    if (authResult.success) {
      userId = authResult.user.id;
      
      // Parse request body to get refresh token if provided
      let refreshToken = null;
      try {
        const body = JSON.parse(event.body || '{}');
        refreshToken = body.refreshToken;
      } catch (parseError) {
        // Ignore parsing errors for logout
      }
      
      // Invalidate refresh token if provided
      if (refreshToken) {
        await invalidateRefreshToken(refreshToken, userId);
      }
      
      // Invalidate all active sessions for this user (optional)
      if (event.body && JSON.parse(event.body).logoutFromAllDevices) {
        await invalidateAllUserSessions(userId);
      }
      
      // Log successful logout
      await logUserActivity(userId, 'logout_success', {
        logoutMethod: 'api',
        invalidatedRefreshToken: !!refreshToken,
        loggedOutFromAllDevices: !!(event.body && JSON.parse(event.body).logoutFromAllDevices)
      }, userInfo);
    }
    
    // Always return success for logout (even if token was invalid)
    // This prevents information leakage about valid/invalid tokens
    return createSuccessResponse(
      null, 
      'Successfully logged out. Thank you for using our service!'
    );
    
  } catch (error) {
    console.error('Logout error:', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      userAgent: event.headers?.['user-agent'],
      ip: event.headers?.['x-forwarded-for']
    });
    
    // Even if there's an error, we should return success for logout
    // to prevent information leakage and ensure the client clears tokens
    return createSuccessResponse(
      null, 
      'Successfully logged out. Thank you for using our service!'
    );
  }
};

/**
 * Invalidate a specific refresh token
 */
async function invalidateRefreshToken(refreshToken, userId) {
  try {
    // In a more sophisticated setup, you would maintain a blacklist
    // of revoked tokens or store active sessions in the database
    
    // For now, we'll mark the session as inactive if it exists
    // This assumes you're storing sessions in the user_sessions table
    
    const { error } = await supabaseAdmin
      .from('user_sessions')
      .update({ 
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('refresh_token_hash', hashToken(refreshToken));
    
    if (error) {
      console.error('Failed to invalidate refresh token:', error);
    }
  } catch (error) {
    console.error('Error invalidating refresh token:', error);
    // Don't throw error to avoid breaking logout flow
  }
}

/**
 * Invalidate all active sessions for a user
 */
async function invalidateAllUserSessions(userId) {
  try {
    const { error } = await supabaseAdmin
      .from('user_sessions')
      .update({ 
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('is_active', true);
    
    if (error) {
      console.error('Failed to invalidate all user sessions:', error);
    }
  } catch (error) {
    console.error('Error invalidating all user sessions:', error);
    // Don't throw error to avoid breaking logout flow
  }
}

/**
 * Simple token hashing function (should match the one used in auth utils)
 */
function hashToken(token) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(token).digest('hex');
}