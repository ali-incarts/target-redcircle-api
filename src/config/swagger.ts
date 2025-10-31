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
        name: 'Products',
        description: 'Product information retrieval and search endpoints',
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
          required: ['shortLink', 'longLink', 'backups', 'zipCode'],
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
              minItems: 1,
              description: 'Backup product mappings for automatic substitution. Must contain at least one mapping.',
            },
            zipCode: {
              type: 'string',
              example: '04457',
              pattern: '^[0-9]{5}$',
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
        BackupProductUsed: {
          type: 'object',
          required: ['originalId', 'replacementId', 'reason'],
          properties: {
            originalId: {
              type: 'string',
              example: '12345678',
              description: 'Original primary product TCIN that was unavailable',
            },
            replacementId: {
              type: 'string',
              example: '87654321',
              description: 'Backup product TCIN that was substituted',
            },
            reason: {
              type: 'string',
              enum: ['OUT_OF_STOCK', 'PRIMARY_UNUSABLE'],
              example: 'OUT_OF_STOCK',
              description: 'Reason for substitution',
            },
          },
        },
        CartOptionsSummary: {
          type: 'object',
          required: ['mode', 'includeStoreId', 'fallbackApplied', 'finalType'],
          properties: {
            mode: {
              type: 'string',
              example: 'auto',
              description: 'Cart URL generation mode that was used',
            },
            includeStoreId: {
              type: 'string',
              example: 'never',
              description: 'Store ID inclusion policy (never/auto/always)',
            },
            fallbackApplied: {
              type: 'boolean',
              example: false,
              description: 'Whether fallback logic was applied',
            },
            finalType: {
              type: 'string',
              example: 'pdp',
              description: 'Final URL type that was generated',
            },
          },
        },
        SmartSelectResponse: {
          type: 'object',
          required: ['redirectUrl', 'backupsUsed', 'backupProducts', 'allProductsUnavailable', 'cartUrlType', 'cartOptionsSummary'],
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
              items: { $ref: '#/components/schemas/BackupProductUsed' },
              description: 'List of backup substitutions that were made',
            },
            allProductsUnavailable: {
              type: 'boolean',
              example: false,
              description: 'Whether all products (primary + backups) were unavailable',
            },
            cartUrlType: {
              type: 'string',
              enum: ['pdp', 'longLink', 'custom'],
              example: 'pdp',
              description: 'Type of URL returned: pdp (product detail page), longLink (original URL), or custom (custom fallback)',
            },
            storeIdAttached: {
              type: 'string',
              nullable: true,
              description: 'Store ID included in the URL (currently not supported for Target, always null)',
            },
            cartOptionsSummary: {
              $ref: '#/components/schemas/CartOptionsSummary',
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
        ProductDetails: {
          type: 'object',
          properties: {
            Tcin: {
              type: 'string',
              example: '78025470',
              description: 'Target product TCIN',
            },
            Title: {
              type: 'string',
              example: 'Sample Product Title',
            },
            Link: {
              type: 'string',
              example: 'https://www.target.com/p/-/A-78025470',
            },
            Brand: {
              type: 'string',
              example: 'Example Brand',
            },
            Main_image: {
              type: 'string',
              example: 'https://example.com/image.jpg',
            },
            Rating: {
              type: 'number',
              example: 4.5,
            },
            Ratings_total: {
              type: 'number',
              example: 123,
            },
            Price: {
              type: 'object',
              properties: {
                value: { type: 'number', example: 19.99 },
                currency: { type: 'string', example: 'USD' },
                currency_symbol: { type: 'string', example: '$' },
              },
            },
            Description: {
              type: 'string',
            },
            Feature_bullets: {
              type: 'array',
              items: { type: 'string' },
            },
            Availability: {
              type: 'object',
              properties: {
                raw: { type: 'string' },
                in_stock: { type: 'boolean' },
              },
            },
          },
        },
        ProductResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            data: {
              $ref: '#/components/schemas/ProductDetails',
            },
            request_info: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                credits_used: { type: 'number' },
                credits_remaining: { type: 'number' },
              },
            },
          },
        },
        SearchResultItem: {
          type: 'object',
          properties: {
            position: {
              type: 'number',
              example: 1,
            },
            product: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                link: { type: 'string' },
                tcin: { type: 'string' },
                brand: { type: 'string' },
                main_image: { type: 'string' },
                rating: { type: 'number' },
                ratings_total: { type: 'number' },
              },
            },
            offers: {
              type: 'object',
              properties: {
                primary: {
                  type: 'object',
                  properties: {
                    price: { type: 'number' },
                    currency_symbol: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        SearchResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            data: {
              type: 'object',
              properties: {
                results: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/SearchResultItem' },
                },
                pagination: {
                  type: 'object',
                  properties: {
                    current_page: { type: 'number' },
                    total_pages: { type: 'number' },
                    total_results: { type: 'number' },
                  },
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
