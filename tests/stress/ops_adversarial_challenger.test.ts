import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Adversarial Challenger Suite: Operations, Rate Limiting, Caching & Offline Autonomy
 */
describe('Adversarial Challenger Suite: Operations, Rate Limiting, Caching & Offline Autonomy', () => {
  const rootDir = path.resolve(__dirname, '../../');
  const nginxConfPath = path.join(rootDir, 'nginx.conf');
  const dockerfilePath = path.join(rootDir, 'Dockerfile');
  const dockerignorePath = path.join(rootDir, '.dockerignore');
  const deployShPath = path.join(rootDir, 'deploy.sh');
  const distDir = path.join(rootDir, 'dist');

  // ==========================================================================
  // Dimension 1: Nginx Rate Limiting & Bot Flood Resistance Simulation
  // ==========================================================================
  describe('Dimension 1: Nginx Rate-Limiting Zone & Bot Flood Defense Oracle', () => {
    it('verifies nginx.conf contains exact rate-limiting and connection-limiting syntax', () => {
      const content = fs.readFileSync(nginxConfPath, 'utf-8');

      // Rate limit zone: 10MB memory, 30 requests/second
      expect(content).toMatch(/limit_req_zone\s+\$binary_remote_addr\s+zone=anotato_limit:10m\s+rate=30r\/s;/);
      // Connection limit zone: 10MB memory
      expect(content).toMatch(/limit_conn_zone\s+\$binary_remote_addr\s+zone=anotato_conn:10m;/);
      // Burst and nodelay
      expect(content).toMatch(/limit_req\s+zone=anotato_limit\s+burst=50\s+nodelay;/);
      // Status code
      expect(content).toMatch(/limit_req_status\s+429;/);
      // Connection limit
      expect(content).toMatch(/limit_conn\s+anotato_conn\s+30;/);
    });

    /**
     * Nginx Token/Leaky Bucket Rate Limiting Mathematical Simulator
     * Replicates the exact algorithm used by ngx_http_limit_req_module with `nodelay`.
     */
    class NginxRateLimiter {
      private ratePerSec: number;
      private burst: number;
      private tokens: number;
      private lastTimestamp: number;

      constructor(ratePerSec = 30, burst = 50) {
        this.ratePerSec = ratePerSec;
        this.burst = burst;
        this.tokens = burst; // Initial burst capacity
        this.lastTimestamp = 0;
      }

      public request(timestampMs: number): { status: 200 | 429; tokensRemaining: number } {
        if (this.lastTimestamp === 0) {
          this.lastTimestamp = timestampMs;
        }

        const elapsedSec = (timestampMs - this.lastTimestamp) / 1000;
        this.lastTimestamp = timestampMs;

        // Refill tokens according to rate
        this.tokens = Math.min(this.burst, this.tokens + elapsedSec * this.ratePerSec);

        if (this.tokens >= 1) {
          this.tokens -= 1;
          return { status: 200, tokensRemaining: this.tokens };
        } else {
          return { status: 429, tokensRemaining: 0 };
        }
      }
    }

    it('empirically simulates sudden bot flood (80 rapid requests in 1ms) and drops excess with 429', () => {
      const limiter = new NginxRateLimiter(30, 50);
      const startTime = 1000;

      let passed200 = 0;
      let blocked429 = 0;

      for (let i = 0; i < 80; i++) {
        // All 80 requests hit within 1ms window
        const res = limiter.request(startTime);
        if (res.status === 200) passed200++;
        if (res.status === 429) blocked429++;
      }

      // Initial burst allows exactly 50 requests
      expect(passed200).toBe(50);
      // The remaining 30 requests are dropped with HTTP 429
      expect(blocked429).toBe(30);
    });

    it('empirically simulates sustained bot attack (100 req/s over 3 seconds) and throttles correctly', () => {
      const limiter = new NginxRateLimiter(30, 50);
      let currentTime = 1000;
      let totalPassed = 0;
      let totalBlocked = 0;

      // 3 seconds, 100 requests per second (1 request every 10ms)
      for (let sec = 0; sec < 3; sec++) {
        for (let req = 0; req < 100; req++) {
          currentTime += 10;
          const res = limiter.request(currentTime);
          if (res.status === 200) totalPassed++;
          if (res.status === 429) totalBlocked++;
        }
      }

      // Over 3 seconds at 30 req/s + 50 initial burst = ~140 allowed requests
      // Out of 300 total requests, ~140 pass and ~160 are dropped with 429
      expect(totalPassed).toBeGreaterThanOrEqual(135);
      expect(totalPassed).toBeLessThanOrEqual(145);
      expect(totalBlocked).toBeGreaterThanOrEqual(155);
      expect(totalBlocked).toBeLessThanOrEqual(165);
      expect(totalPassed + totalBlocked).toBe(300);
    });

    it('verifies Cloud Run deploy.sh instance caps protect against distributed DDoS cost runaway', () => {
      const content = fs.readFileSync(deployShPath, 'utf-8');

      // Check max instances limit
      expect(content).toMatch(/MAX_INSTANCES=5/);
      expect(content).toMatch(/--max-instances="\${MAX_INSTANCES}"/);

      // Check concurrency per instance
      expect(content).toMatch(/CONCURRENCY=80/);
      expect(content).toMatch(/--concurrency="\${CONCURRENCY}"/);

      // Max total cluster concurrency = 5 * 80 = 400 simultaneous requests
      const maxInstances = 5;
      const concurrency = 80;
      const totalClusterConcurrency = maxInstances * concurrency;
      expect(totalClusterConcurrency).toBe(400);

      // Scale to zero protects idle cost
      expect(content).toMatch(/MIN_INSTANCES=0/);
    });
  });

  // ==========================================================================
  // Dimension 2: Static Asset Caching & Revalidation Oracle
  // ==========================================================================
  describe('Dimension 2: Static Asset Caching Headers vs HTML Revalidation Oracle', () => {
    it('verifies immutable caching headers for /assets/ in nginx.conf', () => {
      const content = fs.readFileSync(nginxConfPath, 'utf-8');

      // Asset location block
      const assetBlockMatch = content.match(/location\s+\/assets\/\s*\{([^}]+)\}/);
      expect(assetBlockMatch).not.toBeNull();
      const assetBlock = assetBlockMatch![1];

      expect(assetBlock).toContain('expires 1y;');
      expect(assetBlock).toContain('add_header Cache-Control "public, max-age=31536000, immutable" always;');
      expect(assetBlock).toContain('access_log off;');
    });

    it('verifies static media caching headers for image and font extensions', () => {
      const content = fs.readFileSync(nginxConfPath, 'utf-8');

      const mediaBlockMatch = content.match(/location\s+~\*\s+\\\.\(\?:ico\|svg\|png\|jpg\|jpeg\|gif\|webp\|woff\|woff2\|ttf\|eot\)\$\s*\{([^}]+)\}/);
      expect(mediaBlockMatch).not.toBeNull();
      const mediaBlock = mediaBlockMatch![1];

      expect(mediaBlock).toContain('expires 30d;');
      expect(mediaBlock).toContain('add_header Cache-Control "public, max-age=2592000, immutable" always;');
      expect(mediaBlock).toContain('access_log off;');
    });

    it('verifies strict no-cache revalidation headers for SPA fallback index.html', () => {
      const content = fs.readFileSync(nginxConfPath, 'utf-8');

      const spaBlockMatch = content.match(/location\s+\/\s*\{([^}]+)\}/);
      expect(spaBlockMatch).not.toBeNull();
      const spaBlock = spaBlockMatch![1];

      expect(spaBlock).toContain('try_files $uri $uri/ /index.html;');
      expect(spaBlock).toContain('add_header Cache-Control "no-cache, must-revalidate" always;');
      expect(spaBlock).toContain('add_header Pragma "no-cache" always;');
      expect(spaBlock).toContain('add_header Expires "0" always;');
    });

    it('verifies built production bundle produces cryptographic content-hashes in /assets/', () => {
      expect(fs.existsSync(distDir)).toBe(true);
      const assetsDir = path.join(distDir, 'assets');
      expect(fs.existsSync(assetsDir)).toBe(true);

      const files = fs.readdirSync(assetsDir);
      const jsFiles = files.filter((f) => f.endsWith('.js'));
      const cssFiles = files.filter((f) => f.endsWith('.css'));

      expect(jsFiles.length).toBeGreaterThanOrEqual(1);
      expect(cssFiles.length).toBeGreaterThanOrEqual(1);

      // Verify content hash naming convention (index-[hash].js, index-[hash].css)
      for (const jsFile of jsFiles) {
        expect(jsFile).toMatch(/^index-[A-Za-z0-9_-]+\.js$/);
      }
      for (const cssFile of cssFiles) {
        expect(cssFile).toMatch(/^index-[A-Za-z0-9_-]+\.css$/);
      }

      // Verify index.html in dist points directly to these hashed assets
      const indexHtmlContent = fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8');
      for (const jsFile of jsFiles) {
        expect(indexHtmlContent).toContain(`/assets/${jsFile}`);
      }
      for (const cssFile of cssFiles) {
        expect(indexHtmlContent).toContain(`/assets/${cssFile}`);
      }
    });
  });

  // ==========================================================================
  // Dimension 3: Client-Side 100% Offline Autonomy & Zero Network Egress
  // ==========================================================================
  describe('Dimension 3: Client-Side 100% Offline Autonomy & Zero Network Egress Oracle', () => {
    it('verifies zero external API fetch/xhr/ws egress calls in source code', () => {
      const srcDir = path.join(rootDir, 'src');

      function scanDirForEgress(dir: string): string[] {
        let violations: string[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            violations = violations.concat(scanDirForEgress(fullPath));
          } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
            const content = fs.readFileSync(fullPath, 'utf-8');

            // Look for active fetch(), new WebSocket(), new XMLHttpRequest(), new EventSource()
            const fetchCalls = content.match(/\bfetch\s*\(/g);
            const wsCalls = content.match(/\bnew\s+WebSocket\s*\(/g);
            const xhrCalls = content.match(/\bnew\s+XMLHttpRequest\s*\(/g);
            const eventSourceCalls = content.match(/\bnew\s+EventSource\s*\(/g);

            if (fetchCalls) violations.push(`${entry.name}: fetch() detected`);
            if (wsCalls) violations.push(`${entry.name}: WebSocket detected`);
            if (xhrCalls) violations.push(`${entry.name}: XMLHttpRequest detected`);
            if (eventSourceCalls) violations.push(`${entry.name}: EventSource detected`);
          }
        }
        return violations;
      }

      const violations = scanDirForEgress(srcDir);
      expect(violations).toEqual([]);
    });

    it('verifies telemetry handles offline state without throwing or blocking UI', async () => {
      const { trackEvent, trackPaste, trackCopy, trackAnnotate, setTelemetryEnabled } = await import(
        '../../src/analytics/telemetry'
      );

      setTelemetryEnabled(true);

      // Mock offline navigator
      const originalOnLine = navigator.onLine;
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
        writable: true,
      });

      // Track events while offline
      expect(() => {
        trackEvent('test_offline_event', { key: 'val' });
        trackPaste({ source: 'clipboard', fileSize: 1024, width: 800, height: 600 });
        trackCopy({ type: 'image_clipboard', annotationCount: 3 });
        trackAnnotate({ shapeType: 'box', color: '#ff0000', strokeWidth: 3 });
      }).not.toThrow();

      // Restore navigator.onLine
      Object.defineProperty(navigator, 'onLine', {
        value: originalOnLine,
        configurable: true,
        writable: true,
      });
    });

    it('verifies telemetry handles throwing window.gtag safely without crashing app thread', async () => {
      const { trackEvent, setTelemetryEnabled } = await import('../../src/analytics/telemetry');

      setTelemetryEnabled(true);

      // Mock online navigator
      Object.defineProperty(navigator, 'onLine', {
        value: true,
        configurable: true,
        writable: true,
      });

      // Mock broken gtag that throws
      window.gtag = vi.fn().mockImplementation(() => {
        throw new Error('Network / AdBlock / Offline failure');
      });

      // Should not throw
      expect(() => {
        trackEvent('test_throwing_gtag');
      }).not.toThrow();

      // Allow microtasks to resolve
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    it('verifies Dockerfile and Nginx configuration serve complete self-contained SPA', () => {
      const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf-8');

      // Multi-stage check
      expect(dockerfileContent).toMatch(/FROM\s+node:20-alpine\s+AS\s+builder/);
      expect(dockerfileContent).toMatch(/FROM\s+nginx:1\.27-alpine\s+AS\s+runner/);
      expect(dockerfileContent).toContain('COPY --from=builder /app/dist /usr/share/nginx/html');
      expect(dockerfileContent).toContain('COPY nginx.conf /etc/nginx/conf.d/default.conf');

      // Healthcheck check
      expect(dockerfileContent).toContain('HEALTHCHECK');
      expect(dockerfileContent).toContain('http://localhost:8080/healthz');
    });
  });

  // ==========================================================================
  // Dimension 4: Security Headers & Build Hygiene
  // ==========================================================================
  describe('Dimension 4: Security Headers & Container Build Isolation Oracle', () => {
    it('verifies security headers and CSP directives in nginx.conf', () => {
      const content = fs.readFileSync(nginxConfPath, 'utf-8');

      expect(content).toContain('add_header X-Frame-Options "DENY" always;');
      expect(content).toContain('add_header X-Content-Type-Options "nosniff" always;');
      expect(content).toContain('add_header X-XSS-Protection "1; mode=block" always;');
      expect(content).toContain('add_header Referrer-Policy "strict-origin-when-cross-origin" always;');
      expect(content).toContain('add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;');
      expect(content).toContain('default-src \'self\'');
    });

    it('verifies .dockerignore excludes internal development metadata and tests', () => {
      const content = fs.readFileSync(dockerignorePath, 'utf-8');
      const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);

      expect(lines).toContain('.git');
      expect(lines).toContain('.agents');
      expect(lines).toContain('node_modules');
      expect(lines).toContain('tests');
      expect(lines).toContain('coverage');
    });

    it('verifies deploy.sh strict execution flags and pinned configuration', () => {
      const content = fs.readFileSync(deployShPath, 'utf-8');

      expect(content).toContain('#!/usr/bin/env bash');
      expect(content).toContain('set -euo pipefail');
      expect(content).toContain('PROJECT_ID="ksp-demos"');
      expect(content).toContain('REGION="us-central1"');
      expect(content).toContain('SERVICE_NAME="anotato"');
      expect(content).toContain('--allow-unauthenticated');
    });
  });
});
