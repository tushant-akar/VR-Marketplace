# 🛒 VR Supermarket - Complete Backend System

A comprehensive, production-ready backend system for a Virtual Reality supermarket experience built with **Supabase**, **Netlify Functions**, **Stripe**, and **ElevenLabs**. This system provides complete e-commerce functionality specifically designed for immersive VR shopping experiences.

[![API Status](https://img.shields.io/badge/API-Online-green)](https://your-site.netlify.app)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org)
[![Hackathon Ready](https://img.shields.io/badge/Hackathon-Ready-orange.svg)](#)

## 🚀 System Overview

The VR Supermarket API is a full-stack backend solution that transforms traditional e-commerce into an immersive virtual reality experience. It combines modern web technologies with VR-specific features to create a seamless shopping environment.

### 🌟 Key Features

#### 🛍️ **VR Shopping Experience**
- **Virtual Shopping Sessions** with real-time state management
- **3D Shelf Positioning** with compartmentalized product placement (top/middle/bottom)
- **Sponsored Product Placement** prioritized at store entrance and category fronts
- **Real-time Cart Management** with stock validation and automatic updates
- **Product Recommendations** based on selection and browsing behavior

#### 🤖 **AI-Powered Customer Support**
- **ElevenLabs Voice Integration** for natural conversation
- **Multiple Support Locations** positioned throughout VR store
- **Conversational Product Search** with intelligent query analysis
- **Specialist Assistants** (Grocery nutrition expert, Electronics tech support, General help)
- **Voice Response Generation** with audio playback in VR environment

#### 💳 **Advanced Payment Processing**
- **Dual Payment Methods**: Cash simulation and Stripe integration
- **Virtual Cashier Interaction** with conversational payment flow
- **Real-time Stock Updates** during checkout process
- **Comprehensive Receipt Generation** with transaction details
- **Refund Management** with audit trails and customer notifications

#### 🔒 **Enterprise Security**
- **JWT Authentication** with refresh token rotation
- **Advanced OTP System** with 1-minute expiry and rate limiting
- **Row Level Security (RLS)** on all database operations
- **Input Validation** and sanitization for all endpoints
- **Comprehensive Activity Logging** for audit and analytics

## 📊 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    VR Supermarket API                      │
├─────────────────────────────────────────────────────────────┤
│  Frontend VR Application (Unity/WebXR/React)               │
├─────────────────────────────────────────────────────────────┤
│  Netlify Functions (Serverless API Layer)                  │
│  ├── Authentication APIs    ├── VR Shopping APIs           │
│  ├── Product Management     ├── AI Support APIs            │
│  ├── Payment Processing     └── Analytics APIs             │
├─────────────────────────────────────────────────────────────┤
│  Service Layer                                             │
│  ├── VRProductsService     ├── VRShoppingService           │
│  ├── VRSupportService      ├── VRPaymentService            │
│  └── UserService           └── AnalyticsService            │
├─────────────────────────────────────────────────────────────┤
│  External Integrations                                     │
│  ├── Supabase (Database)   ├── Stripe (Payments)          │
│  ├── ElevenLabs (Voice AI) ├── SendGrid (Email)           │
│  └── Netlify (Hosting)     └── GitHub (CI/CD)             │
└─────────────────────────────────────────────────────────────┘
```

## 🗂️ Complete Project Structure

```
vr-supermarket-backend/
├── 📄 package.json                      # Dependencies and scripts
├── ⚙️  netlify.toml                     # Netlify deployment config
├── 🔧 .env.example                      # Environment variables template
├── 📋 README.md                         # This comprehensive guide
│
├── 🗄️  database/
│   └── schema.sql                       # Complete VR supermarket schema
│
├── 🔨 scripts/
│   ├── seed.js                         # Database seeding with sample data
│   ├── test-api.js                     # Comprehensive API testing
│   └── migrate.js                      # Database migration helper
│
├── 🌐 public/
│   └── index.html                      # Complete API documentation
│
├── ⚡ netlify/functions/
│   ├── 🔧 config/
│   │   └── supabase.js                 # Database client configuration
│   │
│   ├── 🛠️  utils/
│   │   ├── response.js                 # Standardized API responses
│   │   ├── validation.js               # Enhanced input validation
│   │   └── auth.js                     # JWT token management
│   │
│   ├── 🔄 services/
│   │   ├── VRProductsService.js        # Product management & search
│   │   ├── VRShoppingService.js        # Shopping cart & sessions
│   │   ├── VRSupportService.js         # AI customer support
│   │   ├── VRPaymentService.js         # Payment processing
│   │   └── userService.js              # User management (existing)
│   │
│   ├── 🛒 VR API Endpoints/
│   │   ├── vr-products.js              # Products API
│   │   ├── vr-shopping.js              # Shopping cart API
│   │   ├── vr-support.js               # Customer support API
│   │   ├── vr-payment.js               # Payment processing API
│   │   └── vr-analytics.js             # Analytics & tracking API
│   │
│   └── 🔐 Authentication Endpoints/
│       ├── auth-register.js            # User registration
│       ├── auth-verify-otp.js          # OTP verification
│       ├── auth-resend-otp.js          # 🆕 OTP resend with rate limiting
│       ├── auth-login.js               # User login
│       ├── auth-refresh.js             # Token refresh
│       ├── auth-profile.js             # Profile management
│       ├── auth-change-password.js     # Password changes
│       └── auth-logout.js              # User logout
│
└── 📱 client/
    ├── auth-client.js                  # Frontend auth integration
    └── registration-flow.js            # Registration with OTP flow
```

## 🛠️ Setup & Installation

### 1. Prerequisites

- **Node.js 18+** - [Download](https://nodejs.org/)
- **Supabase Account** - [Sign up](https://supabase.com)
- **Netlify Account** - [Sign up](https://netlify.com)
- **Stripe Account** - [Sign up](https://stripe.com) (for payments)
- **ElevenLabs Account** - [Sign up](https://elevenlabs.io) (for voice AI, optional)

### 2. Clone & Install

```bash
# Clone the repository
git clone https://github.com/tushant-akar/VR-Supermarket.git
cd VR-Supermarket

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

### 3. Environment Configuration

Create and configure your `.env` file:

```bash
# 🗄️ Supabase Configuration
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

# 🔐 JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_at_least_32_characters_long
JWT_EXPIRES_IN=1h
REFRESH_TOKEN_EXPIRES_IN=7d

# 💳 Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key_here

# 🤖 ElevenLabs Configuration (Voice AI)
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here

# 📧 Email Configuration
SENDGRID_API_KEY=your_sendgrid_api_key_here
FROM_EMAIL=noreply@vr-supermarket.com

# 🌍 Environment Settings
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8888

# 🛒 VR Specific Configuration
VR_SESSION_TIMEOUT=86400000
MAX_CART_ITEMS=50
DEFAULT_TAX_RATE=0.08
```

### 4. Database Setup

#### Create Supabase Project
1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your project URL and API keys
3. Navigate to the SQL Editor in your Supabase dashboard

#### Deploy Database Schema
```sql
-- Execute the contents of database/schema.sql in your Supabase SQL editor
-- This creates all tables, views, functions, triggers, and sample data
```

#### Seed Sample Data
```bash
npm run db:seed
```

### 5. Local Development

```bash
# Start Netlify dev server
npm run dev

# API will be available at:
# http://localhost:8888/.netlify/functions/
```

### 6. Testing

```bash
# Run comprehensive API tests
npm run test

# Test specific functionality
node scripts/test-api.js

# Lint and format code
npm run lint
npm run format
```

## 🔗 Complete API Reference

### 📦 **Products API** (`/api/vr-products`)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/products` | GET | ❌ | Get products with filters & pagination |
| `/products/{id}` | GET | ❌ | Get product details + recommendations |
| `/sponsored` | GET | ❌ | Get sponsored products for front display |
| `/featured` | GET | ❌ | Get featured products |
| `/categories` | GET | ❌ | Get categories with subcategories |
| `/search?q={term}` | GET | ❌ | Advanced product search |
| `/shelf/{number}` | GET | ❌ | Get products by VR shelf position |
| `/reviews/{productId}` | GET | ❌ | Get product reviews |

### 🛒 **Shopping API** (`/api/vr-shopping`)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/session` | POST | ✅ | Create VR shopping session |
| `/session/{id}` | GET | ✅ | Get session details |
| `/session/end` | PUT | ✅ | End shopping session |
| `/cart/{sessionId}` | GET | ✅ | Get shopping cart contents |
| `/cart/add` | POST | ✅ | Add product to cart |
| `/cart/quantity` | PUT | ✅ | Update cart item quantity |
| `/cart/{sessionId}/{productId}` | DELETE | ✅ | Remove product from cart |
| `/cart/clear/{sessionId}` | DELETE | ✅ | Clear entire cart |

### 🎧 **Customer Support API** (`/api/vr-support`)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/locations` | GET | ✅ | Get AI support locations in VR |
| `/conversation/start` | POST | ✅ | Start AI conversation with voice |
| `/conversation/message` | POST | ✅ | Send message to AI support |
| `/conversation/end` | PUT | ✅ | End conversation with rating |
| `/conversation/{id}` | GET | ✅ | Get conversation history |

### 💳 **Payment API** (`/api/vr-payment`)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/checkout/{sessionId}` | GET | ✅ | Initialize checkout process |
| `/order` | POST | ✅ | Create new order |
| `/order/{id}` | GET | ✅ | Get order details |
| `/orders` | GET | ✅ | Get user order history |
| `/payment/cash` | POST | ✅ | Process cash payment |
| `/payment/stripe/intent` | POST | ✅ | Create Stripe payment intent |
| `/payment/stripe/confirm` | POST | ✅ | Confirm Stripe payment |
| `/order/cancel` | PUT | ✅ | Cancel pending order |
| `/refund` | POST | ✅ | Process order refund |
| `/receipt/{orderId}` | GET | ✅ | Generate order receipt |

### 🔐 **Authentication API** (`/api/auth`)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/register` | POST | ❌ | Register new user with OTP |
| `/verify-otp` | POST | ❌ | Verify OTP (1 min expiry) |
| `/resend-otp` | POST | ❌ | 🆕 Resend OTP with rate limiting |
| `/login` | POST | ❌ | User login with tokens |
| `/refresh` | POST | ❌ | Refresh access token |
| `/profile` | GET/PUT | ✅ | Get/update user profile |
| `/change-password` | POST | ✅ | Change password |
| `/logout` | POST | ✅ | Logout and invalidate tokens |

### 📊 **Analytics API** (`/api/vr-analytics`)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/user/activity` | GET | ✅ | Get user VR activity logs |
| `/user/sessions` | GET | ✅ | Get user shopping sessions |
| `/track` | POST | ✅ | Track custom VR activity |

## 🔒 Advanced OTP Management System

### 🆕 Enhanced OTP Features

Our new OTP system implements industry-standard security practices:

#### **Security Features**
- ⏱️ **1-minute expiry time** for maximum security
- 🔐 **bcrypt hashing** of OTP codes in database
- 🛡️ **Maximum 5 verification attempts** per OTP
- 🚫 **Rate limiting**: 3 resends per hour, 30-second cooldown
- 🧹 **Automatic cleanup** of expired OTPs

#### **User Experience Features**
- 📧 **Professional email templates** with branding
- 🔄 **Smart resend logic** with remaining attempt tracking
- ⚡ **Real-time validation** and error messaging
- 📱 **Mobile-optimized** email design
- 🌍 **Multi-language support** ready

#### **Implementation Example**

```javascript
// Register user (triggers OTP)
const registerResponse = await fetch('/api/auth-register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'SecurePass123!',
    name: 'John Doe'
  })
});

// Verify OTP (1-minute window)
const verifyResponse = await fetch('/api/auth-verify-otp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    otp: '123456'
  })
});

// Resend OTP if needed (with rate limiting)
const resendResponse = await fetch('/api/auth-resend-otp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com'
  })
});

// Response includes rate limit info
const resendData = await resendResponse.json();
console.log(`Remaining attempts: ${resendData.data.remainingResendAttempts}`);
console.log(`Next resend allowed at: ${resendData.data.nextResendAllowedAt}`);
```

## 🏪 VR Store Layout & Experience

### Virtual Store Design

```
🏪 VR Supermarket Layout:
┌─────────────────────────────────────────────────────────────┐
│                     Main Entrance (0,0,0)                  │
│                   🏪 Welcome & Support Desk                │
├─────────────────────────────────────────────────────────────┤
│  🥬 Grocery Section (-100,0,50)     📱 Electronics (100,0,50) │
│  ├─ Shelf 1: 🍎 Fruits             ├─ Shelf 3: 📺 TVs       │
│  │  ├─ Top: Premium fruits         │  ├─ Top: 75"+ TVs       │
│  │  ├─ Mid: Regular fruits         │  ├─ Mid: 55-65" TVs     │
│  │  └─ Bot: Value fruits           │  └─ Bot: 32-50" TVs     │
│  ├─ Shelf 2: 🥕 Vegetables         ├─ Shelf 4: 📱 Mobiles   │
│  └─ 🎧 Grocery Support             └─ 🎧 Tech Support       │
├─────────────────────────────────────────────────────────────┤
│                   💳 Checkout Area (0,0,100)               │
│               🤖 AI Cashier & Payment Terminal              │
└─────────────────────────────────────────────────────────────┘
```

### Product Organization Strategy

#### **Sponsored Product Placement**
- 🌟 **Front & Center**: Sponsored products appear first in each category
- 🎯 **Strategic Positioning**: Premium shelf locations for sponsors
- 💡 **VR Highlighting**: Special visual effects for sponsored items
- 📊 **Performance Tracking**: Detailed analytics for sponsor ROI

#### **Shelf Compartment System**
- 🔝 **Top Shelf**: Premium/luxury products
- 🎯 **Middle Shelf**: Best-selling/recommended products  
- 💰 **Bottom Shelf**: Value/budget options

#### **AI Support Specialists**
- 🏪 **Main Entrance**: General navigation and store information
- 🥗 **Grocery Section**: Nutrition advice, dietary recommendations
- 💻 **Electronics Section**: Technical specifications, comparisons
- 💳 **Checkout Area**: Payment assistance, billing support

## 💡 Usage Examples & Integration

### Frontend VR Integration

```javascript
// Complete VR Shopping Flow
class VRSupermarketClient {
  constructor(apiUrl, headsetType = 'Meta Quest 3') {
    this.apiUrl = apiUrl;
    this.headsetType = headsetType;
    this.accessToken = null;
    this.currentSession = null;
  }

  async authenticateUser(email, password) {
    const response = await fetch(`${this.apiUrl}/auth-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const result = await response.json();
    this.accessToken = result.data.tokens.accessToken;
    return result;
  }

  async startVRSession(userHeight = 175, language = 'en') {
    const response = await fetch(`${this.apiUrl}/vr-shopping/session`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        vr_data: {
          headset: this.headsetType,
          location: 'entrance',
          user_height: userHeight,
          preferred_language: language
        }
      })
    });

    const result = await response.json();
    this.currentSession = result.data.session;
    return result;
  }

  async getProductsByShelf(shelfNumber) {
    const response = await fetch(`${this.apiUrl}/vr-products/shelf/${shelfNumber}`);
    return await response.json();
  }

  async addToCart(productId, quantity = 1) {
    return await fetch(`${this.apiUrl}/vr-shopping/cart/add`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        session_id: this.currentSession.id,
        product_id: productId,
        quantity
      })
    });
  }

  async startAISupport(locationId, query) {
    return await fetch(`${this.apiUrl}/vr-support/conversation/start`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        session_id: this.currentSession.id,
        support_location_id: locationId,
        initial_query: query
      })
    });
  }

  async processPayment(paymentMethod = 'stripe') {
    // Initialize checkout
    const checkout = await fetch(`${this.apiUrl}/vr-payment/checkout/${this.currentSession.id}`, {
      headers: { 'Authorization': `Bearer ${this.accessToken}` }
    });

    // Create order
    const order = await fetch(`${this.apiUrl}/vr-payment/order`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        session_id: this.currentSession.id,
        payment_method: paymentMethod
      })
    });

    return await order.json();
  }
}

// Usage in VR Application
const vrClient = new VRSupermarketClient('https://your-api.netlify.app/api');

// Authenticate and start VR session
await vrClient.authenticateUser('user@example.com', 'password');
await vrClient.startVRSession(175, 'en');

// Browse products by shelf
const shelfProducts = await vrClient.getProductsByShelf(1);
console.log('Fruits shelf:', shelfProducts.data);

// Add product to cart
await vrClient.addToCart(shelfProducts.data.products.top[0].id, 2);

// Get AI support
const support = await vrClient.startAISupport(
  'grocery-support-location',
  'I need help finding organic vegetables'
);
```

### AI Conversation Examples

```javascript
// Electronics Support Conversation
const conversation = await fetch('/api/vr-support/conversation/start', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    support_location_id: 'electronics-support-location',
    initial_query: 'I need a 55-inch smart TV under $700 for gaming'
  })
});

const response = await conversation.json();
console.log('AI Response:', response.data.aiResponse.message);
console.log('Suggested Products:', response.data.suggested_products);
console.log('Audio Response Available:', !!response.data.aiResponse.audio);

// Continue conversation
const followUp = await fetch('/api/vr-support/conversation/message', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    conversation_id: response.data.conversation.id,
    message: 'I prefer Samsung brand TVs with low input lag'
  })
});
```

## 🚀 Production Deployment

### Netlify Deployment

#### 1. **Repository Setup**
```bash
# Connect your GitHub repository to Netlify
git remote add origin https://github.com/your-username/vr-supermarket.git
git push -u origin main
```

#### 2. **Netlify Configuration**
- **Build Command**: `npm run build`
- **Publish Directory**: `public`
- **Functions Directory**: `netlify/functions`

#### 3. **Environment Variables**
Set these in your Netlify dashboard:

```bash
# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# Authentication
JWT_SECRET=your_32_character_secret
JWT_EXPIRES_IN=1h
REFRESH_TOKEN_EXPIRES_IN=7d

# Payments
STRIPE_SECRET_KEY=sk_live_your_stripe_key
STRIPE_PUBLISHABLE_KEY=pk_live_your_stripe_key

# Voice AI
ELEVENLABS_API_KEY=your_elevenlabs_key

# Email
SENDGRID_API_KEY=your_sendgrid_key
FROM_EMAIL=noreply@your-domain.com

# Production Settings
NODE_ENV=production
ALLOWED_ORIGINS=https://your-vr-app.com,https://your-domain.com
```

#### 4. **Deploy**
```bash
npm run deploy:prod
```

### Security Checklist for Production

- [ ] **Strong JWT Secret** (32+ random characters)
- [ ] **HTTPS Only** configuration
- [ ] **CORS Origins** set to production domains only
- [ ] **Supabase RLS** policies enabled and tested
- [ ] **Rate Limiting** configured for all endpoints
- [ ] **Environment Variables** secured in Netlify
- [ ] **API Keys** rotated from development
- [ ] **Database Backups** scheduled
- [ ] **Monitoring** and alerting set up
- [ ] **SSL Certificates** valid and auto-renewing

## 📊 Database Schema Details

### Core Tables Overview

#### **Users & Authentication**
```sql
users                    -- Extended user profiles with VR preferences
registration_otps        -- OTP management with 1-minute expiry
user_sessions           -- Session tracking (optional)
user_activity_logs      -- Comprehensive audit trail
password_reset_tokens   -- Secure password reset
```

#### **Product Management**
```sql
categories              -- Product categories (Grocery, Electronics)
products               -- Products with VR positioning data
product_recommendations -- AI-driven product suggestions
product_reviews        -- User reviews and ratings
shelf_layouts          -- 3D VR shelf positioning
```

#### **VR Shopping**
```sql
shopping_sessions      -- VR shopping session management
shopping_cart         -- Real-time cart with stock validation
support_locations     -- AI assistant positions in VR
support_conversations -- AI conversation storage
```

#### **Commerce & Payments**
```sql
orders               -- Complete order lifecycle
order_items          -- Order line items
vr_activity_logs     -- VR-specific user behavior tracking
```

### Key Features

#### **VR-Specific Enhancements**
- **3D Coordinates** for all positioning data
- **Compartmentalized Shelves** (top/middle/bottom)
- **VR Session Tracking** with headset information
- **Spatial Analytics** for user movement patterns

#### **Performance Optimizations**
- **Indexed Queries** for fast product searches
- **Materialized Views** for real-time analytics
- **Automatic Triggers** for stock and rating updates
- **Cleanup Functions** for expired sessions and tokens

## 🧪 Testing & Quality Assurance

### Automated Testing

```bash
# Run full test suite
npm test

# Test specific components
npm run test:auth          # Authentication tests
npm run test:products      # Product API tests
npm run test:shopping      # Shopping cart tests
npm run test:payment       # Payment processing tests
npm run test:support       # AI support tests

# Performance testing
npm run test:performance   # Load testing
npm run test:security      # Security audit
```

### Manual Testing

```bash
# Run comprehensive API testing script
node scripts/test-api.js

# Test OTP system
node scripts/test-otp.js

# Test payment flows
node scripts/test-payments.js
```

### Test Coverage

- ✅ **Authentication Flow** (Registration, OTP, Login, Logout)
- ✅ **Product Management** (Browse, Search, Recommendations)
- ✅ **Shopping Experience** (Sessions, Cart, Checkout)
- ✅ **AI Support** (Conversations, Voice Responses)
- ✅ **Payment Processing** (Cash, Stripe, Refunds)
- ✅ **Error Handling** (Validation, Rate Limiting)
- ✅ **Security** (Authentication, Authorization, Input Validation)

## 📈 Analytics & Monitoring

### VR-Specific Metrics

#### **User Behavior Analytics**
- **Movement Patterns** in VR space
- **Product Interaction Heatmaps**
- **Shelf Performance** by compartment
- **Time Spent** in different store sections
- **Support Query Analysis** and effectiveness

#### **Business Intelligence**
- **Conversion Rates** by VR experience
- **Popular Product Combinations**
- **Peak Shopping Times** in VR
- **Revenue Attribution** by VR features
- **Support Conversation Effectiveness**

#### **Performance Monitoring**
```javascript
// Example analytics tracking
await fetch('/api/vr-analytics/track', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    session_id: sessionId,
    activity_type: 'product_interaction',
    activity_data: {
      product_id: productId,
      interaction_type: 'picked_up',
      duration_seconds: 15,
      shelf_compartment: 'middle'
    },
    location_data: {
      x: 45.2, y: 0, z: 23.8,
      rotation: '0,180,0'
    }
  })
});
```

## 🎯 Hackathon Deployment Guide

### Quick Deployment for Hackathons

#### **1. Rapid Setup (15 minutes)**
```bash
# Clone and setup
git clone https://github.com/tushant-akar/VR-Supermarket.git
cd VR-Supermarket
npm install

# Set essential environment variables
echo "SUPABASE_URL=your_url" >> .env
echo "SUPABASE_SERVICE_ROLE_KEY=your_key" >> .env
echo "JWT_SECRET=$(openssl rand -base64 32)" >> .env
```

#### **2. Database Quick Deploy**
```bash
# Deploy schema and seed data
npm run db:deploy
npm run db:seed
```

#### **3. Netlify One-Click Deploy**
[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/tushant-akar/VR-Supermarket)

#### **4. Demo-Ready Features**
- ✅ **Pre-loaded Sample Data** (Products, Categories, Support Locations)
- ✅ **Working Payment Demo** (Stripe test mode)
- ✅ **AI Support Demo** (with fallback responses)
- ✅ **Complete API Documentation** (hosted at /api/)
- ✅ **Postman Collection** for instant testing

### Demo Scenarios for Judges

#### **Scenario 1: Complete Shopping Journey**
1. User registration with OTP verification
2. VR session initiation with trolley assignment
3. Browse sponsored products at entrance
4. Navigate to Electronics section
5. Interact with AI support for TV recommendations
6. Add recommended product to cart
7. Proceed to checkout with Stripe payment
8. Receive detailed receipt

#### **Scenario 2: AI Support Showcase**
1. Customer approaches grocery support location
2. Asks: "I need ingredients for a healthy dinner for 4 people"
3. AI analyzes query and suggests products
4. Provides voice response with recommendations
5. Generates virtual product booklet
6. Customer selects items and adds to cart

#### **Scenario 3: Advanced VR Features**
1. Demonstrate 3D shelf positioning
2. Show compartmentalized product placement
3. Display real-time stock updates
4. Showcase spatial analytics tracking
5. Demonstrate voice-powered interactions

## 🤝 Contributing & Development

### Development Workflow

```bash
# Setup development environment
git clone https://github.com/tushant-akar/VR-Supermarket.git
cd VR-Supermarket
npm install
cp .env.example .env

# Create feature branch
git checkout -b feature/new-vr-feature

# Start development server
npm run dev

# Run tests
npm test

# Commit and push
git add .
git commit -m "Add: New VR feature implementation"
git push origin feature/new-vr-feature
```

### Code Style Guidelines

- **ESLint Configuration** with Airbnb standards
- **Prettier Formatting** for consistent code style
- **JSDoc Comments** for all functions and classes
- **Error Handling** with proper HTTP status codes
- **Input Validation** for all endpoints
- **Security First** approach for all implementations

### Adding New Features

#### **New Product Category**
1. Add category to database schema
2. Update validation rules in utils/validation.js
3. Create shelf layouts for VR positioning
4. Add to AI support knowledge base
5. Update product seeding script

#### **New Payment Method**
1. Extend VRPaymentService class
2. Add validation for new payment data
3. Update order processing workflow
4. Implement webhook handlers
5. Add comprehensive testing

#### **New AI Support Features**
1. Extend query analysis patterns in VRSupportService
2. Add new recommendation algorithms
3. Integrate additional voice models (ElevenLabs)
4. Implement multilingual support
5. Add conversation analytics

## 📞 Support & Resources

### Documentation
- 📖 **Complete API Docs**: Available at `/api/` when deployed
- 🔧 **Setup Guides**: Detailed in this README
- 🎥 **Video Tutorials**: Coming soon
- 📋 **Postman Collection**: For API testing

### Community
- 💬 **GitHub Discussions**: For feature requests and questions
- 🐛 **Issue Tracker**: For bug reports and improvements
- 📧 **Email Support**: team@vr-supermarket.com
- 🔗 **Discord**: Community chat and support

### Related Resources
- [Supabase Documentation](https://supabase.com/docs)
- [Netlify Functions Guide](https://docs.netlify.com/functions/overview/)
- [Stripe API Reference](https://stripe.com/docs/api)
- [ElevenLabs Voice API](https://elevenlabs.io/docs)
- [WebXR Device API](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API)

## 📄 License & Legal

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

### Third-Party Services
- **Supabase**: PostgreSQL database and authentication
- **Netlify**: Serverless function hosting and deployment
- **Stripe**: Payment processing and financial transactions
- **ElevenLabs**: AI voice generation and speech synthesis
- **SendGrid**: Transactional email delivery

## 🌟 Acknowledgments

Built with ❤️ for the future of Virtual Reality commerce. Special thanks to:

- **Supabase Team** for excellent database and auth services
- **Netlify** for seamless serverless deployment
- **Stripe** for robust payment infrastructure
- **ElevenLabs** for cutting-edge voice AI technology
- **Open Source Community** for amazing tools and libraries

---

## 🚀 **Ready for World's Largest Hackathon!**

This VR Supermarket backend is **production-ready**, **feature-complete**, and **hackathon-optimized**. It provides everything needed to build the next generation of VR commerce experiences.

### **What Makes This Special:**
- 🎯 **No Mocks or Placeholders** - Everything works in production
- 🔒 **Enterprise Security** - JWT, OTP, rate limiting, validation
- 🤖 **AI Integration** - Voice-powered customer support
- 💳 **Real Payments** - Both cash simulation and Stripe integration
- 📊 **Comprehensive Analytics** - VR-specific user behavior tracking
- 🛠️ **Developer Friendly** - Extensive docs, testing, examples

### **Perfect For:**
- ✅ **Hackathon Submissions** - Impressive, working demo
- ✅ **VR Prototypes** - Foundation for VR commerce apps
- ✅ **Learning Projects** - Modern backend architecture examples
- ✅ **Startup MVP** - Scale-ready production system

**🏆 Ready to win the world's largest hackathon!** 🏆

---

*Last Updated: June 26, 2025 | Version: 1.0.0 | Status: Production Ready*