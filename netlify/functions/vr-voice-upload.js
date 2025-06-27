// =============================================
// Fixed Voice Upload API Endpoint - Multipart
// File: netlify/functions/vr-voice-upload.js
// Optimized to prevent timeouts, using multipart-parser
// =============================================

const { supabaseAdmin } = require('./config/supabase');
const { createSuccessResponse, createErrorResponse } = require('./utils/response');
const crypto = require('crypto');

/**
 * Voice Upload API Handler - Fixed for timeouts
 * Uses simple multipart parsing without heavy dependencies
 */
exports.handler = async (event, context) => {
  // Set timeout context
  context.callbackWaitsForEmptyEventLoop = false;
  
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return createErrorResponse(405, 'Method not allowed', headers);
  }

  try {
    // Quick validation
    const contentType = event.headers['content-type'] || event.headers['Content-Type'];
    if (!contentType || !contentType.includes('multipart/form-data')) {
      return createErrorResponse(400, 'Content-Type must be multipart/form-data', headers);
    }

    // Parse multipart data efficiently
    const parsedData = await parseMultipartDataFast(event);
    
    if (!parsedData.success) {
      return createErrorResponse(400, parsedData.error, headers);
    }

    const { files, fields } = parsedData.data;

    // Validate voice file
    if (!files.voice) {
      return createErrorResponse(400, 'No voice file provided', headers);
    }

    const voiceFile = files.voice;
    const voice_name = fields.voice_name;
    const description = fields.description || '';

    // Quick validations
    if (!voice_name || voice_name.trim().length < 2) {
      return createErrorResponse(400, 'Voice name is required (minimum 2 characters)', headers);
    }

    // Validate file size (max 100MB)
    if (voiceFile.size > 100 * 1024 * 1024) {
      return createErrorResponse(400, 'File too large. Maximum size is 100MB', headers);
    }

    // Validate file type
    const allowedTypes = ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/m4a', 'audio/ogg', 'audio/webm', 'audio/flac', 'audio/aac'];
    if (!allowedTypes.includes(voiceFile.type)) {
      return createErrorResponse(400, 'Invalid file type. Allowed: WAV, MP3, M4A, OGG, WebM, FLAC, AAC', headers);
    }

    // Generate unique filename
    const fileExtension = getFileExtension(voiceFile.filename || voiceFile.type);
    const uniqueId = crypto.randomUUID();
    const timestamp = new Date().toISOString().split('T')[0];
    const fileName = `voice_uploads/${timestamp}/${uniqueId}_${sanitizeFilename(voice_name)}.${fileExtension}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('voice-recordings')
      .upload(fileName, voiceFile.data, {
        contentType: voiceFile.type,
        upsert: false
      });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      return createErrorResponse(500, 'Failed to upload voice file', headers);
    }

    // Calculate estimated duration
    const estimatedDurationSeconds = Math.round(voiceFile.size / (128 * 1024 / 8));

    // Save to database
    const { data: voiceRecord, error: dbError } = await supabaseAdmin
      .from('voice_recordings')
      .insert([{
        voice_name: voice_name.trim(),
        description: description?.trim() || null,
        file_path: uploadData.path,
        file_size_bytes: voiceFile.size,
        mime_type: voiceFile.type,
        duration_seconds: estimatedDurationSeconds
      }])
      .select()
      .single();

    if (dbError) {
      console.error('Database insert error:', dbError);
      // Clean up uploaded file
      await supabaseAdmin.storage.from('voice-recordings').remove([uploadData.path]);
      return createErrorResponse(500, 'Failed to save voice metadata', headers);
    }

    // Log activity (non-blocking)
    supabaseAdmin.from('vr_activity_logs').insert([{
      user_id: null,
      activity_type: 'voice_upload',
      activity_data: {
        voice_id: voiceRecord.id,
        voice_name: voice_name,
        file_size: voiceFile.size,
        duration: estimatedDurationSeconds
      }
    }]).then().catch(err => console.log('Activity log failed:', err));

    // Get public URL
    const { data: publicUrlData } = supabaseAdmin.storage
      .from('voice-recordings')
      .getPublicUrl(uploadData.path);

    return createSuccessResponse({
      voice_id: voiceRecord.id,
      voice_name: voiceRecord.voice_name,
      description: voiceRecord.description,
      file_url: publicUrlData.publicUrl,
      file_size_bytes: voiceFile.size,
      estimated_duration_seconds: estimatedDurationSeconds,
      upload_status: 'success',
      uploaded_at: voiceRecord.created_at
    }, 'Voice uploaded successfully', headers);

  } catch (error) {
    console.error('Voice upload error:', error);
    return createErrorResponse(500, 'Internal server error during voice upload', headers);
  }
};

/**
 * Fast multipart parsing - optimized for Netlify
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
      const contentTypeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/);

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
 * Simple boundary extraction
 */
function extractBoundarySimple(contentType) {
  const match = contentType.match(/boundary=([^;,\s]+)/);
  return match ? match[1].replace(/['"]/g, '') : null;
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
  
  return typeMap[input] || 'audio';
}

/**
 * Sanitize filename
 */
function sanitizeFilename(filename) {
  return filename
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 50);
}

// =============================================
// Alternative: Install and use busboy properly
// If the above still has issues, use this version instead
// =============================================

/*
// First run: npm install busboy@1.6.0

const busboy = require('busboy');

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

  return new Promise((resolve, reject) => {
    const bb = busboy({
      headers: {
        'content-type': event.headers['content-type'] || event.headers['Content-Type']
      },
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
        files: 1
      }
    });

    const files = {};
    const fields = {};
    let hasFile = false;

    bb.on('file', (fieldname, file, info) => {
      const { filename, mimeType } = info;
      
      if (fieldname !== 'voice') {
        file.resume();
        return;
      }

      hasFile = true;
      const chunks = [];
      
      file.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      file.on('end', () => {
        files[fieldname] = {
          filename: filename,
          type: mimeType,
          data: Buffer.concat(chunks),
          size: Buffer.concat(chunks).length
        };
      });
    });

    bb.on('field', (fieldname, value) => {
      fields[fieldname] = value;
    });

    bb.on('finish', async () => {
      try {
        if (!hasFile || !files.voice) {
          return resolve(createErrorResponse(400, 'No voice file provided', headers));
        }

        const voiceFile = files.voice;
        const voice_name = fields.voice_name;

        if (!voice_name || voice_name.trim().length < 2) {
          return resolve(createErrorResponse(400, 'Voice name is required', headers));
        }

        // Continue with upload logic...
        const uniqueId = crypto.randomUUID();
        const timestamp = new Date().toISOString().split('T')[0];
        const fileName = `voice_uploads/${timestamp}/${uniqueId}_${sanitizeFilename(voice_name)}.${getFileExtension(voiceFile.filename || voiceFile.type)}`;

        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
          .from('voice-recordings')
          .upload(fileName, voiceFile.data, {
            contentType: voiceFile.type,
            upsert: false
          });

        if (uploadError) {
          return resolve(createErrorResponse(500, 'Failed to upload voice file', headers));
        }

        const { data: voiceRecord, error: dbError } = await supabaseAdmin
          .from('voice_recordings')
          .insert([{
            voice_name: voice_name.trim(),
            description: fields.description?.trim() || null,
            file_path: uploadData.path,
            file_size_bytes: voiceFile.size,
            mime_type: voiceFile.type,
            duration_seconds: Math.round(voiceFile.size / (128 * 1024 / 8))
          }])
          .select()
          .single();

        if (dbError) {
          await supabaseAdmin.storage.from('voice-recordings').remove([uploadData.path]);
          return resolve(createErrorResponse(500, 'Failed to save voice metadata', headers));
        }

        const { data: publicUrlData } = supabaseAdmin.storage
          .from('voice-recordings')
          .getPublicUrl(uploadData.path);

        resolve(createSuccessResponse({
          voice_id: voiceRecord.id,
          voice_name: voiceRecord.voice_name,
          file_url: publicUrlData.publicUrl,
          file_size_bytes: voiceFile.size,
          upload_status: 'success'
        }, 'Voice uploaded successfully', headers));

      } catch (error) {
        console.error('Upload error:', error);
        resolve(createErrorResponse(500, 'Internal server error', headers));
      }
    });

    bb.on('error', (error) => {
      console.error('Busboy error:', error);
      resolve(createErrorResponse(400, 'Invalid multipart data', headers));
    });

    const bodyBuffer = event.isBase64Encoded 
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body, 'binary');

    bb.write(bodyBuffer);
    bb.end();
  });
};
*/