/**
 * VR Payment API endpoint - FIXED PATH ROUTING
 * Handles checkout, payment processing, and order management
 */
const { createResponse, createErrorResponse, createSuccessResponse } = require('./utils/response');
const { authenticateUser } = require('./utils/auth');
const VRPaymentService = require('./services/VRPaymentService');

const paymentService = new VRPaymentService();

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, null, 'CORS preflight successful');
  }

  try {
    const { httpMethod, path, body, queryStringParameters = {} } = event;
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

    // ✅ FIXED: Properly handle path segments
    const pathSegments = path.split('/').filter(segment => segment);
    
    // Find the actual route after 'vr-payment'
    const routeIndex = pathSegments.indexOf('vr-payment') + 1;
    const actualPathSegments = pathSegments.slice(routeIndex);
    
    console.log('Full path:', path);
    console.log('Path segments:', pathSegments);
    console.log('Actual route segments:', actualPathSegments);

    switch (httpMethod) {
      case 'GET':
        return await handlePaymentGetRequests(actualPathSegments, auth.user, queryStringParameters);
      
      case 'POST':
        return await handlePaymentPostRequests(actualPathSegments, requestBody, auth.user);
      
      case 'PUT':
        return await handlePaymentPutRequests(actualPathSegments, requestBody, auth.user);
      
      default:
        return createErrorResponse(405, `Method ${httpMethod} not allowed`);
    }
  } catch (error) {
    console.error('VR Payment API error:', error);
    return createErrorResponse(500, 'Internal server error', error.message);
  }
};

async function handlePaymentGetRequests(pathSegments, user, queryParams) {
  try {
    console.log('GET - Processing path segments:', pathSegments);
    
    switch (pathSegments[0]) {
      case 'checkout':
        if (!pathSegments[1]) {
          return createErrorResponse(400, 'Session ID is required');
        }
        const checkoutDetails = await paymentService.initializeCheckout(pathSegments[1], user.id);
        return createSuccessResponse(checkoutDetails, 'Checkout initialized successfully');
      
      case 'order':
        if (pathSegments[1]) {
          // Get specific order
          const order = await paymentService.getOrder(pathSegments[1], user.id);
          return createSuccessResponse(order, 'Order retrieved successfully');
        } else {
          return createErrorResponse(400, 'Order ID is required');
        }
      
      case 'orders':
        // Get user order history
        const page = parseInt(queryParams.page) || 1;
        const limit = parseInt(queryParams.limit) || 10;
        
        const orderHistory = await paymentService.getUserOrderHistory(user.id, { page, limit });
        return createSuccessResponse(orderHistory, 'Order history retrieved successfully');
      
      case 'receipt':
        if (!pathSegments[1]) {
          return createErrorResponse(400, 'Order ID is required');
        }
        const receipt = await paymentService.generateReceipt(pathSegments[1]);
        return createSuccessResponse(receipt, 'Receipt generated successfully');
      
      default:
        return createErrorResponse(404, `Endpoint not found. Available GET routes: checkout/{sessionId}, order/{orderId}, orders, receipt/{orderId}`);
    }
  } catch (error) {
    console.error('Payment GET error:', error);
    return createErrorResponse(500, error.message);
  }
}

async function handlePaymentPostRequests(pathSegments, body, user) {
  try {
    console.log('POST - Processing path segments:', pathSegments);
    
    switch (pathSegments[0]) {
      case 'checkout':
        // Create checkout/order - alternative endpoint
        if (!pathSegments[1]) {
          return createErrorResponse(400, 'Session ID is required in path');
        }
        
        const { payment_method = 'stripe' } = body;
        
        if (!['cash', 'stripe'].includes(payment_method)) {
          return createErrorResponse(400, 'Invalid payment method. Must be "cash" or "stripe"');
        }
        
        // Initialize checkout first
        const checkoutDetails = await paymentService.initializeCheckout(pathSegments[1], user.id);
        
        // Create order
        const order = await paymentService.createOrder(
          pathSegments[1],
          user.id,
          payment_method,
          checkoutDetails.totals
        );
        
        return createSuccessResponse(order, 'Checkout completed and order created successfully');
      
      case 'order':
        // Create new order (original endpoint)
        const { session_id, payment_method } = body;
        
        if (!session_id || !payment_method) {
          return createErrorResponse(400, 'Session ID and payment method are required');
        }
        
        if (!['cash', 'stripe'].includes(payment_method)) {
          return createErrorResponse(400, 'Invalid payment method. Must be "cash" or "stripe"');
        }
        
        // Initialize checkout first
        const checkoutDetails = await paymentService.initializeCheckout(session_id, user.id);
        
        // Create order
        const order = await paymentService.createOrder(
          session_id,
          user.id,
          payment_method,
          checkoutDetails.totals
        );
        
        return createSuccessResponse(order, 'Order created successfully');
      
      case 'payment':
        if (pathSegments[1] === 'cash') {
          // Process cash payment
          const { order_id, cash_received } = body;
          
          if (!order_id || !cash_received) {
            return createErrorResponse(400, 'Order ID and cash received amount are required');
          }
          
          const paymentResult = await paymentService.processCashPayment(
            order_id,
            user.id,
            parseFloat(cash_received)
          );
          
          return createSuccessResponse(paymentResult, 'Cash payment processed successfully');
        } else if (pathSegments[1] === 'stripe') {
          if (pathSegments[2] === 'intent') {
            // Create Stripe payment intent
            const { order_id } = body;
            
            if (!order_id) {
              return createErrorResponse(400, 'Order ID is required');
            }
            
            const paymentIntent = await paymentService.createStripePaymentIntent(order_id, user.id);
            return createSuccessResponse(paymentIntent, 'Payment intent created successfully');
          } else if (pathSegments[2] === 'confirm') {
            // Confirm Stripe payment
            const { order_id, payment_intent_id } = body;
            
            if (!order_id || !payment_intent_id) {
              return createErrorResponse(400, 'Order ID and payment intent ID are required');
            }
            
            const confirmationResult = await paymentService.confirmStripePayment(
              order_id,
              user.id,
              payment_intent_id
            );
            
            return createSuccessResponse(confirmationResult, 'Payment confirmed successfully');
          } else {
            return createErrorResponse(404, `Invalid Stripe endpoint. Use: payment/stripe/intent or payment/stripe/confirm`);
          }
        } else {
          return createErrorResponse(404, `Invalid payment method. Use: payment/cash or payment/stripe/*`);
        }
        break;
      
      case 'refund':
        // Process refund
        const { order_id, refund_amount, reason } = body;
        
        if (!order_id || !refund_amount || !reason) {
          return createErrorResponse(400, 'Order ID, refund amount, and reason are required');
        }
        
        const refundResult = await paymentService.processRefund(
          order_id,
          user.id,
          parseFloat(refund_amount),
          reason
        );
        
        return createSuccessResponse(refundResult, 'Refund processed successfully');
      
      default:
        return createErrorResponse(404, `Endpoint not found. Available POST routes: checkout/{sessionId}, order, payment/cash, payment/stripe/intent, payment/stripe/confirm, refund`);
    }
  } catch (error) {
    console.error('Payment POST error:', error);
    return createErrorResponse(500, error.message);
  }
}

async function handlePaymentPutRequests(pathSegments, body, user) {
  try {
    console.log('PUT - Processing path segments:', pathSegments);
    
    if (pathSegments[0] === 'order' && pathSegments[1] === 'cancel') {
      // Cancel order
      const { order_id, reason } = body;
      
      if (!order_id) {
        return createErrorResponse(400, 'Order ID is required');
      }
      
      const cancellationResult = await paymentService.cancelOrder(
        order_id,
        user.id,
        reason || 'Customer cancellation'
      );
      
      return createSuccessResponse(cancellationResult, 'Order cancelled successfully');
    }
    
    return createErrorResponse(404, `Endpoint not found. Available PUT routes: order/cancel`);
  } catch (error) {
    console.error('Payment PUT error:', error);
    return createErrorResponse(500, error.message);
  }
}