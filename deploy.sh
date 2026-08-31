#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Anotato - Google Cloud Run Deployment Script
# Parameterized for custom GCP Projects & Regions with safe cost guardrails
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load local deployment configuration if available
if [[ -f "${SCRIPT_DIR}/.env.deploy" ]]; then
    # shellcheck source=/dev/null
    set -a
    source "${SCRIPT_DIR}/.env.deploy"
    set +a
elif [[ -f "${SCRIPT_DIR}/.env" ]]; then
    # shellcheck source=/dev/null
    set -a
    source "${SCRIPT_DIR}/.env"
    set +a
fi

# Parse optional arguments or flags
ARG_PROJECT=""
ARG_REGION=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        -p|--project)
            ARG_PROJECT="$2"
            shift 2
            ;;
        -r|--region)
            ARG_REGION="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: ./deploy.sh [PROJECT_ID] [REGION]"
            echo "       ./deploy.sh --project <PROJECT_ID> --region <REGION>"
            echo ""
            echo "Environment variables:"
            echo "  GCP_PROJECT_ID / PROJECT_ID   Google Cloud Project ID"
            echo "  GCP_REGION / REGION           Google Cloud Region (default: us-central1)"
            echo "  SERVICE_NAME                  Cloud Run Service Name (default: anotato)"
            echo "  CONCURRENCY                   Requests per container instance (default: 80)"
            echo "  MIN_INSTANCES                 Minimum container instances (default: 0)"
            echo "  MAX_INSTANCES                 Maximum container instances (default: 5)"
            echo "  PORT                          Container port (default: 8080)"
            exit 0
            ;;
        *)
            if [[ -z "${ARG_PROJECT}" ]]; then
                ARG_PROJECT="$1"
            elif [[ -z "${ARG_REGION}" ]]; then
                ARG_REGION="$1"
            fi
            shift
            ;;
    esac
done

# Resolve Project ID: Arg > GCP_PROJECT_ID > PROJECT_ID > gcloud config
RESOLVED_PROJECT="${ARG_PROJECT:-${GCP_PROJECT_ID:-${PROJECT_ID:-}}}"
if [[ -z "${RESOLVED_PROJECT}" ]]; then
    ACTIVE_GCLOUD_PROJECT=$(gcloud config get-value project 2>/dev/null || true)
    if [[ -n "${ACTIVE_GCLOUD_PROJECT}" && "${ACTIVE_GCLOUD_PROJECT}" != "(unset)" ]]; then
        RESOLVED_PROJECT="${ACTIVE_GCLOUD_PROJECT}"
    fi
fi

if [[ -z "${RESOLVED_PROJECT}" || "${RESOLVED_PROJECT}" == "(unset)" ]]; then
    echo "Error: Google Cloud Project ID is required." >&2
    echo "" >&2
    echo "Please specify a project via one of the following methods:" >&2
    echo "  1. Run with argument:      ./deploy.sh <your-project-id> [region]" >&2
    echo "  2. Set environment var:    export GCP_PROJECT_ID=<your-project-id>" >&2
    echo "  3. Configure .env.deploy:  cp .env.deploy.example .env.deploy" >&2
    echo "  4. Set active gcloud:      gcloud config set project <your-project-id>" >&2
    exit 1
fi

PROJECT_ID="${RESOLVED_PROJECT}"
REGION="${ARG_REGION:-${GCP_REGION:-${REGION:-us-central1}}}"
SERVICE_NAME="${SERVICE_NAME:-anotato}"
CONCURRENCY="${CONCURRENCY:-80}"
MIN_INSTANCES="${MIN_INSTANCES:-0}"
MAX_INSTANCES="${MAX_INSTANCES:-5}"
PORT="${PORT:-8080}"

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
if [[ -z "${CURRENT_ACCOUNT}" ]]; then
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
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" --project="${PROJECT_ID}" --region="${REGION}" --format="value(status.url)" 2>/dev/null || echo "https://${SERVICE_NAME}-${PROJECT_ID}.a.run.app")
echo " Live Service URL: ${SERVICE_URL}"
echo "=================================================="
