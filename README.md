# Target RedCircle API Backend

Smart product selection backend with automatic backup substitution for Target products using the RedCircle API.

## 📚 Quick Links

- **Redcirle api docs** : https://docs.trajectdata.com/redcircleapi/collections-api/overview 
- **New to this project?** Start with [HOW_IT_WORKS.md](./HOW_IT_WORKS.md) - Simple explanations of how everything works
- **Setting up?** Continue reading this README
- **Deploying to production?** See [DEPLOYMENT.md](./DEPLOYMENT.md) - Cloud Run deployment with IAM authentication
- **API Documentation** Visit `/api-docs` when server is running for interactive Swagger UI
- **New Product Endpoints** See [NEW_ENDPOINTS.md](./NEW_ENDPOINTS.md) - Product lookup and search capabilities
- **Found bugs?** Check [FIXES.md](./FIXES.md) for known issues and solutions
- **Need specs?** See [docs/isntructions-from-walmart-dev.md](./docs/isntructions-from-walmart-dev.md)

## Overview

This backend implements the **Smart Product Selection API** specification, providing real-time inventory checking and intelligent product substitution when items are out of stock.

### Core Features

- ✅ Real-time Target inventory checking via RedCircle API
- ✅ Automatic backup product substitution
- ✅ Concurrent API calls for optimal performance
- ✅ Two-layer caching (product + stock)
- ✅ Standardized API interface compatible with Walmart backend
- ✅ Comprehensive error handling and logging

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- Target RedCircle API key (sign up at [RedCircle API](https://redcircleapi.com))
- pnpm (recommended) or npm

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd target-redcircle-api

# Install dependencies
pnpm install

# Create .env file from template
cp .env .env.local

# Add your API key to .env.local
# TARGET_API_KEY=your_redcircle_api_key_here
```

### Configuration

Edit `.env` or `.env.local`:

```env
PORT=3000
TARGET_API_KEY=your_redcircle_api_key_here
TARGET_API_BASE_URL=https://api.redcircleapi.com/request
CACHE_TTL_SECONDS=300
PRODUCT_CACHE_TTL_SECONDS=3600
NODE_ENV=development
```

### Running the Server

```bash
# Development mode (with auto-reload)
pnpm run dev

# Build for production
pnpm run build

# Run production build
pnpm start
```

The server will start on `http://localhost:3000`

## API Documentation

### Interactive Swagger UI

When the server is running, visit **http://localhost:3000/api-docs** for interactive API documentation where you can:
- View all endpoints with detailed request/response schemas
- Test API calls directly from your browser
- See example requests and responses
- Explore the OpenAPI 3.0 specification

You can also access the raw OpenAPI spec at **http://localhost:3000/api-docs.json**

### Endpoints

#### 1. Health Check

```
GET /api/health
```

Returns server health status.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-31T12:00:00.000Z",
  "uptime": 3600,
  "environment": "development",
  "apiKeyConfigured": true
}
```

#### 2. Smart Product Selection

```
POST /api/stock/smart-select
```

Perform intelligent product selection with automatic backup substitution.

**Request Body:**
```json
{
  "shortLink": "https://incarts-us.web.app/PFu3rT_jh",
  "longLink": "https://www.target.com/p/product/-/A-12345678",
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
  "zipCode": "04457",
  "storeId": "1771",
  "customUrl": "https://fallback.com/url",
  "allowPdp": true,
  "cartUrlOptions": {
    "mode": "auto"
  }
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `shortLink` | string | ✅ Yes | Your application's short URL |
| `longLink` | string | ✅ Yes | Original Target product URL (fallback) |
| `backups` | array | ✅ Yes | Array of product groups with primary and backup TCINs |
| `backups[].primaryId` | string | ✅ Yes | Primary TCIN (8-digit Target product ID) |
| `backups[].backupIds` | array | ✅ Yes | Ordered array of backup TCINs |
| `zipCode` | string | ✅ Yes | ZIP code for location-based availability |
| `storeId` | string | ❌ No | Optional specific Target store ID |
| `customUrl` | string | ❌ No | Custom fallback URL |
| `allowPdp` | boolean | ❌ No | Allow redirect to product detail page (default: true) |
| `cartUrlOptions` | object | ❌ No | Cart URL options (accepted but not used for Target) |

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
  "allProductsUnavailable": false,
  "cartUrlType": "pdp",
  "storeIdAttached": "1771",
  "cartOptionsSummary": {
    "mode": "pdp",
    "includeStoreId": "never",
    "fallbackApplied": false,
    "finalType": "pdp"
  }
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `redirectUrl` | string | Final URL to redirect user |
| `backupsUsed` | boolean | True if any backup products were substituted |
| `backupProducts` | array | List of all substitutions made |
| `allProductsUnavailable` | boolean | True if no products were available |
| `cartUrlType` | string | Type of URL: `"pdp"`, `"longLink"`, or `"custom"` |
| `storeIdAttached` | string | Store ID used (if any) |
| `cartOptionsSummary` | object | Summary of URL generation decisions |

### Example Usage

```bash
curl -X POST http://localhost:3000/api/stock/smart-select \
  -H "Content-Type: application/json" \
  -d '{
    "shortLink": "https://incarts-us.web.app/test",
    "longLink": "https://www.target.com/p/-/A-78025470",
    "backups": [
      {
        "primaryId": "78025470",
        "backupIds": ["12345678"]
      }
    ],
    "zipCode": "04457"
  }'
```

## Architecture

### Project Structure

```
target-redcircle-api/
├── src/
│   ├── index.ts                    # Express server entry point
│   ├── controllers/
│   │   └── stock.ts                # HTTP request handlers
│   ├── services/
│   │   ├── target/
│   │   │   └── api.ts              # RedCircle API client
│   │   └── stock/
│   │       ├── availability.ts     # Concurrent availability checking
│   │       └── product-selector.ts # Substitution algorithm
│   ├── utils/
│   │   └── cache.ts                # Two-layer caching system
│   └── types/
│       └── index.ts                # TypeScript type definitions
├── docs/
│   ├── isntructions-from-walmart-dev.md  # Standardization specification
│   ├── backend-implemetation.md          # Implementation guide
│   └── redcircle-notes.md               # RedCircle API notes
├── package.json
├── tsconfig.json
├── .env
└── README.md
```

### Key Components

#### 1. Target API Client (`src/services/target/api.ts`)
- Handles all RedCircle API calls
- Implements concurrent requests (Target doesn't support bulk)
- Manages product and stock caching
- Error handling and retry logic

#### 2. Availability Checker (`src/services/stock/availability.ts`)
- Concurrent stock checking for multiple products
- Store selection logic (closest in-stock store)
- Flexible product ID type handling
- Batch processing with individual error isolation

#### 3. Product Selector (`src/services/stock/product-selector.ts`)
- Core substitution algorithm
- Primary → Backup[0] → Backup[1] → ... priority
- URL generation (product pages only)
- Analytics event logging

#### 4. Caching System (`src/utils/cache.ts`)
- **Stock cache:** 5 minutes TTL (inventory changes frequently)
- **Product cache:** 1 hour TTL (product data changes slowly)
- Smart cache keys with ZIP code and store ID
- Cache statistics monitoring

## Target API Specifics

### Key Differences from Walmart

| Feature | Walmart API | Target RedCircle API |
|---------|-------------|----------------------|
| **Product ID** | itemId (numeric) | TCIN (8-digit string) |
| **Bulk Lookup** | ✅ Up to 20 per call | ❌ One TCIN at a time |
| **Add-to-Cart** | ✅ Cart URLs supported | ❌ Product pages only |
| **Stock Check** | Included in product data | Separate store_stock endpoint |

### API Cost Optimization

Each RedCircle API request costs **1 credit**. To minimize costs:

1. **Aggressive caching** (5-minute stock cache, 1-hour product cache)
2. **Short-circuit evaluation** (stop checking backups once available one is found)
3. **Concurrent requests** (faster, not cheaper, but better UX)
4. **Smart cache keys** (include ZIP + store ID to reuse results)

### Store Selection Logic

Target's API returns up to 20 stores sorted by distance. Priority:

1. **User-specified store** (if `storeId` provided and in results)
2. **First in-stock store** (closest by distance)
3. **First store** (even if out of stock, as fallback)

## Performance

### Benchmarks

- **Single product check:** ~1-2 seconds (API call)
- **5 products concurrent:** ~2-3 seconds (parallelized)
- **Cache hit response:** <50ms
- **Full smart-select flow:** 2-4 seconds average

### Optimization Techniques

1. ✅ **Concurrent API calls** via `Promise.all()`
2. ✅ **Two-layer caching** (product + stock)
3. ✅ **Map-based lookups** (O(1) access)
4. ✅ **Short-circuit evaluation** (stop at first available backup)
5. ✅ **Graceful error handling** (don't fail entire batch)

## Testing

### Manual Testing

```bash
# Health check
curl http://localhost:3000/api/health

# Smart select with known TCIN
curl -X POST http://localhost:3000/api/stock/smart-select \
  -H "Content-Type: application/json" \
  -d @test-payload.json
```

Create `test-payload.json`:
```json
{
  "shortLink": "https://incarts-us.web.app/test",
  "longLink": "https://www.target.com/p/-/A-78025470",
  "backups": [
    {
      "primaryId": "78025470",
      "backupIds": []
    }
  ],
  "zipCode": "90210"
}
```

## Error Handling

### Standard Error Response

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "zipCode must be in format 12345 or 12345-6789",
    "field": "zipCode",
    "details": {}
  }
}
```

### Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request payload |
| `PRODUCT_NOT_FOUND` | 404 | TCIN not found in Target catalog |
| `RATE_LIMIT_EXCEEDED` | 429 | API rate limit reached |
| `UNAUTHORIZED` | 401 | Invalid API key |
| `INTERNAL_SERVER_ERROR` | 500 | Server error |

## Deployment

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure `ALLOWED_ORIGINS` for CORS
- [ ] Set up API key in environment variables
- [ ] Enable HTTPS
- [ ] Configure logging service (e.g., DataDog, New Relic)
- [ ] Set up monitoring and alerts
- [ ] Configure cache TTLs based on traffic
- [ ] Set up rate limiting
- [ ] Configure firewall rules

### Environment Variables (Production)

```env
NODE_ENV=production
PORT=3000
TARGET_API_KEY=prod_api_key_here
TARGET_API_BASE_URL=https://api.redcircleapi.com/request
CACHE_TTL_SECONDS=300
PRODUCT_CACHE_TTL_SECONDS=3600
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

## Monitoring & Analytics

### Logged Events

1. **Product Substitution**
   ```json
   {
     "event": "product_substitution",
     "shortLink": "https://incarts-us.web.app/xyz",
     "originalId": "12345678",
     "replacementId": "87654321",
     "reason": "OUT_OF_STOCK",
     "zipCode": "04457"
   }
   ```

2. **All Products Unavailable**
   ```json
   {
     "event": "all_products_unavailable",
     "shortLink": "https://incarts-us.web.app/xyz",
     "primaryProductIds": ["12345678", "22222222"],
     "zipCode": "04457"
   }
   ```

3. **API Performance**
   ```json
   {
     "event": "api_call",
     "endpoint": "/api/stock/smart-select",
     "duration_ms": 2450,
     "cache_hit": false,
     "products_checked": 6,
     "substitutions": 1
   }
   ```

## Troubleshooting

### Common Issues

**1. API calls failing:**
- Check `TARGET_API_KEY` is set correctly
- Verify API key has remaining credits
- Check network connectivity

**2. Slow response times:**
- Monitor cache hit rate (should be >60%)
- Check RedCircle API status
- Consider increasing cache TTLs

**3. Substitutions not working:**
- Verify backup TCINs are valid 8-digit numbers
- Check products are actually in stock at stores
- Review logs for availability check results

### Debug Mode

Set `NODE_ENV=development` for verbose logging:

```bash
NODE_ENV=development pnpm run dev
```

You'll see:
- All API calls with parameters
- Cache hits/misses
- Availability check results
- Substitution decisions
- Performance metrics

## Contributing

1. Follow the standardization document in `docs/isntructions-from-walmart-dev.md`
2. Maintain compatibility with Walmart backend interface
3. Add JSDoc comments to all functions
4. Test with real Target TCINs
5. Update documentation

## License

MIT

## Support

For issues and questions:
- GitHub Issues: [repository-url]/issues
- RedCircle API Support: hello@redcircleapi.com
- Documentation: See `/docs` folder

## Related Projects

- **Walmart Backend:** Reference implementation of the standardization spec
- **Smart Product Selection Spec:** See `docs/isntructions-from-walmart-dev.md`
