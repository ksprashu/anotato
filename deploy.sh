#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Anotato - Google Cloud Run Deployment Script
# Target Project: ksp-demos | Region: us-central1
# ==============================================================================

PROJECT_ID="ksp-demos"
REGION="us-central1"
SERVICE_NAME="anotato"
CONCURRENCY=80
MIN_INSTANCES=0
MAX_INSTANCES=5
PORT=8080

echo "=================================================="
echo " Deploying ${SERVICE_NAME} to Google Cloud Run"
echo " Project:       ${PROJECT_ID}"
echo " Region:        ${REGION}"
echo " Concurrency:   ${CONCURRENCY}"
echo " Instances:     ${MIN_INSTANCES} (min) -> ${MAX_INSTANCES} (max)"
echo " Port:          ${PORT}"
echo "=================================================="

# Check if gcloud CLI is available
if ! command -v gcloud &> /dev/null; then
    echo "Error: gcloud CLI is not installed or not in PATH." >&2
    exit 1
fi

# Verify active gcloud authentication
CURRENT_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null || true)
if [ -z "${CURRENT_ACCOUNT}" ]; then
    echo "Warning: No active gcloud account detected. Attempting deployment with application default credentials..."
else
    echo "Authenticated as: ${CURRENT_ACCOUNT}"
fi

# Run pre-flight build check
echo "Running pre-flight build verification..."
npm run build

echo "Submitting build and deploying to Cloud Run via Google Cloud Build..."
gcloud run deploy "${SERVICE_NAME}" \
    --source . \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --allow-unauthenticated \
    --concurrency="${CONCURRENCY}" \
    --min-instances="${MIN_INSTANCES}" \
    --max-instances="${MAX_INSTANCES}" \
    --port="${PORT}" \
    --set-env-vars="NODE_ENV=production"

echo "=================================================="
echo " Deployment successful!"
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" --project="${PROJECT_ID}" --region="${REGION}" --format="value(status.url)")
echo " Live Service URL: ${SERVICE_URL}"
echo "=================================================="
