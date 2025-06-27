// =============================================
// Secure Voice Upload API Endpoint
// File: netlify/functions/vr-voice-upload.js
// Using built-in multipart parsing - no vulnerable dependencies
// =============================================

const { supabaseAdmin } = require('./config/supabase');
const { createSuccessResponse, createErrorResponse } = require('./utils/response');
const crypto = require('crypto');

/**
 * Secure Voice Upload API Handler
 * No authentication required - public uploads
 * Using native multipart parsing to avoid security vulnerabilities
 */
exports.handler = async (event, context) => {
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
    // Debug logging for headers
    console.log('Event headers:', JSON.stringify(event.headers, null, 2));
    console.log('Event body type:', typeof event.body);
    console.log('Is base64 encoded:', event.isBase64Encoded);
    
    // Check if request has multipart content
    const contentType = event.headers['content-type'] || event.headers['Content-Type'];
    console.log('Content-Type:', contentType);
    
    if (!contentType || !contentType.includes('multipart/form-data')) {
      return createErrorResponse(400, 'Content-Type must be multipart/form-data', headers);
    }

    // Parse multipart data using built-in parsing
    const boundary = extractBoundary(contentType);
    console.log('Extracted boundary:', boundary);
    
    if (!boundary) {
      return createErrorResponse(400, `Invalid multipart boundary. Content-Type: ${contentType}`, headers);
    }

    // Convert base64 body to buffer for binary data
    const bodyBuffer = event.isBase64Encoded 
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body, 'utf8');

    console.log('Body buffer length:', bodyBuffer.length);
    console.log('First 100 bytes:', bodyBuffer.slice(0, 100).toString());

    const parsedData = parseMultipartData(bodyBuffer, boundary);
    console.log('Parsed data fields:', Object.keys(parsedData.fields));
    console.log('Parsed data files:', Object.keys(parsedData.files));
    
    if (!parsedData.files || !parsedData.files.voice) {
      return createErrorResponse(400, 'No voice file provided', headers);
    }

    const voiceFile = parsedData.files.voice;
    const formFields = parsedData.fields;

    // Validate file type using magic numbers (more secure than content-type header)
    const fileType = detectAudioFileType(voiceFile.data);
    if (!fileType) {
      return createErrorResponse(400, 
        'Invalid file type. Please upload a valid audio file (WAV, MP3, M4A, OGG, WebM, FLAC, AAC)', 
        headers
      );
    }

    // Validate file size (max 10MB)
    const maxSizeBytes = 10 * 1024 * 1024; // 10MB
    if (voiceFile.data.length > maxSizeBytes) {
      return createErrorResponse(400, 'File too large. Maximum size is 10MB', headers);
    }

    // Extract required fields
    const voice_name = formFields.voice_name;
    const description = formFields.description || '';

    // Validate required fields
    if (!voice_name || voice_name.trim().length < 2) {
      return createErrorResponse(400, 'Voice name is required (minimum 2 characters)', headers);
    }

    // Generate unique filename
    const uniqueId = crypto.randomUUID();
    const timestamp = new Date().toISOString().split('T')[0];
    const fileName = `voice_uploads/${timestamp}/${uniqueId}_${sanitizeFilename(voice_name)}.${fileType.extension}`;

    // Upload file to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('voice-recordings')
      .upload(fileName, voiceFile.data, {
        contentType: fileType.mimeType,
        upsert: false
      });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      return createErrorResponse(500, 'Failed to upload voice file', headers);
    }

    // Get file size
    const fileSizeBytes = voiceFile.data.length;
    
    // Calculate estimated duration (rough estimate based on file size and type)
    const estimatedDurationSeconds = estimateAudioDuration(fileSizeBytes, fileType);

    // Save voice metadata to database
    const { data: voiceRecord, error: dbError } = await supabaseAdmin
      .from('voice_recordings')
      .insert([{
        voice_name: voice_name.trim(),
        description: description?.trim() || null,
        file_path: uploadData.path,
        file_size_bytes: fileSizeBytes,
        mime_type: fileType.mimeType,
        duration_seconds: estimatedDurationSeconds
      }])
      .select()
      .single();

    if (dbError) {
      console.error('Database insert error:', dbError);
      
      // Clean up uploaded file if database insert fails
      await supabaseAdmin.storage
        .from('voice-recordings')
        .remove([uploadData.path]);
      
      return createErrorResponse(500, 'Failed to save voice metadata', headers);
    }

    // Log the voice upload activity
    await supabaseAdmin
      .from('vr_activity_logs')
      .insert([{
        user_id: null,
        activity_type: 'voice_upload',
        activity_data: {
          voice_id: voiceRecord.id,
          voice_name: voice_name,
          file_size: fileSizeBytes,
          duration: estimatedDurationSeconds,
          file_type: fileType.extension
        }
      }]);

    // Get public URL for the uploaded file
    const { data: publicUrlData } = supabaseAdmin.storage
      .from('voice-recordings')
      .getPublicUrl(uploadData.path);

    return createSuccessResponse({
      voice_id: voiceRecord.id,
      voice_name: voiceRecord.voice_name,
      description: voiceRecord.description,
      file_url: publicUrlData.publicUrl,
      file_size_bytes: fileSizeBytes,
      estimated_duration_seconds: estimatedDurationSeconds,
      file_type: fileType.extension,
      upload_status: 'success',
      uploaded_at: voiceRecord.created_at
    }, 'Voice uploaded successfully', headers);

  } catch (error) {
    console.error('Voice upload error:', error);
    return createErrorResponse(500, 'Internal server error during voice upload', headers);
  }
};

/**
 * Extract boundary from Content-Type header - Fixed for Netlify
 */
function extractBoundary(contentType) {
  // Handle different boundary formats
  const boundaryPatterns = [
    /boundary=([^;,\s]+)/i,           // Standard format
    /boundary="([^"]+)"/i,            // Quoted format
    /boundary=([^;,\s"]+)/i           // Unquoted format
  ];
  
  for (const pattern of boundaryPatterns) {
    const match = contentType.match(pattern);
    if (match) {
      return match[1].replace(/['"]/g, '').trim();
    }
  }
  
  // Debug log for troubleshooting
  console.log('Content-Type header:', contentType);
  return null;
}

/**
 * Parse multipart form data manually (secure implementation)
 */
function parseMultipartData(buffer, boundary) {
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const endBoundaryBuffer = Buffer.from(`--${boundary}--`);
  
  const parts = [];
  let start = 0;
  
  while (true) {
    const boundaryIndex = buffer.indexOf(boundaryBuffer, start);
    if (boundaryIndex === -1) break;
    
    const nextBoundaryIndex = buffer.indexOf(boundaryBuffer, boundaryIndex + boundaryBuffer.length);
    const endBoundaryIndex = buffer.indexOf(endBoundaryBuffer, boundaryIndex);
    
    let partEnd;
    if (endBoundaryIndex !== -1 && (nextBoundaryIndex === -1 || endBoundaryIndex < nextBoundaryIndex)) {
      partEnd = endBoundaryIndex;
    } else if (nextBoundaryIndex !== -1) {
      partEnd = nextBoundaryIndex;
    } else {
      break;
    }
    
    if (boundaryIndex + boundaryBuffer.length < partEnd) {
      const partData = buffer.slice(boundaryIndex + boundaryBuffer.length, partEnd);
      const part = parsePart(partData);
      if (part) parts.push(part);
    }
    
    start = partEnd;
  }
  
  // Organize parts into fields and files
  const result = { fields: {}, files: {} };
  
  parts.forEach(part => {
    if (part.filename) {
      result.files[part.name] = {
        filename: part.filename,
        data: part.data,
        contentType: part.contentType
      };
    } else {
      result.fields[part.name] = part.data.toString('utf8');
    }
  });
  
  return result;
}

/**
 * Parse individual part of multipart data
 */
function parsePart(partBuffer) {
  // Find the double CRLF that separates headers from data
  const doubleCRLF = Buffer.from('\r\n\r\n');
  const headerEndIndex = partBuffer.indexOf(doubleCRLF);
  
  if (headerEndIndex === -1) return null;
  
  const headerBuffer = partBuffer.slice(0, headerEndIndex);
  const dataBuffer = partBuffer.slice(headerEndIndex + doubleCRLF.length);
  
  // Remove trailing CRLF from data
  let data = dataBuffer;
  if (data.length >= 2 && data[data.length - 2] === 0x0D && data[data.length - 1] === 0x0A) {
    data = data.slice(0, -2);
  }
  
  const headers = headerBuffer.toString('utf8');
  
  // Parse Content-Disposition header
  const contentDispositionMatch = headers.match(/Content-Disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]+)")?/i);
  if (!contentDispositionMatch) return null;
  
  const name = contentDispositionMatch[1];
  const filename = contentDispositionMatch[2];
  
  // Parse Content-Type header
  const contentTypeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/i);
  const contentType = contentTypeMatch ? contentTypeMatch[1].trim() : 'text/plain';
  
  return {
    name,
    filename,
    contentType,
    data
  };
}

/**
 * Detect audio file type using magic numbers (file signatures)
 * More secure than relying on Content-Type headers
 */
function detectAudioFileType(buffer) {
  if (buffer.length < 12) return null;
  
  // Check file signatures (magic numbers)
  const header = buffer.slice(0, 12);
  
  // WAV files
  if (header.slice(0, 4).toString() === 'RIFF' && header.slice(8, 12).toString() === 'WAVE') {
    return { extension: 'wav', mimeType: 'audio/wav' };
  }
  
  // MP3 files
  if ((header[0] === 0xFF && (header[1] & 0xE0) === 0xE0) || // MPEG frame header
      header.slice(0, 3).toString() === 'ID3') { // ID3 tag
    return { extension: 'mp3', mimeType: 'audio/mpeg' };
  }
  
  // OGG files
  if (header.slice(0, 4).toString() === 'OggS') {
    return { extension: 'ogg', mimeType: 'audio/ogg' };
  }
  
  // FLAC files
  if (header.slice(0, 4).toString() === 'fLaC') {
    return { extension: 'flac', mimeType: 'audio/flac' };
  }
  
  // M4A/AAC files (MP4 container)
  if (header.slice(4, 8).toString() === 'ftyp' || 
      header.slice(4, 12).toString() === 'ftypM4A ') {
    return { extension: 'm4a', mimeType: 'audio/m4a' };
  }
  
  // WebM files
  if (header.slice(0, 4).equals(Buffer.from([0x1A, 0x45, 0xDF, 0xA3]))) {
    return { extension: 'webm', mimeType: 'audio/webm' };
  }
  
  return null;
}

/**
 * Estimate audio duration based on file size and type
 */
function estimateAudioDuration(fileSizeBytes, fileType) {
  // Rough estimates based on typical bitrates for different formats
  const typicalBitrates = {
    'mp3': 128, // kbps
    'wav': 1411, // kbps (CD quality)
    'ogg': 128, // kbps
    'flac': 1000, // kbps
    'm4a': 128, // kbps
    'webm': 128 // kbps
  };
  
  const bitrate = typicalBitrates[fileType.extension] || 128;
  const bytesPerSecond = (bitrate * 1000) / 8; // Convert kbps to bytes per second
  
  return Math.round(fileSizeBytes / bytesPerSecond);
}

/**
 * Helper function to sanitize filename
 */
function sanitizeFilename(filename) {
  return filename
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 50);
}

// =============================================
// Alternative: Simple Base64 Upload Endpoint
// For even simpler testing without multipart complexity
// =============================================

// Uncomment this if you want a simpler base64 upload endpoint for testing

/*
exports.handler = async (event, context) => {
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
    const body = JSON.parse(event.body);
    const { voice_name, description = '', file_data, file_type = 'wav' } = body;

    if (!voice_name || voice_name.trim().length < 2) {
      return createErrorResponse(400, 'Voice name is required', headers);
    }

    if (!file_data) {
      return createErrorResponse(400, 'File data is required', headers);
    }

    // Decode base64 file data
    const fileBuffer = Buffer.from(file_data, 'base64');
    
    // Validate file size
    if (fileBuffer.length > 10 * 1024 * 1024) {
      return createErrorResponse(400, 'File too large. Maximum size is 10MB', headers);
    }

    // Generate filename
    const uniqueId = crypto.randomUUID();
    const timestamp = new Date().toISOString().split('T')[0];
    const fileName = `voice_uploads/${timestamp}/${uniqueId}_${sanitizeFilename(voice_name)}.${file_type}`;

    // Upload to Supabase
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('voice-recordings')
      .upload(fileName, fileBuffer, {
        contentType: `audio/${file_type}`,
        upsert: false
      });

    if (uploadError) {
      return createErrorResponse(500, 'Failed to upload voice file', headers);
    }

    // Save to database
    const { data: voiceRecord, error: dbError } = await supabaseAdmin
      .from('voice_recordings')
      .insert([{
        voice_name: voice_name.trim(),
        description: description?.trim() || null,
        file_path: uploadData.path,
        file_size_bytes: fileBuffer.length,
        mime_type: `audio/${file_type}`,
        duration_seconds: Math.round(fileBuffer.length / (128 * 1024 / 8))
      }])
      .select()
      .single();

    if (dbError) {
      await supabaseAdmin.storage.from('voice-recordings').remove([uploadData.path]);
      return createErrorResponse(500, 'Failed to save voice metadata', headers);
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from('voice-recordings')
      .getPublicUrl(uploadData.path);

    return createSuccessResponse({
      voice_id: voiceRecord.id,
      voice_name: voiceRecord.voice_name,
      file_url: publicUrlData.publicUrl,
      upload_status: 'success'
    }, 'Voice uploaded successfully', headers);

  } catch (error) {
    console.error('Voice upload error:', error);
    return createErrorResponse(500, 'Internal server error', headers);
  }
};
*/