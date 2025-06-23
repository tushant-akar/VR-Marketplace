# User Authentication System

A comprehensive, production-ready authentication system built with **Supabase** and **Netlify Functions**. This system provides secure user registration, login, profile management, and session handling with industry-standard security practices.

## 🚀 Features

### Core Authentication
- ✅ **User Registration** with email validation
- ✅ **User Login** with secure password verification  
- ✅ **JWT Token Management** (Access + Refresh tokens)
- ✅ **Password Change** functionality
- ✅ **User Profile Management** (GET/PUT)
- ✅ **Secure Logout** with token invalidation

### Security Features
- 🔐 **bcrypt Password Hashing** (12 salt rounds)
- 🔐 **JWT with RS256 Algorithm** 
- 🔐 **Refresh Token Rotation**
- 🔐 **Input Validation & Sanitization**
- 🔐 **CORS Protection**
- 🔐 **Rate Limiting Ready**
- 🔐 **SQL Injection Prevention**
- 🔐 **Row Level Security (RLS)**

### Database Features
- 📊 **User Activity Logging**
- 📊 **Session Management**  
- 📊 **Password Reset Tokens**
- 📊 **Comprehensive User Profiles**
- 📊 **Audit Trails**

## 📁 Project Structure

```
├── package.json                          # Dependencies and scripts
├── netlify.toml                          # Netlify configuration
├── .env.example                          # Environment variables template
├── database/
│   └── schema.sql                        # Complete database schema
├── netlify/functions/
│   ├── config/
│   │   └── supabase.js                   # Supabase client configuration
│   ├── utils/
│   │   ├── response.js                   # Standardized API responses
│   │   ├── validation.js                 # Input validation functions  
│   │   └── auth.js                       # JWT token management
│   ├── services/
│   │   └── userService.js                # User business logic
│   ├── auth-register.js                  # User registration endpoint
│   ├── auth-login.js                     # User login endpoint  
│   ├── auth-refresh.js                   # Token refresh endpoint
│   ├── auth-profile.js                   # Profile management endpoint
│   ├── auth-change-password.js           # Password change endpoint
│   └── auth-logout.js                    # User logout endpoint
└── client/
    └── auth-client.js                    # Frontend authentication client
```

## 🛠️ Setup Instructions

### 1. Prerequisites
- Node.js 18+ 
- Supabase account
- Netlify account

### 2. Environment Setup

Create a `.env` file based on `.env.example`:

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

# JWT Configuration  
JWT_SECRET=your_super_secret_jwt_key_at_least_32_characters_long
JWT_EXPIRES_IN=1h
REFRESH_TOKEN_EXPIRES_IN=7d

# Environment
NODE_ENV=development
```

### 3. Database Setup

1. **Create Supabase Project**
   - Go to [supabase.com](https://supabase.com)
   - Create a new project
   - Note your project URL and API keys

2. **Run Database Schema**
   ```sql
   -- Execute the contents of database/schema.sql in your Supabase SQL editor
   ```

3. **Enable Row Level Security**
   - RLS policies are included in the schema
   - Verify they're active in the Supabase dashboard

### 4. Install Dependencies

```bash
npm install
```

### 5. Local Development

```bash
# Start Netlify dev server
npm run dev

# Or use Netlify CLI directly
netlify dev
```

### 6. Deploy to Netlify

```bash
# Deploy to staging
npm run deploy

# Deploy to production  
npm run deploy:prod
```

## 🔧 API Endpoints

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/auth/register` | POST | Register new user | ❌ |
| `/api/auth/login` | POST | User login | ❌ |
| `/api/auth/refresh` | POST | Refresh access token | ❌ |
| `/api/auth/profile` | GET | Get user profile | ✅ |
| `/api/auth/profile` | PUT | Update user profile | ✅ |
| `/api/auth/change-password` | POST | Change password | ✅ |
| `/api/auth/logout` | POST | User logout | ✅ |

## 💡 Usage Examples

### Frontend Integration

```javascript
// Initialize the auth client
const authClient = new AuthClient('https://your-site.netlify.app');

// Register a new user
const registerResult = await authClient.register({
  email: 'user@example.com',
  password: 'SecurePass123!',
  name: 'John Doe',
  phoneNumber: '+1234567890' // optional
});

if (registerResult.success) {
  console.log('User registered:', registerResult.data.user);
} else {
  console.error('Registration failed:', registerResult.error);
}

// Login
const loginResult = await authClient.login({
  email: 'user@example.com',
  password: 'SecurePass123!',
  rememberMe: true
});

// Check authentication status
if (authClient.isAuthenticated()) {
  const user = authClient.getCurrentUser();
  console.log('Current user:', user);
}

// Update profile
await authClient.updateProfile({
  name: 'John Smith',
  phoneNumber: '+0987654321'
});

// Change password
await authClient.changePassword({
  currentPassword: 'SecurePass123!',
  newPassword: 'NewSecurePass456!'
});

// Logout
await authClient.logout();
```

### Direct API Usage

```javascript
// Register
const response = await fetch('/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'SecurePass123!',
    name: 'John Doe'
  })
});

// Login
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'SecurePass123!'
  })
});

// Authenticated requests
const response = await fetch('/api/auth/profile', {
  method: 'GET',
  headers: { 
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  }
});
```

## 🔒 Security Features

### Password Security
- **bcrypt hashing** with 12 salt rounds
- **Password strength validation** (8+ chars, uppercase, lowercase, number, special char)
- **Password change logging** for audit trails

### Token Security
- **JWT with HS256** algorithm (configurable to RS256)
- **Short-lived access tokens** (1 hour default)
- **Long-lived refresh tokens** (7 days default)
- **Token rotation** on refresh
- **Automatic token cleanup**

### Database Security
- **Row Level Security (RLS)** enabled
- **Parameterized queries** prevent SQL injection
- **Input validation** and sanitization
- **Audit logging** for all user actions

### API Security
- **CORS protection** with configurable origins
- **Rate limiting ready** (implement with Netlify Edge Functions)
- **Request validation** for all endpoints
- **Error handling** without information leakage

## 📊 Database Schema

The system includes these main tables:

- **`users`** - Core user profiles and authentication data
- **`user_sessions`** - Active session tracking (optional)
- **`user_activity_logs`** - Audit trail of user actions
- **`password_reset_tokens`** - Secure password reset functionality

### Key Features:
- ✅ UUID primary keys
- ✅ Timestamps for all records  
- ✅ Soft delete capabilities
- ✅ Indexes for performance
- ✅ Data validation constraints
- ✅ Automatic cleanup functions

## 🚦 Error Handling

The system provides comprehensive error handling:

```javascript
// Standardized error responses
{
  "success": false,
  "message": "Validation failed",
  "error": {
    "validationErrors": [
      "Email is required",
      "Password must be at least 8 characters"
    ]
  },
  "timestamp": "2025-06-23T10:30:00.000Z"
}
```

### Error Types:
- `400` - Validation errors
- `401` - Authentication required
- `403` - Insufficient permissions  
- `404` - Resource not found
- `409` - Resource conflicts (duplicate email)
- `429` - Rate limit exceeded
- `500` - Server errors

## 🧪 Testing

```bash
# Run tests
npm test

# Run linting
npm run lint

# Format code
npm run format
```

## 📝 Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `SUPABASE_URL` | Supabase project URL | ✅ | - |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | ✅ | - |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | ✅ | - |
| `JWT_SECRET` | JWT signing secret (32+ chars) | ✅ | - |
| `JWT_EXPIRES_IN` | Access token expiry | ❌ | `1h` |
| `REFRESH_TOKEN_EXPIRES_IN` | Refresh token expiry | ❌ | `7d` |
| `NODE_ENV` | Environment mode | ❌ | `development` |
| `ALLOWED_ORIGINS` | CORS allowed origins | ❌ | `*` |

## 🔧 Customization

### Adding New Fields to User Profile

1. **Update Database Schema**
   ```sql
   ALTER TABLE users ADD COLUMN new_field VARCHAR(100);
   ```

2. **Update Validation**
   ```javascript
   // In netlify/functions/utils/validation.js
   const validateNewField = (value) => {
     // Add validation logic
   };
   ```

3. **Update Service**
   ```javascript
   // In netlify/functions/services/userService.js
   const allowedFields = ['name', 'email', 'new_field'];
   ```

### Adding New Endpoints

1. Create new function file in `netlify/functions/`
2. Follow existing patterns for authentication and validation
3. Update client library if needed

## 🚀 Production Deployment

### Netlify Deployment

1. **Connect Repository**
   - Link your GitHub/GitLab repository to Netlify

2. **Set Environment Variables**
   - Add all required environment variables in Netlify dashboard
   - Use Netlify's secret management for sensitive values

3. **Configure Build Settings**
   ```bash
   Build command: npm run build
   Publish directory: public
   Functions directory: netlify/functions
   ```

4. **Deploy**
   ```bash
   git push origin main
   # Netlify will auto-deploy
   ```

### Security Checklist for Production

- [ ] Use strong JWT secrets (32+ random characters)
- [ ] Enable HTTPS only
- [ ] Configure proper CORS origins
- [ ] Enable Supabase RLS policies
- [ ] Set up monitoring and logging
- [ ] Configure rate limiting
- [ ] Regular security updates
- [ ] Backup database regularly

## 🐛 Troubleshooting

### Common Issues

**1. "Supabase connection failed"**
```bash
# Check environment variables
echo $SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY

# Verify Supabase project is active
```

**2. "JWT verification failed"**
```bash
# Ensure JWT_SECRET is set and consistent
# Check token expiration times
```

**3. "User not found" errors**
```bash
# Verify RLS policies are correctly configured
# Check user.is_active status
```

**4. CORS errors**
```bash
# Update ALLOWED_ORIGINS environment variable
# Check netlify.toml CORS configuration
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Add tests for new functionality
5. Run tests: `npm test`
6. Commit your changes: `git commit -am 'Add feature'`
7. Push to the branch: `git push origin feature-name`
8. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Related Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Netlify Functions Documentation](https://docs.netlify.com/functions/overview/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc7519)
- [OWASP Authentication Guidelines](https://owasp.org/www-project-authentication-cheat-sheet/)

## 📞 Support

- Create an issue for bug reports
- Join our Discord for community support
- Check the documentation for common solutions
- Email: support@yourcompany.com

---

**Built with ❤️ using Supabase and Netlify Functions**