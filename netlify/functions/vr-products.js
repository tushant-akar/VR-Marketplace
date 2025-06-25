/**
 * VR Products API endpoint
 * Handles product browsing, search, and recommendations
 */
const { createResponse, createErrorResponse, createSuccessResponse } = require('./utils/response');
const { authenticateUser } = require('./utils/auth');
const VRProductsService = require('./services/VRProductsService');

const productsService = new VRProductsService();

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, null, 'CORS preflight successful');
  }

  try {
    const { httpMethod, path, queryStringParameters = {}, body } = event;
    const authHeader = event.headers.authorization || event.headers.Authorization;

    // Parse body if present
    let requestBody = {};
    if (body) {
      try {
        requestBody = JSON.parse(body);
      } catch (error) {
        return createErrorResponse(400, 'Invalid JSON in request body');
      }
    }

    switch (httpMethod) {
      case 'GET':
        return await handleGetRequests(path, queryStringParameters, authHeader);
      
      case 'POST':
        return await handlePostRequests(path, requestBody, authHeader);
      
      default:
        return createErrorResponse(405, `Method ${httpMethod} not allowed`);
    }
  } catch (error) {
    console.error('VR Products API error:', error);
    return createErrorResponse(500, 'Internal server error', error.message);
  }
};

async function handleGetRequests(path, params, authHeader) {
  const pathSegments = path.split('/').filter(segment => segment);
  console.log(pathSegments)

  const route = pathSegments[pathSegments.length - 1] === 'vr-products' ? 'products' : pathSegments[pathSegments.length - 1];
  const routeIndex = pathSegments.indexOf('vr-products') + 1;
  const actualRoute = pathSegments[routeIndex] || 'products';
  const routeParam = pathSegments[routeIndex + 1];
  
  try {
    switch (actualRoute) {
      case 'products':
        if (routeParam) {
          // Get specific product by ID
          const productData = await productsService.getProductById(pathSegments[1]);
          
          // Log product view if user is authenticated
          if (authHeader) {
            const auth = await authenticateUser(authHeader);
            if (auth.success) {
              await productsService.logProductActivity(
                auth.user.id, 
                pathSegments[1], 
                'product_viewed',
                { product_name: productData.product.name }
              );
            }
          }
          
          return createSuccessResponse(productData, 'Product retrieved successfully');
        } else {
          // Get products with filters
          const filters = {
            category_id: params.category_id,
            subcategory_id: params.subcategory_id,
            search: params.search,
            min_price: params.min_price ? parseFloat(params.min_price) : undefined,
            max_price: params.max_price ? parseFloat(params.max_price) : undefined,
            in_stock: params.in_stock === 'true',
            brand: params.brand,
            sort_by: params.sort_by,
            sort_order: params.sort_order
          };
          
          const pagination = {
            page: params.page ? parseInt(params.page) : 1,
            limit: params.limit ? parseInt(params.limit) : 20
          };
          
          const result = await productsService.getProducts(filters, pagination);
          return createSuccessResponse(result, 'Products retrieved successfully');
        }
      
      case 'sponsored':
        const sponsoredProducts = await productsService.getSponsoredProducts(
          params.limit ? parseInt(params.limit) : 10
        );
        return createSuccessResponse(sponsoredProducts, 'Sponsored products retrieved successfully');
      
      case 'featured':
        const featuredProducts = await productsService.getFeaturedProducts(
          params.limit ? parseInt(params.limit) : 10
        );
        return createSuccessResponse(featuredProducts, 'Featured products retrieved successfully');
      
      case 'categories':
        const categories = await productsService.getCategories();
        return createSuccessResponse(categories, 'Categories retrieved successfully');
      
      case 'search':
        if (!params.q) {
          return createErrorResponse(400, 'Search query parameter "q" is required');
        }
        const searchResults = await productsService.searchProducts(params.q, {
          category_id: params.category_id,
          limit: params.limit ? parseInt(params.limit) : 50
        });
        return createSuccessResponse(searchResults, 'Search completed successfully');
      
      case 'shelf':
        if (!pathSegments[1]) {
          return createErrorResponse(400, 'Shelf number is required');
        }
        const shelfNumber = parseInt(pathSegments[1]);
        const shelfProducts = await productsService.getProductsByShelf(shelfNumber);
        return createSuccessResponse(shelfProducts, 'Shelf products retrieved successfully');
      
      case 'reviews':
        if (!pathSegments[1]) {
          return createErrorResponse(400, 'Product ID is required');
        }
        const reviews = await productsService.getProductReviews(pathSegments[1], {
          page: params.page ? parseInt(params.page) : 1,
          limit: params.limit ? parseInt(params.limit) : 10
        });
        return createSuccessResponse(reviews, 'Product reviews retrieved successfully');
      
      default:
        return createErrorResponse(404, 'Endpoint not found');
    }
  } catch (error) {
    console.error('Products GET error:', error);
    return createErrorResponse(500, error.message);
  }
}

async function handlePostRequests(path, body, authHeader) {
  // Authenticate user for POST requests
  const auth = await authenticateUser(authHeader);
  if (!auth.success) {
    return createErrorResponse(401, auth.error);
  }

  const pathSegments = path.split('/').filter(segment => segment);
  
  try {
    switch (pathSegments[0]) {
      case 'reviews':
        if (!pathSegments[1]) {
          return createErrorResponse(400, 'Product ID is required');
        }
        // Handle product review submission
        // Implementation would go here
        return createSuccessResponse({}, 'Review submitted successfully');
      
      default:
        return createErrorResponse(404, 'Endpoint not found');
    }
  } catch (error) {
    console.error('Products POST error:', error);
    return createErrorResponse(500, error.message);
  }
}