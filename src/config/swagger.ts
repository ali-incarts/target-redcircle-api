/**
 * @fileoverview Swagger/OpenAPI configuration for API documentation
 * @description Configures swagger-jsdoc to generate OpenAPI 3.0 specification
 * from JSDoc comments in route handlers and controllers
 * @module config/swagger
 */

import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Target RedCircle API - Smart Product Selection',
      version: '1.0.0',
      description: `
Backend API for intelligent Target product selection with automatic backup substitution.

**Key Features:**
- Smart product availability checking via Target RedCircle API
- Automatic backup product substitution when primary products are unavailable
- Store-specific inventory validation
- Two-layer caching system (stock: 5min, products: 1hr)
- Concurrent product checking for optimal performance

**Authentication:**
Requires RedCircle API key configured via environment variable.
      `.trim(),
      contact: {
        name: 'API Support',
        email: 'support@example.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: process.env.NODE_ENV === 'production'
          ? 'https://api.example.com'
          : `http://localhost:${process.env.PORT || 3000}`,
        description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server',
      },
    ],
    tags: [
      {
        name: 'Health',
        description: 'Health check and service status endpoints',
      },
      {
        name: 'Stock',
        description: 'Product availability and smart selection endpoints',
      },
      {
        name: 'Info',
        description: 'API information and metadata',
      },
    ],
    components: {
      schemas: {
        HealthCheckResponse: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              example: 'ok',
              description: 'Health status of the service',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              example: '2025-10-31T12:00:00.000Z',
              description: 'Current server timestamp',
            },
            uptime: {
              type: 'number',
              example: 3600,
              description: 'Server uptime in seconds',
            },
            environment: {
              type: 'string',
              example: 'development',
              description: 'Current environment (development/production)',
            },
            apiKeyConfigured: {
              type: 'boolean',
              example: true,
              description: 'Whether RedCircle API key is configured',
            },
          },
        },
        BackupMapping: {
          type: 'object',
          required: ['primaryId', 'backupIds'],
          properties: {
            primaryId: {
              type: 'string',
              example: '12345678',
              description: '8-digit Target TCIN for primary product',
            },
            backupIds: {
              type: 'array',
              items: { type: 'string' },
              example: ['87654321', '11223344'],
              description: 'Array of 8-digit Target TCINs for backup products (checked in order)',
            },
          },
        },
        SmartSelectRequest: {
          type: 'object',
          required: ['shortLink', 'longLink', 'zipCode'],
          properties: {
            shortLink: {
              type: 'string',
              example: 'https://incarts-us.web.app/xyz123',
              description: 'Short URL for tracking/analytics',
            },
            longLink: {
              type: 'string',
              example: 'https://www.target.com/p/-/A-12345678',
              description: 'Original Target product URL',
            },
            backups: {
              type: 'array',
              items: { $ref: '#/components/schemas/BackupMapping' },
              description: 'Optional backup product mappings for automatic substitution',
            },
            zipCode: {
              type: 'string',
              example: '04457',
              description: '5-digit ZIP code for stock availability checking',
            },
            storeId: {
              type: 'string',
              example: '1771',
              description: 'Optional Target store ID for specific store inventory',
            },
            customUrl: {
              type: 'string',
              example: 'https://fallback.com',
              description: 'Fallback URL when all products are unavailable',
            },
            allowPdp: {
              type: 'boolean',
              example: true,
              description: 'Allow Product Detail Page (PDP) URLs when cart URLs unavailable',
            },
          },
        },
        ProductInfo: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: '87654321',
              description: 'Target TCIN',
            },
            title: {
              type: 'string',
              example: 'Sample Product Name',
              description: 'Product title',
            },
            url: {
              type: 'string',
              example: 'https://www.target.com/p/-/A-87654321',
              description: 'Product page URL',
            },
            available: {
              type: 'boolean',
              example: true,
              description: 'Whether product is available at the specified location',
            },
          },
        },
        SmartSelectResponse: {
          type: 'object',
          properties: {
            redirectUrl: {
              type: 'string',
              example: 'https://www.target.com/p/-/A-87654321',
              description: 'Final URL to redirect user to',
            },
            backupsUsed: {
              type: 'boolean',
              example: true,
              description: 'Whether backup substitution was applied',
            },
            backupProducts: {
              type: 'array',
              items: { $ref: '#/components/schemas/ProductInfo' },
              description: 'Details of backup products that were checked',
            },
            allProductsUnavailable: {
              type: 'boolean',
              example: false,
              description: 'Whether all products (primary + backups) were unavailable',
            },
            cartUrlType: {
              type: 'string',
              enum: ['cart', 'pdp', 'custom'],
              example: 'pdp',
              description: 'Type of URL returned (cart add, product page, or custom fallback)',
            },
            storeIdAttached: {
              type: 'string',
              example: '1771',
              description: 'Store ID included in the URL (if applicable)',
            },
            cartOptionsSummary: {
              type: 'object',
              description: 'Summary of cart URL generation options attempted',
            },
          },
        },
        ApiInfo: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              example: 'Target RedCircle API - Smart Product Selection',
            },
            version: {
              type: 'string',
              example: '1.0.0',
            },
            description: {
              type: 'string',
            },
            endpoints: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  method: { type: 'string' },
                  path: { type: 'string' },
                  description: { type: 'string' },
                },
              },
            },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                message: {
                  type: 'string',
                  example: 'Invalid request parameters',
                },
                code: {
                  type: 'string',
                  example: 'VALIDATION_ERROR',
                },
                details: {
                  type: 'object',
                  description: 'Additional error details (development only)',
                },
              },
            },
          },
        },
      },
    },
  },
  apis: ['./src/index.ts', './src/controllers/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
