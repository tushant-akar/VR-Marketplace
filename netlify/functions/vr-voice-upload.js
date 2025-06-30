// =============================================
// Streamlined Voice Processing API
// File: netlify/functions/vr-voice-process.js
// Speech → ElevenLabs → n8n → Supabase (Complete Workflow)
// =============================================

const { supabaseAdmin } = require('./config/supabase');
const { createSuccessResponse, createErrorResponse } = require('./utils/response');
const crypto = require('crypto');

/**
 * Complete Voice Processing API Handler
 * Flow: Audio Upload → Speech-to-Text → n8n Processing → Save Response
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
    console.log('Starting streamlined voice processing...');

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

    // Validate file
    if (audioFile.size > 25 * 1024 * 1024) { // 25MB limit
      return createErrorResponse(400, 'Audio file too large. Maximum size is 25MB', headers);
    }

    const allowedTypes = ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/m4a', 'audio/ogg', 'audio/webm', 'audio/flac'];
    if (!allowedTypes.includes(audioFile.type)) {
      return createErrorResponse(400, 'Invalid audio format. Supported: WAV, MP3, M4A, OGG, WebM, FLAC', headers);
    }

    console.log(`Processing audio file: ${audioFile.filename}, Size: ${audioFile.size} bytes`);

    // Step 1: Convert speech to text using ElevenLabs
    console.log('Step 1: Converting speech to text...');
    const transcriptionResult = await speechToText(audioFile.data, audioFile.type);

    if (!transcriptionResult.success) {
      return createErrorResponse(500, `Speech-to-text failed: ${transcriptionResult.error}`, headers);
    }

    const userText = transcriptionResult.text;
    console.log(`Transcription successful: "${userText.substring(0, 100)}..."`);

    // Step 2: Send transcribed text to n8n for processing
    console.log('Step 2: Sending to n8n for processing...');
    const n8nResult = await sendToN8n(userText);

    if (!n8nResult.success) {
      return createErrorResponse(500, `n8n processing failed: ${n8nResult.error}`, headers);
    }

    const aiResponse = n8nResult.response;
    console.log(`n8n response received: "${aiResponse.substring(0, 100)}..."`);

    // Step 3: Save complete interaction to Supabase
    console.log('Step 3: Saving to database...');
    const savedRecord = await saveToDatabase({
      userId,
      sessionId,
      userText,
      aiResponse,
      transcriptionData: transcriptionResult,
      n8nData: n8nResult,
      audioMetadata: {
        filename: audioFile.filename,
        size: audioFile.size,
        type: audioFile.type
      }
    });

    if (!savedRecord.success) {
      return createErrorResponse(500, `Database save failed: ${savedRecord.error}`, headers);
    }

    console.log('Voice processing completed successfully');

    // Step 4: Return complete response
    return createSuccessResponse({
      // Interaction data
      interaction_id: savedRecord.data.id,
      user_input: userText,
      ai_response: aiResponse,
      
      // Processing metadata
      transcription: {
        confidence: transcriptionResult.confidence,
        language: transcriptionResult.language,
        processing_time_ms: transcriptionResult.processing_time
      },
      n8n_processing: {
        processing_time_ms: n8nResult.processing_time,
        status: 'completed'
      },
      
      // Session info
      user_id: userId,
      session_id: sessionId,
      processed_at: savedRecord.data.created_at,
      
      // Audio info
      audio_metadata: {
        filename: audioFile.filename,
        size_bytes: audioFile.size,
        duration_estimate_seconds: Math.round(audioFile.size / (16 * 1024)) // Rough estimate
      }
    }, 'Voice processed successfully', headers);

  } catch (error) {
    console.error('Voice processing error:', error);
    return createErrorResponse(500, 'Internal server error during voice processing', headers);
  }
};

/**
 * Convert speech to text using ElevenLabs API
 * @param {Buffer} audioBuffer - Audio file buffer
 * @param {string} mimeType - Audio MIME type
 * @returns {Promise<Object>} - Transcription result
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

    // Prepare form data
    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], { type: mimeType });
    
    formData.append('file', audioBlob, `audio.${getFileExtension(mimeType)}`);
    formData.append('model_id', 'scribe_v1');
    formData.append('response_format', 'verbose_json');

    console.log('Calling ElevenLabs Speech-to-Text API...');
    
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
      console.error('ElevenLabs API error:', errorText);
      return {
        success: false,
        error: `ElevenLabs API error: ${response.status} - ${errorText}`
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

    console.log(`Speech-to-text completed in ${processingTime}ms`);
    
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
 * Send text to n8n workflow and wait for response
 * @param {string} text - Text to process
 * @returns {Promise<Object>} - n8n processing result
 */
async function sendToN8n(text) {
  const startTime = Date.now();
  
  try {
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
    if (!n8nWebhookUrl) {
      return {
        success: false,
        error: 'N8N_WEBHOOK_URL not configured'
      };
    }

    const payload = {
      "text": text,
      "user_input": text,
      "query": text,
      "requirement": text
    };

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    // Add authentication if configured
    const authToken = process.env.N8N_WEBHOOK_AUTH_TOKEN;
    if (authToken && authToken.trim() !== '') {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    console.log('Sending to n8n webhook:', n8nWebhookUrl);
    console.log('Payload:', JSON.stringify(payload, null, 2));
    
    const response = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });

    const processingTime = Date.now() - startTime;
    console.log(`n8n response received in ${processingTime}ms, status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('n8n webhook error:', errorText);
      return {
        success: false,
        error: `n8n webhook error: ${response.status} - ${errorText}`
      };
    }

    // Parse n8n response
    let responseText;
    const contentType = response.headers.get('content-type');
    
    if (contentType && contentType.includes('application/json')) {
      const responseData = await response.json();
      console.log('n8n JSON response:', responseData);
      
      // Extract text from various possible response formats
      responseText = responseData.response || 
                   responseData.text || 
                   responseData.message || 
                   responseData.result || 
                   responseData.output ||
                   JSON.stringify(responseData);
    } else {
      responseText = await response.text();
    }

    // Validate response
    if (!responseText || responseText.trim().length === 0) {
      return {
        success: false,
        error: 'Empty response from n8n'
      };
    }

    // Check for workflow started messages (means async processing)
    if (responseText.toLowerCase().includes('workflow') && 
        (responseText.toLowerCase().includes('started') || responseText.toLowerCase().includes('triggered'))) {
      
      console.log('Received workflow started message, providing default response');
      responseText = `Thank you for your request: "${text}". I'm processing your query and will provide you with the best recommendations shortly.`;
    }

    return {
      success: true,
      response: responseText.trim(),
      processing_time: processingTime,
      status_code: response.status
    };

  } catch (error) {
    console.error('n8n request error:', error);
    return {
      success: false,
      error: error.message || 'Failed to process request with n8n'
    };
  }
}

/**
 * Save interaction data to Supabase
 * @param {Object} data - Complete interaction data
 * @returns {Promise<Object>} - Save result
 */
async function saveToDatabase(data) {
  try {
    const {
      userId,
      sessionId,
      userText,
      aiResponse,
      transcriptionData,
      n8nData,
      audioMetadata
    } = data;

    console.log('Saving interaction to database...');

    // Insert into voice_interactions table
    const { data: savedRecord, error: dbError } = await supabaseAdmin
      .from('voice_interactions')
      .insert([{
        user_id: userId,
        session_id: sessionId,
        
        // User input data
        user_text: userText,
        audio_filename: audioMetadata.filename,
        audio_size_bytes: audioMetadata.size,
        audio_mime_type: audioMetadata.type,
        
        // Transcription data
        transcription_confidence: transcriptionData.confidence,
        detected_language: transcriptionData.language,
        transcription_time_ms: transcriptionData.processing_time,
        
        // AI response data
        ai_response_text: aiResponse,
        n8n_processing_time_ms: n8nData.processing_time,
        n8n_status_code: n8nData.status_code,
        
        // Metadata
        processing_completed_at: new Date().toISOString(),
        status: 'completed'
      }])
      .select()
      .single();

    if (dbError) {
      console.error('Database save error:', dbError);
      return {
        success: false,
        error: `Database error: ${dbError.message}`
      };
    }

    // Log activity
    await supabaseAdmin.from('vr_activity_logs').insert([{
      user_id: userId,
      activity_type: 'voice_interaction_completed',
      activity_data: {
        interaction_id: savedRecord.id,
        user_text_length: userText.length,
        ai_response_length: aiResponse.length,
        transcription_confidence: transcriptionData.confidence,
        total_processing_time_ms: transcriptionData.processing_time + n8nData.processing_time
      }
    }]).then().catch(err => console.log('Activity log warning:', err));

    console.log('Interaction saved successfully, ID:', savedRecord.id);

    return {
      success: true,
      data: savedRecord
    };

  } catch (error) {
    console.error('Database save error:', error);
    return {
      success: false,
      error: error.message || 'Failed to save to database'
    };
  }
}

/**
 * Parse multipart form data
 * @param {Object} event - Netlify event object
 * @returns {Promise<Object>} - Parsed data
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
        // This is a file
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
        // This is a text field
        fields[fieldName] = body;
      }
    }

    return { success: true, data: { files, fields } };

  } catch (error) {
    console.error('Multipart parsing error:', error);
    return { success: false, error: 'Failed to parse multipart data' };
  }
}

/**
 * Extract boundary from Content-Type header
 * @param {string} contentType - Content-Type header value
 * @returns {string|null} - Boundary string
 */
function extractBoundary(contentType) {
  const match = contentType.match(/boundary=([^;,\s]+)/);
  return match ? match[1].replace(/['"]/g, '') : null;
}

/**
 * Get file extension from MIME type
 * @param {string} mimeType - MIME type
 * @returns {string} - File extension
 */
function getFileExtension(mimeType) {
  const typeMap = {
    'audio/wav': 'wav',
    'audio/wave': 'wav',
    'audio/mp3': 'mp3',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/m4a': 'm4a',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
    'audio/flac': 'flac'
  };
  
  return typeMap[mimeType] || 'audio';
}