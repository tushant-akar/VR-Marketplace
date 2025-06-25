/**
 * Complete Validation Utility Functions for VR Supermarket
 * Enhanced validation for all authentication and VR-specific operations
 * Includes OTP validation, product validation, cart validation, and more
 */

/**
 * Validate email format with comprehensive checks
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid email format
 */
const validateEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  
  // Comprehensive email regex that covers most valid cases
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  const isValidFormat = emailRegex.test(email.trim());
  const isValidLength = email.length <= 320; // RFC 5321 limit
  const hasValidLocalPart = email.split('@')[0]?.length <= 64; // RFC 5321 limit
  
  return isValidFormat && isValidLength && hasValidLocalPart;
};

/**
 * Validate password strength with comprehensive analysis
 * @param {string} password - Password to validate
 * @returns {boolean} - True if password meets requirements
 */
const validatePassword = (password) => {
  if (!password || typeof password !== 'string') return false;
  
  // Enhanced password requirements: 8+ chars, uppercase, lowercase, digit, special char
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  const isValidFormat = passwordRegex.test(password);
  const isValidLength = password.length >= 8 && password.length <= 256;
  
  return isValidFormat && isValidLength;
};

/**
 * Get comprehensive password strength analysis
 * @param {string} password - Password to analyze
 * @returns {Object} - Detailed password strength analysis
 */
const getPasswordStrength = (password) => {
  if (!password) return { score: 0, feedback: ['Password is required'], isValid: false };
  
  const feedback = [];
  let score = 0;
  
  // Length checks with progressive scoring
  if (password.length >= 8) score += 1;
  else feedback.push('Password must be at least 8 characters long');
  
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  
  // Character variety checks
  if (/[a-z]/.test(password)) score += 1;
  else feedback.push('Add lowercase letters (a-z)');
  
  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push('Add uppercase letters (A-Z)');
  
  if (/\d/.test(password)) score += 1;
  else feedback.push('Add numbers (0-9)');
  
  if (/[@$!%*?&]/.test(password)) score += 1;
  else feedback.push('Add special characters (@$!%*?&)');
  
  // Advanced pattern detection
  if (/(.)\1{2,}/.test(password)) {
    score -= 1;
    feedback.push('Avoid repeating characters (aaa, 111)');
  }
  
  if (/123|abc|qwe|password|admin/i.test(password)) {
    score -= 1;
    feedback.push('Avoid common patterns and words');
  }
  
  if (/^\d+$/.test(password)) {
    score -= 2;
    feedback.push('Password cannot be all numbers');
  }
  
  if (/^[a-zA-Z]+$/.test(password)) {
    score -= 1;
    feedback.push('Add numbers and special characters');
  }
  
  // Calculate final score and strength level
  const finalScore = Math.max(0, Math.min(8, score));
  let strengthLevel = 'Very Weak';
  
  if (finalScore >= 7) strengthLevel = 'Very Strong';
  else if (finalScore >= 6) strengthLevel = 'Strong';
  else if (finalScore >= 4) strengthLevel = 'Good';
  else if (finalScore >= 2) strengthLevel = 'Weak';
  
  return {
    score: finalScore,
    strengthLevel,
    feedback: feedback.length === 0 ? ['Excellent password!'] : feedback,
    isValid: finalScore >= 5,
    requirements: {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      numbers: /\d/.test(password),
      special: /[@$!%*?&]/.test(password)
    }
  };
};

/**
 * Validate name format with international support
 * @param {string} name - Name to validate
 * @returns {boolean} - True if valid name format
 */
const validateName = (name) => {
  if (!name || typeof name !== 'string') return false;
  
  const trimmedName = name.trim();
  const isValidLength = trimmedName.length >= 2 && trimmedName.length <= 100;
  
  // Support international characters, spaces, hyphens, apostrophes, and dots
  const isValidFormat = /^[\p{L}\p{M}\s\-'\.]+$/u.test(trimmedName);
  
  // Check for reasonable structure (not all special characters)
  const hasLetters = /[\p{L}]/u.test(trimmedName);
  
  return isValidLength && isValidFormat && hasLetters;
};

/**
 * Validate phone number with international support
 * @param {string} phoneNumber - Phone number to validate
 * @returns {boolean} - True if valid phone number format
 */
const validatePhoneNumber = (phoneNumber) => {
  if (!phoneNumber || typeof phoneNumber !== 'string') return false;
  
  // Remove all non-digit characters except + at the beginning
  const cleaned = phoneNumber.replace(/[^\d+]/g, '');
  
  // Check for international format (+1234567890) or domestic (1234567890)
  const isInternational = cleaned.startsWith('+');
  const digitsOnly = cleaned.replace(/^\+/, '');
  
  // Valid phone numbers: 10-15 digits
  const isValidLength = digitsOnly.length >= 10 && digitsOnly.length <= 15;
  
  // Additional format checks
  const hasValidStructure = isInternational ? 
    /^\+\d{10,14}$/.test(cleaned) : 
    /^\d{10,15}$/.test(cleaned);
  
  return isValidLength && hasValidStructure;
};

/**
 * Validate date of birth with comprehensive checks
 * @param {string} dateOfBirth - Date of birth in YYYY-MM-DD format
 * @returns {boolean} - True if valid date of birth
 */
const validateDateOfBirth = (dateOfBirth) => {
  if (!dateOfBirth || typeof dateOfBirth !== 'string') return false;
  
  // Check format first
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return false;
  
  const date = new Date(dateOfBirth);
  const now = new Date();
  
  // Check if date is valid
  if (isNaN(date.getTime())) return false;
  
  // Check if the date string matches the parsed date (catches invalid dates like Feb 30)
  const [year, month, day] = dateOfBirth.split('-').map(Number);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return false;
  }
  
  // Check if date is not in the future
  if (date > now) return false;
  
  // Check reasonable age limits (13-150 years old)
  const minAge = new Date();
  minAge.setFullYear(minAge.getFullYear() - 13);
  
  const maxAge = new Date();
  maxAge.setFullYear(maxAge.getFullYear() - 150);
  
  return date <= minAge && date >= maxAge;
};

/**
 * Validate URL format with security checks
 * @param {string} url - URL to validate
 * @returns {boolean} - True if valid and safe URL format
 */
const validateUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  
  try {
    const urlObj = new URL(url);
    
    // Only allow HTTP and HTTPS protocols
    if (!['http:', 'https:'].includes(urlObj.protocol)) return false;
    
    // Check for reasonable length
    if (url.length > 2048) return false;
    
    // Basic security check - no localhost or private IPs in production
    if (process.env.NODE_ENV === 'production') {
      const hostname = urlObj.hostname.toLowerCase();
      if (hostname === 'localhost' || 
          hostname.startsWith('127.') || 
          hostname.startsWith('192.168.') ||
          hostname.startsWith('10.') ||
          hostname.startsWith('172.')) {
        return false;
      }
    }
    
    return true;
  } catch {
    return false;
  }
};

/**
 * Validate UUID format
 * @param {string} uuid - UUID string to validate
 * @returns {boolean} - True if valid UUID format
 */
const isValidUUID = (uuid) => {
  if (!uuid || typeof uuid !== 'string') return false;
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

/**
 * Validate OTP code format
 * @param {string} otp - OTP code to validate
 * @returns {boolean} - True if valid OTP format
 */
const validateOTP = (otp) => {
  if (!otp || typeof otp !== 'string') return false;
  
  // OTP should be exactly 6 digits
  const otpRegex = /^\d{6}$/;
  return otpRegex.test(otp.trim());
};

/**
 * Validate registration data with comprehensive checks
 * @param {Object} data - Registration data object
 * @returns {Object} - Validation result with detailed errors
 */
const validateRegistrationData = (data) => {
  const errors = [];
  
  if (!data || typeof data !== 'object') {
    errors.push('Invalid request data format');
    return { isValid: false, errors };
  }
  
  // Email validation
  if (!data.email) {
    errors.push('Email address is required');
  } else if (!validateEmail(data.email)) {
    errors.push('Please provide a valid email address');
  }
  
  // Password validation with detailed feedback
  if (!data.password) {
    errors.push('Password is required');
  } else {
    const passwordStrength = getPasswordStrength(data.password);
    if (!passwordStrength.isValid) {
      errors.push(...passwordStrength.feedback);
    }
  }
  
  // Name validation
  if (!data.name) {
    errors.push('Full name is required');
  } else if (!validateName(data.name)) {
    errors.push('Name must be 2-100 characters and contain only letters, spaces, hyphens, apostrophes, and dots');
  }
  
  // Optional fields validation
  if (data.phoneNumber && !validatePhoneNumber(data.phoneNumber)) {
    errors.push('Please provide a valid phone number (10-15 digits)');
  }
  
  if (data.dateOfBirth && !validateDateOfBirth(data.dateOfBirth)) {
    errors.push('Please provide a valid date of birth (YYYY-MM-DD format, age 13-150)');
  }
  
  if (data.profileImageUrl && !validateUrl(data.profileImageUrl)) {
    errors.push('Please provide a valid profile image URL (HTTP/HTTPS only)');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    data: {
      email: data.email?.toLowerCase().trim(),
      name: data.name?.trim(),
      phoneNumber: data.phoneNumber?.trim() || null,
      dateOfBirth: data.dateOfBirth || null,
      profileImageUrl: data.profileImageUrl?.trim() || null
    }
  };
};

/**
 * Validate login data
 * @param {Object} data - Login data object
 * @returns {Object} - Validation result
 */
const validateLoginData = (data) => {
  const errors = [];
  
  if (!data || typeof data !== 'object') {
    errors.push('Invalid request data format');
    return { isValid: false, errors };
  }
  
  // Email validation
  if (!data.email) {
    errors.push('Email address is required');
  } else if (!validateEmail(data.email)) {
    errors.push('Please provide a valid email address');
  }
  
  // Password validation (just check if provided, not strength for login)
  if (!data.password) {
    errors.push('Password is required');
  } else if (typeof data.password !== 'string' || data.password.length < 1) {
    errors.push('Password cannot be empty');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    data: {
      email: data.email?.toLowerCase().trim(),
      password: data.password,
      rememberMe: Boolean(data.rememberMe)
    }
  };
};

/**
 * Validate OTP verification data
 * @param {Object} data - OTP verification data
 * @returns {Object} - Validation result
 */
const validateOTPData = (data) => {
  const errors = [];
  
  if (!data || typeof data !== 'object') {
    errors.push('Invalid request data format');
    return { isValid: false, errors };
  }
  
  // Email validation
  if (!data.email) {
    errors.push('Email address is required');
  } else if (!validateEmail(data.email)) {
    errors.push('Please provide a valid email address');
  }
  
  // OTP validation
  if (!data.otp) {
    errors.push('OTP code is required');
  } else if (!validateOTP(data.otp)) {
    errors.push('OTP must be a 6-digit number');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    data: {
      email: data.email?.toLowerCase().trim(),
      otp: data.otp?.trim()
    }
  };
};

/**
 * Validate OTP resend data
 * @param {Object} data - OTP resend data
 * @returns {Object} - Validation result
 */
const validateOTPResendData = (data) => {
  const errors = [];
  
  if (!data || typeof data !== 'object') {
    errors.push('Invalid request data format');
    return { isValid: false, errors };
  }
  
  // Email validation
  if (!data.email) {
    errors.push('Email address is required');
  } else if (!validateEmail(data.email)) {
    errors.push('Please provide a valid email address');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    data: {
      email: data.email?.toLowerCase().trim()
    }
  };
};

/**
 * Validate profile update data
 * @param {Object} data - Profile update data object
 * @returns {Object} - Validation result
 */
const validateProfileUpdateData = (data) => {
  const errors = [];
  
  if (!data || typeof data !== 'object') {
    errors.push('Invalid request data format');
    return { isValid: false, errors };
  }
  
  // Check if at least one field is provided for update
  const allowedFields = ['name', 'email', 'phoneNumber', 'dateOfBirth', 'profileImageUrl'];
  const providedFields = Object.keys(data).filter(key => 
    allowedFields.includes(key) && data[key] !== undefined && data[key] !== null
  );
  
  if (providedFields.length === 0) {
    errors.push('At least one field must be provided for update');
    return { isValid: false, errors };
  }
  
  const cleanData = {};
  
  // Validate individual fields if provided
  if (data.name !== undefined && data.name !== null) {
    if (data.name === '') {
      errors.push('Name cannot be empty');
    } else if (!validateName(data.name)) {
      errors.push('Name must be 2-100 characters and contain only letters, spaces, hyphens, apostrophes, and dots');
    } else {
      cleanData.name = data.name.trim();
    }
  }
  
  if (data.email !== undefined && data.email !== null) {
    if (data.email === '') {
      errors.push('Email cannot be empty');
    } else if (!validateEmail(data.email)) {
      errors.push('Please provide a valid email address');
    } else {
      cleanData.email = data.email.toLowerCase().trim();
    }
  }
  
  if (data.phoneNumber !== undefined && data.phoneNumber !== null) {
    if (data.phoneNumber === '') {
      cleanData.phoneNumber = null; // Allow clearing phone number
    } else if (!validatePhoneNumber(data.phoneNumber)) {
      errors.push('Please provide a valid phone number (10-15 digits)');
    } else {
      cleanData.phoneNumber = data.phoneNumber.trim();
    }
  }
  
  if (data.dateOfBirth !== undefined && data.dateOfBirth !== null) {
    if (data.dateOfBirth === '') {
      cleanData.dateOfBirth = null; // Allow clearing date of birth
    } else if (!validateDateOfBirth(data.dateOfBirth)) {
      errors.push('Please provide a valid date of birth (YYYY-MM-DD format, age 13-150)');
    } else {
      cleanData.dateOfBirth = data.dateOfBirth;
    }
  }
  
  if (data.profileImageUrl !== undefined && data.profileImageUrl !== null) {
    if (data.profileImageUrl === '') {
      cleanData.profileImageUrl = null; // Allow clearing profile image
    } else if (!validateUrl(data.profileImageUrl)) {
      errors.push('Please provide a valid profile image URL (HTTP/HTTPS only)');
    } else {
      cleanData.profileImageUrl = data.profileImageUrl.trim();
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    data: cleanData
  };
};

/**
 * Validate password change data
 * @param {Object} data - Password change data object
 * @returns {Object} - Validation result
 */
const validatePasswordChangeData = (data) => {
  const errors = [];
  
  if (!data || typeof data !== 'object') {
    errors.push('Invalid request data format');
    return { isValid: false, errors };
  }
  
  // Current password validation
  if (!data.currentPassword) {
    errors.push('Current password is required');
  } else if (typeof data.currentPassword !== 'string') {
    errors.push('Current password must be a valid string');
  }
  
  // New password validation
  if (!data.newPassword) {
    errors.push('New password is required');
  } else {
    const passwordStrength = getPasswordStrength(data.newPassword);
    if (!passwordStrength.isValid) {
      errors.push(...passwordStrength.feedback);
    }
  }
  
  // Check if passwords are different
  if (data.currentPassword && data.newPassword && data.currentPassword === data.newPassword) {
    errors.push('New password must be different from current password');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    data: {
      currentPassword: data.currentPassword,
      newPassword: data.newPassword
    }
  };
};

/**
 * Validate pagination parameters with enhanced options
 * @param {Object} params - Pagination parameters
 * @returns {Object} - Validated pagination parameters
 */
const validatePaginationParams = (params = {}) => {
  const { page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'desc' } = params;
  
  const validatedPage = Math.max(1, parseInt(page) || 1);
  const validatedLimit = Math.min(100, Math.max(1, parseInt(limit) || 20));
  const validatedSortOrder = ['asc', 'desc'].includes(sortOrder?.toLowerCase()) ? 
    sortOrder.toLowerCase() : 'desc';
  
  // Safe sort fields to prevent SQL injection
  const allowedSortFields = [
    'created_at', 'updated_at', 'name', 'email', 'last_login', 
    'price', 'rating', 'popularity', 'id', 'title'
  ];
  const validatedSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
  
  return {
    page: validatedPage,
    limit: validatedLimit,
    sortBy: validatedSortBy,
    sortOrder: validatedSortOrder,
    offset: (validatedPage - 1) * validatedLimit
  };
};

/**
 * Validate product filters for VR shopping
 * @param {Object} filters - Product filter parameters
 * @returns {Object} - Validation result
 */
const validateProductFilters = (filters = {}) => {
  const errors = [];
  const validated = {};
  
  // Category ID validation
  if (filters.category_id) {
    if (!isValidUUID(filters.category_id)) {
      errors.push('Invalid category ID format');
    } else {
      validated.category_id = filters.category_id;
    }
  }
  
  // Subcategory ID validation
  if (filters.subcategory_id) {
    if (!isValidUUID(filters.subcategory_id)) {
      errors.push('Invalid subcategory ID format');
    } else {
      validated.subcategory_id = filters.subcategory_id;
    }
  }
  
  // Price range validation
  if (filters.min_price !== undefined) {
    const minPrice = parseFloat(filters.min_price);
    if (isNaN(minPrice) || minPrice < 0) {
      errors.push('Minimum price must be a non-negative number');
    } else if (minPrice > 999999) {
      errors.push('Minimum price is too high');
    } else {
      validated.min_price = minPrice;
    }
  }
  
  if (filters.max_price !== undefined) {
    const maxPrice = parseFloat(filters.max_price);
    if (isNaN(maxPrice) || maxPrice < 0) {
      errors.push('Maximum price must be a non-negative number');
    } else if (maxPrice > 999999) {
      errors.push('Maximum price is too high');
    } else {
      validated.max_price = maxPrice;
    }
  }
  
  // Price range consistency check
  if (validated.min_price && validated.max_price && validated.min_price > validated.max_price) {
    errors.push('Minimum price cannot be greater than maximum price');
  }
  
  // Search term validation
  if (filters.search) {
    if (typeof filters.search !== 'string') {
      errors.push('Search term must be a string');
    } else if (filters.search.trim().length < 2) {
      errors.push('Search term must be at least 2 characters long');
    } else if (filters.search.length > 100) {
      errors.push('Search term is too long (maximum 100 characters)');
    } else {
      validated.search = filters.search.trim();
    }
  }
  
  // Brand validation
  if (filters.brand) {
    if (typeof filters.brand !== 'string') {
      errors.push('Brand must be a string');
    } else if (filters.brand.length > 50) {
      errors.push('Brand name is too long');
    } else {
      validated.brand = filters.brand.trim();
    }
  }
  
  // Sort validation
  const validSortFields = ['name', 'price', 'rating', 'popularity', 'created_at'];
  if (filters.sort_by && !validSortFields.includes(filters.sort_by)) {
    errors.push(`Sort field must be one of: ${validSortFields.join(', ')}`);
  } else if (filters.sort_by) {
    validated.sort_by = filters.sort_by;
  }
  
  const validSortOrders = ['asc', 'desc'];
  if (filters.sort_order && !validSortOrders.includes(filters.sort_order)) {
    errors.push('Sort order must be "asc" or "desc"');
  } else if (filters.sort_order) {
    validated.sort_order = filters.sort_order;
  }
  
  // Boolean filters
  if (filters.in_stock !== undefined) {
    validated.in_stock = Boolean(filters.in_stock);
  }
  
  if (filters.is_sponsored !== undefined) {
    validated.is_sponsored = Boolean(filters.is_sponsored);
  }
  
  if (filters.is_featured !== undefined) {
    validated.is_featured = Boolean(filters.is_featured);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    validated
  };
};

/**
 * Validate shopping cart item data
 * @param {Object} itemData - Cart item data
 * @returns {Object} - Validation result
 */
const validateCartItem = (itemData) => {
  const errors = [];
  const validated = {};
  
  if (!itemData || typeof itemData !== 'object') {
    errors.push('Invalid cart item data');
    return { isValid: false, errors };
  }
  
  // Session ID validation
  if (!itemData.session_id) {
    errors.push('Shopping session ID is required');
  } else if (!isValidUUID(itemData.session_id)) {
    errors.push('Invalid session ID format');
  } else {
    validated.session_id = itemData.session_id;
  }
  
  // Product ID validation
  if (!itemData.product_id) {
    errors.push('Product ID is required');
  } else if (!isValidUUID(itemData.product_id)) {
    errors.push('Invalid product ID format');
  } else {
    validated.product_id = itemData.product_id;
  }
  
  // Quantity validation
  if (itemData.quantity !== undefined) {
    const quantity = parseInt(itemData.quantity);
    if (isNaN(quantity) || quantity <= 0) {
      errors.push('Quantity must be a positive number');
    } else if (quantity > 100) {
      errors.push('Quantity cannot exceed 100 items');
    } else {
      validated.quantity = quantity;
    }
  } else {
    validated.quantity = 1; // Default quantity
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    validated
  };
};

/**
 * Validate payment data for checkout
 * @param {Object} paymentData - Payment data
 * @returns {Object} - Validation result
 */
const validatePaymentData = (paymentData) => {
  const errors = [];
  const validated = {};
  
  if (!paymentData || typeof paymentData !== 'object') {
    errors.push('Invalid payment data');
    return { isValid: false, errors };
  }
  
  // Order ID validation
  if (!paymentData.order_id) {
    errors.push('Order ID is required');
  } else if (!isValidUUID(paymentData.order_id)) {
    errors.push('Invalid order ID format');
  } else {
    validated.order_id = paymentData.order_id;
  }
  
  // Payment method validation
  const validPaymentMethods = ['cash', 'stripe', 'paypal'];
  if (!paymentData.payment_method) {
    errors.push('Payment method is required');
  } else if (!validPaymentMethods.includes(paymentData.payment_method)) {
    errors.push(`Payment method must be one of: ${validPaymentMethods.join(', ')}`);
  } else {
    validated.payment_method = paymentData.payment_method;
  }
  
  // Cash amount validation (for cash payments)
  if (paymentData.cash_received !== undefined) {
    const cashAmount = parseFloat(paymentData.cash_received);
    if (isNaN(cashAmount) || cashAmount <= 0) {
      errors.push('Cash received must be a positive number');
    } else if (cashAmount > 999999) {
      errors.push('Cash amount is too large');
    } else {
      validated.cash_received = cashAmount;
    }
  }
  
  // Refund amount validation
  if (paymentData.refund_amount !== undefined) {
    const refundAmount = parseFloat(paymentData.refund_amount);
    if (isNaN(refundAmount) || refundAmount <= 0) {
      errors.push('Refund amount must be a positive number');
    } else if (refundAmount > 999999) {
      errors.push('Refund amount is too large');
    } else {
      validated.refund_amount = refundAmount;
    }
  }
  
  // Stripe payment intent ID validation
  if (paymentData.payment_intent_id) {
    if (typeof paymentData.payment_intent_id !== 'string' || 
        !paymentData.payment_intent_id.startsWith('pi_')) {
      errors.push('Invalid Stripe payment intent ID format');
    } else {
      validated.payment_intent_id = paymentData.payment_intent_id;
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    validated
  };
};

/**
 * Validate customer support conversation data
 * @param {Object} conversationData - Conversation data
 * @returns {Object} - Validation result
 */
const validateSupportConversation = (conversationData) => {
  const errors = [];
  const validated = {};
  
  if (!conversationData || typeof conversationData !== 'object') {
    errors.push('Invalid conversation data');
    return { isValid: false, errors };
  }
  
  // Support location ID validation
  if (!conversationData.support_location_id) {
    errors.push('Support location ID is required');
  } else if (!isValidUUID(conversationData.support_location_id)) {
    errors.push('Invalid support location ID format');
  } else {
    validated.support_location_id = conversationData.support_location_id;
  }
  
  // Message validation
  const message = conversationData.initial_query || conversationData.message;
  if (!message) {
    errors.push('Message or query is required');
  } else if (typeof message !== 'string') {
    errors.push('Message must be a string');
  } else if (message.trim().length < 1) {
    errors.push('Message cannot be empty');
  } else if (message.trim().length > 2000) {
    errors.push('Message is too long (maximum 2000 characters)');
  } else {
    validated.message = message.trim();
  }
  
  // Session ID validation (optional)
  if (conversationData.session_id) {
    if (!isValidUUID(conversationData.session_id)) {
      errors.push('Invalid session ID format');
    } else {
      validated.session_id = conversationData.session_id;
    }
  }
  
  // Conversation ID validation (for existing conversations)
  if (conversationData.conversation_id) {
    if (!isValidUUID(conversationData.conversation_id)) {
      errors.push('Invalid conversation ID format');
    } else {
      validated.conversation_id = conversationData.conversation_id;
    }
  }
  
  // Satisfaction rating validation
  if (conversationData.satisfaction_rating !== undefined) {
    const rating = parseInt(conversationData.satisfaction_rating);
    if (isNaN(rating) || rating < 1 || rating > 5) {
      errors.push('Satisfaction rating must be a number between 1 and 5');
    } else {
      validated.satisfaction_rating = rating;
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    validated
  };
};

/**
 * Validate VR location coordinates
 * @param {Object} locationData - VR location coordinates
 * @returns {Object} - Validation result
 */
const validateVRLocation = (locationData) => {
  const errors = [];
  const validated = {};
  
  if (!locationData || typeof locationData !== 'object') {
    return {
      isValid: true,
      errors: [],
      validated: null
    };
  }
  
  // Validate X coordinate
  if (locationData.x !== undefined) {
    const x = parseFloat(locationData.x);
    if (isNaN(x)) {
      errors.push('X coordinate must be a valid number');
    } else if (x < -1000 || x > 1000) {
      errors.push('X coordinate must be between -1000 and 1000');
    } else {
      validated.x = x;
    }
  }
  
  // Validate Y coordinate
  if (locationData.y !== undefined) {
    const y = parseFloat(locationData.y);
    if (isNaN(y)) {
      errors.push('Y coordinate must be a valid number');
    } else if (y < -1000 || y > 1000) {
      errors.push('Y coordinate must be between -1000 and 1000');
    } else {
      validated.y = y;
    }
  }
  
  // Validate Z coordinate
  if (locationData.z !== undefined) {
    const z = parseFloat(locationData.z);
    if (isNaN(z)) {
      errors.push('Z coordinate must be a valid number');
    } else if (z < -1000 || z > 1000) {
      errors.push('Z coordinate must be between -1000 and 1000');
    } else {
      validated.z = z;
    }
  }
  
  // Validate rotation (optional)
  if (locationData.rotation !== undefined) {
    if (typeof locationData.rotation === 'string') {
      const rotationParts = locationData.rotation.split(',');
      if (rotationParts.length === 3) {
        const rotationValues = rotationParts.map(part => parseFloat(part.trim()));
        if (rotationValues.every(val => !isNaN(val) && val >= 0 && val <= 360)) {
          validated.rotation = locationData.rotation;
        } else {
          errors.push('Rotation values must be numbers between 0 and 360');
        }
      } else {
        errors.push('Rotation must be in format "x,y,z" (e.g., "0,180,0")');
      }
    } else {
      errors.push('Rotation must be a string in format "x,y,z"');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    validated: Object.keys(validated).length > 0 ? validated : null
  };
};

/**
 * Validate VR session data
 * @param {Object} sessionData - VR session data
 * @returns {Object} - Validation result
 */
const validateVRSessionData = (sessionData) => {
  const errors = [];
  const validated = {};
  
  if (!sessionData || typeof sessionData !== 'object') {
    return {
      isValid: true,
      errors: [],
      validated: {}
    };
  }
  
  // Headset validation
  if (sessionData.headset) {
    if (typeof sessionData.headset !== 'string') {
      errors.push('Headset must be a string');
    } else if (sessionData.headset.length > 50) {
      errors.push('Headset name is too long');
    } else {
      validated.headset = sessionData.headset.trim();
    }
  }
  
  // User height validation
  if (sessionData.user_height !== undefined) {
    const height = parseFloat(sessionData.user_height);
    if (isNaN(height) || height < 100 || height > 250) {
      errors.push('User height must be between 100 and 250 cm');
    } else {
      validated.user_height = height;
    }
  }
  
  // Location validation
  if (sessionData.location) {
    if (typeof sessionData.location !== 'string') {
      errors.push('Location must be a string');
    } else {
      validated.location = sessionData.location.trim();
    }
  }
  
  // Language validation
  if (sessionData.preferred_language) {
    const validLanguages = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko'];
    if (!validLanguages.includes(sessionData.preferred_language)) {
      errors.push(`Language must be one of: ${validLanguages.join(', ')}`);
    } else {
      validated.preferred_language = sessionData.preferred_language;
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    validated
  };
};

/**
 * Validate analytics tracking data
 * @param {Object} trackingData - Analytics tracking data
 * @returns {Object} - Validation result
 */
const validateAnalyticsData = (trackingData) => {
  const errors = [];
  const validated = {};
  
  if (!trackingData || typeof trackingData !== 'object') {
    errors.push('Invalid tracking data');
    return { isValid: false, errors };
  }
  
  // Activity type validation
  if (!trackingData.activity_type) {
    errors.push('Activity type is required');
  } else if (typeof trackingData.activity_type !== 'string') {
    errors.push('Activity type must be a string');
  } else if (trackingData.activity_type.length > 100) {
    errors.push('Activity type is too long');
  } else {
    validated.activity_type = trackingData.activity_type.trim();
  }
  
  // Session ID validation (optional)
  if (trackingData.session_id) {
    if (!isValidUUID(trackingData.session_id)) {
      errors.push('Invalid session ID format');
    } else {
      validated.session_id = trackingData.session_id;
    }
  }
  
  // Activity data validation (must be an object)
  if (trackingData.activity_data !== undefined) {
    if (typeof trackingData.activity_data !== 'object' || trackingData.activity_data === null) {
      errors.push('Activity data must be an object');
    } else {
      // Validate the JSON size isn't too large
      try {
        const jsonString = JSON.stringify(trackingData.activity_data);
        if (jsonString.length > 10000) {
          errors.push('Activity data is too large (maximum 10KB)');
        } else {
          validated.activity_data = trackingData.activity_data;
        }
      } catch (e) {
        errors.push('Activity data contains invalid JSON');
      }
    }
  }
  
  // Location data validation
  if (trackingData.location_data) {
    const locationValidation = validateVRLocation(trackingData.location_data);
    if (!locationValidation.isValid) {
      errors.push(...locationValidation.errors);
    } else {
      validated.location_data = locationValidation.validated;
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    validated
  };
};

/**
 * Sanitize string input to prevent XSS and other attacks
 * @param {string} input - Input string to sanitize
 * @returns {string} - Sanitized string
 */
const sanitizeString = (input) => {
  if (!input || typeof input !== 'string') return '';
  
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/['"]/g, '') // Remove quotes to prevent SQL injection
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .substring(0, 2000); // Limit length to prevent buffer overflow
};

/**
 * Sanitize and validate user input object
 * @param {Object} data - Data object to validate and sanitize
 * @param {Array} allowedFields - Array of allowed field names
 * @returns {Object} - Sanitized data object
 */
const sanitizeUserInput = (data, allowedFields = []) => {
  if (!data || typeof data !== 'object') return {};
  
  const sanitized = {};
  
  allowedFields.forEach(field => {
    if (data[field] !== undefined && data[field] !== null) {
      if (typeof data[field] === 'string') {
        sanitized[field] = sanitizeString(data[field]);
      } else if (typeof data[field] === 'number') {
        // Validate numbers are within reasonable bounds
        if (isFinite(data[field]) && data[field] >= -999999999 && data[field] <= 999999999) {
          sanitized[field] = data[field];
        }
      } else if (typeof data[field] === 'boolean') {
        sanitized[field] = Boolean(data[field]);
      } else if (typeof data[field] === 'object') {
        // For objects, stringify and parse to ensure they're safe
        try {
          const jsonString = JSON.stringify(data[field]);
          if (jsonString.length <= 10000) { // Limit object size
            sanitized[field] = JSON.parse(jsonString);
          }
        } catch (e) {
          // Skip invalid objects
        }
      }
    }
  });
  
  return sanitized;
};

/**
 * Validate IP address format
 * @param {string} ip - IP address to validate
 * @returns {boolean} - True if valid IP address
 */
const validateIPAddress = (ip) => {
  if (!ip || typeof ip !== 'string') return false;
  
  // IPv4 regex
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  
  // IPv6 regex (simplified)
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
};

/**
 * Validate user agent string
 * @param {string} userAgent - User agent string to validate
 * @returns {boolean} - True if valid user agent
 */
const validateUserAgent = (userAgent) => {
  if (!userAgent || typeof userAgent !== 'string') return false;
  
  // Basic validation - check length and common patterns
  if (userAgent.length < 10 || userAgent.length > 500) return false;
  
  // Should contain common browser/device indicators
  const commonPatterns = /Mozilla|Chrome|Firefox|Safari|Edge|Opera|Mobile|Android|iPhone|iPad/i;
  
  return commonPatterns.test(userAgent);
};

/**
 * Validate request rate limiting data
 * @param {Object} rateLimitData - Rate limit data
 * @returns {Object} - Validation result
 */
const validateRateLimitData = (rateLimitData) => {
  const errors = [];
  const validated = {};
  
  if (!rateLimitData || typeof rateLimitData !== 'object') {
    errors.push('Invalid rate limit data');
    return { isValid: false, errors };
  }
  
  // Identifier validation (email or IP)
  if (!rateLimitData.identifier) {
    errors.push('Identifier is required');
  } else if (typeof rateLimitData.identifier !== 'string') {
    errors.push('Identifier must be a string');
  } else {
    validated.identifier = rateLimitData.identifier.trim();
  }
  
  // Identifier type validation
  const validIdentifierTypes = ['email', 'ip'];
  if (!rateLimitData.identifier_type) {
    errors.push('Identifier type is required');
  } else if (!validIdentifierTypes.includes(rateLimitData.identifier_type)) {
    errors.push('Identifier type must be "email" or "ip"');
  } else {
    validated.identifier_type = rateLimitData.identifier_type;
    
    // Validate identifier format based on type
    if (rateLimitData.identifier_type === 'email' && !validateEmail(rateLimitData.identifier)) {
      errors.push('Invalid email format for email identifier');
    } else if (rateLimitData.identifier_type === 'ip' && !validateIPAddress(rateLimitData.identifier)) {
      errors.push('Invalid IP address format for IP identifier');
    }
  }
  
  // Action type validation
  const validActionTypes = ['register', 'login', 'resend', 'verify', 'password_reset'];
  if (!rateLimitData.action_type) {
    errors.push('Action type is required');
  } else if (!validActionTypes.includes(rateLimitData.action_type)) {
    errors.push(`Action type must be one of: ${validActionTypes.join(', ')}`);
  } else {
    validated.action_type = rateLimitData.action_type;
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    validated
  };
};

/**
 * Comprehensive input validation for API requests
 * @param {Object} request - Request object containing headers, body, etc.
 * @returns {Object} - Validation result with extracted data
 */
const validateAPIRequest = (request) => {
  const errors = [];
  const validated = {
    headers: {},
    body: {},
    query: {},
    meta: {}
  };
  
  // Validate Content-Type for POST/PUT requests
  if (['POST', 'PUT', 'PATCH'].includes(request.httpMethod)) {
    const contentType = request.headers['content-type'] || request.headers['Content-Type'];
    if (!contentType || !contentType.includes('application/json')) {
      errors.push('Content-Type must be application/json for POST/PUT requests');
    }
  }
  
  // Validate and extract user agent
  const userAgent = request.headers['user-agent'] || request.headers['User-Agent'];
  if (userAgent) {
    if (validateUserAgent(userAgent)) {
      validated.meta.userAgent = userAgent;
    } else {
      // Don't error, just log suspicious user agent
      validated.meta.userAgent = 'unknown';
    }
  }
  
  // Validate and extract IP address
  const ip = request.headers['x-forwarded-for'] || 
            request.headers['X-Forwarded-For'] ||
            request.requestContext?.identity?.sourceIp;
  if (ip) {
    const realIP = ip.split(',')[0].trim(); // Handle comma-separated IPs
    if (validateIPAddress(realIP)) {
      validated.meta.ipAddress = realIP;
    }
  }
  
  // Parse and validate request body
  if (request.body) {
    try {
      validated.body = JSON.parse(request.body);
    } catch (parseError) {
      errors.push('Request body must be valid JSON');
    }
  }
  
  // Extract query parameters
  if (request.queryStringParameters) {
    validated.query = request.queryStringParameters;
  }
  
  // Extract and validate authorization header
  const authHeader = request.headers.authorization || request.headers.Authorization;
  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      validated.headers.authorization = authHeader;
    } else {
      errors.push('Authorization header must use Bearer token format');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    validated
  };
};

/**
 * Export all validation functions
 */
module.exports = {
  // Basic validation functions
  validateEmail,
  validatePassword,
  getPasswordStrength,
  validateName,
  validatePhoneNumber,
  validateDateOfBirth,
  validateUrl,
  isValidUUID,
  validateOTP,
  
  // Authentication validation
  validateRegistrationData,
  validateLoginData,
  validateOTPData,
  validateOTPResendData,
  validateProfileUpdateData,
  validatePasswordChangeData,
  
  // VR-specific validation
  validateProductFilters,
  validateCartItem,
  validatePaymentData,
  validateSupportConversation,
  validateVRLocation,
  validateVRSessionData,
  validateAnalyticsData,
  
  // Utility functions
  validatePaginationParams,
  sanitizeString,
  sanitizeUserInput,
  validateIPAddress,
  validateUserAgent,
  validateRateLimitData,
  validateAPIRequest,
  
  // Legacy aliases for backward compatibility
  validateUUID: isValidUUID
};