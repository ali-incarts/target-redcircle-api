# How the Target Backend Works - Quick Reference

**Purpose:** This document explains how the Target RedCircle API backend works in simple, concise terms.

---

## Table of Contents

1. [What This Backend Does](#what-this-backend-does)
2. [The Flow (Step by Step)](#the-flow-step-by-step)
3. [Example Payload & Response](#example-payload--response)
4. [How We Determine "Target Near ZIP Code"](#how-we-determine-target-near-zip-code)
5. [Latency & Performance](#latency--performance)
6. [Real-World Scenarios](#real-world-scenarios)
7. [Required vs Optional Fields](#required-vs-optional-fields)

---

## What This Backend Does

**In one sentence:** Checks if Target products are in stock, and if not, automatically substitutes with backup products.

**Endpoint:** `POST /api/stock/smart-select`

**What you're asking:** "Check if these products are available at Target near this ZIP code. If not, try these backup products instead."

---

## The Flow (Step by Step)

### Step 1: You Send a Request

```json
{
  "shortLink": "https://incarts-us.web.app/abc123",
  "longLink": "https://www.target.com/p/original-product/-/A-12345678",
  "backups": [
    {
      "primaryId": "12345678",
      "backupIds": ["87654321", "11111111"]
    },
    {
      "primaryId": "22222222",
      "backupIds": ["33333333"]
    }
  ],
  "zipCode": "90210"
}
```

**Translation:**
- Check if product **12345678** is in stock near **90210**
- If not, try backup **87654321**, then **11111111**
- Also check product **22222222**
- If not available, try backup **33333333**
- If nothing works, send user to `longLink`

### Step 2: Extract All Product IDs

```
Primary: 12345678, 22222222
Backups: 87654321, 11111111, 33333333

Total to check: 5 products
```

### Step 3: Check Availability (Concurrent)

Makes 5 API calls to Target **at the same time**:

```
12345678 → OUT OF STOCK ❌
87654321 → IN STOCK ✅ (9 units at Store #1234)
11111111 → IN STOCK ✅ (2 units)
22222222 → IN STOCK ✅ (15 units)
33333333 → OUT OF STOCK ❌
```

### Step 4: Smart Selection Algorithm

```
Product Group 1:
├─ Primary 12345678 → ❌ OUT OF STOCK
├─ Try Backup 87654321 → ✅ IN STOCK (USE THIS!)
└─ Skip Backup 11111111 (already found one)

Product Group 2:
└─ Primary 22222222 → ✅ IN STOCK (USE THIS!)

Final Selection: [87654321, 22222222]
```

**Algorithm Logic:**
1. Check if primary is available → **Yes?** Use it
2. If not → Check backups in order [0, 1, 2...]
3. Use first available backup (short-circuit, stop checking others)
4. If none available → Skip this product group

### Step 5: Generate URL

Since we have **2 products** and Target **can't make multi-item cart URLs**:
- ❌ Can't generate Target URL (Target limitation)
- ✅ Fall back to `longLink`

If we had **1 product**, we'd generate:
- ✅ `https://www.target.com/p/-/A-87654321`

---

## Example Payload & Response

### Request Payload

```json
{
  "shortLink": "https://incarts-us.web.app/abc123",
  "longLink": "https://www.target.com/p/original-product/-/A-12345678",
  "backups": [
    {
      "primaryId": "12345678",
      "backupIds": ["87654321", "11111111"]
    }
  ],
  "zipCode": "90210"
}
```

### Response

```json
{
  "redirectUrl": "https://www.target.com/p/-/A-87654321",
  "backupsUsed": true,
  "backupProducts": [
    {
      "originalId": "12345678",
      "replacementId": "87654321",
      "reason": "OUT_OF_STOCK"
    }
  ],
  "allProductsUnavailable": false,
  "cartUrlType": "pdp",
  "storeIdAttached": null,
  "cartOptionsSummary": {
    "mode": "auto",
    "includeStoreId": "never",
    "fallbackApplied": false,
    "finalType": "pdp"
  }
}
```

**Field Explanations:**
- **redirectUrl**: Where to send the user
- **backupsUsed**: `true` = we used backup product(s)
- **backupProducts**: List of substitutions we made
- **allProductsUnavailable**: `false` = we found at least one product
- **cartUrlType**:
  - `pdp` = Target product page
  - `longLink` = Your fallback URL
  - `custom` = Your custom fallback URL
- **storeIdAttached**: Always `null` for Target (URLs don't support store IDs)
- **cartOptionsSummary**:
  - `mode`: What you requested (`auto`, `offers`, `items`)
  - `includeStoreId`: Always `never` for Target
  - `fallbackApplied`: `true` if we used longLink/customUrl instead of Target URL
  - `finalType`: What we actually generated

---

## How We Determine "Target Near ZIP Code"

### Simple Answer

**Target's API does the work for us.**

### The Process

#### 1. We Ask Target's API
```
GET https://api.redcircleapi.com/request
  ?type=store_stock
  &tcin=12345678
  &store_stock_zipcode=90210
```

#### 2. Target Returns Stores (Sorted by Distance)
```json
{
  "Store_stock_results": [
    {
      "Position": 1,
      "Store_id": "1771",
      "Store_name": "Beverly Hills",
      "In_stock": true,
      "Stock_level": 15,
      "Distance": 0.8
    },
    {
      "Position": 2,
      "Store_id": "2134",
      "Store_name": "West Hollywood",
      "In_stock": false,
      "Stock_level": 0,
      "Distance": 2.3
    },
    {
      "Position": 3,
      "Store_id": "1245",
      "Store_name": "Santa Monica",
      "In_stock": true,
      "Stock_level": 8,
      "Distance": 5.7
    }
  ]
}
```

**Already sorted by distance!** Target API handles geocoding and sorting.

### Our Store Selection Logic

**Priority 1: User-Specified Store**
```json
{
  "zipCode": "90210",
  "storeId": "2134"
}
```
→ Use Store #2134 (even if out of stock)

**Priority 2: Closest In-Stock Store**
```javascript
stores.find(s => s.In_stock && s.Stock_level > 0)
```
→ Store #1771 (0.8 miles, 15 units)

**Priority 3: Closest Store (Even If Out)**
```javascript
stores[0]
```
→ Store #1771 (closest, even if unavailable)

### What We DON'T Do

❌ We don't geocode the ZIP ourselves
❌ We don't calculate distances
❌ We don't store Target locations
❌ We don't pick random stores

✅ **We trust Target's API** to give us stores sorted by distance

---

## Latency & Performance

### The Question
**Are we making a single bulk API call for all 5 products?**

### The Answer
**❌ NO - Target's API doesn't support bulk requests.**

### What We Actually Do

**5 Separate API Calls Running Concurrently:**

```typescript
// src/services/target/api.ts

const stockPromises = [
  checkStock('12345678', '90210'),  // Call 1
  checkStock('22222222', '90210'),  // Call 2
  checkStock('87654321', '90210'),  // Call 3
  checkStock('11111111', '90210'),  // Call 4
  checkStock('33333333', '90210'),  // Call 5
];

await Promise.all(stockPromises);  // Run ALL at once
```

### Latency Comparison

#### Sequential Approach (BAD) ❌
```
Call 1: 2s
Call 2: 2s  (waits for Call 1)
Call 3: 2s  (waits for Call 2)
Call 4: 2s  (waits for Call 3)
Call 5: 2s  (waits for Call 4)
─────────
Total: 10 seconds 😱
```

#### Concurrent Approach (GOOD) ✅
```
Call 1: ████████ 2s
Call 2: ████████ 2s  (runs simultaneously)
Call 3: ████████ 2s  (runs simultaneously)
Call 4: ████████ 2s  (runs simultaneously)
Call 5: ████████ 2s  (runs simultaneously)
─────────
Total: ~2 seconds 🚀
```

**All calls finish in ~2 seconds** (time of slowest call)

### Why Not True Bulk?

**API Limitations:**

```
❌ Target:  ?tcins=12345678,22222222,87654321  (not supported)
✅ Walmart: ?ids=12345678,22222222,87654321     (supported, up to 20)
```

Target requires one TCIN per call:
```
?tcin=12345678  (single TCIN only)
```

### Caching Makes It Even Faster

**First request:** ~2 seconds (5 concurrent API calls)
**Subsequent requests (within 5 min):** <50ms (cache hit) 💨

**Cache Strategy:**
- **Stock Cache:** 5 minutes TTL (inventory changes frequently)
- **Product Cache:** 1 hour TTL (product data changes slowly)

### Performance Numbers

- **Average Response Time:** 2-4 seconds
- **Cache Hit Response:** <50ms
- **Concurrent Capacity:** Up to 20 products at once
- **API Cost:** 1 credit per TCIN check

---

## Real-World Scenarios

### Scenario A: Perfect - Primary Available

**Request:**
```json
{
  "backups": [{"primaryId": "12345678", "backupIds": ["87654321"]}],
  "zipCode": "90210"
}
```

**Check:**
```
12345678 ✅ IN STOCK
```

**Response:**
```json
{
  "redirectUrl": "https://www.target.com/p/-/A-12345678",
  "backupsUsed": false,
  "backupProducts": [],
  "cartUrlType": "pdp",
  "fallbackApplied": false
}
```

### Scenario B: Substitution - Use Backup

**Request:**
```json
{
  "backups": [{"primaryId": "12345678", "backupIds": ["87654321"]}],
  "zipCode": "90210"
}
```

**Check:**
```
12345678 ❌ OUT OF STOCK
87654321 ✅ IN STOCK
```

**Response:**
```json
{
  "redirectUrl": "https://www.target.com/p/-/A-87654321",
  "backupsUsed": true,
  "backupProducts": [
    {
      "originalId": "12345678",
      "replacementId": "87654321",
      "reason": "OUT_OF_STOCK"
    }
  ],
  "cartUrlType": "pdp",
  "fallbackApplied": false
}
```

### Scenario C: Everything Unavailable

**Request:**
```json
{
  "backups": [{"primaryId": "12345678", "backupIds": ["87654321"]}],
  "zipCode": "90210",
  "longLink": "https://www.target.com/c/office-supplies"
}
```

**Check:**
```
12345678 ❌ OUT OF STOCK
87654321 ❌ OUT OF STOCK
```

**Response:**
```json
{
  "redirectUrl": "https://www.target.com/c/office-supplies",
  "backupsUsed": false,
  "backupProducts": [],
  "allProductsUnavailable": true,
  "cartUrlType": "longLink",
  "fallbackApplied": true
}
```

### Scenario D: Multiple Products (Triggers Fallback)

**Request:**
```json
{
  "backups": [
    {"primaryId": "12345678", "backupIds": []},
    {"primaryId": "87654321", "backupIds": []}
  ],
  "zipCode": "90210",
  "longLink": "https://www.target.com/cart"
}
```

**Check:**
```
12345678 ✅ IN STOCK
87654321 ✅ IN STOCK
```

**Response:**
```json
{
  "redirectUrl": "https://www.target.com/cart",
  "backupsUsed": false,
  "backupProducts": [],
  "allProductsUnavailable": false,
  "cartUrlType": "longLink",
  "fallbackApplied": true
}
```

**Why fallback?** Target doesn't support multi-item cart URLs (unlike Walmart)

---

## Required vs Optional Fields

### Required Fields

```json
{
  "shortLink": "string",        // Your tracking URL
  "longLink": "string",         // Fallback URL
  "backups": [                  // Min 1 group
    {
      "primaryId": "string",    // 8-digit TCIN
      "backupIds": ["string"]   // Array (can be empty)
    }
  ],
  "zipCode": "string"          // 5-digit ZIP (or 5+4 format)
}
```

### Optional Fields

```json
{
  "storeId": "string",          // Specific Target store ID
  "customUrl": "string",        // Custom fallback instead of longLink
  "allowPdp": boolean,          // Allow product page redirects (default: true)
  "cartUrlOptions": {           // Advanced options (mostly ignored for Target)
    "mode": "auto",             // "auto" | "offers" | "items"
    "includeStoreId": "never"   // "never" | "auto" | "always"
  }
}
```

---

## Target Limitations vs Walmart

| Feature | Walmart | Target |
|---------|---------|--------|
| **Bulk API** | ✅ Up to 20 per call | ❌ One TCIN per call |
| **Multi-item Cart URL** | ✅ `?items=1,2,3` | ❌ Product pages only |
| **Store ID in URL** | ✅ `?store=1234` | ❌ Not supported |
| **Add-to-Cart URL** | ✅ Supported | ❌ Not supported |

**Implication:** Target backend falls back to `longLink` more often than Walmart

---

## Key Principles

### 1. Concurrent Performance
- Use `Promise.all()` to run API calls simultaneously
- Never sequential (would be 5x slower)

### 2. Smart Caching
- Stock: 5 minutes (changes frequently)
- Product: 1 hour (changes slowly)

### 3. Graceful Fallback
- Always provide a valid URL to the user
- Clear communication about what happened (via `cartOptionsSummary`)

### 4. Accurate Reporting
- `mode`: What you requested
- `includeStoreId`: What we actually did (`"never"` for Target)
- `finalType`: What URL type we generated
- `fallbackApplied`: Whether we used fallback URL

---

## Testing Examples

### Test Basic Availability
```bash
curl -X POST http://localhost:3000/api/stock/smart-select \
  -H "Content-Type: application/json" \
  -d '{
    "shortLink": "https://test.com",
    "longLink": "https://www.target.com",
    "backups": [{"primaryId": "78025470", "backupIds": []}],
    "zipCode": "90210"
  }'
```

### Test Substitution
```bash
curl -X POST http://localhost:3000/api/stock/smart-select \
  -H "Content-Type: application/json" \
  -d '{
    "shortLink": "https://test.com",
    "longLink": "https://www.target.com",
    "backups": [{"primaryId": "99999999", "backupIds": ["78025470"]}],
    "zipCode": "90210"
  }'
```

### Test Multiple Products (Fallback)
```bash
curl -X POST http://localhost:3000/api/stock/smart-select \
  -H "Content-Type: application/json" \
  -d '{
    "shortLink": "https://test.com",
    "longLink": "https://www.target.com/cart",
    "backups": [
      {"primaryId": "78025470", "backupIds": []},
      {"primaryId": "12345678", "backupIds": []}
    ],
    "zipCode": "90210"
  }'
```

---

## Quick Troubleshooting

### Slow Response Times
- ✅ Check cache hit rate (should be >60%)
- ✅ Verify concurrent calls (not sequential)
- ✅ Check Target API status

### Substitutions Not Working
- ✅ Verify backup TCINs are valid (8 digits)
- ✅ Check products are in stock at nearby stores
- ✅ Review logs in development mode

### Always Getting longLink
- ✅ Multiple products? Target can't do multi-item URLs
- ✅ Check `allowPdp` setting
- ✅ Verify products are actually available

---

## Related Documentation

- **Full API Docs:** `README.md`
- **Bug Fixes:** `FIXES.md`
- **Quick Reference:** `FIXES_SUMMARY.md`
- **Standardization Spec:** `docs/isntructions-from-walmart-dev.md`
- **Target API Notes:** `docs/redcircle-notes.md`

---

## Summary

**One sentence:** This backend checks Target inventory for multiple products concurrently, automatically substitutes unavailable items with backups, and generates appropriate redirect URLs based on Target's limitations.

**Key takeaway:** We optimize for speed (concurrent calls + caching) while working within Target's API constraints (no bulk requests, no multi-item cart URLs).
