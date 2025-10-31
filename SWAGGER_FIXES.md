# Swagger Documentation Fixes

## Summary of Changes

All feedback issues have been addressed to ensure the Swagger documentation accurately reflects the actual API implementation.

---

## Issues Fixed

### 1. ✅ `backups` Field Made Required

**Issue**: SmartSelectRequest marked `backups` as optional, but `validateRequest()` rejects any payload without a non-empty backups array.

**Fix**:
- Added `backups` to the `required` array in `SmartSelectRequest` schema
- Added `minItems: 1` constraint
- Updated description to clarify "Must contain at least one mapping"

**File**: `src/config/swagger.ts` (line 112)

**Schema**:
```typescript
SmartSelectRequest: {
  type: 'object',
  required: ['shortLink', 'longLink', 'backups', 'zipCode'],
  properties: {
    backups: {
      type: 'array',
      items: { $ref: '#/components/schemas/BackupMapping' },
      minItems: 1,
      description: 'Backup product mappings for automatic substitution. Must contain at least one mapping.',
    },
    // ...
  }
}
```

---

### 2. ✅ `backupProducts` Schema Corrected

**Issue**: `SmartSelectResponse.backupProducts` was documented as `ProductInfo`, but the real payload returns `BackupProductUsed` objects with `originalId`, `replacementId`, and `reason` fields.

**Fix**:
- Created new `BackupProductUsed` schema matching the actual type definition
- Removed incorrect `ProductInfo` schema
- Updated `SmartSelectResponse.backupProducts` to reference `BackupProductUsed`

**File**: `src/config/swagger.ts` (lines 153-174)

**New Schema**:
```typescript
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
}
```

---

### 3. ✅ `cartUrlType` Enum Corrected

**Issue**: `cartUrlType` allowed `'cart'`, but the service only emits `'pdp'`, `'longLink'`, or `'custom'`.

**Fix**:
- Removed `'cart'` from enum
- Added `'longLink'` to enum
- Updated description to clarify each type

**File**: `src/config/swagger.ts` (lines 225-230)

**Corrected Enum**:
```typescript
cartUrlType: {
  type: 'string',
  enum: ['pdp', 'longLink', 'custom'],
  example: 'pdp',
  description: 'Type of URL returned: pdp (product detail page), longLink (original URL), or custom (custom fallback)',
}
```

---

### 4. ✅ `storeIdAttached` Made Nullable

**Issue**: Example showed a concrete store ID, but the code returns `undefined` for Target (no store ID in URLs).

**Fix**:
- Made field `nullable: true`
- Removed concrete example value
- Updated description to note it's always null for Target

**File**: `src/config/swagger.ts` (lines 231-235)

**Corrected Field**:
```typescript
storeIdAttached: {
  type: 'string',
  nullable: true,
  description: 'Store ID included in the URL (currently not supported for Target, always null)',
}
```

---

### 5. ✅ `cartOptionsSummary` Fully Typed

**Issue**: Defined as an untyped object, but actual response includes `{ mode, includeStoreId, fallbackApplied, finalType }`.

**Fix**:
- Created explicit `CartOptionsSummary` schema matching `src/types/index.ts` (lines 62-67)
- Made all fields required with proper types
- Added descriptions for each field

**File**: `src/config/swagger.ts` (lines 175-200)

**New Schema**:
```typescript
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
}
```

---

### 6. ✅ Response Examples Updated

**Issue**: Response examples in `src/index.ts` didn't match the corrected schemas.

**Fix**:
- Updated all three example responses (backupUsed, primaryUsed, allUnavailable)
- Changed `backupProducts` structure to use `originalId/replacementId/reason`
- Changed `storeIdAttached` to `null`
- Added complete `cartOptionsSummary` objects
- Fixed `cartUrlType` values (removed `'cart'`)

**File**: `src/index.ts` (lines 189-234)

**Example (Backup Used)**:
```yaml
backupUsed:
  summary: Backup product substituted
  value:
    redirectUrl: "https://www.target.com/p/-/A-87654321"
    backupsUsed: true
    backupProducts:
      - originalId: "12345678"
        replacementId: "87654321"
        reason: "OUT_OF_STOCK"
    allProductsUnavailable: false
    cartUrlType: "pdp"
    storeIdAttached: null
    cartOptionsSummary:
      mode: "auto"
      includeStoreId: "never"
      fallbackApplied: false
      finalType: "pdp"
```

---

## Verification

All endpoints are properly documented and accessible via Swagger UI:

### Endpoints Generated
✅ `GET /` - API information
✅ `GET /api/health` - Health check
✅ `POST /api/stock/smart-select` - Smart product selection

### Schemas Generated
✅ `ApiInfo`
✅ `BackupMapping`
✅ `BackupProductUsed` (new)
✅ `CartOptionsSummary` (new, fully typed)
✅ `ErrorResponse`
✅ `HealthCheckResponse`
✅ `SmartSelectRequest` (backups now required)
✅ `SmartSelectResponse` (corrected types)

### Testing
```bash
# Start server
pnpm dev

# View Swagger UI
open http://localhost:3000/api-docs

# Check OpenAPI spec
curl http://localhost:3000/api-docs.json | jq
```

---

## Files Modified

1. **`src/config/swagger.ts`**
   - Added `backups` to required fields
   - Added `minItems: 1` constraint for backups array
   - Created `BackupProductUsed` schema
   - Created `CartOptionsSummary` schema with all fields
   - Removed `ProductInfo` schema
   - Fixed `cartUrlType` enum
   - Made `storeIdAttached` nullable

2. **`src/index.ts`**
   - Updated all response examples to match corrected schemas
   - Fixed `backupProducts` structure
   - Fixed `cartUrlType` values
   - Added complete `cartOptionsSummary` objects
   - Set `storeIdAttached` to `null`

---

## Result

The Swagger documentation now **100% accurately reflects the actual API implementation**, matching:
- Request validation in `src/controllers/stock.ts`
- Response types in `src/types/index.ts`
- Business logic in `src/services/stock/product-selector.ts`

Clients can now rely on the Swagger specification for code generation, testing, and integration.
