/**
 * @fileoverview Stock controller for smart product selection
 * @description HTTP request handler for the /api/stock/smart-select endpoint
 * @module controllers/stock
 * @related services/stock/product-selector.ts, types/index.ts
 */

import { Request, Response } from 'express';
import {
  SmartSelectionRequest,
  SmartSelectionResponse,
  ValidationError,
  ApiError,
} from '../types';
import { selectAvailableProducts, logApiPerformance } from '../services/stock/product-selector';

// ============================================================================
// Controller Entry Point
// ============================================================================

/**
 * Smart product selection endpoint handler
 * POST /api/stock/smart-select
 *
 * @param req - Express request
 * @param res - Express response
 *
 * @example
 * POST /api/stock/smart-select
 * {
 *   "shortLink": "https://incarts-us.web.app/xyz",
 *   "longLink": "https://www.target.com/...",
 *   "backups": [
 *     { "primaryId": "12345678", "backupIds": ["87654321"] }
 *   ],
 *   "zipCode": "04457"
 * }
 */
export async function smartProductSelect(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();

  try {
    // Step 1: Validate request payload
    const validationError = validateRequest(req.body);
    if (validationError) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: validationError.message,
          field: validationError.field,
          details: validationError.details,
        },
      });
      return;
    }

    // Step 2: Extract parameters
    const request: SmartSelectionRequest = req.body;
    const { zipCode, storeId } = request;

    if (process.env.NODE_ENV === 'development') {
      console.log('[Controller] Smart select request received:', {
        shortLink: request.shortLink,
        backupGroups: request.backups.length,
        zipCode,
        storeId,
      });
    }

    // Step 3: Call service layer
    const response: SmartSelectionResponse = await selectAvailableProducts(
      request,
      zipCode,
      storeId,
    );

    // Step 4: Log performance metrics
    const durationMs = Date.now() - startTime;
    const totalProducts = request.backups.reduce(
      (sum, group) => sum + 1 + group.backupIds.length,
      0,
    );

    logApiPerformance({
      endpoint: '/api/stock/smart-select',
      durationMs,
      cacheHit: false, // Would need to track this through the stack
      productsChecked: totalProducts,
      substitutions: response.backupProducts.length,
    });

    // Step 5: Return standardized response
    res.status(200).json(response);
  } catch (error) {
    handleControllerError(error, res);
  }
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate smart selection request payload
 *
 * @param body - Request body (unknown, validated at runtime)
 * @returns ValidationError or null if valid
 */
function validateRequest(body: unknown): ValidationError | null {
  // Type guard: ensure body is an object
  if (!body || typeof body !== 'object') {
    return new ValidationError('Request body must be a JSON object', 'body');
  }

  // Now we know body is an object, cast for property access
  const data = body as Record<string, unknown>;

  // Required fields
  if (!data.shortLink || typeof data.shortLink !== 'string') {
    return new ValidationError('shortLink is required and must be a string', 'shortLink');
  }

  if (!data.longLink || typeof data.longLink !== 'string') {
    return new ValidationError('longLink is required and must be a string', 'longLink');
  }

  if (!data.zipCode || typeof data.zipCode !== 'string') {
    return new ValidationError('zipCode is required and must be a string', 'zipCode');
  }

  // Validate ZIP code format (5 digits or 5+4 format)
  if (!/^\d{5}(-\d{4})?$/.test(data.zipCode)) {
    return new ValidationError(
      'zipCode must be in format 12345 or 12345-6789',
      'zipCode',
    );
  }

  // Validate backups array
  if (!data.backups || !Array.isArray(data.backups)) {
    return new ValidationError('backups is required and must be an array', 'backups');
  }

  if (data.backups.length === 0) {
    return new ValidationError('backups array cannot be empty', 'backups');
  }

  // Validate each backup group
  for (let i = 0; i < data.backups.length; i++) {
    const group = data.backups[i];

    if (!group.primaryId || typeof group.primaryId !== 'string') {
      return new ValidationError(
        `backups[${i}].primaryId is required and must be a string`,
        `backups[${i}].primaryId`,
      );
    }

    // Validate TCIN format (8 digits)
    if (!/^\d{8}$/.test(group.primaryId)) {
      return new ValidationError(
        `backups[${i}].primaryId must be an 8-digit TCIN`,
        `backups[${i}].primaryId`,
        { value: group.primaryId },
      );
    }

    if (!group.backupIds || !Array.isArray(group.backupIds)) {
      return new ValidationError(
        `backups[${i}].backupIds is required and must be an array`,
        `backups[${i}].backupIds`,
      );
    }

    // Validate backup TCINs
    for (let j = 0; j < group.backupIds.length; j++) {
      const backupId = group.backupIds[j];

      if (typeof backupId !== 'string') {
        return new ValidationError(
          `backups[${i}].backupIds[${j}] must be a string`,
          `backups[${i}].backupIds[${j}]`,
        );
      }

      if (!/^\d{8}$/.test(backupId)) {
        return new ValidationError(
          `backups[${i}].backupIds[${j}] must be an 8-digit TCIN`,
          `backups[${i}].backupIds[${j}]`,
          { value: backupId },
        );
      }
    }
  }

  // Optional fields validation
  if (data.storeId !== undefined && typeof data.storeId !== 'string') {
    return new ValidationError('storeId must be a string', 'storeId');
  }

  if (data.customUrl !== undefined && typeof data.customUrl !== 'string') {
    return new ValidationError('customUrl must be a string', 'customUrl');
  }

  if (data.allowPdp !== undefined && typeof data.allowPdp !== 'boolean') {
    return new ValidationError('allowPdp must be a boolean', 'allowPdp');
  }

  // cartUrlOptions validation (accept but ignore for Target)
  if (data.cartUrlOptions !== undefined && typeof data.cartUrlOptions !== 'object') {
    return new ValidationError('cartUrlOptions must be an object', 'cartUrlOptions');
  }

  return null;
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Handle controller errors and return appropriate HTTP response
 *
 * @param error - Error object
 * @param res - Express response
 */
function handleControllerError(error: unknown, res: Response): void {
  if (process.env.NODE_ENV === 'development') {
    console.error('[Controller] Error:', error);
  }

  // ValidationError
  if (error instanceof ValidationError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message,
        field: error.field,
        details: error.details,
      },
    });
    return;
  }

  // ApiError
  if (error instanceof ApiError) {
    const statusCode = getHttpStatusFromApiError(error);
    res.status(statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    });
    return;
  }

  // Generic error
  const err = error as Error;
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'development'
        ? err.message
        : 'An unexpected error occurred',
      details: process.env.NODE_ENV === 'development'
        ? { stack: err.stack }
        : undefined,
    },
  });
}

/**
 * Map ApiError code to HTTP status code
 *
 * @param error - ApiError instance
 * @returns HTTP status code
 */
function getHttpStatusFromApiError(error: ApiError): number {
  const code = String(error.code);

  if (code === 'PRODUCT_NOT_FOUND' || code === '404') {
    return 404;
  }

  if (code === 'RATE_LIMIT_EXCEEDED' || code === '429') {
    return 429;
  }

  if (code === 'UNAUTHORIZED' || code === '401' || code === '403') {
    return 401;
  }

  if (code.startsWith('4')) {
    return 400;
  }

  return 500;
}

// ============================================================================
// Health Check Endpoint
// ============================================================================

/**
 * Health check endpoint handler
 * GET /api/health
 *
 * @param _req - Express request (unused)
 * @param res - Express response
 */
export async function healthCheck(_req: Request, res: Response): Promise<void> {
  try {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      apiKeyConfigured: !!process.env.TARGET_API_KEY,
    };

    res.status(200).json(health);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: (error as Error).message,
    });
  }
}
