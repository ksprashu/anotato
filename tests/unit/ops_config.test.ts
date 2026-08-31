import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Milestones M-Rel-3 & M-Rel-4: Operations, Containerization & Deployment Configuration Suite', () => {
  const rootDir = path.resolve(__dirname, '../../');

  describe('1. Nginx Configuration (nginx.conf)', () => {
    const nginxPath = path.join(rootDir, 'nginx.conf');

    it('verifies nginx.conf exists in root directory', () => {
      expect(fs.existsSync(nginxPath)).toBe(true);
    });

    it('configures rate limiting and connection limiting zones and parameters', () => {
      const content = fs.readFileSync(nginxPath, 'utf-8');

      // Rate limit zone: 10MB memory, 30 req/sec
      expect(content).toMatch(/limit_req_zone\s+\$binary_remote_addr\s+zone=anotato_limit:10m\s+rate=30r\/s;/);
      // Connection limit zone: 10MB memory
      expect(content).toMatch(/limit_conn_zone\s+\$binary_remote_addr\s+zone=anotato_conn:10m;/);

      // Server-level rate limiting with burst buffer and HTTP 429 status
      expect(content).toMatch(/limit_req\s+zone=anotato_limit\s+burst=50\s+nodelay;/);
      expect(content).toMatch(/limit_req_status\s+429;/);

      // Server-level connection limit
      expect(content).toMatch(/limit_conn\s+anotato_conn\s+30;/);
    });

    it('configures server binding on port 8080 and hides server tokens', () => {
      const content = fs.readFileSync(nginxPath, 'utf-8');
      expect(content).toMatch(/listen\s+8080;/);
      expect(content).toMatch(/server_tokens\s+off;/);
      expect(content).toMatch(/root\s+\/usr\/share\/nginx\/html;/);
      expect(content).toMatch(/index\s+index\.html;/);
    });

    it('configures gzip compression for text, scripts, stylesheets, and fonts', () => {
      const content = fs.readFileSync(nginxPath, 'utf-8');
      expect(content).toMatch(/gzip\s+on;/);
      expect(content).toMatch(/gzip_vary\s+on;/);
      expect(content).toMatch(/gzip_comp_level\s+6;/);
      expect(content).toMatch(/text\/css/);
      expect(content).toMatch(/application\/javascript/);
      expect(content).toMatch(/application\/json/);
      expect(content).toMatch(/image\/svg\+xml/);
      expect(content).toMatch(/font\/woff2/);
    });

    it('configures comprehensive security and CSP headers allowing Google Analytics & GTM', () => {
      const content = fs.readFileSync(nginxPath, 'utf-8');
      expect(content).toContain('add_header X-Frame-Options "DENY" always;');
      expect(content).toContain('add_header X-Content-Type-Options "nosniff" always;');
      expect(content).toContain('add_header X-XSS-Protection "1; mode=block" always;');
      expect(content).toContain('add_header Referrer-Policy "strict-origin-when-cross-origin" always;');
      expect(content).toContain('add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;');

      // CSP header
      expect(content).toContain('Content-Security-Policy');
      expect(content).toContain('https://www.googletagmanager.com');
      expect(content).toContain('https://www.google-analytics.com');
      expect(content).toContain('https://*.google-analytics.com');
    });

    it('configures /healthz endpoint returning 200 healthy', () => {
      const content = fs.readFileSync(nginxPath, 'utf-8');
      expect(content).toContain('location = /healthz');
      expect(content).toContain('return 200 "healthy\\n";');
      expect(content).toContain('default_type text/plain;');
    });

    it('configures static asset immutable caching (1 year) for /assets/', () => {
      const content = fs.readFileSync(nginxPath, 'utf-8');
      expect(content).toContain('location /assets/');
      expect(content).toContain('expires 1y;');
      expect(content).toContain('Cache-Control "public, max-age=31536000, immutable"');
    });

    it('configures static media immutable caching (30 days) for icons, images, and fonts', () => {
      const content = fs.readFileSync(nginxPath, 'utf-8');
      expect(content).toMatch(/location\s+~\*\s+\\\.\(\?:ico\|svg\|png\|jpg\|jpeg\|gif\|webp\|woff\|woff2/);
      expect(content).toContain('expires 30d;');
      expect(content).toContain('Cache-Control "public, max-age=2592000, immutable"');
    });

    it('configures SPA fallback routing to /index.html with no-cache revalidation headers', () => {
      const content = fs.readFileSync(nginxPath, 'utf-8');
      expect(content).toMatch(/try_files\s+\$uri\s+\$uri\/\s+\/index\.html;/);
      expect(content).toContain('Cache-Control "no-cache, must-revalidate"');
      expect(content).toContain('Pragma "no-cache"');
      expect(content).toContain('Expires "0"');
    });
  });

  describe('2. Dockerfile Multi-Stage Container Architecture', () => {
    const dockerfilePath = path.join(rootDir, 'Dockerfile');

    it('verifies Dockerfile exists in root directory', () => {
      expect(fs.existsSync(dockerfilePath)).toBe(true);
    });

    it('configures Stage 1 builder with node:20-alpine', () => {
      const content = fs.readFileSync(dockerfilePath, 'utf-8');
      expect(content).toMatch(/FROM\s+node:20-alpine\s+AS\s+builder/i);
      expect(content).toContain('WORKDIR /app');
      expect(content).toContain('npm ci');
      expect(content).toContain('npm run build');
    });

    it('configures Stage 2 runner with nginx:1.27-alpine on port 8080', () => {
      const content = fs.readFileSync(dockerfilePath, 'utf-8');
      expect(content).toMatch(/FROM\s+nginx:1\.27-alpine\s+AS\s+runner/i);
      expect(content).toContain('COPY --from=builder /app/dist /usr/share/nginx/html');
      expect(content).toContain('COPY nginx.conf /etc/nginx/conf.d/default.conf');
      expect(content).toContain('EXPOSE 8080');
      expect(content).toMatch(/CMD\s+\["nginx",\s+"-g",\s+"daemon off;"\]/);
    });

    it('configures container healthcheck on /healthz', () => {
      const content = fs.readFileSync(dockerfilePath, 'utf-8');
      expect(content).toContain('HEALTHCHECK');
      expect(content).toContain('http://localhost:8080/healthz');
    });
  });

  describe('3. Docker Build Exclusions (.dockerignore)', () => {
    const dockerignorePath = path.join(rootDir, '.dockerignore');

    it('verifies .dockerignore exists in root directory', () => {
      expect(fs.existsSync(dockerignorePath)).toBe(true);
    });

    it('excludes heavy dependencies, git history, tests, logs, and docs', () => {
      const content = fs.readFileSync(dockerignorePath, 'utf-8');
      const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);

      expect(lines).toContain('node_modules');
      expect(lines).toContain('.git');
      expect(lines).toContain('.agents');
      expect(lines).toContain('dist');
      expect(lines).toContain('coverage');
      expect(lines).toContain('tests');
      expect(lines).toContain('*.log');
      expect(lines).toContain('.DS_Store');
      expect(lines).toContain('README.md');
      expect(lines).toContain('CONTRIBUTING.md');
      expect(lines).toContain('LICENSE');
      expect(lines).toContain('deploy.sh');
    });
  });

  describe('4. Google Cloud Run Deployment Script (deploy.sh)', () => {
    const deployScriptPath = path.join(rootDir, 'deploy.sh');

    it('verifies deploy.sh exists and is executable', () => {
      expect(fs.existsSync(deployScriptPath)).toBe(true);
      // Verify executable permission
      expect(() => fs.accessSync(deployScriptPath, fs.constants.X_OK)).not.toThrow();
    });

    it('enforces strict bash mode and pins deployment parameters to ksp-demos and us-central1', () => {
      const content = fs.readFileSync(deployScriptPath, 'utf-8');
      expect(content).toContain('#!/usr/bin/env bash');
      expect(content).toContain('set -euo pipefail');

      expect(content).toContain('PROJECT_ID="ksp-demos"');
      expect(content).toContain('REGION="us-central1"');
      expect(content).toContain('SERVICE_NAME="anotato"');
      expect(content).toContain('CONCURRENCY=80');
      expect(content).toContain('MIN_INSTANCES=0');
      expect(content).toContain('MAX_INSTANCES=5');
      expect(content).toContain('PORT=8080');
    });

    it('contains gcloud run deploy command with all required production flags', () => {
      const content = fs.readFileSync(deployScriptPath, 'utf-8');
      expect(content).toContain('gcloud run deploy');
      expect(content).toContain('--source .');
      expect(content).toContain('--project="${PROJECT_ID}"');
      expect(content).toContain('--region="${REGION}"');
      expect(content).toContain('--allow-unauthenticated');
      expect(content).toContain('--concurrency="${CONCURRENCY}"');
      expect(content).toContain('--min-instances="${MIN_INSTANCES}"');
      expect(content).toContain('--max-instances="${MAX_INSTANCES}"');
      expect(content).toContain('--port="${PORT}"');
      expect(content).toContain('--set-env-vars="NODE_ENV=production"');
    });

    it('includes pre-flight build check and post-deployment URL reporting', () => {
      const content = fs.readFileSync(deployScriptPath, 'utf-8');
      expect(content).toContain('npm run build');
      expect(content).toContain('gcloud run services describe');
      expect(content).toContain('status.url');
    });
  });
});
