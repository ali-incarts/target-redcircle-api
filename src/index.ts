/**
 * @fileoverview Express server entry point for Target RedCircle API backend
 * @description Sets up Express server with routes, middleware, and error handling
 * @module index
 * @related controllers/stock.ts
 */

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { smartProductSelect, healthCheck } from './controllers/stock';

// Load environment variables
dotenv.config();

// ============================================================================
// Server Configuration
// ============================================================================

const PORT = process.env.PORT || 3000;
const app: Application = express();

// ============================================================================
// Middleware
// ============================================================================

/**
 * CORS configuration
 * Allow all origins in development, restrict in production
 */
app.use(
  cors({
    origin: process.env.NODE_ENV === 'production'
      ? process.env.ALLOWED_ORIGINS?.split(',') || []
      : '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

/**
 * JSON body parser
 */
app.use(express.json({ limit: '10mb' }));

/**
 * URL-encoded body parser
 */
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/**
 * Request logging middleware (development only)
 */
if (process.env.NODE_ENV === 'development') {
  app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// ============================================================================
// Routes
// ============================================================================

/**
 * Root endpoint
 */
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Target RedCircle API Backend',
    version: '1.0.0',
    description: 'Smart product selection with automatic backup substitution',
    endpoints: {
      health: 'GET /api/health',
      smartSelect: 'POST /api/stock/smart-select',
    },
    documentation: 'https://github.com/your-repo/target-redcircle-api',
  });
});

/**
 * Health check endpoint
 * GET /api/health
 */
app.get('/api/health', healthCheck);

/**
 * Smart product selection endpoint
 * POST /api/stock/smart-select
 *
 * Request body:
 * {
 *   "shortLink": "https://incarts-us.web.app/xyz",
 *   "longLink": "https://www.target.com/...",
 *   "backups": [
 *     { "primaryId": "12345678", "backupIds": ["87654321"] }
 *   ],
 *   "zipCode": "04457",
 *   "storeId": "1771" (optional),
 *   "customUrl": "https://fallback.com" (optional),
 *   "allowPdp": true (optional)
 * }
 */
app.post('/api/stock/smart-select', smartProductSelect);

// ============================================================================
// Error Handling
// ============================================================================

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Endpoint ${req.method} ${req.path} not found`,
      availableEndpoints: {
        root: 'GET /',
        health: 'GET /api/health',
        smartSelect: 'POST /api/stock/smart-select',
      },
    },
  });
});

/**
 * Global error handler
 */
app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Server Error]', error);

  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'development'
        ? error.message
        : 'An unexpected error occurred',
      stack: process.env.NODE_ENV === 'development'
        ? error.stack
        : undefined,
    },
  });
});

// ============================================================================
// Server Startup
// ============================================================================

/**
 * Start the Express server
 */
function startServer(): void {
  // Validate environment variables
  if (!process.env.TARGET_API_KEY && process.env.NODE_ENV !== 'test') {
    console.warn(
      '⚠️  WARNING: TARGET_API_KEY not set in environment variables. ' +
      'API calls will fail. Please set it in your .env file.'
    );
  }

  // Start listening
  app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('🎯 Target RedCircle API Backend');
    console.log('='.repeat(60));
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Server running on: http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
    console.log(`Smart select: POST http://localhost:${PORT}/api/stock/smart-select`);
    console.log('='.repeat(60));

    if (process.env.NODE_ENV === 'development') {
      console.log('\n📚 Development Mode Active');
      console.log('- Verbose logging enabled');
      console.log('- Cache statistics will be logged every 5 minutes');
      console.log('- CORS allows all origins\n');
    }
  });
}

// Start server if this file is run directly
if (require.main === module) {
  startServer();
}

// Export app for testing
export default app;
