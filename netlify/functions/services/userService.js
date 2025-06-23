/**
 * User service for handling user-related database operations
 */

const { supabaseAdmin, supabaseClient } = require('../config/supabase');
const bcrypt = require('bcryptjs');
const { validatePaginationParams } = require('../utils/validation');

class UserService {
  constructor() {
    this.saltRounds = 12;
  }

  /**
   * Create a new user account
   * @param {Object} userData - User registration data
   * @param {Object} userInfo - Additional user info (IP, User-Agent, etc.)
   * @returns {Promise<Object>} - Created user object
   */
  async createUser(userData, userInfo = {}) {
    const { email, password, name, phoneNumber, dateOfBirth, profileImageUrl } = userData;
    
    try {
      // Hash password
      const hashedPassword = await bcrypt.hash(password, this.saltRounds);
      
      // Check if user already exists
      const { data: existingUser } = await supabaseAdmin
        .from('users')
        .select('id, email')
        .eq('email', email.toLowerCase())
        .single();
      
      if (existingUser) {
        throw new Error('User already exists with this email address');
      }
      
      // Create user in Supabase Auth first
      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: email.toLowerCase(),
        password,
        email_confirm: true,
        user_metadata: {
          name: name.trim()
        }
      });
      
      if (authError) {
        console.error('Auth user creation failed:', authError);
        throw new Error(`Account creation failed: ${authError.message}`);
      }
      
      // Create user profile in users table
      const userProfile = {
        id: authUser.user.id,
        email: email.toLowerCase(),
        name: name.trim(),
        password_hash: hashedPassword,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_active: true,
        email_verified: true
      };
      
      // Add optional fields if provided
      if (phoneNumber) userProfile.phone_number = phoneNumber.trim();
      if (dateOfBirth) userProfile.date_of_birth = dateOfBirth;
      if (profileImageUrl) userProfile.profile_image_url = profileImageUrl.trim();
      
      const { data: user, error: userError } = await supabaseAdmin
        .from('users')
        .insert([userProfile])
        .select()
        .single();
      
      if (userError) {
        console.error('User profile creation failed:', userError);
        // Cleanup auth user if profile creation fails
        await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
        throw new Error(`Profile creation failed: ${userError.message}`);
      }
      
      // Log user registration activity
      await this.logActivity(user.id, 'user_registered', {
        registrationMethod: 'email',
        hasPhoneNumber: !!phoneNumber,
        hasDateOfBirth: !!dateOfBirth
      }, userInfo);
      
      return this.sanitizeUser(user);
      
    } catch (error) {
      console.error('User creation error:', error);
      throw error;
    }
  }
  
  /**
   * Authenticate user with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @param {Object} userInfo - Additional user info (IP, User-Agent, etc.)
   * @returns {Promise<Object>} - Authenticated user object
   */
  async authenticateUser(email, password, userInfo = {}) {
    try {
      // Get user from database
      const { data: user, error } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('email', email.toLowerCase())
        .eq('is_active', true)
        .single();
      
      if (error || !user) {
        throw new Error('Invalid email or password');
      }
      
      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        // Log failed login attempt
        await this.logActivity(user.id, 'login_failed', {
          reason: 'invalid_password'
        }, userInfo);
        
        throw new Error('Invalid email or password');
      }
      
      // Update last login timestamp
      await supabaseAdmin
        .from('users')
        .update({ 
          last_login: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);
      
      // Log successful login
      await this.logActivity(user.id, 'login_success', {
        loginMethod: 'email_password'
      }, userInfo);
      
      return this.sanitizeUser(user);
      
    } catch (error) {
      console.error('Authentication error:', error);
      throw error;
    }
  }
  
  /**
   * Get user by ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - User object
   */
  async getUserById(userId) {
    try {
      const { data: user, error } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('id', userId)
        .eq('is_active', true)
        .single();
      
      if (error || !user) {
        throw new Error('User not found');
      }
      
      return this.sanitizeUser(user);
      
    } catch (error) {
      console.error('Get user error:', error);
      throw error;
    }
  }
  
  /**
   * Get user by email
   * @param {string} email - User email
   * @returns {Promise<Object>} - User object
   */
  async getUserByEmail(email) {
    try {
      const { data: user, error } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('email', email.toLowerCase())
        .eq('is_active', true)
        .single();
      
      if (error || !user) {
        throw new Error('User not found');
      }
      
      return this.sanitizeUser(user);
      
    } catch (error) {
      console.error('Get user by email error:', error);
      throw error;
    }
  }
  
  /**
   * Update user profile
   * @param {string} userId - User ID
   * @param {Object} updateData - Data to update
   * @param {Object} userInfo - Additional user info for logging
   * @returns {Promise<Object>} - Updated user object
   */
  async updateUser(userId, updateData, userInfo = {}) {
    try {
      const allowedFields = ['name', 'email', 'phone_number', 'date_of_birth', 'profile_image_url'];
      const filteredData = {};
      
      // Filter and prepare update data
      Object.keys(updateData).forEach(key => {
        if (allowedFields.includes(key) && updateData[key] !== undefined) {
          if (key === 'email' && updateData[key]) {
            filteredData[key] = updateData[key].toLowerCase();
          } else if (typeof updateData[key] === 'string') {
            filteredData[key] = updateData[key].trim();
          } else {
            filteredData[key] = updateData[key];
          }
        }
      });
      
      if (Object.keys(filteredData).length === 0) {
        throw new Error('No valid fields provided for update');
      }
      
      // Check if email is being changed and if it's already taken
      if (filteredData.email) {
        const { data: existingUser } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('email', filteredData.email)
          .neq('id', userId)
          .single();
        
        if (existingUser) {
          throw new Error('Email address is already in use');
        }
      }
      
      filteredData.updated_at = new Date().toISOString();
      
      // Update user in database
      const { data: user, error } = await supabaseAdmin
        .from('users')
        .update(filteredData)
        .eq('id', userId)
        .select()
        .single();
      
      if (error) {
        console.error('User update error:', error);
        throw new Error(`Update failed: ${error.message}`);
      }
      
      // Update email in Supabase Auth if email was changed
      if (filteredData.email) {
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          email: filteredData.email
        });
      }
      
      // Log profile update activity
      await this.logActivity(userId, 'profile_updated', {
        updatedFields: Object.keys(filteredData).filter(key => key !== 'updated_at')
      }, userInfo);
      
      return this.sanitizeUser(user);
      
    } catch (error) {
      console.error('Update user error:', error);
      throw error;
    }
  }
  
  /**
   * Change user password
   * @param {string} userId - User ID
   * @param {string} currentPassword - Current password
   * @param {string} newPassword - New password
   * @param {Object} userInfo - Additional user info for logging
   * @returns {Promise<boolean>} - Success status
   */
  async changePassword(userId, currentPassword, newPassword, userInfo = {}) {
    try {
      // Get current user data
      const { data: user, error } = await supabaseAdmin
        .from('users')
        .select('password_hash')
        .eq('id', userId)
        .eq('is_active', true)
        .single();
      
      if (error || !user) {
        throw new Error('User not found');
      }
      
      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isValidPassword) {
        // Log failed password change attempt
        await this.logActivity(userId, 'password_change_failed', {
          reason: 'invalid_current_password'
        }, userInfo);
        
        throw new Error('Current password is incorrect');
      }
      
      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, this.saltRounds);
      
      // Update password in database
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({ 
          password_hash: hashedPassword,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);
      
      if (updateError) {
        console.error('Password update error:', updateError);
        throw new Error(`Password update failed: ${updateError.message}`);
      }
      
      // Update password in Supabase Auth
      await supabaseAdmin.auth.admin.updateUserById(userId, { 
        password: newPassword 
      });
      
      // Log successful password change
      await this.logActivity(userId, 'password_changed', {}, userInfo);
      
      return true;
      
    } catch (error) {
      console.error('Change password error:', error);
      throw error;
    }
  }
  
  /**
   * Deactivate user account
   * @param {string} userId - User ID
   * @param {Object} userInfo - Additional user info for logging
   * @returns {Promise<boolean>} - Success status
   */
  async deactivateUser(userId, userInfo = {}) {
    try {
      const { error } = await supabaseAdmin
        .from('users')
        .update({ 
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);
      
      if (error) {
        console.error('User deactivation error:', error);
        throw new Error(`Deactivation failed: ${error.message}`);
      }
      
      // Deactivate user in Supabase Auth
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        ban_duration: 'none' // This effectively disables the user
      });
      
      // Log account deactivation
      await this.logActivity(userId, 'account_deactivated', {}, userInfo);
      
      return true;
      
    } catch (error) {
      console.error('Deactivate user error:', error);
      throw error;
    }
  }
  
  /**
   * Reactivate user account
   * @param {string} userId - User ID
   * @param {Object} userInfo - Additional user info for logging
   * @returns {Promise<boolean>} - Success status
   */
  async reactivateUser(userId, userInfo = {}) {
    try {
      const { error } = await supabaseAdmin
        .from('users')
        .update({ 
          is_active: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);
      
      if (error) {
        console.error('User reactivation error:', error);
        throw new Error(`Reactivation failed: ${error.message}`);
      }
      
      // Reactivate user in Supabase Auth
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        ban_duration: 0 // Remove ban
      });
      
      // Log account reactivation
      await this.logActivity(userId, 'account_reactivated', {}, userInfo);
      
      return true;
      
    } catch (error) {
      console.error('Reactivate user error:', error);
      throw error;
    }
  }
  
  /**
   * Get users with pagination and filtering
   * @param {Object} options - Query options
   * @returns {Promise<Object>} - Paginated users result
   */
  async getUsers(options = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'created_at',
        sortOrder = 'desc',
        isActive,
        emailVerified,
        search
      } = options;
      
      const paginationParams = validatePaginationParams({ page, limit, sortBy, sortOrder });
      
      let query = supabaseAdmin
        .from('users')
        .select('id, email, name, phone_number, created_at, updated_at, last_login, is_active, email_verified', { count: 'exact' });
      
      // Apply filters
      if (isActive !== undefined) {
        query = query.eq('is_active', isActive);
      }
      
      if (emailVerified !== undefined) {
        query = query.eq('email_verified', emailVerified);
      }
      
      if (search && search.trim()) {
        const searchTerm = `%${search.trim().toLowerCase()}%`;
        query = query.or(`name.ilike.${searchTerm},email.ilike.${searchTerm}`);
      }
      
      // Apply sorting and pagination
      query = query
        .order(paginationParams.sortBy, { ascending: paginationParams.sortOrder === 'asc' })
        .range(paginationParams.offset, paginationParams.offset + paginationParams.limit - 1);
      
      const { data: users, error, count } = await query;
      
      if (error) {
        console.error('Get users error:', error);
        throw new Error(`Failed to fetch users: ${error.message}`);
      }
      
      const totalPages = Math.ceil(count / paginationParams.limit);
      
      return {
        users: users || [],
        pagination: {
          currentPage: paginationParams.page,
          totalPages,
          totalItems: count,
          itemsPerPage: paginationParams.limit,
          hasNextPage: paginationParams.page < totalPages,
          hasPrevPage: paginationParams.page > 1
        }
      };
      
    } catch (error) {
      console.error('Get users error:', error);
      throw error;
    }
  }
  
  /**
   * Get user activity logs
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} - User activity logs
   */
  async getUserActivity(userId, options = {}) {
    try {
      const { page = 1, limit = 20 } = options;
      const paginationParams = validatePaginationParams({ page, limit });
      
      const { data: activities, error, count } = await supabaseAdmin
        .from('user_activity_logs')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(paginationParams.offset, paginationParams.offset + paginationParams.limit - 1);
      
      if (error) {
        console.error('Get user activity error:', error);
        throw new Error(`Failed to fetch user activity: ${error.message}`);
      }
      
      const totalPages = Math.ceil(count / paginationParams.limit);
      
      return {
        activities: activities || [],
        pagination: {
          currentPage: paginationParams.page,
          totalPages,
          totalItems: count,
          itemsPerPage: paginationParams.limit
        }
      };
      
    } catch (error) {
      console.error('Get user activity error:', error);
      throw error;
    }
  }
  
  /**
   * Reset user password (admin function)
   * @param {string} userId - User ID
   * @param {string} newPassword - New password
   * @param {Object} userInfo - Additional user info for logging
   * @returns {Promise<boolean>} - Success status
   */
  async resetUserPassword(userId, newPassword, userInfo = {}) {
    try {
      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, this.saltRounds);
      
      // Update password in database
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({ 
          password_hash: hashedPassword,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);
      
      if (updateError) {
        console.error('Password reset error:', updateError);
        throw new Error(`Password reset failed: ${updateError.message}`);
      }
      
      // Update password in Supabase Auth
      await supabaseAdmin.auth.admin.updateUserById(userId, { 
        password: newPassword 
      });
      
      // Log password reset
      await this.logActivity(userId, 'password_reset_admin', {
        resetBy: 'admin'
      }, userInfo);
      
      return true;
      
    } catch (error) {
      console.error('Reset user password error:', error);
      throw error;
    }
  }
  
  /**
   * Get user statistics
   * @returns {Promise<Object>} - User statistics
   */
  async getUserStats() {
    try {
      // Get total users
      const { count: totalUsers } = await supabaseAdmin
        .from('users')
        .select('*', { count: 'exact', head: true });
      
      // Get active users
      const { count: activeUsers } = await supabaseAdmin
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);
      
      // Get verified users
      const { count: verifiedUsers } = await supabaseAdmin
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('email_verified', true);
      
      // Get users created in last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { count: recentUsers } = await supabaseAdmin
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo.toISOString());
      
      return {
        totalUsers: totalUsers || 0,
        activeUsers: activeUsers || 0,
        verifiedUsers: verifiedUsers || 0,
        recentUsers: recentUsers || 0,
        inactiveUsers: (totalUsers || 0) - (activeUsers || 0),
        verificationRate: totalUsers > 0 ? ((verifiedUsers || 0) / totalUsers * 100).toFixed(2) : 0
      };
      
    } catch (error) {
      console.error('Get user stats error:', error);
      throw error;
    }
  }
  
  /**
   * Log user activity
   * @param {string} userId - User ID
   * @param {string} action - Action performed
   * @param {Object} details - Additional details
   * @param {Object} userInfo - User info (IP, User-Agent, etc.)
   * @returns {Promise<void>}
   */
  async logActivity(userId, action, details = {}, userInfo = {}) {
    try {
      await supabaseAdmin
        .from('user_activity_logs')
        .insert([{
          user_id: userId,
          action,
          details,
          ip_address: userInfo.ipAddress,
          user_agent: userInfo.userAgent
        }]);
    } catch (error) {
      console.error('Failed to log user activity:', error);
      // Don't throw error to avoid breaking the main flow
    }
  }
  
  /**
   * Clean up expired data (sessions, reset tokens, etc.)
   * @returns {Promise<Object>} - Cleanup statistics
   */
  async cleanupExpiredData() {
    try {
      // Clean expired sessions
      const { count: expiredSessions } = await supabaseAdmin
        .from('user_sessions')
        .delete({ count: 'exact' })
        .lt('expires_at', new Date().toISOString());
      
      // Clean expired reset tokens
      const { count: expiredTokens } = await supabaseAdmin
        .from('password_reset_tokens')
        .delete({ count: 'exact' })
        .or(`expires_at.lt.${new Date().toISOString()},used_at.is.not.null`);
      
      // Clean old activity logs (older than 90 days)
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      
      const { count: oldLogs } = await supabaseAdmin
        .from('user_activity_logs')
        .delete({ count: 'exact' })
        .lt('created_at', ninetyDaysAgo.toISOString());
      
      return {
        expiredSessions: expiredSessions || 0,
        expiredTokens: expiredTokens || 0,
        oldLogs: oldLogs || 0
      };
      
    } catch (error) {
      console.error('Cleanup expired data error:', error);
      throw error;
    }
  }
  
  /**
   * Remove sensitive data from user object
   * @param {Object} user - User object to sanitize
   * @returns {Object} - Sanitized user object
   */
  sanitizeUser(user) {
    if (!user) return null;
    
    const { password_hash, ...sanitizedUser } = user;
    return sanitizedUser;
  }
  
  /**
   * Validate user exists and is active
   * @param {string} userId - User ID to validate
   * @returns {Promise<boolean>} - True if user exists and is active
   */
  async validateUserExists(userId) {
    try {
      const { data: user, error } = await supabaseAdmin
        .from('users')
        .select('id, is_active')
        .eq('id', userId)
        .single();
      
      return !error && user && user.is_active;
    } catch (error) {
      return false;
    }
  }
}

module.exports = new UserService();