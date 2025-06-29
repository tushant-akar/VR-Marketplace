// =============================================
// Simple n8n Test API
// File: netlify/functions/test-n8n.js
// Just send requirement to n8n and print response
// =============================================

const { createSuccessResponse, createErrorResponse } = require('./utils/response');

/**
 * Simple n8n Test API Handler
 * POST request with JSON body: { "requirement": "I want a guitar" }
 */
exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return createErrorResponse(405, 'Method not allowed. Use POST.', headers);
  }

  try {
    console.log('=== Simple n8n Test API Started ===');

    // Parse JSON body
    let requestBody;
    try {
      requestBody = JSON.parse(event.body);
    } catch (error) {
      console.error('Invalid JSON in request body:', error);
      return createErrorResponse(400, 'Invalid JSON in request body', headers);
    }

    // Validate requirement field
    const requirement = requestBody.requirement;
    if (!requirement || typeof requirement !== 'string' || requirement.trim().length === 0) {
      console.error('Missing or invalid requirement field');
      return createErrorResponse(400, 'Missing "requirement" field in JSON body', headers);
    }

    console.log('📝 Requirement received:', requirement);

    // Send to n8n webhook
    const n8nResult = await sendToN8nWebhook(requirement.trim());

    // Print results to console
    console.log('=== n8n RESPONSE RESULTS ===');
    console.log('✅ Success:', n8nResult.success);
    console.log('⏱️  Processing Time:', n8nResult.processing_time_ms + 'ms');
    console.log('📄 Status Code:', n8nResult.status_code);
    
    if (n8nResult.success) {
      console.log('📝 Response Text:', n8nResult.response_text);
      console.log('📊 Response Length:', n8nResult.response_text.length + ' characters');
    } else {
      console.log('❌ Error:', n8nResult.error);
    }
    console.log('=== END RESPONSE RESULTS ===');

    // Return simple success response
    return createSuccessResponse({
      message: 'Request sent to n8n successfully',
      requirement_sent: requirement,
      n8n_success: n8nResult.success,
      processing_time_ms: n8nResult.processing_time_ms,
      response_received: n8nResult.success,
      response_length: n8nResult.success ? n8nResult.response_text.length : 0,
      check_console: 'Check server console/logs for full response details'
    }, 'n8n test completed successfully', headers);

  } catch (error) {
    console.error('=== API ERROR ===');
    console.error('Error details:', error);
    console.error('==================');
    
    return createErrorResponse(500, 'Internal server error during n8n test', headers);
  }
};

/**
 * Send requirement to n8n webhook and wait for response
 * @param {string} requirement - The requirement text to send
 * @returns {Promise<Object>} - n8n response result
 */
async function sendToN8nWebhook(requirement) {
  try {
    console.log('🚀 Sending to n8n webhook...');
    
    // Check if n8n webhook URL is configured
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
    if (!n8nWebhookUrl) {
      console.error('❌ N8N_WEBHOOK_URL not configured in environment');
      return {
        success: false,
        error: 'N8N_WEBHOOK_URL not configured',
        processing_time_ms: 0,
        status_code: null
      };
    }

    // Prepare the exact JSON format expected by n8n
    const payload = {
      "Requirement": requirement
    };

    // Prepare headers
    const headers = {
      'Content-Type': 'application/json'
    };

    // Add authentication if configured
    const authToken = process.env.N8N_WEBHOOK_AUTH_TOKEN;
    if (authToken && authToken.trim() !== '') {
      headers['Authorization'] = `Bearer ${authToken}`;
      console.log('🔐 Using Bearer token authentication');
    } else {
      console.log('🔓 No authentication token configured');
    }

    console.log('🌐 n8n Webhook URL:', n8nWebhookUrl);
    console.log('📤 Payload:', JSON.stringify(payload, null, 2));
    
    // Record start time
    const startTime = Date.now();
    
    // Send request to n8n
    console.log('⏳ Calling n8n webhook...');
    const response = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });

    // Calculate processing time
    const processingTime = Date.now() - startTime;
    
    console.log(`📊 n8n Response Status: ${response.status}`);
    console.log(`⏱️  Processing Time: ${processingTime}ms`);

    // Check if request was successful
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ n8n webhook error response:', errorText);
      return {
        success: false,
        error: `n8n webhook error: ${response.status} - ${errorText}`,
        processing_time_ms: processingTime,
        status_code: response.status
      };
    }

    // Parse the response
    let responseText;
    try {
      const responseData = await response.json();
      console.log('📥 Raw n8n Response Data:', JSON.stringify(responseData, null, 2));
      
      // Handle different possible response formats from n8n
      if (typeof responseData === 'string') {
        responseText = responseData;
      } else if (responseData.response) {
        responseText = responseData.response;
      } else if (responseData.text) {
        responseText = responseData.text;
      } else if (responseData.message) {
        responseText = responseData.message;
      } else if (responseData.result) {
        responseText = responseData.result;
      } else {
        // If complex object, stringify it
        responseText = JSON.stringify(responseData, null, 2);
      }
    } catch (parseError) {
      // If not JSON, treat as plain text
      responseText = await response.text();
      console.log('📥 Plain Text Response:', responseText);
    }

    // Validate response
    if (!responseText || responseText.trim().length === 0) {
      console.warn('⚠️  Empty response received from n8n');
      return {
        success: false,
        error: 'Empty response from n8n webhook',
        processing_time_ms: processingTime,
        status_code: response.status
      };
    }

    console.log('✅ n8n response received successfully');
    
    return {
      success: true,
      response_text: responseText.trim(),
      processing_time_ms: processingTime,
      status_code: response.status
    };

  } catch (error) {
    console.error('❌ Error calling n8n webhook:', error);
    return {
      success: false,
      error: error.message || 'Failed to call n8n webhook',
      processing_time_ms: 0,
      status_code: null
    };
  }
}