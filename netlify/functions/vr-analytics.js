/**
 * VR Analytics API endpoint
 * Handles activity tracking and analytics
 */
const { createResponse, createErrorResponse, createSuccessResponse } = require('./utils/response');
const { authenticateUser } = require('./utils/auth');
const { supabaseAdmin } = require('./config/supabase');

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, null, 'CORS preflight successful');
  }

  try {
    const { httpMethod, path, body } = event;
    const authHeader = event.headers.authorization || event.headers.Authorization;

    // Authenticate user
    const auth = await authenticateUser(authHeader);
    if (!auth.success) {
      return createErrorResponse(401, auth.error);
    }

    // Parse body if present
    let requestBody = {};
    if (body) {
      try {
        requestBody = JSON.parse(body);
      } catch (error) {
        return createErrorResponse(400, 'Invalid JSON in request body');
      }
    }

    const pathSegments = path.split('/').filter(segment => segment);

    switch (httpMethod) {
      case 'GET':
        return await handleAnalyticsGetRequests(pathSegments, auth.user, event.queryStringParameters);
      
      case 'POST':
        return await handleAnalyticsPostRequests(pathSegments, requestBody, auth.user);
      
      default:
        return createErrorResponse(405, `Method ${httpMethod} not allowed`);
    }
  } catch (error) {
    console.error('VR Analytics API error:', error);
    return createErrorResponse(500, 'Internal server error', error.message);
  }
};

async function handleAnalyticsGetRequests(pathSegments, user, queryParams = {}) {
  try {
    switch (pathSegments[0]) {
      case 'user':
        if (pathSegments[1] === 'activity') {
          // Get user activity logs
          const limit = parseInt(queryParams.limit) || 50;
          const offset = parseInt(queryParams.offset) || 0;
          
          const { data: activities, error } = await supabaseAdmin
            .from('vr_activity_logs')
            .select('*')
            .eq('user_id', user.id)
            .order('timestamp', { ascending: false })
            .range(offset, offset + limit - 1);
          
          if (error) {
            throw new Error(`Failed to fetch user activities: ${error.message}`);
          }
          
          return createSuccessResponse(activities, 'User activities retrieved successfully');
        } else if (pathSegments[1] === 'sessions') {
          // Get user shopping sessions
          const { data: sessions, error } = await supabaseAdmin
            .from('session_summary')
            .select('*')
            .eq('user_id', user.id)
            .order('started_at', { ascending: false });
          
          if (error) {
            throw new Error(`Failed to fetch user sessions: ${error.message}`);
          }
          
          return createSuccessResponse(sessions, 'User sessions retrieved successfully');
        }
        break;
      
      default:
        return createErrorResponse(404, 'Endpoint not found');
    }
  } catch (error) {
    console.error('Analytics GET error:', error);
    return createErrorResponse(500, error.message);
  }
}

async function handleAnalyticsPostRequests(pathSegments, body, user) {
  try {
    if (pathSegments[0] === 'track') {
      // Track custom VR activity
      const { session_id, activity_type, activity_data, location_data } = body;
      
      if (!activity_type) {
        return createErrorResponse(400, 'Activity type is required');
      }
      
      const { error } = await supabaseAdmin
        .from('vr_activity_logs')
        .insert([{
          user_id: user.id,
          session_id: session_id || null,
          activity_type: activity_type,
          activity_data: activity_data || {},
          location_data: location_data || null,
          timestamp: new Date().toISOString()
        }]);
      
      if (error) {
        throw new Error(`Failed to track activity: ${error.message}`);
      }
      
      return createSuccessResponse({}, 'Activity tracked successfully');
    }
    
    return createErrorResponse(404, 'Endpoint not found');
  } catch (error) {
    console.error('Analytics POST error:', error);
    return createErrorResponse(500, error.message);
  }
}