/**
 * Utility functions for creating standardized API responses
 */

/**
 * Create a standardized API response
 * @param {number} statusCode - HTTP status code
 * @param {*} data - Response data
 * @param {string|null} message - Optional message
 * @returns {Object} Netlify function response object
 */
const createResponse = (statusCode, data, message = null) => {
  const isSuccess = statusCode >= 200 && statusCode < 300;
  
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS || '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Credentials': 'true',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    },
    body: JSON.stringify({
      success: isSuccess,
      message: message || (isSuccess ? 'Operation successful' : 'Operation failed'),
      data: isSuccess ? data : null,
      error: !isSuccess ? data : null,
      timestamp: new Date().toISOString()
    })
  };
};

/**
 * Create an error response
 * @param {number} statusCode - HTTP error status code
 * @param {*} error - Error data or message
 * @param {string|null} message - Optional error message
 * @returns {Object} Netlify function response object
 */
const createErrorResponse = (statusCode, error, message = null) => {
  // Log error for debugging (but don't expose sensitive info)
  console.error(`API Error ${statusCode}:`, {
    message: message || 'An error occurred',
    error: typeof error === 'string' ? error : error?.message || 'Unknown error',
    timestamp: new Date().toISOString()
  });

  return createResponse(statusCode, error, message || 'An error occurred');
};

/**
 * Create a success response
 * @param {*} data - Success data
 * @param {string|null} message - Optional success message
 * @returns {Object} Netlify function response object
 */
const createSuccessResponse = (data, message = null) => {
  return createResponse(200, data, message || 'Operation successful');
};

/**
 * Create a validation error response
 * @param {Array} errors - Array of validation errors
 * @param {string|null} message - Optional message
 * @returns {Object} Netlify function response object
 */
const createValidationErrorResponse = (errors, message = null) => {
  return createErrorResponse(400, { validationErrors: errors }, message || 'Validation failed');
};

/**
 * Create an unauthorized response
 * @param {string|null} message - Optional message
 * @returns {Object} Netlify function response object
 */
const createUnauthorizedResponse = (message = null) => {
  return createErrorResponse(401, 'Unauthorized access', message || 'Authentication required');
};

/**
 * Create a forbidden response
 * @param {string|null} message - Optional message
 * @returns {Object} Netlify function response object
 */
const createForbiddenResponse = (message = null) => {
  return createErrorResponse(403, 'Access forbidden', message || 'Insufficient permissions');
};

/**
 * Create a not found response
 * @param {string|null} message - Optional message
 * @returns {Object} Netlify function response object
 */
const createNotFoundResponse = (message = null) => {
  return createErrorResponse(404, 'Resource not found', message || 'The requested resource was not found');
};

/**
 * Create a conflict response
 * @param {string|null} message - Optional message
 * @returns {Object} Netlify function response object
 */
const createConflictResponse = (message = null) => {
  return createErrorResponse(409, 'Resource conflict', message || 'Resource already exists');
};

/**
 * Create a method not allowed response
 * @param {Array} allowedMethods - Array of allowed HTTP methods
 * @returns {Object} Netlify function response object
 */
const createMethodNotAllowedResponse = (allowedMethods = []) => {
  const response = createErrorResponse(405, 'Method not allowed', 'HTTP method not allowed for this endpoint');
  
  if (allowedMethods.length > 0) {
    response.headers['Allow'] = allowedMethods.join(', ');
  }
  
  return response;
};

/**
 * Create a rate limit exceeded response
 * @param {string|null} message - Optional message
 * @returns {Object} Netlify function response object
 */
const createRateLimitResponse = (message = null) => {
  return createErrorResponse(429, 'Rate limit exceeded', message || 'Too many requests, please try again later');
};

/**
 * Create an internal server error response
 * @param {string|null} message - Optional message
 * @returns {Object} Netlify function response object
 */
const createInternalServerErrorResponse = (message = null) => {
  return createErrorResponse(500, 'Internal server error', message || 'An unexpected error occurred');
};

/**
 * Handle CORS preflight requests
 * @returns {Object} CORS preflight response
 */
const createCorsResponse = () => {
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS || '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400' // 24 hours
    },
    body: ''
  };
};

module.exports = {
  createResponse,
  createErrorResponse,
  createSuccessResponse,
  createValidationErrorResponse,
  createUnauthorizedResponse,
  createForbiddenResponse,
  createNotFoundResponse,
  createConflictResponse,
  createMethodNotAllowedResponse,
  createRateLimitResponse,
  createInternalServerErrorResponse,
  createCorsResponse
};