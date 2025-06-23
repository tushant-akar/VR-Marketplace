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
      ...options
    };
    
    // Initialize tokens from storage
    this.token = this.getStoredToken();
    this.refreshToken = this.getStoredRefreshToken();
    this.user = this.getStoredUser();
    
    // Set up auto-refresh if enabled
    if (this.options.autoRefresh && this.token) {
      this.setupTokenRefresh();
    }
  }
  
  /**
   * Register a new user account
   */
  async register(userData) {
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