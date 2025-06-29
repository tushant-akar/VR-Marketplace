// =============================================
// Complete Voice Upload with Round-trip Processing
// File: netlify/functions/vr-voice-upload.js
// Upload → Transcribe → n8n → Response → TTS → Frontend
// =============================================

const { supabaseAdmin } = require('./config/supabase');
const { createSuccessResponse, createErrorResponse } = require('./utils/response');
const crypto = require('crypto');

/**
 * Complete Voice Upload API Handler with Round-trip Processing
 * Flow: Upload → Transcribe → n8n → Get Response → Convert to Voice → Return Both
 */
exports.handler = async (event, context) => {
  // Increase timeout for complete processing
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
    console.log('Starting complete voice processing workflow...');

    // Parse multipart data
    const contentType = event.headers['content-type'] || event.headers['Content-Type'];
    if (!contentType || !contentType.includes('multipart/form-data')) {
      return createErrorResponse(400, 'Content-Type must be multipart/form-data', headers);
    }

    const parsedData = await parseMultipartDataFast(event);
    
    if (!parsedData.success) {
      return createErrorResponse(400, parsedData.error, headers);
    }

    const { files, fields } = parsedData.data;

    // Validate inputs
    if (!files.voice) {
      return createErrorResponse(400, 'No voice file provided', headers);
    }

    const voiceFile = files.voice;
    const voice_name = fields.voice_name;
    const description = fields.description || '';

    if (!voice_name || voice_name.trim().length < 2) {
      return createErrorResponse(400, 'Voice name is required (minimum 2 characters)', headers);
    }

    if (voiceFile.size > 100 * 1024 * 1024) {
      return createErrorResponse(400, 'File too large. Maximum size is 100MB', headers);
    }

    const allowedTypes = ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/m4a', 'audio/ogg', 'audio/webm', 'audio/flac', 'audio/aac'];
    if (!allowedTypes.includes(voiceFile.type)) {
      return createErrorResponse(400, 'Invalid file type. Allowed: WAV, MP3, M4A, OGG, WebM, FLAC, AAC', headers);
    }

    console.log(`Processing voice file: ${voice_name}, Size: ${voiceFile.size} bytes`);

    // Step 1: Ensure bucket exists
    const bucketReady = await ensureBucketExists();
    if (!bucketReady) {
      return createErrorResponse(500, 'Storage setup failed', headers);
    }

    // Step 2: Upload file to Supabase Storage
    const fileExtension = getFileExtension(voiceFile.filename || voiceFile.type);
    const uniqueId = crypto.randomUUID();
    const timestamp = new Date().toISOString().split('T')[0];
    const fileName = `voice_uploads/${timestamp}/${uniqueId}_${sanitizeFilename(voice_name)}.${fileExtension}`;

    console.log('Uploading file to storage...');
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('voice-recordings')
      .upload(fileName, voiceFile.data, {
        contentType: voiceFile.type,
        upsert: false
      });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      return createErrorResponse(500, `Upload failed: ${uploadError.message}`, headers);
    }

    console.log('File uploaded successfully, starting transcription...');

    // Step 3: Transcribe audio using ElevenLabs
    const transcriptionResult = await transcribeWithElevenLabs(voiceFile.data, voiceFile.type);

    if (!transcriptionResult.success) {
      console.error('Transcription failed:', transcriptionResult.error);
      return createErrorResponse(500, `Transcription failed: ${transcriptionResult.error}`, headers);
    }

    console.log('Transcription successful, sending to n8n...');

    // Step 4: Send to n8n and wait for response
    const n8nResult = await sendToN8nAndWaitForResponse(transcriptionResult.transcription);

    if (!n8nResult.success) {
      console.error('n8n processing failed:', n8nResult.error);
      return createErrorResponse(500, `n8n processing failed: ${n8nResult.error}`, headers);
    }

    console.log('n8n response received, converting to speech...');

    // Step 5: Convert n8n response to speech using ElevenLabs TTS
    const ttsResult = await convertTextToSpeech(n8nResult.response_text);

    // Step 6: Save everything to database
    const estimatedDurationSeconds = Math.round(voiceFile.size / (128 * 1024 / 8));
    
    const { data: voiceRecord, error: dbError } = await supabaseAdmin
      .from('voice_recordings')
      .insert([{
        voice_name: voice_name.trim(),
        description: description?.trim() || null,
        file_path: uploadData.path,
        file_size_bytes: voiceFile.size,
        mime_type: voiceFile.type,
        duration_seconds: estimatedDurationSeconds,
        
        // Original transcription
        transcription_text: transcriptionResult.transcription,
        transcription_status: 'completed',
        transcription_confidence: transcriptionResult.confidence || null,
        language_detected: transcriptionResult.language || null,
        transcription_completed_at: new Date().toISOString(),
        
        // n8n processing results
        n8n_response_text: n8nResult.response_text,
        n8n_processing_status: 'completed',
        n8n_processing_time_ms: n8nResult.processing_time_ms,
        
        // TTS results
        tts_audio_data: ttsResult.success ? ttsResult.audio_base64 : null,
        tts_status: ttsResult.success ? 'completed' : 'failed',
        tts_error: ttsResult.success ? null : ttsResult.error
      }])
      .select()
      .single();

    if (dbError) {
      console.error('Database insert error:', dbError);
      // Clean up uploaded file if database insert fails
      await supabaseAdmin.storage.from('voice-recordings').remove([uploadData.path]);
      return createErrorResponse(500, 'Failed to save voice data', headers);
    }

    // Step 7: Get public URL for original voice file
    const { data: publicUrlData } = supabaseAdmin.storage
      .from('voice-recordings')
      .getPublicUrl(uploadData.path);

    // Step 8: Log activity
    await supabaseAdmin.from('vr_activity_logs').insert([{
      user_id: null,
      activity_type: 'complete_voice_workflow',
      activity_data: {
        voice_id: voiceRecord.id,
        voice_name: voice_name,
        file_size: voiceFile.size,
        transcription_length: transcriptionResult.transcription.length,
        n8n_response_length: n8nResult.response_text.length,
        tts_success: ttsResult.success,
        total_processing_time_ms: n8nResult.processing_time_ms
      }
    }]).then().catch(err => console.log('Activity log failed:', err));

    console.log('Complete voice workflow finished successfully');

    // Return complete response with both text and audio
    return createSuccessResponse({
      // Voice metadata
      voice_id: voiceRecord.id,
      voice_name: voiceRecord.voice_name,
      description: voiceRecord.description,
      original_file_url: publicUrlData.publicUrl,
      file_size_bytes: voiceFile.size,
      estimated_duration_seconds: estimatedDurationSeconds,
      
      // Processing results
      user_transcription: transcriptionResult.transcription,
      ai_response_text: n8nResult.response_text,
      ai_response_audio: ttsResult.success ? ttsResult.audio_base64 : null,
      ai_response_audio_format: ttsResult.success ? 'audio/mpeg' : null,
      
      // Processing metadata
      transcription_confidence: transcriptionResult.confidence,
      language_detected: transcriptionResult.language,
      n8n_processing_time_ms: n8nResult.processing_time_ms,
      tts_success: ttsResult.success,
      tts_error: ttsResult.success ? null : ttsResult.error,
      
      // Status
      workflow_status: 'completed',
      uploaded_at: voiceRecord.created_at,
      processed_at: new Date().toISOString()
    }, 
    'Voice processed successfully - AI response ready', 
    headers);

  } catch (error) {
    console.error('Complete voice workflow error:', error);
    return createErrorResponse(500, 'Internal server error during voice processing', headers);
  }
};

/**
 * Send transcription to n8n and wait for response
 * @param {string} transcriptionText - Transcribed text to send
 * @returns {Promise<Object>} - n8n response result
 */
async function sendToN8nAndWaitForResponse(transcriptionText) {
  try {
    console.log('Sending to n8n and waiting for response...');
    
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
    if (!n8nWebhookUrl) {
      return {
        success: false,
        error: 'N8N_WEBHOOK_URL not configured'
      };
    }

    const payload = {
      "Requirement": transcriptionText
    };

    const headers = {
      'Content-Type': 'application/json'
    };

    const authToken = process.env.N8N_WEBHOOK_AUTH_TOKEN;
    if (authToken && authToken.trim() !== '') {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    console.log('Calling n8n webhook:', n8nWebhookUrl);
    console.log('Payload:', JSON.stringify(payload, null, 2));
    
    const startTime = Date.now();
    
    const response = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });

    const processingTime = Date.now() - startTime;
    console.log(`n8n webhook response status: ${response.status}, time: ${processingTime}ms`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('n8n webhook error:', errorText);
      return {
        success: false,
        error: `n8n webhook error: ${response.status} - ${errorText}`
      };
    }

    // Get the response text from n8n
    let responseText;
    try {
      const responseData = await response.json();
      // Extract text from different possible response formats
      responseText = responseData.response || responseData.text || responseData.message || JSON.stringify(responseData);
    } catch (e) {
      // If not JSON, treat as plain text
      responseText = await response.text();
    }

    if (!responseText || responseText.trim().length === 0) {
      return {
        success: false,
        error: 'Empty response from n8n'
      };
    }

    console.log(`n8n response received: ${responseText.substring(0, 100)}...`);
    
    return {
      success: true,
      response_text: responseText.trim(),
      processing_time_ms: processingTime,
      status_code: response.status
    };

  } catch (error) {
    console.error('n8n request error:', error);
    return {
      success: false,
      error: error.message || 'Failed to get response from n8n'
    };
  }
}

/**
 * Convert text to speech using ElevenLabs TTS
 * @param {string} text - Text to convert to speech
 * @returns {Promise<Object>} - TTS result with audio data
 */
async function convertTextToSpeech(text) {
  try {
    console.log('Converting text to speech...');
    
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
    if (!elevenLabsApiKey) {
      return {
        success: false,
        error: 'ElevenLabs API key not configured'
      };
    }

    // Use a default voice ID (you can make this configurable)
    const defaultVoiceId = process.env.ELEVENLABS_DEFAULT_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'; // Example voice ID

    const payload = {
      text: text,
      model_id: 'scribe_v1',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.5
      }
    };

    console.log('Calling ElevenLabs TTS API...');
    
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${defaultVoiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': elevenLabsApiKey
      },
      body: JSON.stringify(payload)
    });

    console.log(`ElevenLabs TTS response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs TTS error:', errorText);
      return {
        success: false,
        error: `ElevenLabs TTS error: ${response.status} - ${errorText}`
      };
    }

    const audioBuffer = await response.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');
    
    console.log(`TTS successful: ${audioBase64.length} characters of base64 audio`);
    
    return {
      success: true,
      audio_base64: audioBase64,
      content_type: 'audio/mpeg',
      text_length: text.length
    };

  } catch (error) {
    console.error('TTS error:', error);
    return {
      success: false,
      error: error.message || 'Text-to-speech conversion failed'
    };
  }
}

/**
 * Transcribe audio using ElevenLabs API
 */
async function transcribeWithElevenLabs(audioBuffer, mimeType) {
  try {
    console.log('Starting ElevenLabs transcription...');
    
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
    if (!elevenLabsApiKey) {
      console.error('ElevenLabs API key not configured');
      return {
        success: false,
        error: 'ElevenLabs API key not configured'
      };
    }

    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], { type: mimeType });
    
    formData.append('file', audioBlob, `audio.${getFileExtensionFromMimeType(mimeType)}`);
    formData.append('model_id', 'scribe_v1');
    formData.append('response_format', 'verbose_json');

    console.log('Calling ElevenLabs API...');
    
    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': elevenLabsApiKey
      },
      body: formData
    });

    console.log(`ElevenLabs API response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs API error:', errorText);
      return {
        success: false,
        error: `ElevenLabs API error: ${response.status} - ${errorText}`
      };
    }

    const result = await response.json();
    console.log('ElevenLabs API response received');

    const transcriptionText = result.text || result.transcript || result.transcription || '';
    const confidence = result.confidence || null;
    const detectedLanguage = result.language || result.detected_language || 'en';

    if (!transcriptionText || transcriptionText.trim().length === 0) {
      console.error('No transcription text returned from ElevenLabs');
      return {
        success: false,
        error: 'No transcription text returned from ElevenLabs API'
      };
    }

    console.log(`Transcription successful: ${transcriptionText.length} characters`);
    
    return {
      success: true,
      transcription: transcriptionText.trim(),
      confidence: confidence,
      language: detectedLanguage
    };

  } catch (error) {
    console.error('ElevenLabs transcription error:', error);
    return {
      success: false,
      error: error.message || 'Transcription processing failed'
    };
  }
}

/**
 * Fast multipart parsing optimized for Netlify
 */
async function parseMultipartDataFast(event) {
  try {
    const contentType = event.headers['content-type'] || event.headers['Content-Type'];
    const boundary = extractBoundarySimple(contentType);
    
    if (!boundary) {
      return { success: false, error: 'Could not extract boundary from Content-Type header' };
    }

    const bodyBuffer = event.isBase64Encoded 
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body, 'binary');

    const boundaryString = `--${boundary}`;
    const parts = bodyBuffer.toString('binary').split(boundaryString);
    
    const files = {};
    const fields = {};

    for (let i = 1; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!part || part.length < 10) continue;

      const headerEndIndex = part.indexOf('\r\n\r\n');
      if (headerEndIndex === -1) continue;

      const headers = part.substring(0, headerEndIndex);
      const body = part.substring(headerEndIndex + 4);

      const nameMatch = headers.match(/name="([^"]+)"/);
      if (!nameMatch) continue;
      
      const fieldName = nameMatch[1];
      const filenameMatch = headers.match(/filename="([^"]+)"/);
      const contentTypeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/i);

      if (filenameMatch) {
        const filename = filenameMatch[1];
        const contentType = contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream';
        let bodyData = Buffer.from(body.substring(0, body.length - 2), 'binary');
        
        files[fieldName] = {
          filename: filename,
          type: contentType,
          data: bodyData,
          size: bodyData.length
        };
      } else {
        fields[fieldName] = body.substring(0, body.length - 2);
      }
    }

    return {
      success: true,
      data: { files, fields }
    };

  } catch (error) {
    console.error('Multipart parsing error:', error);
    return { success: false, error: 'Failed to parse multipart data' };
  }
}

function extractBoundarySimple(contentType) {
  const match = contentType.match(/boundary=([^;,\s]+)/);
  return match ? match[1].replace(/['"]/g, '') : null;
}

async function ensureBucketExists() {
  try {
    const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();
    
    if (listError) {
      console.error('Error listing buckets:', listError);
      return false;
    }
    
    const bucketExists = buckets.some(bucket => bucket.id === 'voice-recordings');
    
    if (!bucketExists) {
      console.log('Creating voice-recordings bucket...');
      
      const { data, error: createError } = await supabaseAdmin.storage.createBucket('voice-recordings', {
        public: true,
        fileSizeLimit: 10485760,
        allowedMimeTypes: ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/m4a', 'audio/ogg', 'audio/webm', 'audio/flac', 'audio/aac']
      });
      
      if (createError) {
        console.error('Error creating bucket:', createError);
        return false;
      }
      
      console.log('Voice recordings bucket created successfully');
    }
    
    return true;
  } catch (error) {
    console.error('Error ensuring bucket exists:', error);
    return false;
  }
}

function getFileExtension(input) {
  if (input && input.includes('.')) {
    const parts = input.split('.');
    const ext = parts[parts.length - 1].toLowerCase();
    if (ext && ext.length <= 4) return ext;
  }
  
  return getFileExtensionFromMimeType(input);
}

function getFileExtensionFromMimeType(mimeType) {
  const typeMap = {
    'audio/wav': 'wav',
    'audio/wave': 'wav',
    'audio/mp3': 'mp3',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/m4a': 'm4a',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
    'audio/flac': 'flac',
    'audio/aac': 'aac'
  };
  
  return typeMap[mimeType] || 'audio';
}

function sanitizeFilename(filename) {
  return filename
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 50);
}