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





-- =============================================
-- Enhanced Database Schema for VR Supermarket
-- With Advanced OTP Management (1-minute expiry)
-- =============================================

DROP FUNCTION get_otp_statistics(integer);
-- Check if auth functions exist before using them
DO $$
BEGIN
    -- Create a dummy auth schema if it doesn't exist (for testing environments)
    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
        CREATE SCHEMA auth;
        
        -- Create dummy functions for non-Supabase environments
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS 
        'SELECT gen_random_uuid()' LANGUAGE SQL;
        
        CREATE OR REPLACE FUNCTION auth.email() RETURNS TEXT AS 
        'SELECT current_setting(''app.current_user_email'', true)' LANGUAGE SQL;
        
        CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS 
        'SELECT current_setting(''app.current_user_role'', true)' LANGUAGE SQL;
    END IF;
END $$;

-- Ensure required extensions are available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Update registration_otps table for enhanced functionality
DROP TABLE IF EXISTS registration_otps CASCADE;

CREATE TABLE registration_otps (
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
    resend_count INTEGER DEFAULT 0,
    last_resend_at TIMESTAMP WITH TIME ZONE,
    ip_address INET,
    user_agent TEXT,
    
    CONSTRAINT registration_otps_email_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT registration_otps_attempts_check CHECK (attempts >= 0 AND attempts <= 10),
    CONSTRAINT registration_otps_resend_count_check CHECK (resend_count >= 0 AND resend_count <= 10)
);

-- Indexes for OTP management
CREATE INDEX idx_registration_otps_email ON registration_otps(email);
CREATE INDEX idx_registration_otps_expires_at ON registration_otps(expires_at);
CREATE INDEX idx_registration_otps_verified ON registration_otps(verified);
CREATE INDEX idx_registration_otps_created_at ON registration_otps(created_at);
CREATE INDEX idx_registration_otps_ip_address ON registration_otps(ip_address);

-- Enhanced OTP rate limiting table
CREATE TABLE IF NOT EXISTS otp_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier VARCHAR(255) NOT NULL, -- email or IP address
    identifier_type VARCHAR(20) NOT NULL, -- 'email' or 'ip'
    action_type VARCHAR(50) NOT NULL, -- 'resend', 'verify', 'register'
    attempt_count INTEGER DEFAULT 1,
    window_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_attempt TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    blocked_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT otp_rate_limits_identifier_type_check CHECK (identifier_type IN ('email', 'ip')),
    CONSTRAINT otp_rate_limits_action_type_check CHECK (action_type IN ('resend', 'verify', 'register')),
    UNIQUE(identifier, identifier_type, action_type)
);

-- Indexes for rate limiting
CREATE INDEX idx_otp_rate_limits_identifier ON otp_rate_limits(identifier, identifier_type);
CREATE INDEX idx_otp_rate_limits_window_start ON otp_rate_limits(window_start);
CREATE INDEX idx_otp_rate_limits_blocked_until ON otp_rate_limits(blocked_until);

-- Enhanced OTP statistics table
CREATE TABLE IF NOT EXISTS otp_statistics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_otps_sent INTEGER DEFAULT 0,
    total_otps_verified INTEGER DEFAULT 0,
    total_resends INTEGER DEFAULT 0,
    average_verification_time INTERVAL,
    success_rate DECIMAL(5,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(date)
);

-- Create activity logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS vr_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    session_id UUID,
    activity_type VARCHAR(100) NOT NULL,
    activity_data JSONB NOT NULL DEFAULT '{}',
    location_data JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- Enhanced Functions for OTP Management
-- =============================================

-- Function to clean up expired OTPs (runs every minute)
CREATE OR REPLACE FUNCTION cleanup_expired_otps()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
    expired_count INTEGER;
    old_count INTEGER;
BEGIN
    -- Count expired OTPs for logging
    SELECT COUNT(*) INTO expired_count
    FROM registration_otps 
    WHERE expires_at < NOW() AND verified = FALSE;
    
    -- Count old verified OTPs for cleanup
    SELECT COUNT(*) INTO old_count
    FROM registration_otps 
    WHERE verified = TRUE AND created_at < NOW() - INTERVAL '24 hours';
    
    -- Delete expired and old OTPs
    DELETE FROM registration_otps 
    WHERE expires_at < NOW() 
    OR (verified = FALSE AND created_at < NOW() - INTERVAL '2 hours')
    OR (verified = TRUE AND created_at < NOW() - INTERVAL '24 hours');
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Log cleanup activity
    INSERT INTO vr_activity_logs (user_id, session_id, activity_type, activity_data, timestamp)
    VALUES (NULL, NULL, 'otp_cleanup', jsonb_build_object(
        'total_deleted', deleted_count,
        'expired_otps', expired_count,
        'old_verified_otps', old_count
    ), NOW());
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to check OTP rate limits
CREATE OR REPLACE FUNCTION check_otp_rate_limit(
    p_identifier VARCHAR(255),
    p_identifier_type VARCHAR(20),
    p_action_type VARCHAR(50)
)
RETURNS JSONB AS $$
DECLARE
    rate_limit_record RECORD;
    max_attempts INTEGER;
    window_minutes INTEGER;
    current_time TIMESTAMP WITH TIME ZONE := NOW();
    result JSONB;
BEGIN
    -- Set limits based on action type
    CASE p_action_type
        WHEN 'resend' THEN
            max_attempts := 3;
            window_minutes := 60; -- 1 hour window
        WHEN 'verify' THEN
            max_attempts := 5;
            window_minutes := 10; -- 10 minute window
        WHEN 'register' THEN
            max_attempts := 5;
            window_minutes := 60; -- 1 hour window
        ELSE
            max_attempts := 3;
            window_minutes := 60;
    END CASE;
    
    -- Get existing rate limit record
    SELECT * INTO rate_limit_record
    FROM otp_rate_limits
    WHERE identifier = p_identifier 
    AND identifier_type = p_identifier_type 
    AND action_type = p_action_type;
    
    -- Check if blocked
    IF rate_limit_record.blocked_until IS NOT NULL AND rate_limit_record.blocked_until > current_time THEN
        result := jsonb_build_object(
            'allowed', false,
            'reason', 'blocked',
            'blocked_until', rate_limit_record.blocked_until,
            'message', 'Account temporarily blocked due to too many attempts'
        );
        RETURN result;
    END IF;
    
    -- Check if window has expired (reset counter)
    IF rate_limit_record.window_start IS NULL OR 
       rate_limit_record.window_start < current_time - (window_minutes || ' minutes')::INTERVAL THEN
        
        -- Reset or create new rate limit record
        INSERT INTO otp_rate_limits (
            identifier, identifier_type, action_type, attempt_count, 
            window_start, last_attempt
        ) VALUES (
            p_identifier, p_identifier_type, p_action_type, 1,
            current_time, current_time
        )
        ON CONFLICT (identifier, identifier_type, action_type) 
        DO UPDATE SET
            attempt_count = 1,
            window_start = current_time,
            last_attempt = current_time,
            blocked_until = NULL,
            updated_at = current_time;
        
        result := jsonb_build_object(
            'allowed', true,
            'attempts_remaining', max_attempts - 1
        );
        RETURN result;
    END IF;
    
    -- Check if max attempts exceeded
    IF rate_limit_record.attempt_count >= max_attempts THEN
        -- Block for progressive time (exponential backoff)
        UPDATE otp_rate_limits
        SET blocked_until = current_time + (POWER(2, LEAST(attempt_count - max_attempts, 6)) || ' minutes')::INTERVAL,
            updated_at = current_time
        WHERE identifier = p_identifier 
        AND identifier_type = p_identifier_type 
        AND action_type = p_action_type;
        
        result := jsonb_build_object(
            'allowed', false,
            'reason', 'rate_limit_exceeded',
            'message', 'Too many attempts. Please try again later.',
            'max_attempts', max_attempts,
            'window_minutes', window_minutes
        );
        RETURN result;
    END IF;
    
    -- Increment attempt counter
    UPDATE otp_rate_limits
    SET attempt_count = attempt_count + 1,
        last_attempt = current_time,
        updated_at = current_time
    WHERE identifier = p_identifier 
    AND identifier_type = p_identifier_type 
    AND action_type = p_action_type;
    
    result := jsonb_build_object(
        'allowed', true,
        'attempts_remaining', max_attempts - (rate_limit_record.attempt_count + 1)
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to update OTP statistics
CREATE OR REPLACE FUNCTION update_otp_statistics()
RETURNS VOID AS $$
DECLARE
    today DATE := CURRENT_DATE;
    stats_data RECORD;
BEGIN
    -- Calculate daily statistics
    SELECT 
        COUNT(*) as total_sent,
        COUNT(*) FILTER (WHERE verified = TRUE) as total_verified,
        SUM(resend_count) as total_resends,
        AVG(verified_at - created_at) FILTER (WHERE verified = TRUE) as avg_verification_time,
        (COUNT(*) FILTER (WHERE verified = TRUE) * 100.0 / NULLIF(COUNT(*), 0)) as success_rate
    INTO stats_data
    FROM registration_otps
    WHERE DATE(created_at) = today;
    
    -- Insert or update statistics
    INSERT INTO otp_statistics (
        date, total_otps_sent, total_otps_verified, total_resends,
        average_verification_time, success_rate
    ) VALUES (
        today, COALESCE(stats_data.total_sent, 0), COALESCE(stats_data.total_verified, 0), COALESCE(stats_data.total_resends, 0),
        stats_data.avg_verification_time, COALESCE(stats_data.success_rate, 0)
    )
    ON CONFLICT (date) DO UPDATE SET
        total_otps_sent = EXCLUDED.total_otps_sent,
        total_otps_verified = EXCLUDED.total_otps_verified,
        total_resends = EXCLUDED.total_resends,
        average_verification_time = EXCLUDED.average_verification_time,
        success_rate = EXCLUDED.success_rate,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to get OTP statistics for monitoring
CREATE OR REPLACE FUNCTION get_otp_statistics(days_back INTEGER DEFAULT 7)
RETURNS TABLE (
    date DATE,
    total_otps_sent INTEGER,
    total_otps_verified INTEGER,
    total_resends INTEGER,
    average_verification_seconds INTEGER,
    success_rate DECIMAL(5,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.date,
        s.total_otps_sent,
        s.total_otps_verified,
        s.total_resends,
        EXTRACT(EPOCH FROM s.average_verification_time)::INTEGER as average_verification_seconds,
        s.success_rate
    FROM otp_statistics s
    WHERE s.date >= CURRENT_DATE - days_back
    ORDER BY s.date DESC;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Triggers for OTP Management
-- =============================================

-- Trigger to update OTP statistics when OTPs are verified
CREATE OR REPLACE FUNCTION trigger_update_otp_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Update statistics when OTP is verified
    IF NEW.verified = TRUE AND (OLD.verified IS NULL OR OLD.verified = FALSE) THEN
        PERFORM update_otp_statistics();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_otp_verified ON registration_otps;
CREATE TRIGGER trigger_otp_verified
    AFTER UPDATE ON registration_otps
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_otp_stats();

-- Trigger to automatically clean up rate limits
CREATE OR REPLACE FUNCTION cleanup_expired_rate_limits()
RETURNS TRIGGER AS $$
BEGIN
    -- Clean up expired rate limit blocks
    DELETE FROM otp_rate_limits
    WHERE blocked_until IS NOT NULL 
    AND blocked_until < NOW() - INTERVAL '1 hour';
    
    -- Clean up old rate limit records (older than 24 hours)
    DELETE FROM otp_rate_limits
    WHERE window_start < NOW() - INTERVAL '24 hours';
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create cleanup trigger (runs on insert)
DROP TRIGGER IF EXISTS trigger_cleanup_rate_limits ON otp_rate_limits;
CREATE TRIGGER trigger_cleanup_rate_limits
    AFTER INSERT ON otp_rate_limits
    FOR EACH STATEMENT
    EXECUTE FUNCTION cleanup_expired_rate_limits();

-- Function to validate OTP securely
CREATE OR REPLACE FUNCTION validate_otp(
    p_email VARCHAR(255),
    p_otp_code VARCHAR(6),
    p_ip_address INET DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    otp_record RECORD;
    rate_limit_result JSONB;
BEGIN
    -- Check rate limiting for verification attempts
    rate_limit_result := check_otp_rate_limit(p_email, 'email', 'verify');
    
    IF NOT (rate_limit_result->>'allowed')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'rate_limit_exceeded',
            'message', rate_limit_result->>'message',
            'rate_limit_info', rate_limit_result
        );
    END IF;
    
    -- Get the most recent unverified OTP
    SELECT * INTO otp_record
    FROM registration_otps
    WHERE email = p_email
    AND verified = FALSE
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- Check if OTP exists
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'otp_not_found',
            'message', 'No pending OTP found for this email'
        );
    END IF;
    
    -- Check if OTP has expired
    IF otp_record.expires_at < NOW() THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'otp_expired',
            'message', 'OTP has expired. Please request a new one.'
        );
    END IF;
    
    -- Check if max attempts exceeded
    IF otp_record.attempts >= 5 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'max_attempts_exceeded',
            'message', 'Maximum verification attempts exceeded'
        );
    END IF;
    
    -- Increment attempt counter
    UPDATE registration_otps
    SET attempts = attempts + 1,
        updated_at = NOW()
    WHERE id = otp_record.id;
    
    -- Verify OTP using crypt function for bcrypt
    IF crypt(p_otp_code, otp_record.otp_hash) = otp_record.otp_hash THEN
        -- OTP is valid, mark as verified
        UPDATE registration_otps
        SET verified = TRUE,
            verified_at = NOW(),
            updated_at = NOW()
        WHERE id = otp_record.id;
        
        -- Log successful verification
        INSERT INTO vr_activity_logs (user_id, session_id, activity_type, activity_data, timestamp)
        VALUES (NULL, NULL, 'otp_verified', jsonb_build_object(
            'email', p_email,
            'otp_id', otp_record.id,
            'attempts_used', otp_record.attempts + 1,
            'verification_time_seconds', EXTRACT(EPOCH FROM (NOW() - otp_record.created_at)),
            'ip_address', p_ip_address
        ), NOW());
        
        RETURN jsonb_build_object(
            'success', true,
            'message', 'OTP verified successfully',
            'user_data', otp_record.user_data
        );
    ELSE
        -- OTP is invalid
        INSERT INTO vr_activity_logs (user_id, session_id, activity_type, activity_data, timestamp)
        VALUES (NULL, NULL, 'otp_verification_failed', jsonb_build_object(
            'email', p_email,
            'otp_id', otp_record.id,
            'attempts_used', otp_record.attempts,
            'remaining_attempts', 5 - otp_record.attempts,
            'ip_address', p_ip_address
        ), NOW());
        
        RETURN jsonb_build_object(
            'success', false,
            'error', 'invalid_otp',
            'message', 'Invalid OTP code',
            'remaining_attempts', 5 - otp_record.attempts
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Enhanced Views for OTP Management
-- =============================================

-- View for active OTP sessions
CREATE OR REPLACE VIEW active_otp_sessions AS
SELECT 
    id,
    email,
    user_data->>'name' as user_name,
    attempts,
    resend_count,
    expires_at,
    created_at,
    EXTRACT(EPOCH FROM (expires_at - NOW()))::INTEGER as seconds_until_expiry,
    CASE 
        WHEN expires_at < NOW() THEN 'expired'
        WHEN attempts >= 5 THEN 'max_attempts'
        ELSE 'active'
    END as status
FROM registration_otps
WHERE verified = FALSE
AND created_at > NOW() - INTERVAL '2 hours'
ORDER BY created_at DESC;

-- View for OTP rate limit status
CREATE OR REPLACE VIEW otp_rate_limit_status AS
SELECT 
    identifier,
    identifier_type,
    action_type,
    attempt_count,
    window_start,
    last_attempt,
    blocked_until,
    CASE 
        WHEN blocked_until > NOW() THEN 'blocked'
        WHEN window_start > NOW() - INTERVAL '1 hour' THEN 'active'
        ELSE 'expired'
    END as status,
    CASE 
        WHEN blocked_until > NOW() THEN EXTRACT(EPOCH FROM (blocked_until - NOW()))::INTEGER
        ELSE 0
    END as seconds_until_unblocked
FROM otp_rate_limits
WHERE window_start > NOW() - INTERVAL '24 hours'
ORDER BY last_attempt DESC;

-- =============================================
-- Enable Row Level Security (RLS)
-- =============================================

-- Enable RLS
ALTER TABLE registration_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_statistics ENABLE ROW LEVEL SECURITY;

-- Create safe RLS policies that don't fail if auth schema doesn't exist
DO $$
BEGIN
    -- RLS Policies for registration_otps
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'email' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'auth')) THEN
        DROP POLICY IF EXISTS "Users can view their own OTPs" ON registration_otps;
        CREATE POLICY "Users can view their own OTPs" ON registration_otps
            FOR SELECT USING (auth.email() = email);
    END IF;
    
    -- Allow service role to manage all OTPs
    DROP POLICY IF EXISTS "Service role can manage all OTPs" ON registration_otps;
    CREATE POLICY "Service role can manage all OTPs" ON registration_otps
        FOR ALL USING (current_setting('app.current_user_role', true) = 'service_role');
    
    -- Allow anonymous users to insert and update OTPs during registration
    DROP POLICY IF EXISTS "Anonymous can insert OTPs during registration" ON registration_otps;
    CREATE POLICY "Anonymous can insert OTPs during registration" ON registration_otps
        FOR INSERT WITH CHECK (true);
    
    DROP POLICY IF EXISTS "Anonymous can update OTPs during verification" ON registration_otps;
    CREATE POLICY "Anonymous can update OTPs during verification" ON registration_otps
        FOR UPDATE USING (true);
    
    -- RLS Policies for otp_rate_limits
    DROP POLICY IF EXISTS "Service role can manage rate limits" ON otp_rate_limits;
    CREATE POLICY "Service role can manage rate limits" ON otp_rate_limits
        FOR ALL USING (current_setting('app.current_user_role', true) = 'service_role');
        
    -- Allow anonymous to query rate limits for verification
    DROP POLICY IF EXISTS "Anonymous can check rate limits" ON otp_rate_limits;
    CREATE POLICY "Anonymous can check rate limits" ON otp_rate_limits
        FOR SELECT USING (true);
    
    -- RLS Policies for otp_statistics
    DROP POLICY IF EXISTS "Authenticated users can view OTP statistics" ON otp_statistics;
    CREATE POLICY "Authenticated users can view OTP statistics" ON otp_statistics
        FOR SELECT USING (current_setting('app.current_user_role', true) IN ('authenticated', 'service_role'));
    
    DROP POLICY IF EXISTS "Service role can manage OTP statistics" ON otp_statistics;
    CREATE POLICY "Service role can manage OTP statistics" ON otp_statistics
        FOR ALL USING (current_setting('app.current_user_role', true) = 'service_role');
END $$;

-- Insert initial OTP statistics record
INSERT INTO otp_statistics (date) VALUES (CURRENT_DATE)
ON CONFLICT (date) DO NOTHING;

-- Mark schema update as complete
INSERT INTO vr_activity_logs (user_id, session_id, activity_type, activity_data, timestamp)
VALUES (NULL, NULL, 'schema_update', jsonb_build_object(
    'version', '2.0.0',
    'feature', 'enhanced_otp_management',
    'expiry_minutes', 1,
    'rate_limiting', true,
    'monitoring', true
), NOW());
