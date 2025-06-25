/**
 * Frontend Registration Flow with OTP Verification
 * Complete implementation for two-step registration process
 */

class RegistrationFlow {
  constructor(baseUrl, options = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.options = {
      otpLength: 4,
      otpExpiryMinutes: 1,
      maxAttempts: 5,
      ...options
    };
    
    this.currentStep = 'details'; // 'details' | 'otp' | 'completed'
    this.registrationData = null;
    this.otpSentEmail = null;
    this.otpExpiryTime = null;
  }

  /**
   * Step 1: Send registration data and request OTP
   */
  async sendOTP(registrationData) {
    try {
      // Validate required fields
      const requiredFields = ['email', 'password', 'name'];
      for (const field of requiredFields) {
        if (!registrationData[field]) {
          throw new Error(`${field} is required`);
        }
      }

      // Validate email format
      if (!this.validateEmail(registrationData.email)) {
        throw new Error('Please provide a valid email address');
      }

      // Validate password strength
      if (!this.validatePassword(registrationData.password)) {
        throw new Error('Password must be at least 8 characters with uppercase, lowercase, number, and special character');
      }

      const response = await fetch(`${this.baseUrl}/api/auth-register-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(registrationData)
      });

      const result = await response.json();

      if (result.success) {
        this.registrationData = registrationData;
        this.otpSentEmail = registrationData.email;
        this.otpExpiryTime = new Date(Date.now() + (this.options.otpExpiryMinutes * 60 * 1000));
        this.currentStep = 'otp';
        
        // Start countdown timer
        this.startCountdownTimer();
        
        return {
          success: true,
          email: result.data.email,
          message: result.message,
          expiresIn: result.data.expiresIn,
          nextStep: 'Enter the 4-digit verification code sent to your email'
        };
      } else {
        throw new Error(result.error || result.message || 'Failed to send verification code');
      }

    } catch (error) {
      console.error('Send OTP error:', error);
      return {
        success: false,
        error: error.message || 'Failed to send verification code'
      };
    }
  }

  /**
   * Step 2: Verify OTP and complete registration
   */
  async verifyOTP(otp) {
    try {
      // Validate OTP format
      if (!otp || !/^\d{4}$/.test(otp)) {
        throw new Error('Please enter a valid 4-digit verification code');
      }

      if (!this.otpSentEmail) {
        throw new Error('No verification code was sent. Please start registration again.');
      }

      // Check if OTP has expired
      if (this.otpExpiryTime && new Date() > this.otpExpiryTime) {
        throw new Error('Verification code has expired. Please request a new one.');
      }

      const response = await fetch(`${this.baseUrl}/api/auth-register-verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: this.otpSentEmail,
          otp: otp
        })
      });

      const result = await response.json();

      if (result.success) {
        this.currentStep = 'completed';
        
        // Store tokens
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('accessToken', result.data.token);
          localStorage.setItem('refreshToken', result.data.refreshToken);
          localStorage.setItem('user', JSON.stringify(result.data.user));
        }
        
        // Clear registration data
        this.clearRegistrationData();
        
        return {
          success: true,
          user: result.data.user,
          token: result.data.token,
          refreshToken: result.data.refreshToken,
          message: result.message
        };
      } else {
        throw new Error(result.error || result.message || 'Verification failed');
      }

    } catch (error) {
      console.error('Verify OTP error:', error);
      return {
        success: false,
        error: error.message || 'Verification failed'
      };
    }
  }

  /**
   * Resend OTP (if needed)
   */
  async resendOTP() {
    if (!this.registrationData) {
      throw new Error('No registration data available. Please start registration again.');
    }

    return await this.sendOTP(this.registrationData);
  }

  /**
   * Start countdown timer for OTP expiry
   */
  startCountdownTimer() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }

    this.countdownInterval = setInterval(() => {
      if (!this.otpExpiryTime) {
        clearInterval(this.countdownInterval);
        return;
      }

      const now = new Date();
      const timeRemaining = this.otpExpiryTime - now;

      if (timeRemaining <= 0) {
        clearInterval(this.countdownInterval);
        this.onOTPExpired();
      } else {
        const minutes = Math.floor(timeRemaining / 60000);
        const seconds = Math.floor((timeRemaining % 60000) / 1000);
        this.onCountdownUpdate(minutes, seconds);
      }
    }, 1000);
  }

  /**
   * Get remaining time for OTP
   */
  getRemainingTime() {
    if (!this.otpExpiryTime) return null;
    
    const now = new Date();
    const timeRemaining = this.otpExpiryTime - now;
    
    if (timeRemaining <= 0) return null;
    
    const minutes = Math.floor(timeRemaining / 60000);
    const seconds = Math.floor((timeRemaining % 60000) / 1000);
    
    return { minutes, seconds };
  }

  /**
   * Clear registration data
   */
  clearRegistrationData() {
    this.registrationData = null;
    this.otpSentEmail = null;
    this.otpExpiryTime = null;
    this.currentStep = 'details';
    
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  /**
   * Reset registration flow
   */
  reset() {
    this.clearRegistrationData();
  }

  /**
   * Validate email format
   */
  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate password strength
   */
  validatePassword(password) {
    // At least 8 characters, 1 uppercase, 1 lowercase, 1 number, 1 special char
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return passwordRegex.test(password);
  }

  /**
   * Get password strength feedback
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
   * Event handlers (override these in your implementation)
   */
  onCountdownUpdate(minutes, seconds) {
    console.log(`OTP expires in ${minutes}:${seconds.toString().padStart(2, '0')}`);
  }

  onOTPExpired() {
    console.log('OTP has expired');
  }

  /**
   * Get current registration status
   */
  getStatus() {
    return {
      currentStep: this.currentStep,
      hasRegistrationData: !!this.registrationData,
      otpSentEmail: this.otpSentEmail,
      remainingTime: this.getRemainingTime(),
      isExpired: this.otpExpiryTime ? new Date() > this.otpExpiryTime : false
    };
  }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RegistrationFlow;
} else if (typeof window !== 'undefined') {
  window.RegistrationFlow = RegistrationFlow;
}

/* 
==============================================
USAGE EXAMPLE - HTML + JavaScript
==============================================

<!DOCTYPE html>
<html>
<head>
    <title>Registration with OTP</title>
    <style>
        .form-container { max-width: 400px; margin: 50px auto; padding: 20px; }
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; margin-bottom: 5px; font-weight: bold; }
        .form-group input { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
        .btn { background: #667eea; color: white; padding: 12px 24px; border: none; border-radius: 4px; cursor: pointer; width: 100%; }
        .btn:hover { background: #5a67d8; }
        .btn:disabled { background: #ccc; cursor: not-allowed; }
        .error { color: #e53e3e; font-size: 14px; margin-top: 5px; }
        .success { color: #38a169; font-size: 14px; margin-top: 5px; }
        .step { display: none; }
        .step.active { display: block; }
        .countdown { text-align: center; margin: 10px 0; font-weight: bold; color: #d69e2e; }
        .otp-input { text-align: center; font-size: 24px; letter-spacing: 5px; }
    </style>
</head>
<body>
    <div class="form-container">
        <!-- Step 1: Registration Details -->
        <div id="step-details" class="step active">
            <h2>Create Account</h2>
            <form id="registration-form">
                <div class="form-group">
                    <label>Email *</label>
                    <input type="email" id="email" required>
                </div>
                <div class="form-group">
                    <label>Password *</label>
                    <input type="password" id="password" required>
                    <div id="password-feedback" class="error"></div>
                </div>
                <div class="form-group">
                    <label>Full Name *</label>
                    <input type="text" id="name" required>
                </div>
                <div class="form-group">
                    <label>Phone Number</label>
                    <input type="tel" id="phoneNumber" placeholder="+1234567890">
                </div>
                <button type="submit" class="btn" id="continue-btn">Continue</button>
                <div id="step1-message"></div>
            </form>
        </div>

        <!-- Step 2: OTP Verification -->
        <div id="step-otp" class="step">
            <h2>Verify Your Email</h2>
            <p>We've sent a 4-digit verification code to <strong id="otp-email"></strong></p>
            
            <form id="otp-form">
                <div class="form-group">
                    <label>Verification Code</label>
                    <input type="text" id="otp" maxlength="4" class="otp-input" placeholder="0000" required>
                </div>
                <div class="countdown" id="countdown"></div>
                <button type="submit" class="btn" id="verify-btn">Verify & Create Account</button>
                <button type="button" class="btn" id="resend-btn" style="background: #718096; margin-top: 10px;">Resend Code</button>
                <div id="step2-message"></div>
            </form>
        </div>

        <!-- Step 3: Success -->
        <div id="step-success" class="step">
            <h2>🎉 Welcome!</h2>
            <p>Your account has been created successfully!</p>
            <div class="success" id="success-message"></div>
        </div>
    </div>

    <script>
        // Initialize registration flow
        const registrationFlow = new RegistrationFlow('https://your-site.netlify.app');
        
        // Override event handlers
        registrationFlow.onCountdownUpdate = (minutes, seconds) => {
            const countdownEl = document.getElementById('countdown');
            if (countdownEl) {
                countdownEl.textContent = `Code expires in ${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
        };
        
        registrationFlow.onOTPExpired = () => {
            document.getElementById('countdown').textContent = '⏰ Code has expired';
            document.getElementById('verify-btn').disabled = true;
        };

        // Step 1: Registration form
        document.getElementById('registration-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const continueBtn = document.getElementById('continue-btn');
            const messageEl = document.getElementById('step1-message');
            
            continueBtn.disabled = true;
            continueBtn.textContent = 'Sending...';
            messageEl.innerHTML = '';
            
            const formData = {
                email: document.getElementById('email').value,
                password: document.getElementById('password').value,
                name: document.getElementById('name').value,
                phoneNumber: document.getElementById('phoneNumber').value || undefined
            };
            
            const result = await registrationFlow.sendOTP(formData);
            
            if (result.success) {
                // Show OTP step
                document.getElementById('step-details').classList.remove('active');
                document.getElementById('step-otp').classList.add('active');
                document.getElementById('otp-email').textContent = formData.email;
                document.getElementById('otp').focus();
                
                messageEl.innerHTML = `<div class="success">${result.message}</div>`;
            } else {
                messageEl.innerHTML = `<div class="error">${result.error}</div>`;
            }
            
            continueBtn.disabled = false;
            continueBtn.textContent = 'Continue';
        });

        // Password strength feedback
        document.getElementById('password').addEventListener('input', (e) => {
            const strength = registrationFlow.getPasswordStrength(e.target.value);
            const feedbackEl = document.getElementById('password-feedback');
            
            if (strength.isValid) {
                feedbackEl.innerHTML = '<span style="color: #38a169;">✓ Strong password</span>';
            } else {
                feedbackEl.innerHTML = `<span style="color: #e53e3e;">${strength.feedback.join(', ')}</span>`;
            }
        });

        // Step 2: OTP verification
        document.getElementById('otp-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const verifyBtn = document.getElementById('verify-btn');
            const messageEl = document.getElementById('step2-message');
            
            verifyBtn.disabled = true;
            verifyBtn.textContent = 'Verifying...';
            messageEl.innerHTML = '';
            
            const otp = document.getElementById('otp').value;
            const result = await registrationFlow.verifyOTP(otp);
            
            if (result.success) {
                // Show success step
                document.getElementById('step-otp').classList.remove('active');
                document.getElementById('step-success').classList.add('active');
                document.getElementById('success-message').textContent = result.message;
                
                // Redirect after 3 seconds
                setTimeout(() => {
                    window.location.href = '/dashboard';
                }, 3000);
            } else {
                messageEl.innerHTML = `<div class="error">${result.error}</div>`;
            }
            
            verifyBtn.disabled = false;
            verifyBtn.textContent = 'Verify & Create Account';
        });

        // Resend OTP
        document.getElementById('resend-btn').addEventListener('click', async () => {
            const resendBtn = document.getElementById('resend-btn');
            const messageEl = document.getElementById('step2-message');
            
            resendBtn.disabled = true;
            resendBtn.textContent = 'Resending...';
            
            const result = await registrationFlow.resendOTP();
            
            if (result.success) {
                messageEl.innerHTML = `<div class="success">New verification code sent!</div>`;
                document.getElementById('verify-btn').disabled = false;
            } else {
                messageEl.innerHTML = `<div class="error">${result.error}</div>`;
            }
            
            resendBtn.disabled = false;
            resendBtn.textContent = 'Resend Code';
        });

        // Auto-focus and format OTP input
        document.getElementById('otp').addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, ''); // Only digits
            if (e.target.value.length === 4) {
                document.getElementById('verify-btn').focus();
            }
        });
    </script>
</body>
</html>

*/