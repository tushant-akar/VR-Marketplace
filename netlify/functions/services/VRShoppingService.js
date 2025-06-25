/**
 * VR Shopping Service for handling shopping cart and session operations
 * Following the existing codebase patterns and conventions
 */

const { supabaseAdmin } = require('../config/supabase');
const crypto = require('crypto');

class VRShoppingService {
  constructor() {
    this.sessionTimeout = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  }

  /**
   * Create a new shopping session for user
   * @param {string} userId - User UUID
   * @param {Object} vrData - VR session initialization data
   * @returns {Promise<Object>} - Shopping session with empty cart
   */
  async createShoppingSession(userId, vrData = {}) {
    try {
      // Check if user has an active session
      const { data: existingSession } = await supabaseAdmin
        .from('shopping_sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .single();

      // If active session exists, return it
      if (existingSession) {
        const cart = await this.getShoppingCart(existingSession.id);
        return {
          session: existingSession,
          cart,
          isNew: false
        };
      }

      // Create new session
      const sessionToken = this.generateSessionToken();
      
      const { data: newSession, error } = await supabaseAdmin
        .from('shopping_sessions')
        .insert([{
          user_id: userId,
          session_token: sessionToken,
          status: 'active',
          vr_session_data: vrData,
          started_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) {
        console.error('Session creation error:', error);
        throw new Error(`Failed to create shopping session: ${error.message}`);
      }

      // Log session start activity
      await this.logVRActivity(userId, newSession.id, 'session_started', {
        session_token: sessionToken,
        vr_data: vrData
      });

      return {
        session: newSession,
        cart: { items: [], totalItems: 0, totalAmount: 0.00 },
        isNew: true
      };
    } catch (error) {
      console.error('Error in createShoppingSession:', error);
      throw error;
    }
  }

  /**
   * Get shopping cart for session
   * @param {string} sessionId - Session UUID
   * @returns {Promise<Object>} - Shopping cart with items
   */
  async getShoppingCart(sessionId) {
    try {
      const { data: cartItems, error } = await supabaseAdmin
        .from('shopping_cart')
        .select(`
          *,
          product:products(
            id,
            name,
            price,
            discount_price,
            product_images,
            brand,
            stock_quantity
          )
        `)
        .eq('session_id', sessionId)
        .order('added_at', { ascending: true });

      if (error) {
        console.error('Cart fetch error:', error);
        throw new Error(`Failed to fetch shopping cart: ${error.message}`);
      }

      const items = cartItems || [];
      const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
      const totalAmount = items.reduce((sum, item) => sum + item.total_price, 0);

      return {
        items,
        totalItems,
        totalAmount,
        sessionId
      };
    } catch (error) {
      console.error('Error in getShoppingCart:', error);
      throw error;
    }
  }

  /**
   * Add product to shopping cart
   * @param {string} sessionId - Session UUID
   * @param {string} productId - Product UUID
   * @param {number} quantity - Quantity to add
   * @param {string} userId - User UUID (for logging)
   * @returns {Promise<Object>} - Updated cart item
   */
  async addToCart(sessionId, productId, quantity = 1, userId = null) {
    try {
      // Validate inputs
      if (!this.isValidUUID(sessionId) || !this.isValidUUID(productId)) {
        throw new Error('Invalid session or product ID format');
      }

      if (typeof quantity !== 'number' || quantity <= 0) {
        throw new Error('Quantity must be a positive number');
      }

      // Get product details and check stock
      const { data: product, error: productError } = await supabaseAdmin
        .from('products')
        .select('*')
        .eq('id', productId)
        .eq('is_active', true)
        .single();

      if (productError) {
        if (productError.code === 'PGRST116') {
          throw new Error('Product not found or unavailable');
        }
        throw new Error(`Product fetch failed: ${productError.message}`);
      }

      // Check stock availability
      if (product.stock_quantity < quantity) {
        throw new Error(`Insufficient stock. Available: ${product.stock_quantity}`);
      }

      // Calculate price (use discount price if available)
      const unitPrice = product.discount_price || product.price;

      // Check if item already exists in cart
      const { data: existingItem } = await supabaseAdmin
        .from('shopping_cart')
        .select('*')
        .eq('session_id', sessionId)
        .eq('product_id', productId)
        .single();

      let cartItem;

      if (existingItem) {
        // Update existing item
        const newQuantity = existingItem.quantity + quantity;
        
        // Check total stock against new quantity
        if (product.stock_quantity < newQuantity) {
          throw new Error(`Insufficient stock for total quantity. Available: ${product.stock_quantity}, Requested: ${newQuantity}`);
        }

        const { data: updatedItem, error: updateError } = await supabaseAdmin
          .from('shopping_cart')
          .update({
            quantity: newQuantity,
            unit_price: unitPrice
          })
          .eq('id', existingItem.id)
          .select(`
            *,
            product:products(
              id,
              name,
              price,
              discount_price,
              product_images,
              brand,
              stock_quantity
            )
          `)
          .single();

        if (updateError) {
          console.error('Cart update error:', updateError);
          throw new Error(`Failed to update cart: ${updateError.message}`);
        }

        cartItem = updatedItem;
      } else {
        // Add new item
        const { data: newItem, error: insertError } = await supabaseAdmin
          .from('shopping_cart')
          .insert([{
            session_id: sessionId,
            product_id: productId,
            quantity: quantity,
            unit_price: unitPrice
          }])
          .select(`
            *,
            product:products(
              id,
              name,
              price,
              discount_price,
              product_images,
              brand,
              stock_quantity
            )
          `)
          .single();

        if (insertError) {
          console.error('Cart insert error:', insertError);
          throw new Error(`Failed to add to cart: ${insertError.message}`);
        }

        cartItem = newItem;
      }

      // Log add to cart activity
      if (userId) {
        await this.logVRActivity(userId, sessionId, 'product_added_to_cart', {
          product_id: productId,
          quantity: quantity,
          unit_price: unitPrice,
          action: existingItem ? 'updated' : 'added'
        });
      }

      return cartItem;
    } catch (error) {
      console.error('Error in addToCart:', error);
      throw error;
    }
  }

  /**
   * Remove product from shopping cart
   * @param {string} sessionId - Session UUID
   * @param {string} productId - Product UUID
   * @param {string} userId - User UUID (for logging)
   * @returns {Promise<Object>} - Removal result
   */
  async removeFromCart(sessionId, productId, userId = null) {
    try {
      // Validate inputs
      if (!this.isValidUUID(sessionId) || !this.isValidUUID(productId)) {
        throw new Error('Invalid session or product ID format');
      }

      const { data: removedItem, error } = await supabaseAdmin
        .from('shopping_cart')
        .delete()
        .eq('session_id', sessionId)
        .eq('product_id', productId)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new Error('Product not found in cart');
        }
        console.error('Cart removal error:', error);
        throw new Error(`Failed to remove from cart: ${error.message}`);
      }

      // Log remove from cart activity
      if (userId) {
        await this.logVRActivity(userId, sessionId, 'product_removed_from_cart', {
          product_id: productId,
          quantity_removed: removedItem.quantity,
          unit_price: removedItem.unit_price
        });
      }

      return {
        success: true,
        removedItem,
        message: 'Product removed from cart successfully'
      };
    } catch (error) {
      console.error('Error in removeFromCart:', error);
      throw error;
    }
  }

  /**
   * Update cart item quantity
   * @param {string} sessionId - Session UUID
   * @param {string} productId - Product UUID
   * @param {number} quantity - New quantity
   * @param {string} userId - User UUID (for logging)
   * @returns {Promise<Object>} - Updated cart item
   */
  async updateCartQuantity(sessionId, productId, quantity, userId = null) {
    try {
      // Validate inputs
      if (!this.isValidUUID(sessionId) || !this.isValidUUID(productId)) {
        throw new Error('Invalid session or product ID format');
      }

      if (typeof quantity !== 'number' || quantity <= 0) {
        throw new Error('Quantity must be a positive number');
      }

      // Check product stock
      const { data: product, error: productError } = await supabaseAdmin
        .from('products')
        .select('stock_quantity')
        .eq('id', productId)
        .single();

      if (productError || !product) {
        throw new Error('Product not found');
      }

      if (product.stock_quantity < quantity) {
        throw new Error(`Insufficient stock. Available: ${product.stock_quantity}`);
      }

      // Update cart item
      const { data: updatedItem, error } = await supabaseAdmin
        .from('shopping_cart')
        .update({ quantity })
        .eq('session_id', sessionId)
        .eq('product_id', productId)
        .select(`
          *,
          product:products(
            id,
            name,
            price,
            discount_price,
            product_images,
            brand,
            stock_quantity
          )
        `)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new Error('Product not found in cart');
        }
        console.error('Cart quantity update error:', error);
        throw new Error(`Failed to update quantity: ${error.message}`);
      }

      // Log quantity update activity
      if (userId) {
        await this.logVRActivity(userId, sessionId, 'cart_quantity_updated', {
          product_id: productId,
          new_quantity: quantity,
          unit_price: updatedItem.unit_price
        });
      }

      return updatedItem;
    } catch (error) {
      console.error('Error in updateCartQuantity:', error);
      throw error;
    }
  }

  /**
   * Clear shopping cart
   * @param {string} sessionId - Session UUID
   * @param {string} userId - User UUID (for logging)
   * @returns {Promise<Object>} - Clear result
   */
  async clearCart(sessionId, userId = null) {
    try {
      if (!this.isValidUUID(sessionId)) {
        throw new Error('Invalid session ID format');
      }

      const { error } = await supabaseAdmin
        .from('shopping_cart')
        .delete()
        .eq('session_id', sessionId);

      if (error) {
        console.error('Cart clear error:', error);
        throw new Error(`Failed to clear cart: ${error.message}`);
      }

      // Log cart clear activity
      if (userId) {
        await this.logVRActivity(userId, sessionId, 'cart_cleared', {});
      }

      return {
        success: true,
        message: 'Cart cleared successfully'
      };
    } catch (error) {
      console.error('Error in clearCart:', error);
      throw error;
    }
  }

  /**
   * Get shopping session details
   * @param {string} sessionId - Session UUID
   * @returns {Promise<Object>} - Session details
   */
  async getSessionDetails(sessionId) {
    try {
      if (!this.isValidUUID(sessionId)) {
        throw new Error('Invalid session ID format');
      }

      const { data: session, error } = await supabaseAdmin
        .from('session_summary')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new Error('Session not found');
        }
        console.error('Session fetch error:', error);
        throw new Error(`Failed to fetch session: ${error.message}`);
      }

      return session;
    } catch (error) {
      console.error('Error in getSessionDetails:', error);
      throw error;
    }
  }

  /**
   * End shopping session
   * @param {string} sessionId - Session UUID
   * @param {string} userId - User UUID
   * @param {string} status - Final status (completed, abandoned)
   * @returns {Promise<Object>} - Session end result
   */
  async endShoppingSession(sessionId, userId, status = 'abandoned') {
    try {
      if (!this.isValidUUID(sessionId)) {
        throw new Error('Invalid session ID format');
      }

      if (!['completed', 'abandoned'].includes(status)) {
        throw new Error('Invalid session status');
      }

      const { data: updatedSession, error } = await supabaseAdmin
        .from('shopping_sessions')
        .update({
          status: status,
          ended_at: new Date().toISOString()
        })
        .eq('id', sessionId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        console.error('Session end error:', error);
        throw new Error(`Failed to end session: ${error.message}`);
      }

      // Log session end activity
      await this.logVRActivity(userId, sessionId, 'session_ended', {
        final_status: status,
        duration_minutes: updatedSession.duration_minutes
      });

      return updatedSession;
    } catch (error) {
      console.error('Error in endShoppingSession:', error);
      throw error;
    }
  }

  /**
   * Generate unique session token
   * @returns {string} - Session token
   */
  generateSessionToken() {
    return crypto.randomUUID();
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
   * Log VR activity
   * @param {string} userId - User UUID
   * @param {string} sessionId - Session UUID
   * @param {string} activityType - Type of activity
   * @param {Object} activityData - Additional activity data
   * @param {Object} locationData - VR location data
   * @returns {Promise<void>}
   */
  async logVRActivity(userId, sessionId, activityType, activityData = {}, locationData = null) {
    try {
      await supabaseAdmin
        .from('vr_activity_logs')
        .insert([{
          user_id: userId,
          session_id: sessionId,
          activity_type: activityType,
          activity_data: activityData,
          location_data: locationData,
          timestamp: new Date().toISOString()
        }]);
    } catch (error) {
      console.error('VR activity logging failed:', error);
      // Don't throw error for logging failures
    }
  }
}

module.exports = VRShoppingService;