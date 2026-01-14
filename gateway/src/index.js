require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration - allow frontend origins
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://airline-customer.vercel.app',
  'https://airline-admin.vercel.app',
  // Allow any vercel.app subdomain
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);

    // Allow any vercel.app domain
    if (origin.endsWith('.vercel.app')) return callback(null, true);

    // Allow localhost
    if (origin.includes('localhost')) return callback(null, true);

    // Allow any onrender.com domain  
    if (origin.endsWith('.onrender.com')) return callback(null, true);

    // Check explicit list
    if (allowedOrigins.includes(origin)) return callback(null, true);

    // Allow all in development or if ALLOWED_ORIGINS includes the origin
    const envOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || [];
    if (envOrigins.includes(origin) || envOrigins.includes('*')) return callback(null, true);

    // Default: allow (for flexibility during development/demo)
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'X-Requested-With'],
  credentials: true
};
app.use(cors(corsOptions));

// Service URLs
const FLIGHT_SERVICE_URL = process.env.FLIGHT_SERVICE_URL || 'http://localhost:3001';
const MILES_SERVICE_URL = process.env.MILES_SERVICE_URL || 'http://localhost:3002';
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3003';

// Health check (needs body parsing)
app.get('/health', express.json(), (req, res) => {
  res.json({ status: 'ok', service: 'gateway', timestamp: new Date().toISOString() });
});

// Proxy configuration helper
const createProxy = (target, pathPrefix) => createProxyMiddleware({
  target,
  changeOrigin: true,
  timeout: 120000, // 2 minutes for complex searches
  proxyTimeout: 30000,
  onError: (err, req, res) => {
    console.error(`Proxy error for ${pathPrefix}:`, err.message);
    if (!res.headersSent) {
      res.status(502).json({
        error: 'Service unavailable',
        message: `Backend service at ${target} is not responding`,
        details: err.message
      });
    }
  },
  onProxyReq: (proxyReq, req, res) => {
    console.log(`[Gateway] ${req.method} ${req.originalUrl} -> ${target}${req.url}`);
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log(`[Gateway] Response: ${proxyRes.statusCode} for ${req.originalUrl}`);
  }
});

// Proxy routes - Admin endpoints (flight-service)
app.use('/api/v1/admin', createProxy(FLIGHT_SERVICE_URL, '/api/v1/admin'));

// Proxy routes - Flight search endpoints (flight-service)
app.use('/api/v1/flights', createProxy(FLIGHT_SERVICE_URL, '/api/v1/flights'));

// Proxy routes - Ticket endpoints (flight-service)
app.use('/api/v1/tickets', createProxy(FLIGHT_SERVICE_URL, '/api/v1/tickets'));

// Proxy routes - Bookings endpoints (flight-service)
app.use('/api/v1/bookings', createProxy(FLIGHT_SERVICE_URL, '/api/v1/bookings'));

// Proxy routes - Miles endpoints (miles-service)
app.use('/api/v1/miles', createProxy(MILES_SERVICE_URL, '/api/v1/miles'));

// Proxy routes - Notification endpoints (notification-service)
app.use('/api/v1/notifications', createProxy(NOTIFICATION_SERVICE_URL, '/api/v1/notifications'));

// 404 handler for unmatched routes
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.originalUrl });
});

app.listen(PORT, () => {
  console.log('🚀 API Gateway running on http://localhost:' + PORT);
  console.log('   Proxying to:');
  console.log('   - Flight Service: ' + FLIGHT_SERVICE_URL);
  console.log('   - Miles Service: ' + MILES_SERVICE_URL);
  console.log('   - Notification Service: ' + NOTIFICATION_SERVICE_URL);
});
