/**
 * User Profile Endpoint
 * GET /api/auth/profile - Get user profile
 * PUT /api/auth/profile - Update user profile
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
const { validateProfileUpdateData, sanitizeUserInput } = require('./utils/validation');
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
  
  // Only allow GET and PUT methods
  if (!['GET', 'PUT'].includes(event.httpMethod)) {
    return createMethodNotAllowedResponse(['GET', 'PUT', 'OPTIONS']);
  }
  
  try {
    // Authenticate user
    const authResult = await authenticateUser(event.headers.authorization);
    if (!authResult.success) {
      return createUnauthorizedResponse(authResult.error);
    }
    
    const { user, tokenInfo } = authResult;
    const userInfo = extractUserInfo(event);
    
    if (event.httpMethod === 'GET') {
      // Get user profile
      return await handleGetProfile(user, userInfo);
      
    } else if (event.httpMethod === 'PUT') {
      // Update user profile
      return await handleUpdateProfile(event, user, userInfo);
    }
    
  } catch (error) {
    console.error('Profile operation error:', {
      method: event.httpMethod,
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      userAgent: event.headers?.['user-agent'],
      ip: event.headers?.['x-forwarded-for']
    });
    
    return createInternalServerErrorResponse(
      process.env.NODE_ENV === 'development' 
        ? error.message 
        : 'Profile operation failed. Please try again.'
    );
  }
};

/**
 * Handle GET profile request
 */
async function handleGetProfile(user, userInfo) {
  try {
    // Get fresh user data from database
    const currentUser = await userService.getUserById(user.id);
    
    // Log profile access
    await logUserActivity(user.id, 'profile_accessed', {
      accessMethod: 'api'
    }, userInfo);
    
    return createSuccessResponse({
      user: currentUser,
      lastLogin: currentUser.last_login,
      accountCreated: currentUser.created_at,
      profileCompletion: calculateProfileCompletion(currentUser)
    }, 'Profile retrieved successfully');
    
  } catch (error) {
    console.error('Get profile error:', error);
    
    if (error.message === 'User not found') {
      return createUnauthorizedResponse('User account not found');
    }
    
    throw error;
  }
}

/**
 * Handle PUT profile update request
 */
async function handleUpdateProfile(event, user, userInfo) {
  try {
    // Parse and validate request body
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return createErrorResponse(400, 'Invalid JSON in request body');
    }
    
    // Sanitize user input
    const allowedFields = ['name', 'email', 'phoneNumber', 'dateOfBirth', 'profileImageUrl'];
    const sanitizedData = sanitizeUserInput(body, allowedFields);
    
    // Validate update data
    const validation = validateProfileUpdateData(sanitizedData);
    if (!validation.isValid) {
      return createValidationErrorResponse(validation.errors, 'Please correct the following errors');
    }
    
    // Update user profile
    const updatedUser = await userService.updateUser(user.id, sanitizedData, userInfo);
    
    return createSuccessResponse({
      user: updatedUser,
      profileCompletion: calculateProfileCompletion(updatedUser)
    }, 'Profile updated successfully');
    
  } catch (error) {
    console.error('Update profile error:', error);
    
    if (error.message === 'User not found') {
      return createUnauthorizedResponse('User account not found');
    }
    
    if (error.message.includes('already in use')) {
      return createErrorResponse(409, 'Email address is already in use by another account');
    }
    
    if (error.message.includes('No valid fields')) {
      return createErrorResponse(400, 'No valid fields provided for update');
    }
    
    throw error;
  }
}

/**
 * Calculate profile completion percentage
 */
function calculateProfileCompletion(user) {
  const fields = [
    'name',
    'email', 
    'phone_number',
    'date_of_birth',
    'profile_image_url'
  ];
  
  const completedFields = fields.filter(field => {
    const value = user[field];
    return value && value.toString().trim().length > 0;
  });
  
  const percentage = Math.round((completedFields.length / fields.length) * 100);
  
  return {
    percentage,
    completedFields: completedFields.length,
    totalFields: fields.length,
    missingFields: fields.filter(field => {
      const value = user[field];
      return !value || value.toString().trim().length === 0;
    })
  };
}