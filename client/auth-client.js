/**
 * Authentication Client for Frontend Applications
 * Handles all authentication-related API calls and token management
 */

class AuthClient {
  constructor(baseUrl, options = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.options = {
      tokenStorageKey: 'authToken',
      refreshTokenStorageKey: 'refreshToken',
      userStorageKey: 'user',
      autoRefresh: true,
      otpLength: 4,
      otpExpiryMiniutes: 1,
      ...options
    };
    
    // Initialize tokens from storage
    this.token = this.getStoredToken();
    this.refreshToken = this.getStoredRefreshToken();
    this.user = this.getStoredUser();

    // Registration state
    this.registrationState = {
      currentStep: 'details', // 'details' | 'otp' | 'completed'
      pendingData: null,
      otpEmail: null,
      otpExpiryTime: null,
      countdownInterval: null
    };
    
    // Set up auto-refresh if enabled
    if (this.options.autoRefresh && this.token) {
      this.setupTokenRefresh();
    }
  }
  
  /**
   * DEPRECATED: Old direct registration method
   * Use registerSendOTP() and registerVerifyOTP() instead
   */
  async register(userData) {
    console.warn('⚠️ register() method is deprecated. Use registerSendOTP() and registerVerifyOTP() instead.');
    
    try {
      const response = await fetch(`${this.baseUrl}/.netlify/functions/auth-register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(userData)
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.setTokens(data.data.token, data.data.refreshToken);
        this.setUser(data.data.user);
        this.setupTokenRefresh();
      }
      
      return data;
    } catch (error) {
      console.error('Registration error:', error);
      return {
        success: false,
        error: 'Network error occurred. Please try again.',
        message: 'Registration failed'
      };
    }
  }
  
  /**
   * NEW: Step 1 - Send registration data and request OTP
   */
  async registerSendOTP(userData) {
    try {
      // Validate required fields
      const requiredFields = ['email', 'password', 'name'];
      for (const field of requiredFields) {
        if (!userData[field]) {
          throw new Error(`${field} is required`);
        }
      }

      // Basic client-side validation
      if (!this.validateEmail(userData.email)) {
        throw new Error('Please provide a valid email address');
      }

      if (!this.validatePassword(userData.password)) {
        throw new Error('Password must be at least 8 characters with uppercase, lowercase, number, and special character');
      }

      const response = await fetch(`${this.baseUrl}/.netlify/functions/auth-register-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(userData)
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Store registration state
        this.registrationState = {
          currentStep: 'otp',
          pendingData: userData,
          otpEmail: userData.email,
          otpExpiryTime: new Date(Date.now() + (this.options.otpExpiryMinutes * 60 * 1000)),
          countdownInterval: null
        };
        
        // Start countdown timer
        this.startOTPCountdown();
        
        // Emit event for UI updates
        this.emit('otpSent', {
          email: userData.email,
          expiresIn: this.options.otpExpiryMinutes
        });
      }
      
      return data;
    } catch (error) {
      console.error('Send OTP error:', error);
      return {
        success: false,
        error: error.message || 'Failed to send verification code',
        message: 'OTP sending failed'
      };
    }
  }
  
  /**
   * NEW: Step 2 - Verify OTP and complete registration
   */
  async registerVerifyOTP(otp) {
    try {
      // Validate OTP format
      if (!otp || !/^\d{4}$/.test(otp)) {
        throw new Error('Please enter a valid 4-digit verification code');
      }

      if (!this.registrationState.otpEmail) {
        throw new Error('No verification code was sent. Please start registration again.');
      }

      // Check if OTP has expired
      if (this.registrationState.otpExpiryTime && new Date() > this.registrationState.otpExpiryTime) {
        throw new Error('Verification code has expired. Please request a new one.');
      }

      const response = await fetch(`${this.baseUrl}/.netlify/functions/auth-register-verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: this.registrationState.otpEmail,
          otp: otp
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Registration completed successfully
        this.setTokens(data.data.token, data.data.refreshToken);
        this.setUser(data.data.user);
        this.setupTokenRefresh();
        
        // Clear registration state
        this.clearRegistrationState();
        
        // Emit success event
        this.emit('registrationComplete', {
          user: data.data.user
        });
      }
      
      return data;
    } catch (error) {
      console.error('Verify OTP error:', error);
      return {
        success: false,
        error: error.message || 'Verification failed',
        message: 'OTP verification failed'
      };
    }
  }
  
  /**
   * NEW: Resend OTP for registration
   */
  async registerResendOTP() {
    if (!this.registrationState.pendingData) {
      throw new Error('No registration data available. Please start registration again.');
    }

    return await this.registerSendOTP(this.registrationState.pendingData);
  }
  
  /**
   * NEW: Get registration status and remaining time
   */
  getRegistrationStatus() {
    const remainingTime = this.getOTPRemainingTime();
    
    return {
      currentStep: this.registrationState.currentStep,
      email: this.registrationState.otpEmail,
      remainingTime,
      isExpired: remainingTime ? remainingTime.total <= 0 : false,
      hasPendingData: !!this.registrationState.pendingData
    };
  }
  
  /**
   * NEW: Get remaining time for OTP
   */
  getOTPRemainingTime() {
    if (!this.registrationState.otpExpiryTime) return null;
    
    const now = new Date();
    const timeRemaining = this.registrationState.otpExpiryTime - now;
    
    if (timeRemaining <= 0) return { total: 0, minutes: 0, seconds: 0 };
    
    const minutes = Math.floor(timeRemaining / 60000);
    const seconds = Math.floor((timeRemaining % 60000) / 1000);
    
    return {
      total: timeRemaining,
      minutes,
      seconds
    };
  }
  
  /**
   * NEW: Start OTP countdown timer
   */
  startOTPCountdown() {
    this.clearOTPCountdown();
    
    this.registrationState.countdownInterval = setInterval(() => {
      const remaining = this.getOTPRemainingTime();
      
      if (!remaining || remaining.total <= 0) {
        this.clearOTPCountdown();
        this.emit('otpExpired');
        return;
      }
      
      this.emit('otpCountdown', remaining);
    }, 1000);
  }
  
  /**
   * NEW: Clear OTP countdown timer
   */
  clearOTPCountdown() {
    if (this.registrationState.countdownInterval) {
      clearInterval(this.registrationState.countdownInterval);
      this.registrationState.countdownInterval = null;
    }
  }
  
  /**
   * NEW: Clear registration state
   */
  clearRegistrationState() {
    this.clearOTPCountdown();
    this.registrationState = {
      currentStep: 'details',
      pendingData: null,
      otpEmail: null,
      otpExpiryTime: null,
      countdownInterval: null
    };
  }
  
  /**
   * NEW: Reset registration flow
   */
  resetRegistration() {
    this.clearRegistrationState();
    this.emit('registrationReset');
  }
  
  /**
   * Login with email and password
   */
  async login(credentials) {
    try {
      const response = await fetch(`${this.baseUrl}/.netlify/functions/auth-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(credentials)
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.setTokens(data.data.token, data.data.refreshToken);
        this.setUser(data.data.user);
        this.setupTokenRefresh();
      }
      
      return data;
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: 'Network error occurred. Please try again.',
        message: 'Login failed'
      };
    }
  }
  
  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/.netlify/functions/auth-refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refreshToken: this.refreshToken })
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.setTokens(data.data.token, data.data.refreshToken);
        if (data.data.user) {
          this.setUser(data.data.user);
        }
        return data;
      } else {
        // Refresh failed, clear tokens and redirect to login
        this.clearTokens();
        throw new Error(data.error || 'Token refresh failed');
      }
    } catch (error) {
      console.error('Token refresh error:', error);
      this.clearTokens();
      throw error;
    }
  }
  
  /**
   * Get user profile
   */
  async getProfile() {
    return this.authenticatedRequest('GET', '/.netlify/functions/auth-profile');
  }
  
  /**
   * Update user profile
   */
  async updateProfile(updateData) {
    const result = await this.authenticatedRequest('PUT', '/.netlify/functions/auth-profile', updateData);
    
    if (result.success && result.data.user) {
      this.setUser(result.data.user);
    }
    
    return result;
  }
  
  /**
   * Change password
   */
  async changePassword(passwordData) {
    return this.authenticatedRequest('POST', '/.netlify/functions/auth-change-password', passwordData);
  }
  
  /**
   * Logout user
   */
  async logout(logoutFromAllDevices = false) {
    try {
      await this.authenticatedRequest('POST', '/.netlify/functions/auth-logout', {
        refreshToken: this.refreshToken,
        logoutFromAllDevices
      });
    } catch (error) {
      console.error('Logout API error:', error);
      // Continue with local cleanup even if API call fails
    } finally {
      this.clearTokens();
      this.clearRefreshTimer();
    }
    
    return { success: true, message: 'Logged out successfully' };
  }
  
  /**
   * Make authenticated request with automatic token refresh
   */
  async authenticatedRequest(method, endpoint, data = null) {
    let response = await this.makeRequest(method, endpoint, data, true);
    
    // If token expired and we have a refresh token, try to refresh and retry
    if (response.status === 401 && this.refreshToken) {
      try {
        await this.refreshAccessToken();
        response = await this.makeRequest(method, endpoint, data, true);
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        return {
          success: false,
          error: 'Authentication failed. Please login again.',
          requiresLogin: true
        };
      }
    }
    
    return await response.json();
  }
  
  /**
   * Make HTTP request
   */
  async makeRequest(method, endpoint, data = null, authenticated = false) {
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (authenticated && this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    
    const config = {
      method,
      headers,
      body: data ? JSON.stringify(data) : null
    };
    
    return fetch(`${this.baseUrl}${endpoint}`, config);
  }

  /**
   * NEW: Validate email format
   */
  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
  
  /**
   * NEW: Validate password strength
   */
  validatePassword(password) {
    // At least 8 characters, 1 uppercase, 1 lowercase, 1 number, 1 special char
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return passwordRegex.test(password);
  }
  
  /**
   * NEW: Get password strength feedback
   */
  getPasswordStrength(password) {
    if (!password) return { score: 0, feedback: ['Password is required'] };
    
    const feedback = [];
    let score = 0;
    
    if (password.length >= 8) score += 1;
    else feedback.push('At least 8 characters required');
    
    if (/[a-z]/.test(password)) score += 1;
    else feedback.push('Add lowercase letters');
    
    if (/[A-Z]/.test(password)) score += 1;
    else feedback.push('Add uppercase letters');
    
    if (/\d/.test(password)) score += 1;
    else feedback.push('Add numbers');
    
    if (/[@$!%*?&]/.test(password)) score += 1;
    else feedback.push('Add special characters (@$!%*?&)');
    
    return {
      score,
      feedback: feedback.length === 0 ? ['Strong password!'] : feedback,
      isValid: score >= 5
    };
  }
  
  /**
   * Set authentication tokens
   */
  setTokens(token, refreshToken) {
    this.token = token;
    this.refreshToken = refreshToken;
    
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.options.tokenStorageKey, token);
      localStorage.setItem(this.options.refreshTokenStorageKey, refreshToken);
    }
    
    if (this.options.autoRefresh) {
      this.setupTokenRefresh();
    }
  }
  
  /**
   * Set user data
   */
  setUser(user) {
    this.user = user;
    
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.options.userStorageKey, JSON.stringify(user));
    }
  }
  
  /**
   * Clear all authentication data
   */
  clearTokens() {
    this.token = null;
    this.refreshToken = null;
    this.user = null;
    
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.options.tokenStorageKey);
      localStorage.removeItem(this.options.refreshTokenStorageKey);
      localStorage.removeItem(this.options.userStorageKey);
    }
    
    this.clearRefreshTimer();
  }
  
  /**
   * Get stored token from localStorage
   */
  getStoredToken() {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(this.options.tokenStorageKey);
    }
    return null;
  }
  
  /**
   * Get stored refresh token from localStorage
   */
  getStoredRefreshToken() {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(this.options.refreshTokenStorageKey);
    }
    return null;
  }
  
  /**
   * Get stored user from localStorage
   */
  getStoredUser() {
    if (typeof localStorage !== 'undefined') {
      const storedUser = localStorage.getItem(this.options.userStorageKey);
      if (storedUser) {
        try {
          return JSON.parse(storedUser);
        } catch (error) {
          console.error('Error parsing stored user data:', error);
          localStorage.removeItem(this.options.userStorageKey);
        }
      }
    }
    return null;
  }
  
  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return !!(this.token && this.user);
  }
  
  /**
   * Get current user
   */
  getCurrentUser() {
    return this.user;
  }
  
  /**
   * Check if token is expired (basic check)
   */
  isTokenExpired() {
    if (!this.token) return true;
    
    try {
      const payload = JSON.parse(atob(this.token.split('.')[1]));
      const currentTime = Math.floor(Date.now() / 1000);
      return payload.exp < currentTime;
    } catch (error) {
      console.error('Error checking token expiration:', error);
      return true;
    }
  }
  
  /**
   * Setup automatic token refresh
   */
  setupTokenRefresh() {
    this.clearRefreshTimer();
    
    if (!this.token) return;
    
    try {
      const payload = JSON.parse(atob(this.token.split('.')[1]));
      const expirationTime = payload.exp * 1000; // Convert to milliseconds
      const currentTime = Date.now();
      const refreshTime = expirationTime - (5 * 60 * 1000); // Refresh 5 minutes before expiry
      
      if (refreshTime > currentTime) {
        this.refreshTimer = setTimeout(async () => {
          try {
            await this.refreshAccessToken();
          } catch (error) {
            console.error('Auto token refresh failed:', error);
            this.clearTokens();
          }
        }, refreshTime - currentTime);
      }
    } catch (error) {
      console.error('Error setting up token refresh:', error);
    }
  }
  
  /**
   * Clear refresh timer
   */
  clearRefreshTimer() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
  
  /**
   * Add event listener for authentication events
   */
  on(event, callback) {
    if (!this.eventListeners) {
      this.eventListeners = {};
    }
    
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    
    this.eventListeners[event].push(callback);
  }
  
  /**
   * Remove event listener
   */
  off(event, callback) {
    if (this.eventListeners && this.eventListeners[event]) {
      this.eventListeners[event] = this.eventListeners[event].filter(cb => cb !== callback);
    }
  }
  
  /**
   * Emit authentication event
   */
  emit(event, data) {
    if (this.eventListeners && this.eventListeners[event]) {
      this.eventListeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Error in event listener:', error);
        }
      });
    }
  }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AuthClient;
} else if (typeof window !== 'undefined') {
  window.AuthClient = AuthClient;
}

// Usage example:
/*
const authClient = new AuthClient('https://your-site.netlify.app');

// Register
const registerResult = await authClient.register({
  email: 'user@example.com',
  password: 'SecurePass123!',
  name: 'John Doe'
});

// Login
const loginResult = await authClient.login({
  email: 'user@example.com',
  password: 'SecurePass123!'
});

// Check if authenticated
if (authClient.isAuthenticated()) {
  console.log('User is logged in:', authClient.getCurrentUser());
}

// Update profile
await authClient.updateProfile({
  name: 'John Smith',
  phoneNumber: '+1234567890'
});

// Change password
await authClient.changePassword({
  currentPassword: 'SecurePass123!',
  newPassword: 'NewSecurePass456!'
});

// Logout
await authClient.logout();
*/