/**
 * Validation utility functions for user input
 */

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid email format
 */
const validateEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isValidFormat = emailRegex.test(email);
  const isValidLength = email.length <= 255;
  
  return isValidFormat && isValidLength;
};

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {boolean} - True if password meets requirements
 */
const validatePassword = (password) => {
  if (!password || typeof password !== 'string') return false;
  
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number, 1 special char
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  const isValidFormat = passwordRegex.test(password);
  const isValidLength = password.length >= 8 && password.length <= 128;
  
  return isValidFormat && isValidLength;
};

/**
 * Get password strength score and feedback
 * @param {string} password - Password to analyze
 * @returns {Object} - Password strength analysis
 */
const getPasswordStrength = (password) => {
  if (!password) return { score: 0, feedback: ['Password is required'] };
  
  const feedback = [];
  let score = 0;
  
  // Length check
  if (password.length >= 8) score += 1;
  else feedback.push('Password must be at least 8 characters long');
  
  if (password.length >= 12) score += 1;
  
  // Character variety checks
  if (/[a-z]/.test(password)) score += 1;
  else feedback.push('Password must contain lowercase letters');
  
  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push('Password must contain uppercase letters');
  
  if (/\d/.test(password)) score += 1;
  else feedback.push('Password must contain numbers');
  
  if (/[@$!%*?&]/.test(password)) score += 1;
  else feedback.push('Password must contain special characters');
  
  // Common patterns to avoid
  if (/(.)\1{2,}/.test(password)) {
    score -= 1;
    feedback.push('Avoid repeating characters');
  }
  
  if (/123|abc|qwe/i.test(password)) {
    score -= 1;
    feedback.push('Avoid common sequences');
  }
  
  return {
    score: Math.max(0, Math.min(6, score)),
    feedback: feedback.length === 0 ? ['Strong password!'] : feedback,
    isValid: score >= 4
  };
};

/**
 * Validate name format
 * @param {string} name - Name to validate
 * @returns {boolean} - True if valid name format
 */
const validateName = (name) => {
  if (!name || typeof name !== 'string') return false;
  
  const trimmedName = name.trim();
  const isValidLength = trimmedName.length >= 2 && trimmedName.length <= 100;
  const isValidFormat = /^[a-zA-Z\s\-'\.]+$/.test(trimmedName);
  
  return isValidLength && isValidFormat;
};

/**
 * Validate phone number format
 * @param {string} phoneNumber - Phone number to validate
 * @returns {boolean} - True if valid phone number format
 */
const validatePhoneNumber = (phoneNumber) => {
  if (!phoneNumber || typeof phoneNumber !== 'string') return false;
  
  // Remove all non-digit characters
  const digitsOnly = phoneNumber.replace(/\D/g, '');
  
  // Check if it's a valid length (10-15 digits)
  return digitsOnly.length >= 10 && digitsOnly.length <= 15;
};

/**
 * Validate date of birth
 * @param {string} dateOfBirth - Date of birth in YYYY-MM-DD format
 * @returns {boolean} - True if valid date of birth
 */
const validateDateOfBirth = (dateOfBirth) => {
  if (!dateOfBirth || typeof dateOfBirth !== 'string') return false;
  
  const date = new Date(dateOfBirth);
  const now = new Date();
  
  // Check if date is valid
  if (isNaN(date.getTime())) return false;
  
  // Check if date is not in the future
  if (date > now) return false;
  
  // Check if person is at least 13 years old (common minimum age)
  const minAge = new Date();
  minAge.setFullYear(minAge.getFullYear() - 13);
  
  // Check if person is not older than 150 years
  const maxAge = new Date();
  maxAge.setFullYear(maxAge.getFullYear() - 150);
  
  return date <= minAge && date >= maxAge;
};

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean} - True if valid URL format
 */
const validateUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Validate registration data
 * @param {Object} data - Registration data object
 * @returns {Object} - Validation result
 */
const validateRegistrationData = (data) => {
  const errors = [];
  
  if (!data || typeof data !== 'object') {
    errors.push('Invalid request data');
    return { isValid: false, errors };
  }
  
  // Email validation
  if (!data.email) {
    errors.push('Email is required');
  } else if (!validateEmail(data.email)) {
    errors.push('Please provide a valid email address');
  }
  
  // Password validation
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
    errors.push('Name is required');
  } else if (!validateName(data.name)) {
    errors.push('Name must be 2-100 characters and contain only letters, spaces, hyphens, apostrophes, and dots');
  }
  
  // Optional fields validation
  if (data.phoneNumber && !validatePhoneNumber(data.phoneNumber)) {
    errors.push('Please provide a valid phone number');
  }
  
  if (data.dateOfBirth && !validateDateOfBirth(data.dateOfBirth)) {
    errors.push('Please provide a valid date of birth');
  }
  
  if (data.profileImageUrl && !validateUrl(data.profileImageUrl)) {
    errors.push('Please provide a valid profile image URL');
  }
  
  return {
    isValid: errors.length === 0,
    errors
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
    errors.push('Invalid request data');
    return { isValid: false, errors };
  }
  
  // Email validation
  if (!data.email) {
    errors.push('Email is required');
  } else if (!validateEmail(data.email)) {
    errors.push('Please provide a valid email address');
  }
  
  // Password validation
  if (!data.password) {
    errors.push('Password is required');
  } else if (typeof data.password !== 'string' || data.password.length < 1) {
    errors.push('Password cannot be empty');
  }
  
  return {
    isValid: errors.length === 0,
    errors
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
    errors.push('Invalid request data');
    return { isValid: false, errors };
  }
  
  // Check if at least one field is provided
  const allowedFields = ['name', 'email', 'phoneNumber', 'dateOfBirth', 'profileImageUrl'];
  const providedFields = Object.keys(data).filter(key => allowedFields.includes(key) && data[key] !== undefined);
  
  if (providedFields.length === 0) {
    errors.push('At least one field must be provided for update');
    return { isValid: false, errors };
  }
  
  // Validate individual fields if provided
  if (data.name !== undefined) {
    if (!validateName(data.name)) {
      errors.push('Name must be 2-100 characters and contain only letters, spaces, hyphens, apostrophes, and dots');
    }
  }
  
  if (data.email !== undefined) {
    if (!validateEmail(data.email)) {
      errors.push('Please provide a valid email address');
    }
  }
  
  if (data.phoneNumber !== undefined && data.phoneNumber !== null) {
    if (data.phoneNumber !== '' && !validatePhoneNumber(data.phoneNumber)) {
      errors.push('Please provide a valid phone number');
    }
  }
  
  if (data.dateOfBirth !== undefined && data.dateOfBirth !== null) {
    if (data.dateOfBirth !== '' && !validateDateOfBirth(data.dateOfBirth)) {
      errors.push('Please provide a valid date of birth');
    }
  }
  
  if (data.profileImageUrl !== undefined && data.profileImageUrl !== null) {
    if (data.profileImageUrl !== '' && !validateUrl(data.profileImageUrl)) {
      errors.push('Please provide a valid profile image URL');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
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
    errors.push('Invalid request data');
    return { isValid: false, errors };
  }
  
  // Current password validation
  if (!data.currentPassword) {
    errors.push('Current password is required');
  } else if (typeof data.currentPassword !== 'string') {
    errors.push('Current password must be a string');
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
    errors
  };
};

/**
 * Sanitize string input (remove potentially harmful characters)
 * @param {string} input - Input string to sanitize
 * @returns {string} - Sanitized string
 */
const sanitizeString = (input) => {
  if (!input || typeof input !== 'string') return '';
  
  return input
    .trim()
    .replace(/[<>\"']/g, '') // Remove potential XSS characters
    .slice(0, 1000); // Limit length
};

/**
 * Validate and sanitize user input object
 * @param {Object} data - Data object to validate and sanitize
 * @param {Array} allowedFields - Array of allowed field names
 * @returns {Object} - Sanitized data object
 */
const sanitizeUserInput = (data, allowedFields = []) => {
  if (!data || typeof data !== 'object') return {};
  
  const sanitized = {};
  
  allowedFields.forEach(field => {
    if (data[field] !== undefined) {
      if (typeof data[field] === 'string') {
        sanitized[field] = sanitizeString(data[field]);
      } else {
        sanitized[field] = data[field];
      }
    }
  });
  
  return sanitized;
};

/**
 * Validate UUID format
 * @param {string} uuid - UUID string to validate
 * @returns {boolean} - True if valid UUID format
 */
const validateUUID = (uuid) => {
  if (!uuid || typeof uuid !== 'string') return false;
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

/**
 * Validate pagination parameters
 * @param {Object} params - Pagination parameters
 * @returns {Object} - Validated pagination parameters
 */
const validatePaginationParams = (params) => {
  const { page = 1, limit = 10, sortBy = 'created_at', sortOrder = 'desc' } = params;
  
  const validatedPage = Math.max(1, parseInt(page) || 1);
  const validatedLimit = Math.min(100, Math.max(1, parseInt(limit) || 10));
  const validatedSortOrder = ['asc', 'desc'].includes(sortOrder) ? sortOrder : 'desc';
  
  // Only allow safe sort fields
  const allowedSortFields = ['created_at', 'updated_at', 'name', 'email', 'last_login'];
  const validatedSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
  
  return {
    page: validatedPage,
    limit: validatedLimit,
    sortBy: validatedSortBy,
    sortOrder: validatedSortOrder,
    offset: (validatedPage - 1) * validatedLimit
  };
};

module.exports = {
  validateEmail,
  validatePassword,
  getPasswordStrength,
  validateName,
  validatePhoneNumber,
  validateDateOfBirth,
  validateUrl,
  validateRegistrationData,
  validateLoginData,
  validateProfileUpdateData,
  validatePasswordChangeData,
  sanitizeString,
  sanitizeUserInput,
  validateUUID,
  validatePaginationParams
};