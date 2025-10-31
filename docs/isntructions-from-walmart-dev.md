# Smart Product Selection API - Standardization Document

**Version:** 1.0
**Last Updated:** 2025-10-31
**Purpose:** Standardize product availability checking and backup substitution across multiple retailer backends (Walmart, Target, etc.)

---

## Overview

This document defines the **standard interface** for smart product selection APIs that check real-time inventory availability and perform intelligent product substitutions when items are out of stock.

**Core Functionality:**
1. Check availability for multiple products in a single request
2. Automatically substitute unavailable products with backup alternatives
3. Return a redirect URL with available products
4. Provide detailed substitution analytics

**Implementations:**
- ✅ **Walmart Backend** (walmart-apis) - REFERENCE IMPLEMENTATION
- 🚧 **Target Backend** (target-apis) - TO BE BUILT using this spec

---

## 1. Standard API Endpoint

### Endpoint Definition
```
POST /api/stock/smart-select
Content-Type: application/json
```

### Purpose
Perform intelligent product selection based on real-time availability with automatic backup substitution.

---

## 2. Standard Request Payload

### Complete Request Structure
```json
{
  "shortLink": "https://incarts-us.web.app/PFu3rT_jh",
  "longLink": "https://www.walmart.com/sc/cart/addToCart?items=858434656_1,108931301_2",
  "backups": [
    {
      "primaryId": "858434656",
      "backupIds": ["999999999", "888888888"]
    },
    {
      "primaryId": "108931301",
      "backupIds": ["777777777"]
    }
  ],
  "zipCode": "04457",
  "storeId": "optional-store-id",
  "customUrl": "https://fallback.com/url",
  "allowPdp": false,
  "cartUrlOptions": {
    "mode": "auto",
    "fallbackMode": "items",
    "includeStoreId": "auto",
    "preferItemsForWalmart": true,
    "preferOffersForMarketplace": false
  }
}
```

### Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `shortLink` | string | ✅ Yes | Your application's short URL (for tracking/analytics) |
| `longLink` | string | ✅ Yes | Original retailer cart/product URL (fallback if all products unavailable) |
| `backups` | array | ✅ Yes | Array of product groups with primary and backup product IDs |
| `backups[].primaryId` | string | ✅ Yes | Primary product identifier (Walmart: itemId, Target: TCIN) |
| `backups[].backupIds` | array | ✅ Yes | Ordered array of backup product IDs (checked in order) |
| `zipCode` | string | ✅ Yes | ZIP code for location-based availability (e.g., "04457") |
| `storeId` | string | ❌ No | Optional specific store ID for store-specific inventory |
| `customUrl` | string | ❌ No | Custom fallback URL when all products unavailable |
| `allowPdp` | boolean | ❌ No | Allow redirect to single product detail page (default: false) |
| `cartUrlOptions` | object | ❌ No | Cart URL generation preferences (see below) |

### Cart URL Options (Optional)

```json
{
  "mode": "auto",              // "auto" | "offers" | "items"
  "fallbackMode": "items",     // "offers" | "items"
  "includeStoreId": "auto",    // "never" | "auto" | "always"
  "preferItemsForWalmart": true,
  "preferOffersForMarketplace": false
}
```

| Option | Values | Description |
|--------|--------|-------------|
| `mode` | "auto", "offers", "items" | Cart URL generation strategy |
| `fallbackMode` | "offers", "items" | Fallback if primary mode fails |
| `includeStoreId` | "never", "auto", "always" | Store ID attachment behavior |
| `preferItemsForWalmart` | boolean | Use item-based URLs for Walmart-sold products |
| `preferOffersForMarketplace` | boolean | Use offer-based URLs for marketplace sellers |

**Note for Target:** Since Target doesn't support cart URLs, `cartUrlOptions` should be accepted but have no effect on the redirect URL (always returns product page URL).

---

## 3. Standard Response Structure

### Complete Response
```json
{
  "redirectUrl": "https://www.walmart.com/sc/cart/addToCart?offers=ABC123_1,DEF456_2",
  "backupsUsed": true,
  "backupProducts": [
    {
      "originalId": "858434656",
      "replacementId": "999999999",
      "reason": "OUT_OF_STOCK"
    }
  ],
  "allProductsUnavailable": false,
  "cartUrlType": "offers",
  "storeIdAttached": "1234",
  "cartOptionsSummary": {
    "mode": "auto",
    "includeStoreId": "auto",
    "fallbackApplied": false,
    "finalType": "offers"
  }
}
```

### Field Definitions

| Field | Type | Description |
|-------|------|-------------|
| `redirectUrl` | string | Final URL to redirect user (cart URL, product page, or fallback) |
| `backupsUsed` | boolean | True if any backup products were substituted |
| `backupProducts` | array | List of all substitutions made (empty if none) |
| `backupProducts[].originalId` | string | Original product ID that was unavailable |
| `backupProducts[].replacementId` | string | Backup product ID used as replacement |
| `backupProducts[].reason` | string | "OUT_OF_STOCK" or "PRIMARY_UNUSABLE" |
| `allProductsUnavailable` | boolean | True if no products (primary or backup) were available |
| `cartUrlType` | string | Type of URL generated (see table below) |
| `storeIdAttached` | string | Store ID included in final URL (if any) |
| `cartOptionsSummary` | object | Summary of cart URL generation decisions |
| `cartOptionsSummary.mode` | string | Requested mode ("auto", "offers", "items") |
| `cartOptionsSummary.includeStoreId` | string | Store ID inclusion mode used |
| `cartOptionsSummary.fallbackApplied` | boolean | True if fallback strategy was used |
| `cartOptionsSummary.finalType` | string | Actual URL type generated |

### Cart URL Types

| Type | Description | Walmart Example | Target Example |
|------|-------------|-----------------|----------------|
| `offers` | Offer-based cart URL | `?offers=ABC_1,DEF_2` | N/A (not supported) |
| `items` | Item-based cart URL | `?items=123_1,456_2` | N/A (not supported) |
| `pdp` | Product detail page | `/ip/seort/123456` | `/p/product-name/-/A-78025470` |
| `longLink` | Original long URL | (fallback) | (fallback) |
| `custom` | Custom fallback URL | (user-provided) | (user-provided) |

**Target Implementation:** `cartUrlType` will typically be `"pdp"` (product page) since Target doesn't support add-to-cart URLs.

---

## 4. Core Algorithm - Substitution Logic

### High-Level Flow

```
1. Extract all product IDs (primary + all backups)
   ↓
2. Single bulk availability check for ALL products
   ↓
3. For each primary product:
   a. Check if primary is available AND usable
   b. If NO → Check backups in order [0, 1, 2...]
   c. Use first available backup
   d. If none available → Skip product
   ↓
4. Build redirect URL with selected products
   ↓
5. Return response with substitution details
```

### Detailed Selection Algorithm

```typescript
// Pseudo-code for standard implementation
for each item in request.backups {
  primary = item.primaryId

  // Check primary availability
  if (isAvailable(primary) AND isUsable(primary)) {
    selectedProducts.push(primary)
    continue
  }

  // Primary unavailable - check backups
  let replaced = false
  for each backupId in item.backupIds {
    if (isAvailable(backupId) AND isUsable(backupId)) {
      selectedProducts.push(backupId)
      recordSubstitution(primary, backupId, reason)
      replaced = true
      break  // Stop at first available backup
    }
  }

  if (!replaced) {
    // No products available - skip this item
    recordUnavailable(primary)
  }
}
```

### Availability Criteria

A product is **available and usable** if:
1. ✅ `inStock === true` (or equivalent availability flag)
2. ✅ Required metadata exists (e.g., offerId for Walmart)
3. ✅ No API errors for this product

**Walmart-specific:**
- Must have `stock === 'Available'`
- Must have valid `offerId` (for cart URL generation)

**Target-specific:**
- Must have `In_stock === true` in store stock results
- Must have valid `Stock_level > 0` (recommended)
- `offerId` not required (Target doesn't use it)

---

## 5. Performance Optimization Techniques

### 1. Bulk API Calls
**❌ DON'T:**
```typescript
// Slow: N separate API calls
for (let productId of allProducts) {
  await checkAvailability(productId)
}
```

**✅ DO:**
```typescript
// Fast: Single bulk API call
const allProductIds = [...primaryIds, ...backupIds]
const availability = await checkBatchAvailability(allProductIds, zipCode, storeId)
```

**Implementation Notes:**
- **Walmart:** API supports up to 20 products per call (`?ids=1,2,3...`)
- **Target:** API requires separate calls per TCIN, but use `Promise.all()` for concurrent requests

```typescript
// Target implementation (concurrent but not truly bulk)
const availabilityPromises = allProductIds.map(tcin =>
  checkTargetStoreStock(tcin, zipCode)
)
const results = await Promise.all(availabilityPromises)
```

### 2. Two-Layer Caching

```typescript
// Product cache: 1 hour TTL (product data changes slowly)
productCache = new Cache<ProductData>(3600000)

// Stock cache: 5 minutes TTL (inventory changes frequently)
stockCache = new Cache<AvailabilityData>(300000)

// Cache key structure
cacheKey = `stock:${zipCode}:${storeId}:${sortedProductIds.join(',')}`
```

**Cache Strategy:**
1. Check cache before API call
2. Return cached data if valid (not expired)
3. On cache miss, fetch from API
4. Store result in cache before returning

### 3. Map-Based Lookups (O(1) Access)

**❌ DON'T:**
```typescript
// Slow: O(n) array search for each lookup
const product = availabilityArray.find(p => p.id === searchId)
```

**✅ DO:**
```typescript
// Fast: O(1) Map lookup
const availabilityMap = new Map()
availabilityArray.forEach(product => {
  // Store multiple key types for flexible lookup
  availabilityMap.set(product.id, product)           // Original type
  availabilityMap.set(product.id.toString(), product) // String
  availabilityMap.set(Number(product.id), product)    // Number
})

const product = availabilityMap.get(searchId) // O(1) lookup
```

### 4. Short-Circuit Evaluation

```typescript
// Stop checking backups once first available is found
for (let backupId of item.backupIds) {
  if (isAvailable(backupId)) {
    selectedProducts.push(backupId)
    break // ✅ Don't check remaining backups
  }
}
```

### 5. Graceful Error Handling

```typescript
// Don't crash on API errors - treat as unavailable
try {
  availability = await checkAvailability(productId)
} catch (error) {
  if (error.code === 'NOT_FOUND' || error.code === 6001) {
    // Treat as unavailable, continue processing
    availability = { inStock: false, quantity: 0 }
  } else {
    throw error // Re-throw unexpected errors
  }
}
```

---

## 6. Walmart Backend Reference Implementation

### File Structure
```
src/
├── controllers/
│   └── stock.ts                 # Entry point: smartProductSelect()
├── services/
│   ├── stock/
│   │   ├── availability.ts      # Bulk availability check
│   │   └── product-selector.ts  # Substitution algorithm
│   └── walmart/
│       └── products.ts          # Walmart API calls
└── utils/
    └── cache.ts                 # Caching utilities
```

### Key Functions

**1. Controller Entry Point** (`src/controllers/stock.ts:179`)
```typescript
export async function smartProductSelect(req: Request, res: Response)
```
- Validates request payload
- Extracts parameters
- Calls service layer
- Returns standardized response

**2. Availability Check** (`src/services/stock/availability.ts:42`)
```typescript
export async function checkBatchAvailability(params: StockCheckParams)
```
- Single bulk API call for all products
- Caching with smart cache keys
- Returns availability for each product

**3. Product Selection** (`src/services/stock/product-selector.ts:216`)
```typescript
export async function selectAvailableProducts(
  request: SmartSelectionRequest,
  zipCode: string,
  storeId?: string
)
```
- Implements substitution algorithm
- Builds redirect URL
- Logs analytics events
- Returns standardized response

**4. Walmart API Integration** (`src/services/walmart/products.ts:268`)
```typescript
export async function getProductsByIds(productIds: string[], options?)
```
- Bulk fetch up to 20 products
- Handles API errors gracefully
- Caches results

---

## 7. Target Backend Implementation Guide

### API Differences vs Walmart

| Feature | Walmart API | Target RedCircle API |
|---------|-------------|----------------------|
| **Product ID** | itemId (numeric) | TCIN (8-digit string) |
| **Bulk Lookup** | ✅ Up to 20 per call | ❌ One TCIN at a time |
| **Stock Check** | Included in product data | Separate `type=store_stock` call |
| **Add-to-Cart** | ✅ Cart URLs supported | ❌ Product pages only |
| **Offer ID** | Required for cart URLs | N/A (not applicable) |
| **Store Stock** | Via product endpoint | Via dedicated store_stock endpoint |

### Target API Calls Required

**1. Bulk Product Availability (Concurrent)**
```typescript
// One call per TCIN (use Promise.all for concurrency)
const stockPromises = tcinArray.map(tcin =>
  fetch(`https://api.redcircleapi.com/request?` +
        `api_key=${apiKey}` +
        `&type=store_stock` +
        `&tcin=${tcin}` +
        `&store_stock_zipcode=${zipCode}`)
)
const results = await Promise.all(stockPromises)
```

**Response Structure:**
```json
{
  "Store_stock_results": [
    {
      "Position": 1,
      "Store_name": "Cedar Rapids South",
      "Store_id": "1771",
      "In_stock": true,
      "Stock_level": 13,
      "Distance": 1.58
    }
  ]
}
```

**2. Product Details (If Needed)**
```typescript
// Get product metadata (price, images, etc.)
fetch(`https://api.redcircleapi.com/request?` +
      `api_key=${apiKey}` +
      `&type=product` +
      `&tcin=${tcin}`)
```

### Implementation Strategy

#### Step 1: Map Standardized Payload to Target Format
```typescript
// Input: Standard payload with primaryId/backupIds
// Output: Array of TCINs to check

const allTCINs = request.backups.flatMap(item =>
  [item.primaryId, ...item.backupIds]
)
```

#### Step 2: Concurrent Stock Checks
```typescript
// Check all TCINs concurrently (not truly bulk, but parallel)
const stockResults = await Promise.all(
  allTCINs.map(tcin =>
    checkTargetStoreStock(tcin, zipCode, storeId)
  )
)
```

#### Step 3: Build Availability Map
```typescript
// Transform Target API responses into standard format
const availabilityMap = new Map()

stockResults.forEach(result => {
  const availability = {
    productId: result.tcin,
    inStock: result.Store_stock_results?.[0]?.In_stock || false,
    availableQuantity: result.Store_stock_results?.[0]?.Stock_level || 0,
    // Target doesn't use offerIds
    offerId: undefined,
    offerType: 'TARGET_PRODUCT'
  }

  // Store with multiple key types
  availabilityMap.set(result.tcin, availability)
  availabilityMap.set(Number(result.tcin), availability)
})
```

#### Step 4: Apply Same Substitution Algorithm
```typescript
// Identical to Walmart - check primary, then backups in order
const { selectedProducts, backupProductsUsed } =
  performProductSelection(request, availabilityMap)
```

#### Step 5: Generate Target Product Page URL
```typescript
// Target only supports product page URLs
if (selectedProducts.length === 1) {
  // Single product: direct product page
  const tcin = selectedProducts[0].productId
  redirectUrl = `https://www.target.com/p/-/A-${tcin}`
  cartUrlType = 'pdp'
} else if (selectedProducts.length > 1) {
  // Multiple products: send to first product or custom URL
  // Target doesn't support multi-product cart URLs
  redirectUrl = request.customUrl || request.longLink
  cartUrlType = request.customUrl ? 'custom' : 'longLink'
} else {
  // No products available: fallback
  redirectUrl = request.customUrl || request.longLink
  cartUrlType = request.customUrl ? 'custom' : 'longLink'
  allProductsUnavailable = true
}
```

#### Step 6: Return Standardized Response
```typescript
return {
  redirectUrl,
  backupsUsed: backupProductsUsed.length > 0,
  backupProducts: backupProductsUsed,
  allProductsUnavailable,
  cartUrlType, // Will be 'pdp', 'custom', or 'longLink'
  storeIdAttached: storeId,
  cartOptionsSummary: {
    mode: 'pdp', // Target always uses product pages
    includeStoreId: 'never',
    fallbackApplied: false,
    finalType: cartUrlType
  }
}
```

### Store Selection Logic (Target-Specific)

Target's `store_stock` endpoint returns up to 20 stores sorted by distance. You should:

**Option 1: Use Closest In-Stock Store**
```typescript
// Find closest store that has the product
const inStockStore = storeResults.find(store =>
  store.In_stock && store.Stock_level > 0
)
const storeId = inStockStore?.Store_id
```

**Option 2: Use User-Specified Store (If Provided)**
```typescript
// If storeId provided in request, check that specific store
if (request.storeId) {
  const specifiedStore = storeResults.find(s =>
    s.Store_id === request.storeId
  )
  availability = specifiedStore?.In_stock || false
}
```

**Recommendation:** Use Option 1 (closest store) if no storeId provided, Option 2 if storeId specified.

---

## 8. API Rate Limiting & Cost Optimization

### Walmart API
- Built-in rate limits (check Walmart docs)
- Batch endpoint reduces API calls significantly

### Target RedCircle API
- **Cost:** 1 credit per request
- **No bulk endpoint** → More expensive for multi-product checks
- **Optimization strategies:**

1. **Aggressive Caching**
   ```typescript
   // Cache store stock for 5 minutes
   const STOCK_CACHE_TTL = 300000
   stockCache.set(cacheKey, result, STOCK_CACHE_TTL)
   ```

2. **Only Check Required Products**
   ```typescript
   // Don't check backup[1] if backup[0] is available
   // Short-circuit as soon as possible
   ```

3. **Batch Requests in Collections API (High Volume)**
   ```typescript
   // For scheduled/bulk operations
   // Use RedCircle Collections API (up to 15,000 requests)
   // Runs concurrently on their infrastructure
   ```

4. **Smart Store Selection**
   ```typescript
   // Only query 1 closest store if acceptable
   // Instead of checking all 20 stores returned
   ```

---

## 9. Error Handling Standards

### Standard Error Response Format
```json
{
  "error": {
    "code": "PRODUCT_NOT_FOUND",
    "message": "Product with ID 12345 not found",
    "details": {
      "productId": "12345",
      "retailer": "walmart"
    }
  }
}
```

### Error Handling Rules

1. **Missing Product → Treat as Unavailable**
   ```typescript
   // Don't fail entire request if one product missing
   if (error.code === 'NOT_FOUND') {
     availability = { inStock: false, quantity: 0 }
   }
   ```

2. **API Rate Limit → Return Cached or Fail Gracefully**
   ```typescript
   if (error.code === 'RATE_LIMIT_EXCEEDED') {
     // Try to return cached data even if stale
     return cachedData || fallbackResponse
   }
   ```

3. **Invalid Request → Return 400 with Details**
   ```typescript
   if (!request.backups || request.backups.length === 0) {
     throw new BadRequestError('backups array is required')
   }
   ```

4. **Server Error → Return 500 with Retry Info**
   ```typescript
   if (error.code === 'SERVER_ERROR') {
     throw new InternalServerError('Retailer API unavailable', {
       retryAfter: 60,
       canRetry: true
     })
   }
   ```

---

## 10. Testing Checklist

### Unit Tests

- [ ] Substitution algorithm (primary available)
- [ ] Substitution algorithm (backup[0] used)
- [ ] Substitution algorithm (backup[2] used after [0] and [1] fail)
- [ ] All products unavailable scenario
- [ ] Cache hit scenario
- [ ] Cache miss scenario
- [ ] Missing offerId/metadata handling
- [ ] Invalid payload validation

### Integration Tests

- [ ] End-to-end smart-select with real API
- [ ] Multi-product request (3+ products)
- [ ] Mixed scenario (some primary, some backup)
- [ ] Rate limiting behavior
- [ ] Timeout handling
- [ ] Store ID attachment

### Load Tests

- [ ] 100 concurrent requests
- [ ] Cache hit rate under load
- [ ] API error rate under load
- [ ] Response time p95, p99

---

## 11. Analytics & Logging

### Required Log Events

**1. Substitution Event**
```json
{
  "event": "product_substitution",
  "timestamp": "2025-10-31T12:00:00Z",
  "shortLink": "https://incarts-us.web.app/PFu3rT_jh",
  "primaryProductId": "858434656",
  "replacementProductId": "999999999",
  "reason": "OUT_OF_STOCK",
  "zipCode": "04457",
  "storeId": "1234"
}
```

**2. All Products Unavailable**
```json
{
  "event": "all_products_unavailable",
  "timestamp": "2025-10-31T12:00:00Z",
  "shortLink": "https://incarts-us.web.app/PFu3rT_jh",
  "primaryProductIds": ["858434656", "108931301"],
  "zipCode": "04457",
  "fallbackUrl": "https://fallback.com/url"
}
```

**3. API Performance**
```json
{
  "event": "api_call",
  "endpoint": "/api/stock/smart-select",
  "duration_ms": 342,
  "cache_hit": false,
  "products_checked": 6,
  "substitutions": 1
}
```

---

## 12. Migration Checklist (Existing Code → Standardized)

### For New Target Backend

- [ ] Clone Walmart backend structure
- [ ] Replace Walmart API client with RedCircle API client
- [ ] Adapt `getProductsByIds()` to concurrent Target API calls
- [ ] Update availability check to use `store_stock` endpoint
- [ ] Remove offer ID logic (not applicable to Target)
- [ ] Update redirect URL logic (product pages only)
- [ ] Implement store selection logic
- [ ] Keep substitution algorithm identical
- [ ] Keep request/response format identical
- [ ] Add Target-specific error handling
- [ ] Update tests with Target data structures

### For Existing Walmart Backend

- [ ] Verify payload matches specification above
- [ ] Verify response matches specification above
- [ ] Update any non-standard fields
- [ ] Add missing analytics events
- [ ] Document any Walmart-specific extensions

---

## 13. Advanced Optimizations (Optional)

### 1. Predictive Pre-caching
```typescript
// Pre-fetch common backup products before they're requested
if (substitutionRate > 0.3) {
  // High substitution rate - pre-cache backup products
  schedulePrefetch(commonBackupIds, popularZipCodes)
}
```

### 2. Smart Backup Ordering
```typescript
// Reorder backups based on historical availability
const orderedBackups = item.backupIds.sort((a, b) =>
  historicalAvailability[b] - historicalAvailability[a]
)
```

### 3. Multi-Store Fallback (Target)
```typescript
// If closest store out of stock, check next closest
for (let store of storeResults.slice(0, 5)) {
  if (store.In_stock && store.Stock_level > 0) {
    return { storeId: store.Store_id, available: true }
  }
}
```

### 4. Parallel Store Checks
```typescript
// Check multiple stores simultaneously for faster results
const storeChecks = preferredStores.map(storeId =>
  checkAvailability(productId, zipCode, storeId)
)
const firstAvailable = await Promise.race(
  storeChecks.map(p => p.then(r => r.inStock ? r : Promise.reject()))
)
```

### 5. Dynamic Cache TTL
```typescript
// Shorter TTL during high-demand periods (holidays)
const isHighDemand = isHolidaySeason() || isPeakHours()
const cacheTTL = isHighDemand ? 60000 : 300000
```

---

## 14. Common Pitfalls & Solutions

### Pitfall 1: Inconsistent Product ID Types
**Problem:** Mixing string "123" and number 123 breaks Map lookups

**Solution:** Store both types in availability map
```typescript
availabilityMap.set(productId, data)           // Original
availabilityMap.set(productId.toString(), data) // String
availabilityMap.set(Number(productId), data)    // Number
```

### Pitfall 2: Not Short-Circuiting Backup Checks
**Problem:** Checking all backups even after finding available one

**Solution:** Break immediately after finding first available
```typescript
for (let backup of backups) {
  if (isAvailable(backup)) {
    select(backup)
    break // ✅ Stop checking
  }
}
```

### Pitfall 3: Cache Key Collisions
**Problem:** Same product, different ZIP codes share cache

**Solution:** Include all differentiating factors in cache key
```typescript
const cacheKey = `stock:${zipCode}:${storeId}:${sortedIds.join(',')}`
```

### Pitfall 4: Ignoring Quantity in Availability
**Problem:** Product "in stock" but quantity = 0

**Solution:** Check both flags
```typescript
const isAvailable = product.inStock && product.quantity > 0
```

### Pitfall 5: Failing Entire Request on One Bad Product
**Problem:** One missing product crashes entire batch

**Solution:** Treat missing products as unavailable, continue
```typescript
try {
  availability = await check(productId)
} catch {
  availability = { inStock: false, quantity: 0 }
}
```

---

## 15. Version History

### v1.0 (2025-10-31)
- Initial specification based on Walmart backend analysis
- Standardized request/response formats
- Target RedCircle API adaptation guide
- Performance optimization techniques
- Testing and error handling standards

---

## 16. Support & Questions

### Implementation Questions
- **Walmart Backend:** See `/src/services/stock/` for reference implementation
- **Target Backend:** Follow Section 7 adaptation guide

### Standard Clarifications
- Open an issue in the project repository
- Tag with `standardization` label

### API-Specific Questions
- **Walmart:** Check `/instructional-docs/api-documentation`
- **Target RedCircle:** https://docs.trajectdata.com/redcircleapi

---

**END OF SPECIFICATION**
