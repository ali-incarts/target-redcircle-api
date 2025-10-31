# Cloud Run Deployment Guide

## Security: IAM-Based Service-to-Service Authentication

This API uses Google Cloud Run's built-in IAM authentication for secure service-to-service communication. No custom authentication code is required in the API itself.

---

## Deployment Steps

### 1. Build and Deploy the API

```bash
# Build Docker image (if using Dockerfile)
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/target-redcircle-api

# Deploy to Cloud Run with authentication required
gcloud run deploy target-redcircle-api \
  --image gcr.io/YOUR_PROJECT_ID/target-redcircle-api \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --no-allow-unauthenticated \
  --ingress internal-and-cloud-load-balancing \
  --set-env-vars "TARGET_API_KEY=your-redcircle-api-key,NODE_ENV=production"
```

**Key Flags Explained:**
- `--no-allow-unauthenticated`: Requires authentication for all requests
- `--ingress internal-and-cloud-load-balancing`: Only allows calls from Cloud Run services or Cloud Load Balancer (blocks public internet)

### 2. Grant Permission to Calling Service

```bash
# Get the calling service's service account
gcloud run services describe YOUR_CALLING_SERVICE \
  --region us-central1 \
  --format="value(spec.template.spec.serviceAccountName)"

# Grant the calling service permission to invoke this API
gcloud run services add-iam-policy-binding target-redcircle-api \
  --region us-central1 \
  --member="serviceAccount:CALLING_SERVICE_SA@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```

---

## Calling Service Implementation

### Option 1: Using google-auth-library (Recommended)

Install dependency:
```bash
pnpm add google-auth-library
```

Example implementation:
```typescript
import { GoogleAuth } from 'google-auth-library';
import axios from 'axios';

const TARGET_API_URL = 'https://target-redcircle-api-xxx.run.app';

/**
 * Call the Target API with IAM authentication
 */
async function callTargetAPI(endpoint: string, data: any) {
  const auth = new GoogleAuth();

  // Get an ID token client for the target service
  const client = await auth.getIdTokenClient(TARGET_API_URL);

  // Make authenticated request
  const response = await client.request({
    url: `${TARGET_API_URL}${endpoint}`,
    method: 'POST',
    data,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  return response.data;
}

// Usage example
async function smartProductSelect(productData: any) {
  try {
    const result = await callTargetAPI('/api/stock/smart-select', {
      shortLink: productData.shortLink,
      longLink: productData.longLink,
      backups: productData.backups,
      zipCode: productData.zipCode,
      storeId: productData.storeId,
      customUrl: productData.customUrl,
      allowPdp: true,
    });

    return result;
  } catch (error) {
    console.error('Failed to call Target API:', error);
    throw error;
  }
}
```

### Option 2: Using fetch with manual token retrieval

```typescript
import { GoogleAuth } from 'google-auth-library';

const TARGET_API_URL = 'https://target-redcircle-api-xxx.run.app';

async function getIdToken(targetAudience: string): Promise<string> {
  const auth = new GoogleAuth();
  const client = await auth.getIdTokenClient(targetAudience);
  const idToken = await client.idTokenProvider.fetchIdToken(targetAudience);
  return idToken;
}

async function callTargetAPI(endpoint: string, data: any) {
  const idToken = await getIdToken(TARGET_API_URL);

  const response = await fetch(`${TARGET_API_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`API call failed: ${response.statusText}`);
  }

  return response.json();
}
```

---

## Testing

### Local Testing (Skip IAM)

For local development, you can deploy a separate version without authentication:

```bash
gcloud run deploy target-redcircle-api-dev \
  --image gcr.io/YOUR_PROJECT_ID/target-redcircle-api \
  --allow-unauthenticated \
  --set-env-vars "TARGET_API_KEY=your-key,NODE_ENV=development"
```

### Testing with curl (using your own credentials)

```bash
# Get your own ID token
TOKEN=$(gcloud auth print-identity-token \
  --audiences=https://target-redcircle-api-xxx.run.app)

# Make authenticated request
curl -X POST https://target-redcircle-api-xxx.run.app/api/stock/smart-select \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "shortLink": "https://incarts-us.web.app/xyz",
    "longLink": "https://www.target.com/p/-/A-12345678",
    "zipCode": "04457"
  }'
```

### Health Check Test

```bash
TOKEN=$(gcloud auth print-identity-token \
  --audiences=https://target-redcircle-api-xxx.run.app)

curl https://target-redcircle-api-xxx.run.app/api/health \
  -H "Authorization: Bearer $TOKEN"
```

---

## Security Best Practices

### 1. Use Least Privilege IAM
Only grant `roles/run.invoker` to services that need to call this API:

```bash
# List current IAM bindings
gcloud run services get-iam-policy target-redcircle-api --region us-central1

# Remove a service's access
gcloud run services remove-iam-policy-binding target-redcircle-api \
  --region us-central1 \
  --member="serviceAccount:old-service@project.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```

### 2. Use Internal Ingress
The `--ingress internal-and-cloud-load-balancing` flag ensures:
- ✅ Only Cloud Run services in the same project can call it
- ✅ Only Cloud Load Balancer can route external traffic (if needed)
- ❌ Direct public internet access is blocked

### 3. Monitor Access Logs

View authenticated requests in Cloud Logging:
```bash
gcloud logging read "resource.type=cloud_run_revision \
  AND resource.labels.service_name=target-redcircle-api \
  AND httpRequest.status>=400" \
  --limit 50 \
  --format json
```

### 4. Rotate Service Accounts Regularly
If a service account is compromised:
1. Create a new service account
2. Grant it `roles/run.invoker`
3. Update the calling service to use the new account
4. Remove the old service account's access

---

## Troubleshooting

### Error: "403 Forbidden"
**Cause**: The calling service doesn't have permission.

**Fix**:
```bash
gcloud run services add-iam-policy-binding target-redcircle-api \
  --member="serviceAccount:CALLING_SERVICE@project.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```

### Error: "401 Unauthorized"
**Cause**: No ID token provided or token is invalid.

**Fix**: Ensure the calling service is correctly fetching and sending the ID token:
```typescript
const auth = new GoogleAuth();
const client = await auth.getIdTokenClient(TARGET_URL);
// client automatically adds the Authorization header
```

### Error: "Audience verification failed"
**Cause**: The ID token audience doesn't match the service URL.

**Fix**: Ensure the audience matches exactly:
```typescript
// Audience must be the full service URL (no trailing slash)
const client = await auth.getIdTokenClient('https://your-service.run.app');
```

### Local Development Issues
**Cause**: IAM authentication doesn't work in local development.

**Fix**: Use Application Default Credentials:
```bash
# Authenticate locally
gcloud auth application-default login

# The google-auth-library will automatically use your credentials
```

---

## Cost Considerations

- **IAM authentication**: Free
- **Cloud Run requests**: $0.40 per million requests
- **Ingress/Egress**: Internal Cloud Run traffic is free

---

## Additional Resources

- [Cloud Run Authentication Overview](https://cloud.google.com/run/docs/authenticating/overview)
- [Service-to-Service Authentication](https://cloud.google.com/run/docs/authenticating/service-to-service)
- [IAM Conditions](https://cloud.google.com/iam/docs/conditions-overview) - For advanced access control
