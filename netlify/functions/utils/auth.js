/**
 * Authentication utility functions for JWT token management
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { supabaseAdmin } = require('../config/supabase');

// Validate required environment variables
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';

/**
 * Generate access and refresh tokens
 * @param {string} userId - User ID
 * @param {string} email - User email
 * @param {Object} additionalClaims - Additional claims to include in token
 * @returns {Object} - Token pair
 */
const generateTokens = (userId, email, additionalClaims = {}) => {
  const payload = {
    userId,
    email,
    ...additionalClaims,
    tokenType: 'access'
  };
  
  const refreshPayload = {
    userId,
    email,
    tokenType: 'refresh',
    tokenId: crypto.randomUUID()
  };
  
  const accessToken = jwt.sign(payload, JWT_SECRET, { 
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'auth-system',
    audience: 'auth-system-users'
  });
  
  const refreshToken = jwt.sign(refreshPayload, JWT_SECRET, { 
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
    issuer: 'auth-system',
    audience: 'auth-system-users'
  });
  
  return { 
    accessToken, 
    refreshToken,
    accessTokenExpiresIn: JWT_EXPIRES_IN,
    refreshTokenExpiresIn: REFRESH_TOKEN_EXPIRES_IN
  };
};

/**
 * Verify and decode JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object|null} - Decoded token payload or null if invalid
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET, {
      issuer: 'auth-system',
      audience: 'auth-system-users'
    });
  } catch (error) {
    console.error('Token verification failed:', error.message);
    return null;
  }
};

/**
 * Extract token from Authorization header
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} - Extracted token or null
 */
const extractTokenFromHeader = (authHeader) => {
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }
  
  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.substring(7).trim();
  return token.length > 0 ? token : null;
};

/**
 * Authenticate user from request headers
 * @param {string} authHeader - Authorization header value
 * @returns {Object} - Authentication result
 */
const authenticateUser = async (authHeader) => {
  const token = extractTokenFromHeader(authHeader);
  
  if (!token) {
    return { 
      success: false, 
      error: 'No authentication token provided',
      code: 'NO_TOKEN'
    };
  }

  const decoded = verifyToken(token);
  
  if (!decoded) {
    return { 
      success: false, 
      error: 'Invalid or expired authentication token',
      code: 'INVALID_TOKEN'
    };
  }
  
  // Check if it's an access token
  if (decoded.tokenType !== 'access') {
    return {
      success: false,
      error: 'Invalid token type',
      code: 'INVALID_TOKEN_TYPE'
    };
  }

  // Verify user still exists and is active in database
  try {
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', decoded.userId)
      .eq('is_active', true)
      .single();

    if (error || !user) {
      return { 
        success: false, 
        error: 'User not found or inactive',
        code: 'USER_NOT_FOUND'
      };
    }

    return { 
      success: true, 
      user, 
      decoded,
      tokenInfo: {
        userId: decoded.userId,
        email: decoded.email,
        iat: decoded.iat,
        exp: decoded.exp
      }
    };
  } catch (error) {
    console.error('User verification failed:', error);
    return {
      success: false,
      error: 'Authentication verification failed',
      code: 'VERIFICATION_FAILED'
    };
  }
};

/**
 * Verify refresh token and get user info
 * @param {string} refreshToken - Refresh token to verify
 * @returns {Object} - Verification result
 */
const verifyRefreshToken = async (refreshToken) => {
  if (!refreshToken || typeof refreshToken !== 'string') {
    return {
      success: false,
      error: 'No refresh token provided',
      code: 'NO_REFRESH_TOKEN'
    };
  }
  
  const decoded = verifyToken(refreshToken);
  
  if (!decoded) {
    return {
      success: false,
      error: 'Invalid or expired refresh token',
      code: 'INVALID_REFRESH_TOKEN'
    };
  }
  
  // Check if it's a refresh token
  if (decoded.tokenType !== 'refresh') {
    return {
      success: false,
      error: 'Invalid token type',
      code: 'INVALID_TOKEN_TYPE'
    };
  }
  
  // Verify user still exists and is active
  try {
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', decoded.userId)
      .eq('is_active', true)
      .single();

    if (error || !user) {
      return {
        success: false,
        error: 'User not found or inactive',
        code: 'USER_NOT_FOUND'
      };
    }

    return {
      success: true,
      user,
      decoded,
      tokenInfo: {
        userId: decoded.userId,
        email: decoded.email,
        tokenId: decoded.tokenId,
        iat: decoded.iat,
        exp: decoded.exp
      }
    };
  } catch (error) {
    console.error('Refresh token verification failed:', error);
    return {
      success: false,
      error: 'Token verification failed',
      code: 'VERIFICATION_FAILED'
    };
  }
};

/**
 * Generate secure random token for password reset, etc.
 * @param {number} length - Token length in bytes (default: 32)
 * @returns {string} - Secure random token
 */
const generateSecureToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Hash token for secure storage
 * @param {string} token - Token to hash
 * @returns {string} - Hashed token
 */
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Generate password reset token with expiration
 * @param {string} userId - User ID
 * @returns {Object} - Password reset token info
 */
const generatePasswordResetToken = async (userId) => {
  const token = generateSecureToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour expiration
  
  try {
    // Store token in database
    const { data, error } = await supabaseAdmin
      .from('password_reset_tokens')
      .insert([{
        user_id: userId,
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString()
      }])
      .select()
      .single();
    
    if (error) {
      throw error;
    }
    
    return {
      success: true,
      token, // Only return the plain token to send via email
      tokenId: data.id,
      expiresAt: expiresAt.toISOString()
    };
  } catch (error) {
    console.error('Failed to generate password reset token:', error);
    return {
      success: false,
      error: 'Failed to generate reset token'
    };
  }
};

/**
 * Verify password reset token
 * @param {string} token - Password reset token
 * @returns {Object} - Verification result
 */
const verifyPasswordResetToken = async (token) => {
  if (!token) {
    return {
      success: false,
      error: 'No reset token provided'
    };
  }
  
  const tokenHash = hashToken(token);
  
  try {
    const { data: resetToken, error } = await supabaseAdmin
      .from('password_reset_tokens')
      .select('*, users!inner(*)')
      .eq('token_hash', tokenHash)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .single();
    
    if (error || !resetToken) {
      return {
        success: false,
        error: 'Invalid or expired reset token'
      };
    }
    
    return {
      success: true,
      userId: resetToken.user_id,
      user: resetToken.users,
      tokenId: resetToken.id
    };
  } catch (error) {
    console.error('Failed to verify password reset token:', error);
    return {
      success: false,
      error: 'Token verification failed'
    };
  }
};

/**
 * Mark password reset token as used
 * @param {string} tokenId - Token ID to mark as used
 * @returns {Object} - Operation result
 */
const markResetTokenAsUsed = async (tokenId) => {
  try {
    const { error } = await supabaseAdmin
      .from('password_reset_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', tokenId);
    
    if (error) {
      throw error;
    }
    
    return { success: true };
  } catch (error) {
    console.error('Failed to mark reset token as used:', error);
    return {
      success: false,
      error: 'Failed to update token status'
    };
  }
};

/**
 * Extract user information from request (IP, User-Agent, etc.)
 * @param {Object} event - Netlify event object
 * @returns {Object} - Extracted user information
 */
const extractUserInfo = (event) => {
  const headers = event.headers || {};
  
  return {
    ipAddress: headers['x-forwarded-for'] || headers['x-real-ip'] || 'unknown',
    userAgent: headers['user-agent'] || 'unknown',
    origin: headers['origin'] || 'unknown',
    referer: headers['referer'] || 'unknown'
  };
};

/**
 * Log user activity
 * @param {string} userId - User ID
 * @param {string} action - Action performed
 * @param {Object} details - Additional details
 * @param {Object} userInfo - User info (IP, User-Agent, etc.)
 * @returns {Promise<void>}
 */
const logUserActivity = async (userId, action, details = {}, userInfo = {}) => {
  try {
    await supabaseAdmin
      .from('user_activity_logs')
      .insert([{
        user_id: userId,
        action,
        details,
        ip_address: userInfo.ipAddress,
        user_agent: userInfo.userAgent
      }]);
  } catch (error) {
    console.error('Failed to log user activity:', error);
    // Don't throw error to avoid breaking the main flow
  }
};

/**
 * Check if user has specific permissions (for future role-based access)
 * @param {Object} user - User object
 * @param {Array} requiredPermissions - Array of required permissions
 * @returns {boolean} - True if user has all required permissions
 */
const hasPermissions = (user, requiredPermissions = []) => {
  if (!user || !user.is_active) return false;
  
  // For now, all active users have basic permissions
  // This can be extended to support role-based permissions
  const userPermissions = user.permissions || ['read:profile', 'update:profile'];
  
  return requiredPermissions.every(permission => 
    userPermissions.includes(permission)
  );
};

module.exports = {
  generateTokens,
  verifyToken,
  extractTokenFromHeader,
  authenticateUser,
  verifyRefreshToken,
  generateSecureToken,
  hashToken,
  generatePasswordResetToken,
  verifyPasswordResetToken,
  markResetTokenAsUsed,
  extractUserInfo,
  logUserActivity,
  hasPermissions
};