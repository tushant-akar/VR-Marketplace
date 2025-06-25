/**
 * VR Customer Support Service for handling customer support interactions
 * Integrates with ElevenLabs for conversational AI
 * Following the existing codebase patterns and conventions
 */

const { supabaseAdmin } = require('../config/supabase');
const VRProductsService = require('./VRProductsService');

class VRSupportService {
  constructor() {
    this.productsService = new VRProductsService();
    this.elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
    this.elevenLabsBaseUrl = 'https://api.elevenlabs.io/v1';
  }

  /**
   * Get all support locations
   * @returns {Promise<Array>} - Support locations
   */
  async getSupportLocations() {
    try {
      const { data: locations, error } = await supabaseAdmin
        .from('support_locations')
        .select('*')
        .eq('is_active', true)
        .order('location_name');

      if (error) {
        console.error('Support locations fetch error:', error);
        throw new Error(`Failed to fetch support locations: ${error.message}`);
      }

      return locations || [];
    } catch (error) {
      console.error('Error in getSupportLocations:', error);
      throw error;
    }
  }

  /**
   * Start a new support conversation
   * @param {string} userId - User UUID
   * @param {string} sessionId - Shopping session UUID
   * @param {string} supportLocationId - Support location UUID
   * @param {string} initialQuery - Initial user query
   * @returns {Promise<Object>} - New conversation
   */
  async startSupportConversation(userId, sessionId, supportLocationId, initialQuery) {
    try {
      // Validate inputs
      if (!this.isValidUUID(userId) || !this.isValidUUID(supportLocationId)) {
        throw new Error('Invalid user or support location ID format');
      }

      // Get support location details
      const { data: location, error: locationError } = await supabaseAdmin
        .from('support_locations')
        .select('*')
        .eq('id', supportLocationId)
        .eq('is_active', true)
        .single();

      if (locationError) {
        throw new Error('Support location not found');
      }

      // Create conversation record
      const { data: conversation, error } = await supabaseAdmin
        .from('support_conversations')
        .insert([{
          user_id: userId,
          session_id: sessionId,
          support_location_id: supportLocationId,
          conversation_data: [
            {
              type: 'user_message',
              content: initialQuery,
              timestamp: new Date().toISOString()
            }
          ],
          query_category: this.categorizeQuery(initialQuery),
          status: 'active',
          started_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) {
        console.error('Conversation creation error:', error);
        throw new Error(`Failed to start conversation: ${error.message}`);
      }

      // Generate AI response
      const aiResponse = await this.generateAIResponse(initialQuery, location, userId);
      
      // Update conversation with AI response
      const updatedConversation = await this.addMessageToConversation(
        conversation.id,
        'ai_response',
        aiResponse.message,
        aiResponse.suggested_products
      );

      // Log support activity
      await this.logSupportActivity(userId, sessionId, 'support_conversation_started', {
        conversation_id: conversation.id,
        location_id: supportLocationId,
        initial_query: initialQuery,
        query_category: conversation.query_category
      });

      return {
        conversation: updatedConversation,
        location: location,
        aiResponse: aiResponse
      };
    } catch (error) {
      console.error('Error in startSupportConversation:', error);
      throw error;
    }
  }

  /**
   * Add message to existing conversation
   * @param {string} conversationId - Conversation UUID
   * @param {string} messageType - Type of message (user_message, ai_response)
   * @param {string} content - Message content
   * @param {Array} suggestedProducts - Array of suggested product IDs
   * @returns {Promise<Object>} - Updated conversation
   */
  async addMessageToConversation(conversationId, messageType, content, suggestedProducts = []) {
    try {
      // Get current conversation
      const { data: conversation, error: fetchError } = await supabaseAdmin
        .from('support_conversations')
        .select('*')
        .eq('id', conversationId)
        .single();

      if (fetchError) {
        throw new Error('Conversation not found');
      }

      // Create new message
      const newMessage = {
        type: messageType,
        content: content,
        timestamp: new Date().toISOString()
      };

      if (suggestedProducts.length > 0) {
        newMessage.suggested_products = suggestedProducts;
      }

      // Update conversation data
      const updatedConversationData = [...(conversation.conversation_data || []), newMessage];
      const updatedSuggestedProducts = suggestedProducts.length > 0 
        ? [...new Set([...(conversation.suggested_products || []), ...suggestedProducts])]
        : conversation.suggested_products;

      const { data: updatedConversation, error } = await supabaseAdmin
        .from('support_conversations')
        .update({
          conversation_data: updatedConversationData,
          suggested_products: updatedSuggestedProducts
        })
        .eq('id', conversationId)
        .select()
        .single();

      if (error) {
        console.error('Conversation update error:', error);
        throw new Error(`Failed to update conversation: ${error.message}`);
      }

      return updatedConversation;
    } catch (error) {
      console.error('Error in addMessageToConversation:', error);
      throw error;
    }
  }

  /**
   * Process user message and generate AI response
   * @param {string} conversationId - Conversation UUID
   * @param {string} userMessage - User's message
   * @param {string} userId - User UUID
   * @returns {Promise<Object>} - AI response
   */
  async processUserMessage(conversationId, userMessage, userId) {
    try {
      // Get conversation context
      const { data: conversation, error } = await supabaseAdmin
        .from('support_conversations')
        .select(`
          *,
          support_location:support_locations(*),
          user:users(name, email)
        `)
        .eq('id', conversationId)
        .single();

      if (error) {
        throw new Error('Conversation not found');
      }

      // Add user message to conversation
      await this.addMessageToConversation(conversationId, 'user_message', userMessage);

      // Generate AI response based on context
      const aiResponse = await this.generateAIResponse(
        userMessage, 
        conversation.support_location, 
        userId, 
        conversation.conversation_data
      );

      // Add AI response to conversation
      const updatedConversation = await this.addMessageToConversation(
        conversationId,
        'ai_response',
        aiResponse.message,
        aiResponse.suggested_products
      );

      // Log interaction
      await this.logSupportActivity(userId, conversation.session_id, 'support_message_processed', {
        conversation_id: conversationId,
        user_message: userMessage,
        ai_response: aiResponse.message,
        suggested_products_count: aiResponse.suggested_products?.length || 0
      });

      return {
        conversation: updatedConversation,
        aiResponse: aiResponse
      };
    } catch (error) {
      console.error('Error in processUserMessage:', error);
      throw error;
    }
  }

  /**
   * Generate AI response using ElevenLabs and product knowledge
   * @param {string} userQuery - User's query
   * @param {Object} supportLocation - Support location details
   * @param {string} userId - User UUID
   * @param {Array} conversationHistory - Previous conversation messages
   * @returns {Promise<Object>} - AI response with suggestions
   */
  async generateAIResponse(userQuery, supportLocation, userId, conversationHistory = []) {
    try {
      // Analyze query intent and extract product requirements
      const queryAnalysis = await this.analyzeUserQuery(userQuery, conversationHistory);
      
      let suggestedProducts = [];
      let responseMessage = '';

      switch (queryAnalysis.intent) {
        case 'product_search':
          suggestedProducts = await this.searchProductsForQuery(queryAnalysis);
          responseMessage = await this.generateProductSearchResponse(queryAnalysis, suggestedProducts);
          break;
        
        case 'product_comparison':
          suggestedProducts = await this.getProductComparisons(queryAnalysis);
          responseMessage = await this.generateComparisonResponse(queryAnalysis, suggestedProducts);
          break;
        
        case 'general_help':
          responseMessage = await this.generateHelpResponse(queryAnalysis, supportLocation);
          break;
        
        case 'navigation':
          responseMessage = await this.generateNavigationResponse(queryAnalysis, supportLocation);
          break;
        
        default:
          responseMessage = await this.generateFallbackResponse(queryAnalysis, supportLocation);
      }

      // Generate audio response if ElevenLabs is configured
      let audioResponse = null;
      if (this.elevenLabsApiKey) {
        audioResponse = await this.generateAudioResponse(responseMessage, supportLocation.avatar_config?.voice || 'female');
      }

      return {
        message: responseMessage,
        suggested_products: suggestedProducts,
        audio: audioResponse,
        intent: queryAnalysis.intent,
        confidence: queryAnalysis.confidence
      };
    } catch (error) {
      console.error('Error in generateAIResponse:', error);
      // Return fallback response
      return {
        message: "I'm sorry, I'm having trouble processing your request right now. Could you please rephrase your question?",
        suggested_products: [],
        audio: null,
        intent: 'error',
        confidence: 0
      };
    }
  }

  /**
   * Analyze user query to determine intent and extract requirements
   * @param {string} query - User's query
   * @param {Array} history - Conversation history
   * @returns {Promise<Object>} - Query analysis
   */
  async analyzeUserQuery(query, history = []) {
    const queryLower = query.toLowerCase();
    
    // Product search patterns
    const productSearchKeywords = ['need', 'want', 'buy', 'looking for', 'find', 'get', 'purchase'];
    const tvKeywords = ['tv', 'television', 'smart tv', 'screen', 'display'];
    const mobileKeywords = ['phone', 'mobile', 'smartphone', 'iphone', 'android'];
    const groceryKeywords = ['food', 'fruit', 'vegetable', 'milk', 'bread', 'meat'];
    
    // Navigation patterns
    const navigationKeywords = ['where', 'location', 'direction', 'find section', 'how to get'];
    
    // Comparison patterns
    const comparisonKeywords = ['compare', 'difference', 'better', 'vs', 'versus', 'which one'];
    
    let intent = 'general_help';
    let confidence = 0.5;
    let productCategory = null;
    let specifications = {};
    
    // Determine intent
    if (productSearchKeywords.some(keyword => queryLower.includes(keyword))) {
      intent = 'product_search';
      confidence = 0.8;
      
      // Determine product category
      if (tvKeywords.some(keyword => queryLower.includes(keyword))) {
        productCategory = 'electronics';
        specifications.subcategory = 'TVs';
        
        // Extract TV specifications
        const sizeMatch = queryLower.match(/(\d+)\s*(inch|"|'')/);
        if (sizeMatch) {
          specifications.size = sizeMatch[1] + ' inch';
        }
        
        if (queryLower.includes('smart')) {
          specifications.type = 'smart';
        }
      }
      
      if (mobileKeywords.some(keyword => queryLower.includes(keyword))) {
        productCategory = 'electronics';
        specifications.subcategory = 'Mobiles';
      }
      
      if (groceryKeywords.some(keyword => queryLower.includes(keyword))) {
        productCategory = 'grocery';
        // Could add more specific grocery analysis here
      }
    }
    
    if (comparisonKeywords.some(keyword => queryLower.includes(keyword))) {
      intent = 'product_comparison';
      confidence = 0.8;
    }
    
    if (navigationKeywords.some(keyword => queryLower.includes(keyword))) {
      intent = 'navigation';
      confidence = 0.7;
    }
    
    return {
      intent,
      confidence,
      productCategory,
      specifications,
      originalQuery: query,
      keywords: this.extractKeywords(query)
    };
  }

  /**
   * Search for products based on query analysis
   * @param {Object} queryAnalysis - Analyzed query
   * @returns {Promise<Array>} - Matching products
   */
  async searchProductsForQuery(queryAnalysis) {
    try {
      const { productCategory, specifications, keywords } = queryAnalysis;
      
      if (!productCategory) {
        // General search using keywords
        const searchResults = await this.productsService.searchProducts(keywords.join(' '));
        return searchResults.products.slice(0, 5);
      }
      
      // Category-specific search
      const categoryData = await supabaseAdmin
        .from('categories')
        .select('id')
        .eq('name', productCategory.charAt(0).toUpperCase() + productCategory.slice(1))
        .single();
      
      if (!categoryData.data) {
        return [];
      }
      
      const filters = {
        category_id: categoryData.data.id,
        sort_by: 'rating',
        sort_order: 'desc'
      };
      
      if (specifications.subcategory) {
        const subcategoryData = await supabaseAdmin
          .from('categories')
          .select('id')
          .eq('name', specifications.subcategory)
          .eq('parent_id', categoryData.data.id)
          .single();
        
        if (subcategoryData.data) {
          filters.subcategory_id = subcategoryData.data.id;
        }
      }
      
      const products = await this.productsService.getProductsByCategory(categoryData.data.id, {
        subcategory_id: filters.subcategory_id,
        limit: 5
      });
      
      return products;
    } catch (error) {
      console.error('Error in searchProductsForQuery:', error);
      return [];
    }
  }

  /**
   * Generate product search response
   * @param {Object} queryAnalysis - Query analysis
   * @param {Array} products - Found products
   * @returns {Promise<string>} - Response message
   */
  async generateProductSearchResponse(queryAnalysis, products) {
    if (products.length === 0) {
      return `I couldn't find any products matching your request for "${queryAnalysis.originalQuery}". Could you provide more specific details about what you're looking for?`;
    }
    
    const { specifications } = queryAnalysis;
    let response = '';
    
    if (specifications.subcategory === 'TVs') {
      response = `I found some great TV options for you! `;
      if (specifications.size) {
        response += `Here are ${specifications.size} TVs that might interest you: `;
      }
    } else if (specifications.subcategory === 'Mobiles') {
      response = `I found some excellent smartphone options for you: `;
    } else {
      response = `I found some products that match your request: `;
    }
    
    response += `\n\nHere are my top recommendations:\n`;
    products.forEach((product, index) => {
      const price = product.discount_price || product.price;
      response += `${index + 1}. ${product.name} by ${product.brand} - ${price}\n`;
    });
    
    response += `\nWould you like more details about any of these products, or would you like me to help you narrow down your choices based on specific features?`;
    
    return response;
  }

  /**
   * Generate audio response using ElevenLabs
   * @param {string} text - Text to convert to speech
   * @param {string} voice - Voice type (male, female, neutral)
   * @returns {Promise<Object>} - Audio response data
   */
  async generateAudioResponse(text, voice = 'female') {
    if (!this.elevenLabsApiKey) {
      return null;
    }
    
    try {
      // Voice mapping (you'll need to replace with actual ElevenLabs voice IDs)
      const voiceIds = {
        female: 'EXAVITQu4vr4xnSDxMaL', // Example voice ID
        male: 'VR6AewLTigWG4xSOukaG',   // Example voice ID
        neutral: 'pNInz6obpgDQGcFmaJgB'  // Example voice ID
      };
      
      const voiceId = voiceIds[voice] || voiceIds.female;
      
      const response = await fetch(`${this.elevenLabsBaseUrl}/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': this.elevenLabsApiKey
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5
          }
        })
      });
      
      if (!response.ok) {
        console.error('ElevenLabs API error:', response.statusText);
        return null;
      }
      
      const audioBuffer = await response.arrayBuffer();
      const audioBase64 = Buffer.from(audioBuffer).toString('base64');
      
      return {
        audio_data: audioBase64,
        content_type: 'audio/mpeg',
        voice_used: voice
      };
    } catch (error) {
      console.error('Error generating audio response:', error);
      return null;
    }
  }

  /**
   * End support conversation
   * @param {string} conversationId - Conversation UUID
   * @param {string} userId - User UUID
   * @param {number} satisfactionRating - User satisfaction rating (1-5)
   * @returns {Promise<Object>} - Ended conversation
   */
  async endSupportConversation(conversationId, userId, satisfactionRating = null) {
    try {
      const updateData = {
        status: 'resolved',
        ended_at: new Date().toISOString()
      };
      
      if (satisfactionRating && satisfactionRating >= 1 && satisfactionRating <= 5) {
        updateData.satisfaction_rating = satisfactionRating;
      }
      
      const { data: conversation, error } = await supabaseAdmin
        .from('support_conversations')
        .update(updateData)
        .eq('id', conversationId)
        .eq('user_id', userId)
        .select()
        .single();
      
      if (error) {
        console.error('Conversation end error:', error);
        throw new Error(`Failed to end conversation: ${error.message}`);
      }
      
      // Log conversation end
      await this.logSupportActivity(userId, conversation.session_id, 'support_conversation_ended', {
        conversation_id: conversationId,
        satisfaction_rating: satisfactionRating,
        total_messages: conversation.conversation_data?.length || 0
      });
      
      return conversation;
    } catch (error) {
      console.error('Error in endSupportConversation:', error);
      throw error;
    }
  }

  /**
   * Get conversation history
   * @param {string} conversationId - Conversation UUID
   * @returns {Promise<Object>} - Conversation details
   */
  async getConversationHistory(conversationId) {
    try {
      const { data: conversation, error } = await supabaseAdmin
        .from('support_conversations')
        .select(`
          *,
          support_location:support_locations(*),
          user:users(name, email)
        `)
        .eq('id', conversationId)
        .single();
      
      if (error) {
        throw new Error('Conversation not found');
      }
      
      return conversation;
    } catch (error) {
      console.error('Error in getConversationHistory:', error);
      throw error;
    }
  }

  /**
   * Categorize user query
   * @param {string} query - User query
   * @returns {string} - Query category
   */
  categorizeQuery(query) {
    const queryLower = query.toLowerCase();
    
    if (queryLower.includes('tv') || queryLower.includes('television')) {
      return 'electronics_tv';
    }
    if (queryLower.includes('phone') || queryLower.includes('mobile')) {
      return 'electronics_mobile';
    }
    if (queryLower.includes('food') || queryLower.includes('grocery')) {
      return 'grocery_general';
    }
    if (queryLower.includes('where') || queryLower.includes('location')) {
      return 'navigation';
    }
    if (queryLower.includes('help') || queryLower.includes('support')) {
      return 'general_help';
    }
    
    return 'general_inquiry';
  }

  /**
   * Extract keywords from query
   * @param {string} query - User query
   * @returns {Array} - Extracted keywords
   */
  extractKeywords(query) {
    const stopWords = ['i', 'need', 'want', 'a', 'an', 'the', 'to', 'for', 'and', 'or', 'but'];
    return query
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.includes(word))
      .slice(0, 5); // Limit to 5 keywords
  }

  /**
   * Generate fallback response
   * @param {Object} queryAnalysis - Query analysis
   * @param {Object} supportLocation - Support location
   * @returns {Promise<string>} - Fallback response
   */
  async generateFallbackResponse(queryAnalysis, supportLocation) {
    const responses = [
      "I'd be happy to help you with that! Could you provide a bit more detail about what you're looking for?",
      "I want to make sure I understand your needs correctly. Could you tell me more about what you're shopping for today?",
      "Let me help you find exactly what you need. What specific product or information are you looking for?"
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
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
   * Log support activity
   * @param {string} userId - User UUID
   * @param {string} sessionId - Session UUID
   * @param {string} activityType - Activity type
   * @param {Object} activityData - Activity data
   * @returns {Promise<void>}
   */
  async logSupportActivity(userId, sessionId, activityType, activityData = {}) {
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
      console.error('Support activity logging failed:', error);
      // Don't throw error for logging failures
    }
  }
}

module.exports = VRSupportService;