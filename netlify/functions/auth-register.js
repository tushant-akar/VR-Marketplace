/**
 * DEPRECATED: Direct User Registration Endpoint
 * POST /api/auth-register
 * 
 * This endpoint is now deprecated. Please use the new OTP-based registration:
 * 1. POST /api/auth-register-otp (send OTP)
 * 2. POST /api/auth-register-verify (verify OTP and create account)
 */

const { 
  createErrorResponse,
  createCorsResponse,
  createMethodNotAllowedResponse
} = require('./utils/response');

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
  
  // Return deprecation notice
  return createErrorResponse(410, {
    deprecated: true,
    message: 'This endpoint has been deprecated. Please use the new OTP-based registration flow.',
    newEndpoints: {
      step1: {
        method: 'POST',
        url: '/api/auth-register-otp',
        description: 'Send OTP to email for verification'
      },
      step2: {
        method: 'POST', 
        url: '/api/auth-register-verify',
        description: 'Verify OTP and complete registration'
      }
    },
    migrationGuide: 'https://your-docs-site.com/migration-guide'
  }, 'Registration endpoint deprecated. Please use OTP-based registration flow.');
};