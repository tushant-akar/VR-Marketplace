/**
 * VR Shopping API endpoint
 * Handles shopping sessions, cart management
 */
const { createResponse, createErrorResponse, createSuccessResponse } = require('./utils/response');
const { authenticateUser } = require('./utils/auth');
const VRShoppingService = require('./services/VRShoppingService');

const shoppingService = new VRShoppingService();

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
        return await handleShoppingGetRequests(pathSegments, auth.user);
      
      case 'POST':
        return await handleShoppingPostRequests(pathSegments, requestBody, auth.user);
      
      case 'PUT':
        return await handleShoppingPutRequests(pathSegments, requestBody, auth.user);
      
      case 'DELETE':
        return await handleShoppingDeleteRequests(pathSegments, auth.user);
      
      default:
        return createErrorResponse(405, `Method ${httpMethod} not allowed`);
    }
  } catch (error) {
    console.error('VR Shopping API error:', error);
    return createErrorResponse(500, 'Internal server error', error.message);
  }
};

async function handleShoppingGetRequests(pathSegments, user) {
  try {
    switch (pathSegments[0]) {
      case 'session':
        if (pathSegments[1]) {
          // Get specific session details
          const sessionDetails = await shoppingService.getSessionDetails(pathSegments[1]);
          return createSuccessResponse(sessionDetails, 'Session details retrieved successfully');
        } else {
          return createErrorResponse(400, 'Session ID is required');
        }
      
      case 'cart':
        if (!pathSegments[1]) {
          return createErrorResponse(400, 'Session ID is required');
        }
        const cart = await shoppingService.getShoppingCart(pathSegments[1]);
        return createSuccessResponse(cart, 'Shopping cart retrieved successfully');
      
      default:
        return createErrorResponse(404, 'Endpoint not found');
    }
  } catch (error) {
    console.error('Shopping GET error:', error);
    return createErrorResponse(500, error.message);
  }
}

async function handleShoppingPostRequests(pathSegments, body, user) {
  try {
    switch (pathSegments[0]) {
      case 'session':
        // Create new shopping session
        const vrData = body.vr_data || {};
        const sessionResult = await shoppingService.createShoppingSession(user.id, vrData);
        return createSuccessResponse(sessionResult, 'Shopping session created successfully');
      
      case 'cart':
        if (pathSegments[1] === 'add') {
          // Add item to cart
          const { session_id, product_id, quantity = 1 } = body;
          
          if (!session_id || !product_id) {
            return createErrorResponse(400, 'Session ID and Product ID are required');
          }
          
          const cartItem = await shoppingService.addToCart(session_id, product_id, quantity, user.id);
          return createSuccessResponse(cartItem, 'Product added to cart successfully');
        }
        return createErrorResponse(404, 'Endpoint not found');
      
      default:
        return createErrorResponse(404, 'Endpoint not found');
    }
  } catch (error) {
    console.error('Shopping POST error:', error);
    return createErrorResponse(500, error.message);
  }
}

async function handleShoppingPutRequests(pathSegments, body, user) {
  try {
    if (pathSegments[0] === 'cart' && pathSegments[1] === 'quantity') {
      // Update cart item quantity
      const { session_id, product_id, quantity } = body;
      
      if (!session_id || !product_id || !quantity) {
        return createErrorResponse(400, 'Session ID, Product ID, and quantity are required');
      }
      
      const updatedItem = await shoppingService.updateCartQuantity(session_id, product_id, quantity, user.id);
      return createSuccessResponse(updatedItem, 'Cart quantity updated successfully');
    }
    
    if (pathSegments[0] === 'session' && pathSegments[1] === 'end') {
      // End shopping session
      const { session_id, status = 'abandoned' } = body;
      
      if (!session_id) {
        return createErrorResponse(400, 'Session ID is required');
      }
      
      const endedSession = await shoppingService.endShoppingSession(session_id, user.id, status);
      return createSuccessResponse(endedSession, 'Shopping session ended successfully');
    }
    
    return createErrorResponse(404, 'Endpoint not found');
  } catch (error) {
    console.error('Shopping PUT error:', error);
    return createErrorResponse(500, error.message);
  }
}

async function handleShoppingDeleteRequests(pathSegments, user) {
  try {
    if (pathSegments[0] === 'cart') {
      if (pathSegments[1] === 'clear') {
        // Clear entire cart
        const sessionId = pathSegments[2];
        if (!sessionId) {
          return createErrorResponse(400, 'Session ID is required');
        }
        
        const result = await shoppingService.clearCart(sessionId, user.id);
        return createSuccessResponse(result, 'Cart cleared successfully');
      } else if (pathSegments[1] && pathSegments[2]) {
        // Remove specific item from cart
        const sessionId = pathSegments[1];
        const productId = pathSegments[2];
        
        const result = await shoppingService.removeFromCart(sessionId, productId, user.id);
        return createSuccessResponse(result, 'Product removed from cart successfully');
      }
    }
    
    return createErrorResponse(404, 'Endpoint not found');
  } catch (error) {
    console.error('Shopping DELETE error:', error);
    return createErrorResponse(500, error.message);
  }
}