# Anotato — Release & Deployment Report

![Anotato Banner](/Users/ksprashanth/.gemini/antigravity/brain/76c8db24-d4ba-4e72-827d-c1caa87afcc1/anotato_banner_1788202328329.jpg)

**Anotato** (a play on *Annotate* and *Potato*) is an open-source, high-performance screenshot annotation and note-taking web application built for developer coding harnesses and AI workflows.

---

## 🔗 Repository & Live Deployment

- **GitHub Repository**: [https://github.com/ksprashu/anotato](https://github.com/ksprashu/anotato)
- **Live Cloud Run Endpoint**: [https://anotato-powot63zaa-uc.a.run.app](https://anotato-powot63zaa-uc.a.run.app)
- **Project Banner**: Committed to [`docs/images/banner.png`](file:///Users/ksprashanth/code/github/anotato/docs/images/banner.png) and embedded at the top of [`README.md`](file:///Users/ksprashanth/code/github/anotato/README.md).

---

## 🔒 Security & Privacy Audit

- **Zero Credential / Token Leaks**: Audited all tracked files for API keys, passwords, bearer tokens, and internal email addresses (`0 found`).
- **Environment & Deploy Isolation**: Created [`.env.deploy.example`](file:///Users/ksprashanth/code/github/anotato/.env.deploy.example) for local project configuration, with `.env.deploy` gitignored to prevent accidental commits of personal project configurations.
- **Zero-Network Client Architecture**: Verified that the frontend SPA makes zero outbound external network requests or fetch calls during operation, guaranteeing complete client-side privacy.

---

## ☁️ Parameterized Cloud Run Deployment (`deploy.sh`)

The deployment script [`deploy.sh`](file:///Users/ksprashanth/code/github/anotato/deploy.sh) is fully parameterized:

```bash
# Option 1: Pass project ID and optional region as arguments
./deploy.sh <your-gcp-project-id> [region]

# Option 2: Use environment variables
GCP_PROJECT_ID=your-gcp-project-id GCP_REGION=us-central1 ./deploy.sh

# Option 3: Configure via .env.deploy file
cp .env.deploy.example .env.deploy
# Edit .env.deploy with your project ID
./deploy.sh
```

**Guardrails & Defaults**:
- **Project**: Resolves from CLI argument $\rightarrow$ `GCP_PROJECT_ID` $\rightarrow$ `PROJECT_ID` $\rightarrow$ active `gcloud` config. Prompts with helpful instructions if unset.
- **Region**: Defaults to `us-central1` (overridable via `GCP_REGION` or CLI argument).
- **Service Name**: Defaults to `anotato` (overridable via `SERVICE_NAME`).
- **Scale-to-Zero Guardrail**: `--min-instances=0` (zero idle compute costs).
- **Max Instance Cap**: `--max-instances=5` (protects against runaway billing from traffic floods).
- **Concurrency**: `--concurrency=80` requests per instance.

---

## 📊 Google Analytics 4 (GA4) & Custom Telemetry

- **Measurement ID**: `G-RN4Y25GBXM` (configured asynchronously in [`index.html`](file:///Users/ksprashanth/code/github/anotato/index.html))
- **Telemetry Module**: [`src/analytics/telemetry.ts`](file:///Users/ksprashanth/code/github/anotato/src/analytics/telemetry.ts)
- **Tracked Custom Events**:
  1. `paste`: Dispatched upon image ingestion from clipboard (`Cmd+V`), drag-and-drop, or file picker.
  2. `copy`: Dispatched upon copying composite PNG images (`image/png`), copying markdown notes (`text/plain`), or downloading files.
  3. `annotate`: Dispatched upon drawing any shape or callout badge (bounding box, ellipse, arrow, pin).
- **Resilience**: Non-blocking `queueMicrotask` scheduling, strict error boundaries, offline auto-bypass, and unit test isolation.

---

## ⚡ Offline Caching, Edge Performance & Bot Attack Safeguards

- **Immutable Asset Caching**: Static JS/CSS/Fonts are hashed and served with `Cache-Control: public, max-age=31536000, immutable`.
- **Nginx Bot & Burst Protection** ([`nginx.conf`](file:///Users/ksprashanth/code/github/anotato/nginx.conf)):
  - IP-based rate limiting zone: `limit_req_zone $binary_remote_addr zone=anotato_limit:10m rate=30r/s burst=50 nodelay`.
  - Max connection limit: `limit_conn anotato_conn 30`.
  - Gzip compression on all textual/vector assets.
  - Security headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and CSP.

---

## 🧪 Comprehensive Verification Summary

| Verification Track | Scope / Command | Result |
|---|---|---|
| **Vitest Unit & Integration** | `npm test` (58 test files) | **877 / 877 passed (100%)** |
| **Standalone 4-Tier E2E** | `npx tsx tests/e2e/test-runner.ts` | **247 / 247 passed (100%)** |
| **TypeScript Typecheck** | `npm run typecheck` | **0 errors** |
| **ESLint** | `npm run lint` | **0 errors** |
| **Production Build** | `npm run build` | **Clean bundle in `dist/`** |
| **Live Cloud Run Status** | `curl` endpoint verification | **HTTP 200 with immutable cache headers** |
| **Git Status** | `git status` | **Clean, pushed to origin main** |
