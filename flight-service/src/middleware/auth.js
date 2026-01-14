const { supabase } = require('../config/supabase');

// User roles
const ROLES = {
    ADMIN: 'ADMIN',
    MS_MEMBER: 'MS_MEMBER',
    SERVICE_OTHER_AIRLINE: 'SERVICE_OTHER_AIRLINE'
};

/**
 * Extract and verify JWT token from request
 */
const verifyToken = async (req) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.split(' ')[1];

    try {
        // Add timeout for Supabase auth call (3 seconds max)
        let authResult;
        try {
            const authPromise = supabase.auth.getUser(token);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Auth verification timeout after 3 seconds')), 3000)
            );
            
            authResult = await Promise.race([authPromise, timeoutPromise]);
        } catch (timeoutError) {
            console.error('Auth verification timeout:', timeoutError.message);
            return null;
        }

        const { data: { user }, error } = authResult || {};

        if (error || !user) {
            console.log('Auth verification failed:', error?.message || 'No user');
            return null;
        }

        // Get user role from metadata
        const role = user.user_metadata?.role || null;

        return { user, role, token };
    } catch (error) {
        console.error('Token verification error:', error.message || error);
        return null;
    }
};

/**
 * Middleware: Require authentication
 */
const requireAuth = async (req, res, next) => {
    const authData = await verifyToken(req);

    if (!authData) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Valid authentication token required'
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
 * Middleware: Optional auth (attaches user if present but doesn't require it)
 */
const optionalAuth = async (req, res, next) => {
    const authData = await verifyToken(req);

    if (authData) {
        req.user = authData.user;
        req.userRole = authData.role;
        req.token = authData.token;
    }

    next();
};

module.exports = {
    requireAuth,
    requireRole,
    optionalAuth,
    verifyToken,
    ROLES
};
