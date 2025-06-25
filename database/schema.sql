-- =============================================
-- Updated User Authentication System Database Schema
-- With OTP Registration Support
-- =============================================

-- Create users table (same as before)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT auth.uid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    email_verified BOOLEAN DEFAULT FALSE,
    profile_image_url TEXT,
    phone_number VARCHAR(20),
    date_of_birth DATE,
    CONSTRAINT users_email_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT users_name_check CHECK (LENGTH(TRIM(name)) >= 2 AND LENGTH(TRIM(name)) <= 100)
);

-- Create registration_otps table for OTP verification
CREATE TABLE IF NOT EXISTS registration_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    otp_hash TEXT NOT NULL,
    user_data JSONB NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    attempts INTEGER DEFAULT 0,
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT registration_otps_email_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT registration_otps_attempts_check CHECK (attempts >= 0 AND attempts <= 10)
);

-- Create unique index on email for registration_otps (only one active OTP per email)
CREATE UNIQUE INDEX IF NOT EXISTS idx_registration_otps_email_active 
ON registration_otps(email) WHERE verified = FALSE;

-- Create user_sessions table for tracking active sessions (optional)
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL,
    device_info JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

-- Create user_activity_logs table for audit trail
CREATE TABLE IF NOT EXISTS user_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create password_reset_tokens table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- =============================================
-- Row Level Security Policies
-- =============================================

-- Users table policies
DROP POLICY IF EXISTS "Users can view own profile" ON users;
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Service role can manage users" ON users;
CREATE POLICY "Service role can manage users" ON users
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Registration OTPs policies (service role only)
DROP POLICY IF EXISTS "Service role can manage registration otps" ON registration_otps;
CREATE POLICY "Service role can manage registration otps" ON registration_otps
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- User sessions policies
DROP POLICY IF EXISTS "Users can view own sessions" ON user_sessions;
CREATE POLICY "Users can view own sessions" ON user_sessions
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own sessions" ON user_sessions;
CREATE POLICY "Users can manage own sessions" ON user_sessions
    FOR ALL USING (auth.uid() = user_id);

-- User activity logs policies
DROP POLICY IF EXISTS "Users can view own activity" ON user_activity_logs;
CREATE POLICY "Users can view own activity" ON user_activity_logs
    FOR SELECT USING (auth.uid() = user_id);

-- Password reset tokens policies
DROP POLICY IF EXISTS "Users can access own reset tokens" ON password_reset_tokens;
CREATE POLICY "Users can access own reset tokens" ON password_reset_tokens
    FOR SELECT USING (auth.uid() = user_id);

-- =============================================
-- Indexes for Performance
-- =============================================

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login);
CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(email_verified);

-- Registration OTPs indexes
CREATE INDEX IF NOT EXISTS idx_registration_otps_email ON registration_otps(email);
CREATE INDEX IF NOT EXISTS idx_registration_otps_expires_at ON registration_otps(expires_at);
CREATE INDEX IF NOT EXISTS idx_registration_otps_created_at ON registration_otps(created_at);
CREATE INDEX IF NOT EXISTS idx_registration_otps_verified ON registration_otps(verified);

-- User sessions indexes
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(is_active);

-- User activity logs indexes
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_id ON user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_created_at ON user_activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_action ON user_activity_logs(action);

-- Password reset tokens indexes
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);

-- =============================================
-- Functions and Triggers
-- =============================================

-- Function to update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for users table
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for registration_otps table
DROP TRIGGER IF EXISTS update_registration_otps_updated_at ON registration_otps;
CREATE TRIGGER update_registration_otps_updated_at 
    BEFORE UPDATE ON registration_otps 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Function to clean expired OTPs
CREATE OR REPLACE FUNCTION clean_expired_otps()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM registration_otps 
    WHERE expires_at < NOW() 
       OR (verified = TRUE AND verified_at < NOW() - INTERVAL '1 hour');
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ language 'plpgsql';

-- Function to clean expired sessions
CREATE OR REPLACE FUNCTION clean_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM user_sessions 
    WHERE expires_at < NOW() OR is_active = FALSE;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ language 'plpgsql';

-- Function to clean expired password reset tokens
CREATE OR REPLACE FUNCTION clean_expired_reset_tokens()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM password_reset_tokens 
    WHERE expires_at < NOW() OR used_at IS NOT NULL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ language 'plpgsql';

-- Function to log user activity
CREATE OR REPLACE FUNCTION log_user_activity(
    p_user_id UUID,
    p_action VARCHAR(50),
    p_details JSONB DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO user_activity_logs (user_id, action, details, ip_address, user_agent)
    VALUES (p_user_id, p_action, p_details, p_ip_address, p_user_agent);
END;
$$ language 'plpgsql';

-- Function to get OTP statistics
CREATE OR REPLACE FUNCTION get_otp_statistics(days_back INTEGER DEFAULT 7)
RETURNS TABLE(
    total_otps_sent INTEGER,
    verified_otps INTEGER,
    expired_otps INTEGER,
    failed_attempts INTEGER,
    success_rate NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER as total_otps_sent,
        COUNT(*) FILTER (WHERE verified = TRUE)::INTEGER as verified_otps,
        COUNT(*) FILTER (WHERE expires_at < NOW() AND verified = FALSE)::INTEGER as expired_otps,
        COALESCE(SUM(attempts), 0)::INTEGER as failed_attempts,
        CASE 
            WHEN COUNT(*) > 0 THEN 
                ROUND((COUNT(*) FILTER (WHERE verified = TRUE)::NUMERIC / COUNT(*)::NUMERIC) * 100, 2)
            ELSE 0
        END as success_rate
    FROM registration_otps 
    WHERE created_at >= NOW() - INTERVAL '1 day' * days_back;
END;
$$ language 'plpgsql';

-- =============================================
-- Views for Common Queries
-- =============================================

-- Active users view
CREATE OR REPLACE VIEW active_users AS
SELECT 
    id,
    email,
    name,
    created_at,
    last_login,
    email_verified
FROM users 
WHERE is_active = TRUE;

-- User session summary view
CREATE OR REPLACE VIEW user_session_summary AS
SELECT 
    u.id,
    u.email,
    u.name,
    COUNT(s.id) as active_sessions,
    MAX(s.created_at) as last_session_created
FROM users u
LEFT JOIN user_sessions s ON u.id = s.user_id AND s.is_active = TRUE AND s.expires_at > NOW()
WHERE u.is_active = TRUE
GROUP BY u.id, u.email, u.name;

-- OTP verification status view
CREATE OR REPLACE VIEW otp_verification_status AS
SELECT 
    email,
    user_data->>'name' as name,
    attempts,
    verified,
    expires_at,
    created_at,
    CASE 
        WHEN verified = TRUE THEN 'Verified'
        WHEN expires_at < NOW() THEN 'Expired'
        WHEN attempts >= 5 THEN 'Max Attempts Reached'
        ELSE 'Pending'
    END as status
FROM registration_otps
ORDER BY created_at DESC;

-- =============================================
-- Sample Data (Optional - for development)
-- =============================================

-- Uncomment the following lines if you want to insert sample data
/*
INSERT INTO users (email, name, password_hash, email_verified) VALUES
('admin@example.com', 'Admin User', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/lewUiuNJcfIWNm7dS', TRUE),
('user@example.com', 'Regular User', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/lewUiuNJcfIWNm7dS', TRUE);
*/

-- =============================================
-- Database Maintenance Commands
-- =============================================

-- Run these commands periodically to maintain database health

-- Clean expired OTPs (run every hour)
-- SELECT clean_expired_otps();

-- Clean expired sessions (run daily)
-- SELECT clean_expired_sessions();

-- Clean expired reset tokens (run daily)
-- SELECT clean_expired_reset_tokens();

-- Get OTP statistics (run weekly)
-- SELECT * FROM get_otp_statistics(7);

-- Analyze tables for query optimization (run weekly)
-- ANALYZE users, registration_otps, user_sessions, user_activity_logs, password_reset_tokens;