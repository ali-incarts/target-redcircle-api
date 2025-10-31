#!/bin/bash

# Quick deployment script for Cloud Run
# Make executable: chmod +x deploy.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Target RedCircle API - Cloud Run Deployment${NC}"
echo "=================================================="

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI is not installed${NC}"
    echo "Install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Get project ID
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Error: No GCP project configured${NC}"
    echo "Run: gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

echo -e "${GREEN}Project ID: ${PROJECT_ID}${NC}"

# Prompt for region
read -p "Enter Cloud Run region (default: us-central1): " REGION
REGION=${REGION:-us-central1}

# Prompt for service name
read -p "Enter service name (default: target-redcircle-api): " SERVICE_NAME
SERVICE_NAME=${SERVICE_NAME:-target-redcircle-api}

echo ""
echo -e "${YELLOW}Building and deploying...${NC}"

# Build and deploy
gcloud builds submit --tag gcr.io/${PROJECT_ID}/${SERVICE_NAME}

echo ""
echo -e "${YELLOW}Deploying to Cloud Run...${NC}"

gcloud run deploy ${SERVICE_NAME} \
  --image gcr.io/${PROJECT_ID}/${SERVICE_NAME} \
  --platform managed \
  --region ${REGION} \
  --no-allow-unauthenticated \
  --ingress internal-and-cloud-load-balancing \
  --memory 512Mi \
  --cpu 1 \
  --max-instances 10 \
  --min-instances 0 \
  --timeout 60

# Get service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} \
  --region ${REGION} \
  --format 'value(status.url)')

echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo "=================================================="
echo -e "Service URL: ${GREEN}${SERVICE_URL}${NC}"
echo -e "API Documentation: ${GREEN}${SERVICE_URL}/api-docs${NC}"
echo ""
echo -e "${YELLOW}⚠️  Remember to:${NC}"
echo "1. Set environment variables (TARGET_API_KEY, etc.)"
echo "   gcloud run services update ${SERVICE_NAME} --region ${REGION} --set-env-vars TARGET_API_KEY=your-key"
echo ""
echo "2. Grant invoker permission to calling service:"
echo "   gcloud run services add-iam-policy-binding ${SERVICE_NAME} \\"
echo "     --region ${REGION} \\"
echo "     --member='serviceAccount:CALLER_SA@${PROJECT_ID}.iam.gserviceaccount.com' \\"
echo "     --role='roles/run.invoker'"
echo ""
echo -e "See ${GREEN}DEPLOYMENT.md${NC} for detailed instructions."
