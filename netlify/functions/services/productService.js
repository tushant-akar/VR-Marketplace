/**
 * VR Products Service for handling product-related operations
 * Following the existing codebase patterns and conventions
 */

const { supabaseAdmin } = require('../config/supabase');
const { validatePaginationParams } = require('../utils/validation');

class VRProductsService {
  constructor() {
    this.defaultPageSize = 20;
    this.maxPageSize = 100;
  }

  /**
   * Get all products with filtering and pagination
   * @param {Object} filters - Product filters
   * @param {Object} pagination - Pagination parameters
   * @returns {Promise<Object>} - Products with metadata
   */
  async getProducts(filters = {}, pagination = {}) {
    try {
      const { page = 1, limit = this.defaultPageSize } = validatePaginationParams(pagination);
      const offset = (page - 1) * limit;

      let query = supabaseAdmin
        .from('active_products')
        .select('*', { count: 'exact' });

      // Apply filters
      if (filters.category_id) {
        query = query.eq('category_id', filters.category_id);
      }
      
      if (filters.subcategory_id) {
        query = query.eq('subcategory_id', filters.subcategory_id);
      }
      
      if (filters.search) {
        query = query.or(`name.ilike.%${filters.search}%,description.ilike.%${filters.search}%,brand.ilike.%${filters.search}%`);
      }
      
      if (filters.min_price) {
        query = query.gte('effective_price', filters.min_price);
      }
      
      if (filters.max_price) {
        query = query.lte('effective_price', filters.max_price);
      }
      
      if (filters.in_stock) {
        query = query.gt('stock_quantity', 0);
      }
      
      if (filters.brand) {
        query = query.eq('brand', filters.brand);
      }

      // Apply sorting
      const sortField = filters.sort_by || 'name';
      const sortOrder = filters.sort_order === 'desc' ? 'desc' : 'asc';
      
      if (sortField === 'price') {
        query = query.order('effective_price', { ascending: sortOrder === 'asc' });
      } else if (sortField === 'rating') {
        query = query.order('rating', { ascending: sortOrder === 'asc' });
      } else if (sortField === 'popularity') {
        query = query.order('review_count', { ascending: sortOrder === 'asc' });
      } else {
        query = query.order(sortField, { ascending: sortOrder === 'asc' });
      }

      // Apply pagination
      query = query.range(offset, offset + limit - 1);

      const { data: products, error, count } = await query;

      if (error) {
        console.error('Products fetch error:', error);
        throw new Error(`Failed to fetch products: ${error.message}`);
      }

      // Get total pages
      const totalPages = Math.ceil(count / limit);

      return {
        products: products || [],
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: count,
          itemsPerPage: limit,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1
        },
        filters: filters
      };
    } catch (error) {
      console.error('Error in getProducts:', error);
      throw error;
    }
  }

  /**
   * Get sponsored products for front display
   * @param {number} limit - Number of sponsored products to fetch
   * @returns {Promise<Array>} - Sponsored products
   */
  async getSponsoredProducts(limit = 10) {
    try {
      const { data: products, error } = await supabaseAdmin
        .from('sponsored_products')
        .select('*')
        .limit(limit);

      if (error) {
        console.error('Sponsored products fetch error:', error);
        throw new Error(`Failed to fetch sponsored products: ${error.message}`);
      }

      return products || [];
    } catch (error) {
      console.error('Error in getSponsoredProducts:', error);
      throw error;
    }
  }

  /**
   * Get featured products
   * @param {number} limit - Number of featured products to fetch
   * @returns {Promise<Array>} - Featured products
   */
  async getFeaturedProducts(limit = 10) {
    try {
      const { data: products, error } = await supabaseAdmin
        .from('featured_products')
        .select('*')
        .limit(limit);

      if (error) {
        console.error('Featured products fetch error:', error);
        throw new Error(`Failed to fetch featured products: ${error.message}`);
      }

      return products || [];
    } catch (error) {
      console.error('Error in getFeaturedProducts:', error);
      throw error;
    }
  }

  /**
   * Get product by ID with recommendations
   * @param {string} productId - Product UUID
   * @returns {Promise<Object>} - Product with recommendations
   */
  async getProductById(productId) {
    try {
      // Validate UUID format
      if (!this.isValidUUID(productId)) {
        throw new Error('Invalid product ID format');
      }

      // Get product details
      const { data: product, error: productError } = await supabaseAdmin
        .from('active_products')
        .select('*')
        .eq('id', productId)
        .single();

      if (productError) {
        if (productError.code === 'PGRST116') {
          throw new Error('Product not found');
        }
        console.error('Product fetch error:', productError);
        throw new Error(`Failed to fetch product: ${productError.message}`);
      }

      // Get product recommendations
      const recommendations = await this.getProductRecommendations(productId);

      return {
        product,
        recommendations
      };
    } catch (error) {
      console.error('Error in getProductById:', error);
      throw error;
    }
  }

  /**
   * Get product recommendations
   * @param {string} productId - Product UUID
   * @param {number} limit - Number of recommendations
   * @returns {Promise<Array>} - Recommended products
   */
  async getProductRecommendations(productId, limit = 5) {
    try {
      const { data: recommendations, error } = await supabaseAdmin
        .from('product_recommendations')
        .select(`
          *,
          recommended_product:recommended_product_id(*)
        `)
        .eq('product_id', productId)
        .order('confidence_score', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Recommendations fetch error:', error);
        return [];
      }

      return recommendations?.map(rec => ({
        ...rec.recommended_product,
        recommendation_type: rec.recommendation_type,
        confidence_score: rec.confidence_score
      })) || [];
    } catch (error) {
      console.error('Error in getProductRecommendations:', error);
      return [];
    }
  }

  /**
   * Get products by category
   * @param {string} categoryId - Category UUID
   * @param {Object} options - Additional options
   * @returns {Promise<Array>} - Products in category
   */
  async getProductsByCategory(categoryId, options = {}) {
    try {
      const { limit = 20, subcategory_id } = options;

      let query = supabaseAdmin
        .from('active_products')
        .select('*')
        .eq('category_id', categoryId);

      if (subcategory_id) {
        query = query.eq('subcategory_id', subcategory_id);
      }

      // Prioritize sponsored products first
      query = query
        .order('is_sponsored', { ascending: false })
        .order('is_featured', { ascending: false })
        .order('rating', { ascending: false })
        .limit(limit);

      const { data: products, error } = await query;

      if (error) {
        console.error('Category products fetch error:', error);
        throw new Error(`Failed to fetch category products: ${error.message}`);
      }

      return products || [];
    } catch (error) {
      console.error('Error in getProductsByCategory:', error);
      throw error;
    }
  }

  /**
   * Get shelf layout information
   * @param {string} categoryId - Category UUID
   * @param {string} subcategoryId - Subcategory UUID
   * @returns {Promise<Object>} - Shelf layout information
   */
  async getShelfLayout(categoryId, subcategoryId = null) {
    try {
      let query = supabaseAdmin
        .from('shelf_layouts')
        .select('*')
        .eq('category_id', categoryId)
        .eq('is_active', true);

      if (subcategoryId) {
        query = query.eq('subcategory_id', subcategoryId);
      }

      const { data: shelves, error } = await query;

      if (error) {
        console.error('Shelf layout fetch error:', error);
        throw new Error(`Failed to fetch shelf layout: ${error.message}`);
      }

      return shelves || [];
    } catch (error) {
      console.error('Error in getShelfLayout:', error);
      throw error;
    }
  }

  /**
   * Get products by shelf with compartment information
   * @param {number} shelfNumber - Shelf number
   * @returns {Promise<Object>} - Products organized by compartment
   */
  async getProductsByShelf(shelfNumber) {
    try {
      const { data: products, error } = await supabaseAdmin
        .from('active_products')
        .select('*')
        .contains('shelf_position', { shelf_id: shelfNumber })
        .order('shelf_position->position', { ascending: true });

      if (error) {
        console.error('Shelf products fetch error:', error);
        throw new Error(`Failed to fetch shelf products: ${error.message}`);
      }

      // Organize products by compartment
      const organizedProducts = {
        top: [],
        middle: [],
        bottom: []
      };

      products?.forEach(product => {
        const compartment = product.shelf_position?.compartment;
        if (compartment && organizedProducts[compartment]) {
          organizedProducts[compartment].push(product);
        }
      });

      return {
        shelfNumber,
        products: organizedProducts,
        totalProducts: products?.length || 0
      };
    } catch (error) {
      console.error('Error in getProductsByShelf:', error);
      throw error;
    }
  }

  /**
   * Search products with advanced filtering
   * @param {string} searchTerm - Search query
   * @param {Object} filters - Additional filters
   * @returns {Promise<Object>} - Search results
   */
  async searchProducts(searchTerm, filters = {}) {
    try {
      if (!searchTerm || searchTerm.trim().length < 2) {
        throw new Error('Search term must be at least 2 characters long');
      }

      const cleanSearchTerm = searchTerm.trim().toLowerCase();
      
      let query = supabaseAdmin
        .from('active_products')
        .select('*', { count: 'exact' })
        .or(`name.ilike.%${cleanSearchTerm}%,description.ilike.%${cleanSearchTerm}%,brand.ilike.%${cleanSearchTerm}%`);

      // Apply additional filters
      if (filters.category_id) {
        query = query.eq('category_id', filters.category_id);
      }

      // Sort by relevance (sponsored first, then featured, then rating)
      query = query
        .order('is_sponsored', { ascending: false })
        .order('is_featured', { ascending: false })
        .order('rating', { ascending: false })
        .limit(filters.limit || 50);

      const { data: products, error, count } = await query;

      if (error) {
        console.error('Product search error:', error);
        throw new Error(`Search failed: ${error.message}`);
      }

      return {
        searchTerm: cleanSearchTerm,
        products: products || [],
        totalResults: count,
        hasResults: (products?.length || 0) > 0
      };
    } catch (error) {
      console.error('Error in searchProducts:', error);
      throw error;
    }
  }

  /**
   * Get all categories with subcategories
   * @returns {Promise<Array>} - Categories with subcategories
   */
  async getCategories() {
    try {
      const { data: categories, error } = await supabaseAdmin
        .from('categories')
        .select(`
          id,
          name,
          description,
          display_order,
          icon_url,
          subcategories:categories!parent_id(
            id,
            name,
            description,
            display_order,
            icon_url
          )
        `)
        .is('parent_id', null)
        .eq('is_active', true)
        .order('display_order');

      if (error) {
        console.error('Categories fetch error:', error);
        throw new Error(`Failed to fetch categories: ${error.message}`);
      }

      return categories || [];
    } catch (error) {
      console.error('Error in getCategories:', error);
      throw error;
    }
  }

  /**
   * Get product reviews
   * @param {string} productId - Product UUID
   * @param {Object} pagination - Pagination parameters
   * @returns {Promise<Object>} - Reviews with metadata
   */
  async getProductReviews(productId, pagination = {}) {
    try {
      const { page = 1, limit = 10 } = validatePaginationParams(pagination);
      const offset = (page - 1) * limit;

      const { data: reviews, error, count } = await supabaseAdmin
        .from('product_reviews')
        .select(`
          *,
          user:users(name, id)
        `, { count: 'exact' })
        .eq('product_id', productId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error('Reviews fetch error:', error);
        throw new Error(`Failed to fetch reviews: ${error.message}`);
      }

      const totalPages = Math.ceil(count / limit);

      return {
        reviews: reviews || [],
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: count,
          itemsPerPage: limit
        }
      };
    } catch (error) {
      console.error('Error in getProductReviews:', error);
      throw error;
    }
  }

  /**
   * Update product stock
   * @param {string} productId - Product UUID
   * @param {number} quantity - New stock quantity
   * @returns {Promise<Object>} - Updated product
   */
  async updateProductStock(productId, quantity) {
    try {
      if (!this.isValidUUID(productId)) {
        throw new Error('Invalid product ID format');
      }

      if (typeof quantity !== 'number' || quantity < 0) {
        throw new Error('Quantity must be a non-negative number');
      }

      const { data: product, error } = await supabaseAdmin
        .from('products')
        .update({ 
          stock_quantity: quantity,
          updated_at: new Date().toISOString()
        })
        .eq('id', productId)
        .select()
        .single();

      if (error) {
        console.error('Stock update error:', error);
        throw new Error(`Failed to update stock: ${error.message}`);
      }

      return product;
    } catch (error) {
      console.error('Error in updateProductStock:', error);
      throw error;
    }
  }

  /**
   * Get low stock products
   * @param {number} limit - Number of products to return
   * @returns {Promise<Array>} - Low stock products
   */
  async getLowStockProducts(limit = 20) {
    try {
      const { data: products, error } = await supabaseAdmin
        .from('low_stock_products')
        .select('*')
        .order('stock_quantity', { ascending: true })
        .limit(limit);

      if (error) {
        console.error('Low stock fetch error:', error);
        throw new Error(`Failed to fetch low stock products: ${error.message}`);
      }

      return products || [];
    } catch (error) {
      console.error('Error in getLowStockProducts:', error);
      throw error;
    }
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
   * Log product activity
   * @param {string} userId - User UUID
   * @param {string} productId - Product UUID
   * @param {string} activityType - Type of activity
   * @param {Object} activityData - Additional activity data
   * @returns {Promise<void>}
   */
  async logProductActivity(userId, productId, activityType, activityData = {}) {
    try {
      await supabaseAdmin
        .from('vr_activity_logs')
        .insert([{
          user_id: userId,
          activity_type: activityType,
          activity_data: {
            product_id: productId,
            ...activityData
          },
          timestamp: new Date().toISOString()
        }]);
    } catch (error) {
      console.error('Activity logging failed:', error);
      // Don't throw error for logging failures
    }
  }
}

module.exports = VRProductsService;