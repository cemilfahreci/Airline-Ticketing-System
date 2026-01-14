const { supabase, supabaseAdmin } = require('../config/supabase');

// User roles
const ROLES = {
    ADMIN: 'ADMIN',
    MS_MEMBER: 'MS_MEMBER',
    SERVICE_OTHER_AIRLINE: 'SERVICE_OTHER_AIRLINE'
};

/**
 * Extract and verify JWT token from request
 * Uses Supabase Admin API to verify token directly
 */
const verifyToken = async (req) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.split(' ')[1];

    try {
        // Use Supabase Admin API to verify JWT token directly
        // Supabase manages IAM - we just verify the token
        let user, error;
        
        if (supabaseAdmin) {
            // Use admin instance for more reliable verification
            const result = await supabaseAdmin.auth.getUser(token);
            user = result.data?.user;
            error = result.error;
        } else {
            // Fallback to regular client
            const result = await supabase.auth.getUser(token);
            user = result.data?.user;
            error = result.error;
        }

        if (error || !user) {
            console.log('Auth verification failed:', error?.message || 'No user');
            return null;
        }

        // Get user role from metadata (Supabase manages this)
        const role = user.user_metadata?.role || null;

        return { user, role, token };
    } catch (error) {
        console.error('Token verification error:', error.message || error);
        return null;
    }
};

/**
 * Middleware: Require authentication
 * Supabase manages IAM - we just verify the token
 */
const requireAuth = async (req, res, next) => {
    const authData = await verifyToken(req);

    if (!authData) {
        console.error('Auth failed for:', req.method, req.path, {
            hasAuthHeader: !!req.headers.authorization,
            authHeaderPrefix: req.headers.authorization?.substring(0, 20)
        });
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Geçersiz veya eksik authentication token. Lütfen tekrar giriş yapın.'
        });
    }

    req.user = authData.user;
    req.userRole = authData.role;
    req.token = authData.token;
    next();
};

/**
 * Middleware: Require specific role
 */
const requireRole = (...allowedRoles) => {
    return async (req, res, next) => {
        const authData = await verifyToken(req);

        if (!authData) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Valid authentication token required'
            });
        }

        if (!allowedRoles.includes(authData.role)) {
            return res.status(403).json({
                error: 'Forbidden',
                message: `Required role: ${allowedRoles.join(' or ')}. Your role: ${authData.role || 'none'}`
            });
        }

        req.user = authData.user;
        req.userRole = authData.role;
        req.token = authData.token;
        next();
    };
};

/**
 * Middleware for service-to-service authentication
 * Uses API key or service token
 */
const requireServiceAuth = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    const expectedKey = process.env.SERVICE_API_KEY;

    if (!apiKey || apiKey !== expectedKey) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Valid service API key required'
        });
    }

    req.isServiceCall = true;
    next();
};

module.exports = {
    requireAuth,
    requireRole,
    requireServiceAuth,
    verifyToken,
    ROLES
};
