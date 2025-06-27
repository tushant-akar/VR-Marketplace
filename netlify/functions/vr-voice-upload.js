// =============================================
// Complete Voice Upload with Auto-Transcription
// File: netlify/functions/vr-voice-upload.js
// Single POST request does everything automatically
// =============================================

const { supabaseAdmin } = require('./config/supabase');
const { createSuccessResponse, createErrorResponse } = require('./utils/response');
const crypto = require('crypto');

/**
 * Complete Voice Upload API Handler
 * Single request: Upload + Transcribe + Save to Database
 */
exports.handler = async (event, context) => {
  // Increase timeout for transcription processing
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
    console.log('Starting complete voice upload process...');

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

    // Step 4: Save to database with transcription
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
        transcription_text: transcriptionResult.success ? transcriptionResult.transcription : null,
        transcription_status: transcriptionResult.success ? 'completed' : 'failed',
        transcription_confidence: transcriptionResult.confidence || null,
        language_detected: transcriptionResult.language || null,
        transcription_error: transcriptionResult.success ? null : transcriptionResult.error,
        transcription_completed_at: transcriptionResult.success ? new Date().toISOString() : null
      }])
      .select()
      .single();

    if (dbError) {
      console.error('Database insert error:', dbError);
      // Clean up uploaded file if database insert fails
      await supabaseAdmin.storage.from('voice-recordings').remove([uploadData.path]);
      return createErrorResponse(500, 'Failed to save voice data', headers);
    }

    // Step 5: Get public URL
    const { data: publicUrlData } = supabaseAdmin.storage
      .from('voice-recordings')
      .getPublicUrl(uploadData.path);

    // Step 6: Log activity
    await supabaseAdmin.from('vr_activity_logs').insert([{
      user_id: null,
      activity_type: 'complete_voice_upload',
      activity_data: {
        voice_id: voiceRecord.id,
        voice_name: voice_name,
        file_size: voiceFile.size,
        transcription_success: transcriptionResult.success,
        transcription_length: transcriptionResult.success ? transcriptionResult.transcription?.length : 0
      }
    }]).then().catch(err => console.log('Activity log failed:', err));

    console.log('Complete voice upload process finished successfully');

    // Return complete response
    return createSuccessResponse({
      voice_id: voiceRecord.id,
      voice_name: voiceRecord.voice_name,
      description: voiceRecord.description,
      file_url: publicUrlData.publicUrl,
      file_size_bytes: voiceFile.size,
      estimated_duration_seconds: estimatedDurationSeconds,
      
      // Transcription results
      transcription_status: voiceRecord.transcription_status,
      transcription_text: voiceRecord.transcription_text,
      transcription_confidence: voiceRecord.transcription_confidence,
      language_detected: voiceRecord.language_detected,
      transcription_error: voiceRecord.transcription_error,
      
      upload_status: 'success',
      uploaded_at: voiceRecord.created_at,
      processed_at: new Date().toISOString()
    }, 
    transcriptionResult.success 
      ? 'Voice uploaded and transcribed successfully' 
      : 'Voice uploaded but transcription failed', 
    headers);

  } catch (error) {
    console.error('Complete voice upload error:', error);
    return createErrorResponse(500, 'Internal server error during voice processing', headers);
  }
};

/**
 * Transcribe audio using ElevenLabs API
 */
async function transcribeWithElevenLabs(audioBuffer, mimeType) {
  try {
    console.log('Starting ElevenLabs transcription...');
    
    // Check API key
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
    if (!elevenLabsApiKey) {
      console.error('ElevenLabs API key not configured');
      return {
        success: false,
        error: 'ElevenLabs API key not configured'
      };
    }

    // Prepare form data for ElevenLabs API
    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], { type: mimeType });
    formData.append('audio', audioBlob, `audio.${getFileExtensionFromMimeType(mimeType)}`);
    
    // Add optional parameters for better transcription
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json');

    console.log('Calling ElevenLabs API...');
    
    // Call ElevenLabs Speech-to-Text API
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

    // Extract transcription data (adjust based on actual ElevenLabs response format)
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

    // Get body as buffer
    const bodyBuffer = event.isBase64Encoded 
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body, 'binary');

    // Simple boundary-based splitting
    const boundaryString = `--${boundary}`;
    const parts = bodyBuffer.toString('binary').split(boundaryString);
    
    const files = {};
    const fields = {};

    // Process each part quickly
    for (let i = 1; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!part || part.length < 10) continue;

      // Find header/body separator
      const headerEndIndex = part.indexOf('\r\n\r\n');
      if (headerEndIndex === -1) continue;

      const headers = part.substring(0, headerEndIndex);
      const body = part.substring(headerEndIndex + 4);

      // Extract field name
      const nameMatch = headers.match(/name="([^"]+)"/);
      if (!nameMatch) continue;
      
      const fieldName = nameMatch[1];

      // Check if it's a file
      const filenameMatch = headers.match(/filename="([^"]+)"/);
      const contentTypeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/i);

      if (filenameMatch) {
        // It's a file
        const filename = filenameMatch[1];
        const contentType = contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream';
        
        // Convert body back to buffer (remove trailing CRLF)
        let bodyData = Buffer.from(body.substring(0, body.length - 2), 'binary');
        
        files[fieldName] = {
          filename: filename,
          type: contentType,
          data: bodyData,
          size: bodyData.length
        };
      } else {
        // It's a regular field
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

/**
 * Extract boundary from Content-Type header
 */
function extractBoundarySimple(contentType) {
  const match = contentType.match(/boundary=([^;,\s]+)/);
  return match ? match[1].replace(/['"]/g, '') : null;
}

/**
 * Ensure the voice-recordings bucket exists
 */
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
        fileSizeLimit: 10485760, // 10MB
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

/**
 * Get file extension from filename or content type
 */
function getFileExtension(input) {
  // Try filename first
  if (input && input.includes('.')) {
    const parts = input.split('.');
    const ext = parts[parts.length - 1].toLowerCase();
    if (ext && ext.length <= 4) return ext;
  }
  
  // Fallback to content type
  return getFileExtensionFromMimeType(input);
}

/**
 * Get file extension from MIME type
 */
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

/**
 * Sanitize filename for storage
 */
function sanitizeFilename(filename) {
  return filename
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 50);
}