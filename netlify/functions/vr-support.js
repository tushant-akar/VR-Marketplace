/**
 * VR Customer Support API endpoint
 * Handles customer support interactions and AI conversations
 */
const { createResponse, createErrorResponse, createSuccessResponse } = require('./utils/response');
const { authenticateUser } = require('./utils/auth');
const VRSupportService = require('./services/VRSupportService');

const supportService = new VRSupportService();

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, null, 'CORS preflight successful');
  }

  try {
    const { httpMethod, path, body } = event;
    const authHeader = event.headers.authorization || event.headers.Authorization;

    // Authenticate user
    const auth = await authenticateUser(authHeader);
    if (!auth.success) {
      return createErrorResponse(401, auth.error);
    }

    // Parse body if present
    let requestBody = {};
    if (body) {
      try {
        requestBody = JSON.parse(body);
      } catch (error) {
        return createErrorResponse(400, 'Invalid JSON in request body');
      }
    }

    const pathSegments = path.split('/').filter(segment => segment);

    switch (httpMethod) {
      case 'GET':
        return await handleSupportGetRequests(pathSegments, auth.user);
      
      case 'POST':
        return await handleSupportPostRequests(pathSegments, requestBody, auth.user);
      
      case 'PUT':
        return await handleSupportPutRequests(pathSegments, requestBody, auth.user);
      
      default:
        return createErrorResponse(405, `Method ${httpMethod} not allowed`);
    }
  } catch (error) {
    console.error('VR Support API error:', error);
    return createErrorResponse(500, 'Internal server error', error.message);
  }
};

async function handleSupportGetRequests(pathSegments, user) {
  try {
    switch (pathSegments[0]) {
      case 'locations':
        const locations = await supportService.getSupportLocations();
        return createSuccessResponse(locations, 'Support locations retrieved successfully');
      
      case 'conversation':
        if (!pathSegments[1]) {
          return createErrorResponse(400, 'Conversation ID is required');
        }
        const conversation = await supportService.getConversationHistory(pathSegments[1]);
        return createSuccessResponse(conversation, 'Conversation history retrieved successfully');
      
      default:
        return createErrorResponse(404, 'Endpoint not found');
    }
  } catch (error) {
    console.error('Support GET error:', error);
    return createErrorResponse(500, error.message);
  }
}

async function handleSupportPostRequests(pathSegments, body, user) {
  try {
    switch (pathSegments[0]) {
      case 'conversation':
        if (pathSegments[1] === 'start') {
          // Start new support conversation
          const { session_id, support_location_id, initial_query } = body;
          
          if (!support_location_id || !initial_query) {
            return createErrorResponse(400, 'Support location ID and initial query are required');
          }
          
          const conversationResult = await supportService.startSupportConversation(
            user.id,
            session_id,
            support_location_id,
            initial_query
          );
          
          return createSuccessResponse(conversationResult, 'Support conversation started successfully');
        } else if (pathSegments[1] === 'message') {
          // Send message to existing conversation
          const { conversation_id, message } = body;
          
          if (!conversation_id || !message) {
            return createErrorResponse(400, 'Conversation ID and message are required');
          }
          
          const responseResult = await supportService.processUserMessage(
            conversation_id,
            message,
            user.id
          );
          
          return createSuccessResponse(responseResult, 'Message processed successfully');
        }
        break;
      
      default:
        return createErrorResponse(404, 'Endpoint not found');
    }
  } catch (error) {
    console.error('Support POST error:', error);
    return createErrorResponse(500, error.message);
  }
}

async function handleSupportPutRequests(pathSegments, body, user) {
  try {
    if (pathSegments[0] === 'conversation' && pathSegments[1] === 'end') {
      // End support conversation
      const { conversation_id, satisfaction_rating } = body;
      
      if (!conversation_id) {
        return createErrorResponse(400, 'Conversation ID is required');
      }
      
      const endedConversation = await supportService.endSupportConversation(
        conversation_id,
        user.id,
        satisfaction_rating
      );
      
      return createSuccessResponse(endedConversation, 'Support conversation ended successfully');
    }
    
    return createErrorResponse(404, 'Endpoint not found');
  } catch (error) {
    console.error('Support PUT error:', error);
    return createErrorResponse(500, error.message);
  }
}