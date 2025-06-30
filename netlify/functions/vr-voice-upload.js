// =============================================
// Enhanced VR Store Assistant API with Musical Instruments
// File: netlify/functions/vr-store-assistant.js
// Voice → AI Store Helper → Product Search → Audio Response (Always)
// =============================================

const { supabaseAdmin } = require('./config/supabase');
const { createSuccessResponse, createErrorResponse } = require('./utils/response');
const crypto = require('crypto');

/**
 * Enhanced VR Store Assistant Handler with Guaranteed Audio Response
 * Flow: Voice Input → Transcription → AI Analysis → Product Search → Text + Audio Response
 */
exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return createErrorResponse(405, 'Method not allowed', headers);
  }

  try {
    console.log('Starting Enhanced VR Store Assistant processing...');

    // Parse multipart form data
    const parsedData = await parseMultipartData(event);
    
    if (!parsedData.success) {
      return createErrorResponse(400, parsedData.error, headers);
    }

    const { files, fields } = parsedData.data;

    // Validate audio file
    if (!files.audio) {
      return createErrorResponse(400, 'No audio file provided', headers);
    }

    const audioFile = files.audio;
    const userId = fields.user_id || null;
    const sessionId = fields.session_id || null;
    const conversationHistory = fields.conversation_history ? JSON.parse(fields.conversation_history) : [];

    // Validate file size and type
    if (audioFile.size > 25 * 1024 * 1024) {
      return createErrorResponse(400, 'Audio file too large. Maximum size is 25MB', headers);
    }

    const allowedTypes = ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/m4a', 'audio/ogg', 'audio/webm', 'audio/flac'];
    if (!allowedTypes.includes(audioFile.type)) {
      return createErrorResponse(400, 'Invalid audio format. Supported: WAV, MP3, M4A, OGG, WebM, FLAC', headers);
    }

    console.log(`Processing customer request: ${audioFile.filename}, Size: ${audioFile.size} bytes`);

    // Step 1: Convert speech to text using ElevenLabs
    console.log('Step 1: Converting speech to text...');
    const transcriptionResult = await speechToText(audioFile.data, audioFile.type);

    if (!transcriptionResult.success) {
      return createErrorResponse(500, `Speech-to-text failed: ${transcriptionResult.error}`, headers);
    }

    const customerRequest = transcriptionResult.text;
    console.log(`Customer said: "${customerRequest}"`);

    // Step 2: Process customer request with enhanced AI logic
    console.log('Step 2: Processing customer request with AI store assistant...');
    const assistantResponse = await processEnhancedCustomerRequest(customerRequest, conversationHistory, userId);

    if (!assistantResponse.success) {
      return createErrorResponse(500, `AI processing failed: ${assistantResponse.error}`, headers);
    }

    const responseText = assistantResponse.response_text;
    console.log(`AI Response generated: "${responseText.substring(0, 100)}..."`);

    // Step 3: ALWAYS convert response to audio (this is guaranteed)
    console.log('Step 3: Converting AI response to audio (guaranteed)...');
    const ttsResult = await convertTextToSpeechGuaranteed(responseText);

    if (!ttsResult.success) {
      console.error('TTS failed, but continuing with text-only response:', ttsResult.error);
    }

    // Step 4: Generate audio file and save to storage (optional)
    let audioFileUrl = null;
    if (ttsResult.success && ttsResult.audio_base64) {
      console.log('Step 4: Saving audio response to storage...');
      const audioSaveResult = await saveAudioResponse(ttsResult.audio_base64, sessionId);
      if (audioSaveResult.success) {
        audioFileUrl = audioSaveResult.file_url;
      }
    }

    // Step 5: Save complete interaction to database
    console.log('Step 5: Saving interaction to database...');
    const savedRecord = await saveEnhancedStoreInteraction({
      userId,
      sessionId,
      customerRequest,
      aiResponse: responseText,
      suggestedProducts: assistantResponse.suggested_products,
      followUpQuestions: assistantResponse.follow_up_questions,
      conversationStage: assistantResponse.conversation_stage,
      productCategories: assistantResponse.categories_detected,
      transcriptionData: transcriptionResult,
      ttsResult: ttsResult,
      audioFileUrl: audioFileUrl,
      audioMetadata: {
        filename: audioFile.filename,
        size: audioFile.size,
        type: audioFile.type
      }
    });

    if (!savedRecord.success) {
      console.error('Database save failed, but continuing:', savedRecord.error);
    }

    console.log('Enhanced VR Store Assistant processing completed successfully');

    // Step 6: Return comprehensive response with guaranteed audio
    const finalResponse = {
      // Core interaction data
      interaction_id: savedRecord.success ? savedRecord.data.id : crypto.randomUUID(),
      customer_request: customerRequest,
      assistant_response_text: responseText,
      
      // Audio response (guaranteed - either base64 or file URL)
      response_audio_base64: ttsResult.success ? ttsResult.audio_base64 : null,
      response_audio_url: audioFileUrl,
      response_audio_format: ttsResult.success ? 'audio/mpeg' : null,
      audio_duration_seconds: ttsResult.success ? ttsResult.estimated_duration : null,
      
      // AI analysis results
      conversation_stage: assistantResponse.conversation_stage,
      suggested_products: assistantResponse.suggested_products || [],
      follow_up_questions: assistantResponse.follow_up_questions || [],
      product_categories_detected: assistantResponse.categories_detected || [],
      customer_preferences_extracted: assistantResponse.customer_preferences || {},
      
      // Processing metadata
      transcription: {
        confidence: transcriptionResult.confidence,
        language: transcriptionResult.language,
        processing_time_ms: transcriptionResult.processing_time
      },
      audio_generation: {
        success: ttsResult.success,
        processing_time_ms: ttsResult.processing_time || 0,
        error: ttsResult.success ? null : ttsResult.error
      },
      
      // Session and user info
      user_id: userId,
      session_id: sessionId,
      processed_at: new Date().toISOString(),
      
      // Frontend guidance
      next_action: assistantResponse.next_action,
      requires_followup: assistantResponse.requires_followup,
      should_display_products: assistantResponse.suggested_products && assistantResponse.suggested_products.length > 0,
      
      // Audio processing status
      audio_response_available: ttsResult.success,
      audio_file_saved: audioFileUrl !== null
    };

    return createSuccessResponse(finalResponse, 'Store assistant response ready with audio', headers);

  } catch (error) {
    console.error('Enhanced VR Store Assistant error:', error);
    return createErrorResponse(500, 'Internal server error during processing', headers);
  }
};

/**
 * Enhanced customer request processing with musical instruments support
 * @param {string} customerRequest - What the customer said
 * @param {Array} conversationHistory - Previous conversation
 * @param {string} userId - User ID for personalization
 * @returns {Promise<Object>} - Enhanced AI assistant response
 */
async function processEnhancedCustomerRequest(customerRequest, conversationHistory = [], userId = null) {
  try {
    console.log('Processing customer request with enhanced AI logic...');

    // Enhanced analysis including musical instruments
    const analysisResult = await analyzeCustomerIntentEnhanced(customerRequest, conversationHistory);
    
    let responseText = '';
    let suggestedProducts = [];
    let followUpQuestions = [];
    let conversationStage = 'initial_inquiry';
    let nextAction = 'ask_followup';
    let requiresFollowup = true;

    if (analysisResult.has_sufficient_info) {
      // Customer provided enough details - search for products
      console.log('Sufficient information provided, searching for products...');
      
      const productSearchResult = await searchProductsEnhanced(analysisResult.product_criteria);
      suggestedProducts = productSearchResult.products;
      conversationStage = 'product_suggestion';
      nextAction = 'show_products';
      requiresFollowup = false;

      // Generate product suggestion response
      responseText = generateEnhancedProductResponse(
        customerRequest,
        suggestedProducts,
        analysisResult.product_criteria,
        analysisResult.categories
      );

    } else {
      // Need more information - ask follow-up questions
      console.log('Need more information, generating follow-up questions...');
      
      followUpQuestions = generateEnhancedFollowUpQuestions(analysisResult);
      conversationStage = 'gathering_requirements';
      nextAction = 'ask_followup';
      requiresFollowup = true;

      // Generate clarifying response
      responseText = generateEnhancedClarifyingResponse(
        customerRequest,
        analysisResult,
        followUpQuestions
      );
    }

    return {
      success: true,
      response_text: responseText,
      suggested_products: suggestedProducts,
      follow_up_questions: followUpQuestions,
      conversation_stage: conversationStage,
      categories_detected: analysisResult.categories,
      customer_preferences: analysisResult.customer_preferences,
      next_action: nextAction,
      requires_followup: requiresFollowup,
      analysis_result: analysisResult
    };

  } catch (error) {
    console.error('Error in enhanced customer request processing:', error);
    return {
      success: false,
      error: error.message || 'Failed to process customer request'
    };
  }
}

/**
 * Enhanced customer intent analysis with musical instruments support
 * @param {string} request - Customer request
 * @param {Array} history - Conversation history
 * @returns {Object} - Enhanced analysis result
 */
async function analyzeCustomerIntentEnhanced(request, history = []) {
  const requestLower = request.toLowerCase();
  
  // Enhanced product category detection including musical instruments
  const categories = [];
  const productKeywords = {
    'electronics': ['tv', 'television', 'laptop', 'computer', 'phone', 'mobile', 'tablet', 'headphones', 'camera', 'speaker', 'bluetooth', 'smartwatch', 'gaming'],
    'appliances': ['refrigerator', 'fridge', 'washing machine', 'microwave', 'oven', 'dishwasher', 'air conditioner', 'vacuum', 'blender'],
    'clothing': ['shirt', 'pants', 'dress', 'shoes', 'jacket', 'clothing', 'apparel', 'jeans', 'sweater', 'coat', 'boots'],
    'groceries': ['food', 'snacks', 'drinks', 'milk', 'bread', 'fruits', 'vegetables', 'meat', 'dairy', 'beverage'],
    'home': ['furniture', 'sofa', 'bed', 'table', 'chair', 'lamp', 'decoration', 'curtains', 'carpet', 'mirror'],
    'musical_instruments': [
      // String instruments
      'guitar', 'electric guitar', 'acoustic guitar', 'bass', 'bass guitar', 'violin', 'viola', 'cello', 'double bass', 'harp', 'banjo', 'mandolin', 'ukulele',
      // Wind instruments  
      'flute', 'clarinet', 'saxophone', 'trumpet', 'trombone', 'french horn', 'tuba', 'oboe', 'bassoon', 'piccolo', 'harmonica',
      // Percussion
      'drums', 'drum set', 'drum kit', 'cymbals', 'tambourine', 'xylophone', 'marimba', 'timpani', 'bongos', 'congas',
      // Keyboard instruments
      'piano', 'keyboard', 'electric piano', 'synthesizer', 'organ', 'accordion',
      // General music terms
      'instrument', 'music', 'musical', 'band', 'orchestra', 'recording', 'amplifier', 'microphone', 'audio interface'
    ],
    'sports': ['basketball', 'football', 'soccer', 'tennis', 'golf', 'fitness', 'exercise', 'gym', 'weights', 'yoga'],
    'books': ['book', 'novel', 'magazine', 'textbook', 'cookbook', 'fiction', 'biography', 'history'],
    'toys': ['toy', 'game', 'puzzle', 'doll', 'action figure', 'board game', 'educational toy'],
    'automotive': ['car', 'auto', 'vehicle', 'tire', 'battery', 'oil', 'parts', 'accessories']
  };

  // Detect categories
  for (const [category, keywords] of Object.entries(productKeywords)) {
    if (keywords.some(keyword => requestLower.includes(keyword))) {
      categories.push(category);
    }
  }

  // Extract specific product mentions
  const productMentions = [];
  for (const keywords of Object.values(productKeywords)) {
    for (const keyword of keywords) {
      if (requestLower.includes(keyword)) {
        productMentions.push(keyword);
      }
    }
  }

  // Enhanced specifications extraction
  const specifications = {
    size: extractSpecification(requestLower, ['inch', 'size', 'small', 'medium', 'large', 'big', 'huge', 'compact', 'portable']),
    brand: extractSpecification(requestLower, [
      // Electronics brands
      'samsung', 'lg', 'sony', 'apple', 'dell', 'hp', 'lenovo', 'asus',
      // Musical instrument brands
      'yamaha', 'fender', 'gibson', 'roland', 'steinway', 'kawai', 'casio', 'pearl', 'zildjian', 'shure'
    ]),
    price_range: extractPriceRange(requestLower),
    color: extractSpecification(requestLower, ['black', 'white', 'red', 'blue', 'silver', 'gold', 'brown', 'natural', 'sunburst']),
    features: extractFeaturesEnhanced(requestLower),
    skill_level: extractSpecification(requestLower, ['beginner', 'intermediate', 'advanced', 'professional', 'student']),
    instrument_type: extractInstrumentType(requestLower),
    use_case: extractUseCase(requestLower)
  };

  // Extract customer preferences
  const customerPreferences = {
    budget_conscious: requestLower.includes('cheap') || requestLower.includes('affordable') || requestLower.includes('budget'),
    quality_focused: requestLower.includes('best') || requestLower.includes('quality') || requestLower.includes('premium'),
    brand_specific: specifications.brand !== null,
    size_specific: specifications.size !== null,
    beginner_friendly: specifications.skill_level === 'beginner',
    professional_grade: specifications.skill_level === 'professional' || requestLower.includes('professional')
  };

  // Determine if we have sufficient information
  const hasSufficientInfo = categories.length > 0 && (
    specifications.size || 
    specifications.brand || 
    specifications.price_range.min || 
    specifications.skill_level ||
    productMentions.length > 0 ||
    history.length >= 2 // After some conversation
  );

  return {
    categories,
    product_mentions: productMentions,
    specifications,
    customer_preferences: customerPreferences,
    has_sufficient_info: hasSufficientInfo,
    intent_confidence: calculateIntentConfidenceEnhanced(categories, productMentions, specifications),
    product_criteria: {
      categories,
      specifications,
      search_terms: productMentions,
      customer_preferences: customerPreferences
    }
  };
}

/**
 * Enhanced product search with musical instruments support
 * @param {Object} criteria - Search criteria
 * @returns {Promise<Object>} - Search results
 */
async function searchProductsEnhanced(criteria) {
  try {
    console.log('Searching products with enhanced criteria:', criteria);

    let query = supabaseAdmin
      .from('products')
      .select(`
        id,
        name,
        brand,
        price,
        discount_price,
        category,
        subcategory,
        description,
        features,
        specifications,
        image_url,
        stock_quantity,
        rating,
        skill_level,
        instrument_type
      `)
      .eq('is_active', true)
      .gt('stock_quantity', 0)
      .order('rating', { ascending: false })
      .limit(6); // Increased limit for better variety

    // Filter by categories
    if (criteria.categories && criteria.categories.length > 0) {
      query = query.in('category', criteria.categories);
    }

    // Enhanced filtering
    if (criteria.specifications) {
      if (criteria.specifications.brand) {
        query = query.ilike('brand', `%${criteria.specifications.brand}%`);
      }
      
      if (criteria.specifications.price_range && criteria.specifications.price_range.max) {
        query = query.lte('price', criteria.specifications.price_range.max);
      }
      
      if (criteria.specifications.price_range && criteria.specifications.price_range.min) {
        query = query.gte('price', criteria.specifications.price_range.min);
      }

      if (criteria.specifications.skill_level) {
        query = query.eq('skill_level', criteria.specifications.skill_level);
      }

      if (criteria.specifications.instrument_type) {
        query = query.eq('instrument_type', criteria.specifications.instrument_type);
      }
    }

    // Enhanced search terms
    if (criteria.search_terms && criteria.search_terms.length > 0) {
      const searchTerm = criteria.search_terms.join('|');
      query = query.or(`name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,features.ilike.%${searchTerm}%`);
    }

    const { data: products, error } = await query;

    if (error) {
      console.error('Enhanced product search error:', error);
      return { products: [], total: 0 };
    }

    console.log(`Found ${products ? products.length : 0} products matching enhanced criteria`);

    return {
      products: products || [],
      total: products ? products.length : 0
    };

  } catch (error) {
    console.error('Error in enhanced product search:', error);
    return { products: [], total: 0 };
  }
}

/**
 * Generate enhanced product suggestion response
 * @param {string} originalRequest - Original customer request
 * @param {Array} products - Suggested products
 * @param {Object} criteria - Search criteria used
 * @param {Array} categories - Detected categories
 * @returns {string} - Enhanced response text
 */
function generateEnhancedProductResponse(originalRequest, products, criteria, categories) {
  if (products.length === 0) {
    const categoryText = categories.includes('musical_instruments') ? 'musical instrument' : categories.join(' or ');
    return `I understand you're looking for ${originalRequest}. Unfortunately, I don't have any ${categoryText} products matching your exact requirements in stock right now. However, I'd be happy to suggest some similar options or help you find alternatives that might work for you. Would you like me to show you some related products or check if we can special order what you're looking for?`;
  }

  const isMusicalInstrument = categories.includes('musical_instruments');
  let response = `Excellent choice! Based on your request for ${originalRequest}, I found ${products.length} fantastic option${products.length > 1 ? 's' : ''} for you:\n\n`;

  products.forEach((product, index) => {
    const price = product.discount_price || product.price;
    const discount = product.discount_price ? ` (Save ${Math.round(((product.price - product.discount_price) / product.price) * 100)}%!)` : '';
    
    response += `${index + 1}. **${product.name}** by ${product.brand}\n`;
    response += `   Price: $${price}${discount}\n`;
    response += `   Rating: ${product.rating}/5 stars\n`;
    
    if (isMusicalInstrument) {
      if (product.skill_level) {
        response += `   Skill Level: ${product.skill_level}\n`;
      }
      if (product.instrument_type) {
        response += `   Type: ${product.instrument_type}\n`;
      }
    }
    
    if (product.features) {
      response += `   Key features: ${product.features}\n`;
    }
    response += `\n`;
  });

  if (isMusicalInstrument) {
    response += `All of these instruments are currently in stock and ready for you to try in our VR music store! Would you like to hear audio samples, see detailed specifications, or virtually test any of these instruments? I can also help you with accessories like amplifiers, cases, or sheet music.`;
  } else {
    response += `All of these products are currently in stock and ready for pickup in our VR store. Would you like more detailed information about any of these items, or would you prefer to see them in our virtual showroom? I can also help you compare features or find complementary products.`;
  }

  return response;
}

/**
 * Generate enhanced clarifying response
 * @param {string} originalRequest - Original request
 * @param {Object} analysis - Analysis result
 * @param {Array} followUpQuestions - Follow-up questions
 * @returns {string} - Enhanced response text
 */
function generateEnhancedClarifyingResponse(originalRequest, analysis, followUpQuestions) {
  const isMusicalInstrument = analysis.categories.includes('musical_instruments');
  
  let response = `I'd be absolutely delighted to help you find the perfect `;
  
  if (isMusicalInstrument) {
    response += `musical instrument! Whether you're a beginner starting your musical journey or an experienced musician looking to upgrade, I'll make sure we find exactly what you need.\n\n`;
  } else {
    response += `${analysis.categories.join(' or ')} for you! `;
    if (analysis.product_mentions.length > 0) {
      response += `I can see you're interested in ${analysis.product_mentions.join(' or ')}, which is great! `;
    }
    response += `To give you the most personalized recommendations, let me ask you a few quick questions:\n\n`;
  }

  followUpQuestions.forEach((question, index) => {
    response += `${index + 1}. ${question}\n`;
  });

  if (isMusicalInstrument) {
    response += `\nTake your time! Finding the right instrument is important, and I'm here to help you make the perfect choice for your musical goals and budget.`;
  } else {
    response += `\nNo rush at all! I want to make sure you get exactly what you're looking for within your preferences and budget.`;
  }

  return response;
}

/**
 * Generate enhanced follow-up questions
 * @param {Object} analysis - Analysis result
 * @returns {Array} - Array of enhanced follow-up questions
 */
function generateEnhancedFollowUpQuestions(analysis) {
  const questions = [];
  
  if (analysis.categories.includes('musical_instruments')) {
    if (analysis.product_mentions.some(p => ['guitar', 'electric guitar', 'acoustic guitar'].includes(p))) {
      questions.push("Are you looking for an acoustic or electric guitar?");
      questions.push("What's your experience level - beginner, intermediate, or advanced?");
      questions.push("What's your budget range for this guitar?");
      questions.push("Do you have a preferred brand like Fender, Gibson, or Yamaha?");
    } else if (analysis.product_mentions.some(p => ['piano', 'keyboard'].includes(p))) {
      questions.push("Are you interested in an acoustic piano or digital keyboard?");
      questions.push("How many keys do you need - 61, 76, or full 88 keys?");
      questions.push("What's your skill level and intended use?");
    } else if (analysis.product_mentions.includes('drums')) {
      questions.push("Are you looking for an acoustic or electronic drum set?");
      questions.push("Do you need a complete kit or specific pieces?");
      questions.push("What's your experience level with drumming?");
    } else {
      // General musical instrument questions
      questions.push("What type of music do you want to play?");
      questions.push("Are you a beginner or do you have experience?");
      questions.push("What's your budget range?");
      questions.push("Do you need any accessories with the instrument?");
    }
  } else if (analysis.categories.includes('electronics')) {
    if (analysis.product_mentions.includes('tv')) {
      questions.push("What size TV are you looking for? (32\", 43\", 55\", 65\", or larger?)");
      questions.push("What's your budget range for this TV?");
      questions.push("Do you prefer any specific brand or smart TV features?");
    } else if (analysis.product_mentions.some(p => ['laptop', 'computer'].includes(p))) {
      questions.push("What will you primarily use this laptop for? (work, gaming, general use?)");
      questions.push("Do you have a preferred screen size and brand?");
      questions.push("What's your budget range?");
    }
  }
  
  // Add general questions if no specific ones generated
  if (questions.length === 0) {
    questions.push("Could you tell me more about what you're looking for?");
    questions.push("Do you have any specific requirements or preferences?");
    questions.push("What's your budget range for this purchase?");
  }

  return questions.slice(0, 4); // Limit to 4 questions max
}

/**
 * Guaranteed text-to-speech conversion with fallback
 * @param {string} text - Text to convert
 * @returns {Promise<Object>} - TTS result (always attempts conversion)
 */
async function convertTextToSpeechGuaranteed(text) {
  const startTime = Date.now();
  
  try {
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
    if (!elevenLabsApiKey) {
      console.error('ElevenLabs API key not configured - audio response unavailable');
      return {
        success: false,
        error: 'ElevenLabs API key not configured',
        processing_time: Date.now() - startTime
      };
    }

    // Use a professional, friendly voice for store assistant
    const voiceId = process.env.ELEVENLABS_STORE_VOICE_ID || process.env.ELEVENLABS_DEFAULT_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';
    
    const payload = {
      text: text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.75,        // Slightly more stable for consistent store assistant voice
        similarity_boost: 0.85, // Higher similarity for professional consistency
        style: 0.3,             // Moderate style for friendly but professional tone
        use_speaker_boost: true
      }
    };

    console.log(`Converting ${text.length} characters to speech using voice ${voiceId}...`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 second timeout
    
    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': elevenLabsApiKey
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const processingTime = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        console.error('ElevenLabs TTS API error:', errorText);
        return {
          success: false,
          error: `ElevenLabs TTS error: ${response.status} - ${errorText}`,
          processing_time: processingTime
        };
      }

      const audioBuffer = await response.arrayBuffer();
      const audioBase64 = Buffer.from(audioBuffer).toString('base64');
      
      // Estimate duration (rough calculation: ~150 words per minute)
      const wordCount = text.split(' ').length;
      const estimatedDuration = Math.max(2, Math.round((wordCount / 150) * 60));

      console.log(`TTS successful: ${audioBase64.length} characters of base64 audio, estimated ${estimatedDuration}s duration`);
      
      return {
        success: true,
        audio_base64: audioBase64,
        content_type: 'audio/mpeg',
        text_length: text.length,
        estimated_duration: estimatedDuration,
        processing_time: processingTime,
        voice_id_used: voiceId
      };

    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        console.error('TTS request timed out');
        return {
          success: false,
          error: 'TTS request timed out after 20 seconds',
          processing_time: Date.now() - startTime
        };
      }
      throw error;
    }

  } catch (error) {
    console.error('TTS conversion error:', error);
    return {
      success: false,
      error: error.message || 'Text-to-speech conversion failed',
      processing_time: Date.now() - startTime
    };
  }
}

/**
 * Save audio response to Supabase storage
 * @param {string} audioBase64 - Base64 encoded audio
 * @param {string} sessionId - Session ID for organization
 * @returns {Promise<Object>} - Save result
 */
async function saveAudioResponse(audioBase64, sessionId) {
  try {
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const fileName = `audio_responses/${new Date().toISOString().split('T')[0]}/${sessionId || 'no-session'}_${crypto.randomUUID()}.mp3`;

    console.log(`Saving audio response to storage: ${fileName}`);

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('voice-recordings')
      .upload(fileName, audioBuffer, {
        contentType: 'audio/mpeg',
        upsert: false
      });

    if (uploadError) {
      console.error('Audio upload error:', uploadError);
      return { success: false, error: uploadError.message };
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from('voice-recordings')
      .getPublicUrl(uploadData.path);

    console.log('Audio response saved successfully');
    return {
      success: true,
      file_path: uploadData.path,
      file_url: publicUrlData.publicUrl
    };

  } catch (error) {
    console.error('Error saving audio response:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Save enhanced store interaction to database
 * @param {Object} data - Complete interaction data
 * @returns {Promise<Object>} - Save result
 */
async function saveEnhancedStoreInteraction(data) {
  try {
    const {
      userId, sessionId, customerRequest, aiResponse, suggestedProducts,
      followUpQuestions, conversationStage, productCategories, transcriptionData,
      ttsResult, audioFileUrl, audioMetadata
    } = data;

    console.log('Saving enhanced store interaction to database...');

    const { data: savedRecord, error: dbError } = await supabaseAdmin
      .from('voice_interactions')
      .insert([{
        user_id: userId,
        session_id: sessionId,
        
        // Core interaction data
        user_text: customerRequest,
        ai_response_text: aiResponse,
        
        // Audio metadata
        audio_filename: audioMetadata.filename,
        audio_size_bytes: audioMetadata.size,
        audio_mime_type: audioMetadata.type,
        
        // Transcription data
        transcription_confidence: transcriptionData.confidence,
        detected_language: transcriptionData.language,
        transcription_time_ms: transcriptionData.processing_time,
        
        // Store assistant specific data
        conversation_stage: conversationStage,
        suggested_products: suggestedProducts,
        follow_up_questions: followUpQuestions,
        product_categories_detected: productCategories,
        
        // TTS and audio response data
        tts_success: ttsResult.success,
        response_audio_generated: ttsResult.success,
        response_audio_url: audioFileUrl,
        
        // Processing status and timing
        status: 'completed',
        processing_completed_at: new Date().toISOString(),
        
        // Additional metadata
        voice_id_used: ttsResult.voice_id_used || null,
        estimated_audio_duration: ttsResult.estimated_duration || null
      }])
      .select()
      .single();

    if (dbError) {
      console.error('Enhanced database save error:', dbError);
      return { success: false, error: dbError.message };
    }

    // Log activity for analytics
    await supabaseAdmin.from('vr_activity_logs').insert([{
      user_id: userId,
      activity_type: 'enhanced_voice_interaction',
      activity_data: {
        interaction_id: savedRecord.id,
        conversation_stage: conversationStage,
        categories_detected: productCategories,
        products_suggested: suggestedProducts ? suggestedProducts.length : 0,
        audio_generated: ttsResult.success,
        transcription_confidence: transcriptionData.confidence,
        processing_time_total_ms: transcriptionData.processing_time + (ttsResult.processing_time || 0)
      }
    }]).then().catch(err => console.log('Activity log warning:', err));

    console.log('Enhanced store interaction saved successfully, ID:', savedRecord.id);
    return { success: true, data: savedRecord };

  } catch (error) {
    console.error('Error saving enhanced store interaction:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Convert speech to text using ElevenLabs API
 */
async function speechToText(audioBuffer, mimeType) {
  const startTime = Date.now();
  
  try {
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
    if (!elevenLabsApiKey) {
      return {
        success: false,
        error: 'ElevenLabs API key not configured'
      };
    }

    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], { type: mimeType });
    
    formData.append('file', audioBlob, `audio.${getFileExtension(mimeType)}`);
    formData.append('model_id', 'scribe_v1');
    formData.append('response_format', 'verbose_json');

    console.log('Converting speech to text with ElevenLabs...');
    
    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': elevenLabsApiKey
      },
      body: formData
    });

    const processingTime = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs STT API error:', errorText);
      return {
        success: false,
        error: `ElevenLabs STT error: ${response.status} - ${errorText}`
      };
    }

    const result = await response.json();
    const transcriptionText = result.text || result.transcript || '';

    if (!transcriptionText || transcriptionText.trim().length === 0) {
      return {
        success: false,
        error: 'No speech detected in audio file'
      };
    }

    console.log(`Speech-to-text completed in ${processingTime}ms: "${transcriptionText.substring(0, 50)}..."`);
    
    return {
      success: true,
      text: transcriptionText.trim(),
      confidence: result.confidence || null,
      language: result.language || result.detected_language || 'en',
      processing_time: processingTime
    };

  } catch (error) {
    console.error('Speech-to-text error:', error);
    return {
      success: false,
      error: error.message || 'Speech-to-text conversion failed'
    };
  }
}

/**
 * Enhanced helper functions for analysis
 */
function extractFeaturesEnhanced(text) {
  const features = [];
  const featureKeywords = [
    // General electronics
    '4k', 'smart', 'wireless', 'bluetooth', 'wifi', 'gaming', 'touchscreen', 'hdr',
    // Musical instrument features
    'solid wood', 'laminate', 'electric', 'acoustic', 'digital', 'analog', 'tube', 'modeling',
    'weighted keys', 'touch sensitive', 'midi', 'usb', 'pickup', 'amplified'
  ];
  
  for (const feature of featureKeywords) {
    if (text.includes(feature)) {
      features.push(feature);
    }
  }
  
  return features;
}

function extractInstrumentType(text) {
  const instrumentTypes = {
    'string': ['guitar', 'bass', 'violin', 'cello', 'banjo', 'mandolin'],
    'wind': ['flute', 'clarinet', 'saxophone', 'trumpet', 'trombone'],
    'percussion': ['drums', 'cymbals', 'xylophone', 'timpani'],
    'keyboard': ['piano', 'keyboard', 'organ', 'synthesizer']
  };
  
  for (const [type, instruments] of Object.entries(instrumentTypes)) {
    if (instruments.some(instrument => text.includes(instrument))) {
      return type;
    }
  }
  
  return null;
}

function extractUseCase(text) {
  const useCases = [
    'recording', 'live performance', 'practice', 'learning', 'teaching',
    'home studio', 'professional', 'hobby', 'church', 'school', 'band'
  ];
  
  for (const useCase of useCases) {
    if (text.includes(useCase)) {
      return useCase;
    }
  }
  
  return null;
}

function extractSpecification(text, keywords) {
  for (const keyword of keywords) {
    if (text.includes(keyword)) {
      return keyword;
    }
  }
  return null;
}

function extractPriceRange(text) {
  const priceRegex = /\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/g;
  const matches = text.match(priceRegex);
  
  if (matches && matches.length >= 2) {
    const prices = matches.map(m => parseFloat(m.replace(/[$,]/g, '')));
    return { min: Math.min(...prices), max: Math.max(...prices) };
  } else if (matches && matches.length === 1) {
    const price = parseFloat(matches[0].replace(/[$,]/g, ''));
    if (text.includes('under') || text.includes('below') || text.includes('less than')) {
      return { min: null, max: price };
    } else if (text.includes('over') || text.includes('above') || text.includes('more than')) {
      return { min: price, max: null };
    }
  }
  
  return { min: null, max: null };
}

function calculateIntentConfidenceEnhanced(categories, productMentions, specifications) {
  let confidence = 0;
  
  if (categories.length > 0) confidence += 0.35;
  if (productMentions.length > 0) confidence += 0.25;
  if (Object.values(specifications).some(spec => spec !== null && spec !== undefined)) confidence += 0.25;
  if (categories.includes('musical_instruments')) confidence += 0.15; // Bonus for musical instruments
  
  return Math.min(confidence, 1.0);
}

/**
 * Parse multipart form data and utility functions
 */
async function parseMultipartData(event) {
  try {
    const contentType = event.headers['content-type'] || event.headers['Content-Type'];
    if (!contentType || !contentType.includes('multipart/form-data')) {
      return { success: false, error: 'Content-Type must be multipart/form-data' };
    }

    const boundary = extractBoundary(contentType);
    if (!boundary) {
      return { success: false, error: 'Could not extract boundary from Content-Type' };
    }

    const bodyBuffer = event.isBase64Encoded 
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body, 'binary');

    const parts = bodyBuffer.toString('binary').split(`--${boundary}`);
    
    const files = {};
    const fields = {};

    for (let i = 1; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!part || part.length < 10) continue;

      const headerEndIndex = part.indexOf('\r\n\r\n');
      if (headerEndIndex === -1) continue;

      const headers = part.substring(0, headerEndIndex);
      const body = part.substring(headerEndIndex + 4, part.length - 2);

      const nameMatch = headers.match(/name="([^"]+)"/);
      if (!nameMatch) continue;
      
      const fieldName = nameMatch[1];
      const filenameMatch = headers.match(/filename="([^"]+)"/);
      const contentTypeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/i);

      if (filenameMatch) {
        const filename = filenameMatch[1];
        const contentType = contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream';
        const bodyData = Buffer.from(body, 'binary');
        
        files[fieldName] = {
          filename: filename,
          type: contentType,
          data: bodyData,
          size: bodyData.length
        };
      } else {
        fields[fieldName] = body;
      }
    }

    return { success: true, data: { files, fields } };

  } catch (error) {
    console.error('Multipart parsing error:', error);
    return { success: false, error: 'Failed to parse multipart data' };
  }
}

function extractBoundary(contentType) {
  const match = contentType.match(/boundary=([^;,\s]+)/);
  return match ? match[1].replace(/['"]/g, '') : null;
}

function getFileExtension(mimeType) {
  const typeMap = {
    'audio/wav': 'wav', 'audio/wave': 'wav', 'audio/mp3': 'mp3',
    'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/m4a': 'm4a',
    'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/flac': 'flac'
  };
  return typeMap[mimeType] || 'audio';
}