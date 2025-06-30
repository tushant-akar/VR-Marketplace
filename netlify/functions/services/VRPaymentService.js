/**
 * VR Payment Service for handling checkout and payment processing
 * Integrates with Stripe for online payments and handles cash payments
 * Following the existing codebase patterns and conventions
 * 
 * FIXED: Order number generation issue with lpad function
 */

const { supabaseAdmin } = require('../config/supabase');
const VRShoppingService = require('./VRShoppingService');

class VRPaymentService {
  constructor() {
    this.shoppingService = new VRShoppingService();
    this.stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    this.stripe = this.stripeSecretKey ? require('stripe')(this.stripeSecretKey) : null;
    this.taxRate = 0.08; // 8% tax rate (configurable)
  }

  /**
   * Generate unique order number
   * @returns {string} - Formatted order number
   */
  generateOrderNumber() {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `ORD-${timestamp.slice(-6)}${random}`;
  }

  /**
   * Calculate order totals
   * @param {Array} cartItems - Shopping cart items
   * @param {Object} discounts - Applied discounts
   * @returns {Object} - Order totals
   */
  calculateOrderTotals(cartItems, discounts = {}) {
    const subtotal = cartItems.reduce((sum, item) => sum + item.total_price, 0);
    const discountAmount = discounts.amount || 0;
    const subtotalAfterDiscount = Math.max(0, subtotal - discountAmount);
    const taxAmount = subtotalAfterDiscount * this.taxRate;
    const totalAmount = subtotalAfterDiscount + taxAmount;

    return {
      subtotal: parseFloat(subtotal.toFixed(2)),
      discountAmount: parseFloat(discountAmount.toFixed(2)),
      subtotalAfterDiscount: parseFloat(subtotalAfterDiscount.toFixed(2)),
      taxAmount: parseFloat(taxAmount.toFixed(2)),
      totalAmount: parseFloat(totalAmount.toFixed(2))
    };
  }

  /**
   * Initialize checkout process
   * @param {string} sessionId - Shopping session UUID
   * @param {string} userId - User UUID
   * @returns {Promise<Object>} - Checkout details
   */
  async initializeCheckout(sessionId, userId) {
    try {
      // Validate session and get cart
      const cart = await this.shoppingService.getShoppingCart(sessionId);
      
      if (!cart.items || cart.items.length === 0) {
        throw new Error('Cart is empty');
      }

      // Validate stock for all items
      const stockValidation = await this.validateCartStock(cart.items);
      if (!stockValidation.isValid) {
        throw new Error(`Stock validation failed: ${stockValidation.errors.join(', ')}`);
      }

      // Calculate totals
      const totals = this.calculateOrderTotals(cart.items);

      // Get session details
      const sessionDetails = await this.shoppingService.getSessionDetails(sessionId);

      return {
        cart,
        totals,
        session: sessionDetails,
        stockValidation,
        paymentMethods: ['cash', 'stripe'],
        checkoutReady: true
      };
    } catch (error) {
      console.error('Error in initializeCheckout:', error);
      throw error;
    }
  }

  /**
   * Validate cart stock before checkout
   * @param {Array} cartItems - Shopping cart items
   * @returns {Promise<Object>} - Stock validation result
   */
  async validateCartStock(cartItems) {
    try {
      const errors = [];
      const updates = [];

      for (const item of cartItems) {
        const { data: product, error } = await supabaseAdmin
          .from('products')
          .select('stock_quantity, name')
          .eq('id', item.product_id)
          .single();

        if (error || !product) {
          errors.push(`Product ${item.product?.name || item.product_id} not found`);
          continue;
        }

        if (product.stock_quantity < item.quantity) {
          errors.push(`Insufficient stock for ${product.name}. Available: ${product.stock_quantity}, Requested: ${item.quantity}`);
        }

        updates.push({
          product_id: item.product_id,
          available_stock: product.stock_quantity,
          requested_quantity: item.quantity
        });
      }

      return {
        isValid: errors.length === 0,
        errors,
        stockUpdates: updates
      };
    } catch (error) {
      console.error('Error in validateCartStock:', error);
      return {
        isValid: false,
        errors: ['Stock validation failed'],
        stockUpdates: []
      };
    }
  }

  /**
   * Create order record
   * @param {string} sessionId - Shopping session UUID
   * @param {string} userId - User UUID
   * @param {string} paymentMethod - Payment method (cash, stripe)
   * @param {Object} totals - Order totals
   * @returns {Promise<Object>} - Created order
   */
  async createOrder(sessionId, userId, paymentMethod, totals) {
    try {
      // Get cart items
      const cart = await this.shoppingService.getShoppingCart(sessionId);

      // Generate order number to avoid database function issues
      const orderNumber = this.generateOrderNumber();

      // Create order with explicit order_number
      const { data: order, error: orderError } = await supabaseAdmin
        .from('orders')
        .insert([{
          user_id: userId,
          session_id: sessionId,
          order_number: orderNumber, // ✅ FIXED: Explicit order number generation
          payment_method: paymentMethod,
          payment_status: 'pending',
          subtotal: totals.subtotal,
          tax_amount: totals.taxAmount,
          discount_amount: totals.discountAmount,
          total_amount: totals.totalAmount,
          status: 'pending'
        }])
        .select()
        .single();

      if (orderError) {
        console.error('Order creation error:', orderError);
        throw new Error(`Failed to create order: ${orderError.message}`);
      }

      // Create order items
      const orderItems = cart.items.map(item => ({
        order_id: order.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price || (item.unit_price * item.quantity)
      }));

      const { error: itemsError } = await supabaseAdmin
        .from('order_items')
        .insert(orderItems);

      if (itemsError) {
        console.error('Order items creation error:', itemsError);
        // Rollback order creation
        await supabaseAdmin.from('orders').delete().eq('id', order.id);
        throw new Error(`Failed to create order items: ${itemsError.message}`);
      }

      // Log order creation
      await this.logPaymentActivity(userId, sessionId, 'order_created', {
        order_id: order.id,
        order_number: order.order_number,
        payment_method: paymentMethod,
        total_amount: totals.totalAmount,
        item_count: cart.items.length
      });

      return order;
    } catch (error) {
      console.error('Error in createOrder:', error);
      throw error;
    }
  }

  /**
   * Process cash payment
   * @param {string} orderId - Order UUID
   * @param {string} userId - User UUID
   * @param {number} cashReceived - Amount of cash received
   * @returns {Promise<Object>} - Payment result
   */
  async processCashPayment(orderId, userId, cashReceived) {
    try {
      // Get order details
      const { data: order, error: orderError } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .eq('user_id', userId)
        .single();

      if (orderError || !order) {
        throw new Error('Order not found');
      }

      if (order.payment_status !== 'pending') {
        throw new Error('Order payment already processed');
      }

      if (cashReceived < order.total_amount) {
        throw new Error(`Insufficient cash. Required: $${order.total_amount}, Received: $${cashReceived}`);
      }

      const change = cashReceived - order.total_amount;

      // Update order status
      const { data: updatedOrder, error: updateError } = await supabaseAdmin
        .from('orders')
        .update({
          payment_status: 'completed',
          status: 'processing',
          receipt_data: {
            payment_method: 'cash',
            cash_received: cashReceived,
            change_given: change,
            processed_at: new Date().toISOString()
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId)
        .select()
        .single();

      if (updateError) {
        console.error('Order update error:', updateError);
        throw new Error(`Failed to update order: ${updateError.message}`);
      }

      // Update product stock
      await this.updateProductStock(orderId);

      // Complete shopping session
      await this.shoppingService.endShoppingSession(order.session_id, userId, 'completed');

      // Generate receipt
      const receipt = await this.generateReceipt(orderId);

      // Log payment completion
      await this.logPaymentActivity(userId, order.session_id, 'cash_payment_completed', {
        order_id: orderId,
        order_number: order.order_number,
        cash_received: cashReceived,
        change_given: change,
        total_amount: order.total_amount
      });

      return {
        success: true,
        order: updatedOrder,
        payment: {
          method: 'cash',
          cashReceived,
          change,
          status: 'completed'
        },
        receipt
      };
    } catch (error) {
      console.error('Error in processCashPayment:', error);
      throw error;
    }
  }

  /**
   * Create Stripe payment intent
   * @param {string} orderId - Order UUID
   * @param {string} userId - User UUID
   * @returns {Promise<Object>} - Stripe payment intent
   */
  async createStripePaymentIntent(orderId, userId) {
    try {
      if (!this.stripe) {
        throw new Error('Stripe is not configured');
      }

      // Get order details
      const { data: order, error: orderError } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .eq('user_id', userId)
        .single();

      if (orderError || !order) {
        throw new Error('Order not found');
      }

      if (order.payment_status !== 'pending') {
        throw new Error('Order payment already processed');
      }

      // Get user details for Stripe
      const { data: user, error: userError } = await supabaseAdmin
        .from('users')
        .select('email, name')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        throw new Error('User not found');
      }

      // Create payment intent
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(order.total_amount * 100), // Convert to cents
        currency: 'usd',
        metadata: {
          order_id: orderId,
          order_number: order.order_number,
          user_id: userId,
          session_id: order.session_id
        },
        receipt_email: user.email,
        description: `VR Supermarket Order ${order.order_number}`
      });

      // Update order with payment intent ID
      await supabaseAdmin
        .from('orders')
        .update({
          payment_intent_id: paymentIntent.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      // Log payment intent creation
      await this.logPaymentActivity(userId, order.session_id, 'stripe_payment_intent_created', {
        order_id: orderId,
        payment_intent_id: paymentIntent.id,
        amount: order.total_amount
      });

      return {
        paymentIntent: {
          id: paymentIntent.id,
          client_secret: paymentIntent.client_secret,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          status: paymentIntent.status
        },
        order
      };
    } catch (error) {
      console.error('Error in createStripePaymentIntent:', error);
      throw error;
    }
  }

  /**
   * Confirm Stripe payment
   * @param {string} orderId - Order UUID
   * @param {string} userId - User UUID
   * @param {string} paymentIntentId - Stripe payment intent ID
   * @returns {Promise<Object>} - Payment confirmation result
   */
  async confirmStripePayment(orderId, userId, paymentIntentId) {
    try {
      if (!this.stripe) {
        throw new Error('Stripe is not configured');
      }

      // Get order details
      const { data: order, error: orderError } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .eq('user_id', userId)
        .eq('payment_intent_id', paymentIntentId)
        .single();

      if (orderError || !order) {
        throw new Error('Order not found or payment intent mismatch');
      }

      // Retrieve payment intent from Stripe
      const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);

      if (paymentIntent.status !== 'succeeded') {
        throw new Error(`Payment not completed. Status: ${paymentIntent.status}`);
      }

      // Update order status
      const { data: updatedOrder, error: updateError } = await supabaseAdmin
        .from('orders')
        .update({
          payment_status: 'completed',
          status: 'processing',
          receipt_data: {
            payment_method: 'stripe',
            payment_intent_id: paymentIntentId,
            stripe_charge_id: paymentIntent.latest_charge,
            processed_at: new Date().toISOString()
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId)
        .select()
        .single();

      if (updateError) {
        console.error('Order update error:', updateError);
        throw new Error(`Failed to update order: ${updateError.message}`);
      }

      // Update product stock
      await this.updateProductStock(orderId);

      // Complete shopping session
      await this.shoppingService.endShoppingSession(order.session_id, userId, 'completed');

      // Generate receipt
      const receipt = await this.generateReceipt(orderId);

      // Log payment completion
      await this.logPaymentActivity(userId, order.session_id, 'stripe_payment_completed', {
        order_id: orderId,
        payment_intent_id: paymentIntentId,
        stripe_charge_id: paymentIntent.latest_charge,
        total_amount: order.total_amount
      });

      return {
        success: true,
        order: updatedOrder,
        payment: {
          method: 'stripe',
          paymentIntentId,
          chargeId: paymentIntent.latest_charge,
          status: 'completed'
        },
        receipt
      };
    } catch (error) {
      console.error('Error in confirmStripePayment:', error);
      throw error;
    }
  }

  /**
   * Update product stock after successful payment
   * @param {string} orderId - Order UUID
   * @returns {Promise<void>}
   */
  async updateProductStock(orderId) {
    try {
      // Get order items
      const { data: orderItems, error } = await supabaseAdmin
        .from('order_items')
        .select('*')
        .eq('order_id', orderId);

      if (error) {
        console.error('Error fetching order items:', error);
        return;
      }

      // Update stock for each product using direct SQL
      for (const item of orderItems) {
        const { error: stockError } = await supabaseAdmin
          .from('products')
          .update({
            stock_quantity: supabaseAdmin.raw(`stock_quantity - ${item.quantity}`)
          })
          .eq('id', item.product_id);

        if (stockError) {
          console.error(`Error updating stock for product ${item.product_id}:`, stockError);
        }
      }
    } catch (error) {
      console.error('Error updating product stock:', error);
      // Don't throw error here as payment has already been processed
    }
  }

  /**
   * Generate receipt for order
   * @param {string} orderId - Order UUID
   * @returns {Promise<Object>} - Receipt data
   */
  async generateReceipt(orderId) {
    try {
      // Get complete order details
      const { data: order, error: orderError } = await supabaseAdmin
        .from('orders')
        .select(`
          *,
          user:users(name, email),
          order_items(
            *,
            product:products(name, brand, sku)
          )
        `)
        .eq('id', orderId)
        .single();

      if (orderError || !order) {
        throw new Error('Order not found for receipt generation');
      }

      const receipt = {
        receiptNumber: `RCP-${order.order_number}`,
        orderNumber: order.order_number,
        date: new Date().toISOString(),
        customer: {
          name: order.user.name,
          email: order.user.email
        },
        items: order.order_items.map(item => ({
          name: item.product.name,
          brand: item.product.brand,
          sku: item.product.sku,
          quantity: item.quantity,
          unitPrice: item.unit_price,
          totalPrice: item.total_price
        })),
        totals: {
          subtotal: order.subtotal,
          taxAmount: order.tax_amount,
          discountAmount: order.discount_amount,
          totalAmount: order.total_amount
        },
        payment: {
          method: order.payment_method,
          status: order.payment_status,
          processedAt: order.receipt_data?.processed_at
        },
        store: {
          name: 'VR Supermarket',
          address: 'Virtual Reality Plaza',
          phone: '1-800-VR-SHOP',
          website: 'vr-supermarket.com'
        }
      };

      // Add payment-specific details
      if (order.payment_method === 'cash' && order.receipt_data) {
        receipt.payment.cashReceived = order.receipt_data.cash_received;
        receipt.payment.changeGiven = order.receipt_data.change_given;
      } else if (order.payment_method === 'stripe' && order.receipt_data) {
        receipt.payment.transactionId = order.receipt_data.stripe_charge_id;
      }

      return receipt;
    } catch (error) {
      console.error('Error in generateReceipt:', error);
      throw error;
    }
  }

  /**
   * Get order by ID
   * @param {string} orderId - Order UUID
   * @param {string} userId - User UUID
   * @returns {Promise<Object>} - Order details
   */
  async getOrder(orderId, userId) {
    try {
      const { data: order, error } = await supabaseAdmin
        .from('orders')
        .select(`
          *,
          user:users(name, email),
          order_items(
            *,
            product:products(name, brand, sku, product_images)
          )
        `)
        .eq('id', orderId)
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new Error('Order not found');
        }
        console.error('Order fetch error:', error);
        throw new Error(`Failed to fetch order: ${error.message}`);
      }

      return order;
    } catch (error) {
      console.error('Error in getOrder:', error);
      throw error;
    }
  }

  /**
   * Get user order history
   * @param {string} userId - User UUID
   * @param {Object} pagination - Pagination parameters
   * @returns {Promise<Object>} - Order history
   */
  async getUserOrderHistory(userId, pagination = {}) {
    try {
      const { page = 1, limit = 10 } = pagination;
      const offset = (page - 1) * limit;

      const { data: orders, error, count } = await supabaseAdmin
        .from('orders')
        .select(`
          id,
          order_number,
          status,
          payment_method,
          payment_status,
          total_amount,
          created_at,
          order_items(
            quantity,
            product:products(name, product_images)
          )
        `, { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error('Order history fetch error:', error);
        throw new Error(`Failed to fetch order history: ${error.message}`);
      }

      const totalPages = Math.ceil(count / limit);

      return {
        orders: orders || [],
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: count,
          itemsPerPage: limit
        }
      };
    } catch (error) {
      console.error('Error in getUserOrderHistory:', error);
      throw error;
    }
  }

  /**
   * Cancel order (if payment is pending)
   * @param {string} orderId - Order UUID
   * @param {string} userId - User UUID
   * @param {string} reason - Cancellation reason
   * @returns {Promise<Object>} - Cancellation result
   */
  async cancelOrder(orderId, userId, reason = 'Customer cancellation') {
    try {
      // Get order details
      const { data: order, error: orderError } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .eq('user_id', userId)
        .single();

      if (orderError || !order) {
        throw new Error('Order not found');
      }

      if (order.payment_status === 'completed') {
        throw new Error('Cannot cancel completed order');
      }

      // Cancel Stripe payment intent if exists
      if (order.payment_intent_id && this.stripe) {
        try {
          await this.stripe.paymentIntents.cancel(order.payment_intent_id);
        } catch (stripeError) {
          console.error('Stripe cancellation error:', stripeError);
          // Continue with order cancellation even if Stripe fails
        }
      }

      // Update order status
      const { data: cancelledOrder, error: updateError } = await supabaseAdmin
        .from('orders')
        .update({
          status: 'cancelled',
          payment_status: 'failed',
          receipt_data: {
            ...order.receipt_data,
            cancellation_reason: reason,
            cancelled_at: new Date().toISOString()
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId)
        .select()
        .single();

      if (updateError) {
        console.error('Order cancellation error:', updateError);
        throw new Error(`Failed to cancel order: ${updateError.message}`);
      }

      // Log cancellation
      await this.logPaymentActivity(userId, order.session_id, 'order_cancelled', {
        order_id: orderId,
        order_number: order.order_number,
        reason: reason,
        total_amount: order.total_amount
      });

      return {
        success: true,
        order: cancelledOrder,
        message: 'Order cancelled successfully'
      };
    } catch (error) {
      console.error('Error in cancelOrder:', error);
      throw error;
    }
  }

  /**
   * Process refund for completed order
   * @param {string} orderId - Order UUID
   * @param {string} userId - User UUID
   * @param {number} refundAmount - Amount to refund
   * @param {string} reason - Refund reason
   * @returns {Promise<Object>} - Refund result
   */
  async processRefund(orderId, userId, refundAmount, reason) {
    try {
      // Get order details
      const { data: order, error: orderError } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .eq('user_id', userId)
        .single();

      if (orderError || !order) {
        throw new Error('Order not found');
      }

      if (order.payment_status !== 'completed') {
        throw new Error('Order payment not completed');
      }

      if (refundAmount > order.total_amount) {
        throw new Error('Refund amount cannot exceed order total');
      }

      let refundResult = null;

      // Process Stripe refund if applicable
      if (order.payment_method === 'stripe' && order.receipt_data?.stripe_charge_id && this.stripe) {
        refundResult = await this.stripe.refunds.create({
          charge: order.receipt_data.stripe_charge_id,
          amount: Math.round(refundAmount * 100), // Convert to cents
          reason: 'requested_by_customer',
          metadata: {
            order_id: orderId,
            reason: reason
          }
        });
      }

      // Update order status
      const { data: updatedOrder, error: updateError } = await supabaseAdmin
        .from('orders')
        .update({
          payment_status: 'refunded',
          receipt_data: {
            ...order.receipt_data,
            refund_amount: refundAmount,
            refund_reason: reason,
            refund_processed_at: new Date().toISOString(),
            stripe_refund_id: refundResult?.id
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId)
        .select()
        .single();

      if (updateError) {
        console.error('Refund update error:', updateError);
        throw new Error(`Failed to process refund: ${updateError.message}`);
      }

      // Log refund
      await this.logPaymentActivity(userId, order.session_id, 'order_refunded', {
        order_id: orderId,
        order_number: order.order_number,
        refund_amount: refundAmount,
        reason: reason,
        stripe_refund_id: refundResult?.id
      });

      return {
        success: true,
        order: updatedOrder,
        refund: {
          amount: refundAmount,
          method: order.payment_method,
          stripeRefundId: refundResult?.id,
          status: 'completed'
        }
      };
    } catch (error) {
      console.error('Error in processRefund:', error);
      throw error;
    }
  }

  /**
   * Validate UUID format
   * @param {string} uuid - UUID string to validate
   * @returns {boolean} - Is valid UUID
   */
  isValidUUID(uuid) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * Log payment activity
   * @param {string} userId - User UUID
   * @param {string} sessionId - Session UUID
   * @param {string} activityType - Activity type
   * @param {Object} activityData - Activity data
   * @returns {Promise<void>}
   */
  async logPaymentActivity(userId, sessionId, activityType, activityData = {}) {
    try {
      await supabaseAdmin
        .from('vr_activity_logs')
        .insert([{
          user_id: userId,
          session_id: sessionId,
          activity_type: activityType,
          activity_data: activityData,
          timestamp: new Date().toISOString()
        }]);
    } catch (error) {
      console.error('Payment activity logging failed:', error);
      // Don't throw error for logging failures
    }
  }
}

module.exports = VRPaymentService;