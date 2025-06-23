/**
 * Change Password Endpoint
 * POST /api/auth/change-password
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
const { validatePasswordChangeData, sanitizeUserInput } = require('./utils/validation');
const { authenticateUser, extractUserInfo, logUserActivity } = require('./utils/auth');
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
    // Authenticate user
    const authResult = await authenticateUser(event.headers.authorization);
    if (!authResult.success) {
      return createUnauthorizedResponse(authResult.error);
    }
    
    const { user } = authResult;
    const userInfo = extractUserInfo(event);
    
    // Parse and validate request body
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return createErrorResponse(400, 'Invalid JSON in request body');
    }
    
    // Sanitize user input
    const allowedFields = ['currentPassword', 'newPassword'];
    const sanitizedData = sanitizeUserInput(body, allowedFields);
    
    // Validate password change data
    const validation = validatePasswordChangeData(sanitizedData);
    if (!validation.isValid) {
      return createValidationErrorResponse(validation.errors, 'Please correct the following errors');
    }
    
    // Change password
    await userService.changePassword(
      user.id, 
      sanitizedData.currentPassword, 
      sanitizedData.newPassword,
      userInfo
    );
    
    // Log successful password change
    await logUserActivity(user.id, 'password_changed_success', {
      changeMethod: 'user_initiated',
      userAgent: userInfo.userAgent
    }, userInfo);
    
    return createSuccessResponse(
      null, 
      'Password changed successfully. Please use your new password for future logins.'
    );
    
  } catch (error) {
    console.error('Change password error:', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      userAgent: event.headers?.['user-agent'],
      ip: event.headers?.['x-forwarded-for']
    });
    
    // Handle specific error types
    if (error.message === 'Current password is incorrect') {
      return createErrorResponse(400, 'Current password is incorrect. Please try again.');
    }
    
    if (error.message === 'User not found') {
      return createUnauthorizedResponse('User account not found');
    }
    
    if (error.message.includes('Password update failed')) {
      return createErrorResponse(500, 'Failed to update password. Please try again.');
    }
    
    // Generic server error for unexpected issues
    return createInternalServerErrorResponse(
      process.env.NODE_ENV === 'development' 
        ? error.message 
        : 'Password change failed. Please try again.'
    );
  }
};