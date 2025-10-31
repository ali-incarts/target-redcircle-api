/**
 * @fileoverview Express server entry point for Target RedCircle API backend
 * @description Sets up Express server with routes, middleware, and error handling
 * @module index
 * @related controllers/stock.ts
 */

import express, {
  Application, Request, Response, NextFunction,
} from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import { smartProductSelect, healthCheck } from './controllers/stock';
import { swaggerSpec } from './config/swagger';

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
  }),
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
// API Documentation
// ============================================================================

/**
 * Swagger UI
 * Serves interactive API documentation at /api-docs
 */
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Target RedCircle API - Documentation',
}));

/**
 * Swagger JSON specification
 * Returns raw OpenAPI spec at /api-docs.json
 */
app.get('/api-docs.json', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// ============================================================================
// Routes
// ============================================================================

/**
 * @swagger
 * /:
 *   get:
 *     summary: API information
 *     description: Returns basic API metadata and available endpoints
 *     tags: [Info]
 *     responses:
 *       200:
 *         description: API information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiInfo'
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
    documentation: {
      interactive: 'http://localhost:3000/api-docs',
      openapi: 'http://localhost:3000/api-docs.json',
    },
  });
});

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check
 *     description: Returns server health status, uptime, and configuration info
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Server is healthy and running
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthCheckResponse'
 *             example:
 *               status: ok
 *               timestamp: "2025-10-31T12:00:00.000Z"
 *               uptime: 3600
 *               environment: development
 *               apiKeyConfigured: true
 */
app.get('/api/health', healthCheck);

/**
 * @swagger
 * /api/stock/smart-select:
 *   post:
 *     summary: Smart product selection with backup substitution
 *     description: |
 *       Intelligently selects the best available Target product based on inventory.
 *
 *       **Features:**
 *       - Checks primary product availability at specified location (ZIP code or store)
 *       - Automatically substitutes first available backup if primary unavailable
 *       - Generates optimized cart/PDP URLs with store information
 *       - Falls back to custom URL if all products unavailable
 *       - Uses aggressive caching to minimize API costs
 *
 *       **Algorithm:**
 *       1. Check primary product stock at location
 *       2. If unavailable, iterate through backup products in order
 *       3. Return first available product with appropriate URL
 *       4. If all unavailable, return custom fallback URL or original
 *     tags: [Stock]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SmartSelectRequest'
 *           example:
 *             shortLink: "https://incarts-us.web.app/xyz123"
 *             longLink: "https://www.target.com/p/-/A-12345678"
 *             backups:
 *               - primaryId: "12345678"
 *                 backupIds: ["87654321", "11223344"]
 *             zipCode: "04457"
 *             storeId: "1771"
 *             customUrl: "https://fallback.example.com"
 *             allowPdp: true
 *     responses:
 *       200:
 *         description: Product selection completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SmartSelectResponse'
 *             examples:
 *               backupUsed:
 *                 summary: Backup product substituted
 *                 value:
 *                   redirectUrl: "https://www.target.com/p/-/A-87654321"
 *                   backupsUsed: true
 *                   backupProducts:
 *                     - id: "87654321"
 *                       title: "Alternative Product"
 *                       url: "https://www.target.com/p/-/A-87654321"
 *                       available: true
 *                   allProductsUnavailable: false
 *                   cartUrlType: "pdp"
 *                   storeIdAttached: "1771"
 *               primaryUsed:
 *                 summary: Primary product available
 *                 value:
 *                   redirectUrl: "https://www.target.com/p/-/A-12345678"
 *                   backupsUsed: false
 *                   allProductsUnavailable: false
 *                   cartUrlType: "cart"
 *                   storeIdAttached: "1771"
 *               allUnavailable:
 *                 summary: All products unavailable, custom fallback used
 *                 value:
 *                   redirectUrl: "https://fallback.example.com"
 *                   backupsUsed: false
 *                   allProductsUnavailable: true
 *                   cartUrlType: "custom"
 *       400:
 *         description: Invalid request parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error:
 *                 message: "Invalid zipCode format. Must be 5 digits."
 *                 code: "VALIDATION_ERROR"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error:
 *                 message: "Failed to fetch product data from Target API"
 *                 code: "API_ERROR"
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
      '⚠️  WARNING: TARGET_API_KEY not set in environment variables. '
      + 'API calls will fail. Please set it in your .env file.',
    );
  }

  // Start listening
  app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('🎯 Target RedCircle API Backend');
    console.log('='.repeat(60));
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Server running on: http://localhost:${PORT}`);
    console.log(`\n📖 API Documentation: http://localhost:${PORT}/api-docs`);
    console.log(`OpenAPI Spec: http://localhost:${PORT}/api-docs.json`);
    console.log('\n🔍 Endpoints:');
    console.log(`  Health check: GET http://localhost:${PORT}/api/health`);
    console.log(`  Smart select: POST http://localhost:${PORT}/api/stock/smart-select`);
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
