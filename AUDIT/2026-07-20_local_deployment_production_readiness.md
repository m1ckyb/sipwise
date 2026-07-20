# LOCAL DEPLOYMENT — PRODUCTION READINESS AUDIT

**Target System:** SipWise Local Deployment Mode (Docker + PostgreSQL + Hono API)  
**Audit Date:** 2026-07-20  
**Review Board:** Principal Engineer Review Panel (Security, Backend, Frontend, DevOps/Infra, Database)  
**Scope:** All files created/modified for the local deployment feature  
**Status:** 🔴 **NOT PRODUCTION READY** — Critical security and infrastructure issues found

---

## EXECUTIVE SUMMARY

The local deployment feature is **functionally complete** — the codebase bootstraps, auth works, data syncs, push subscriptions flow, API keys generate, cron fires, Docker builds pass, lint passes, and all 18 tests pass. However, the system has **14 critical/high findings** that must be resolved before any production traffic. The most urgent are: wide-open CORS, a hardcoded JWT fallback secret, no HTTPS/TLS, PostgreSQL port exposed to host, and no request size limits.

---

## FINDINGS BY SEVERITY

### 🔴 CRITICAL (must fix before any deployment)

---

#### C-01: JWT Secret Falls Back to Known Default
**File:** `server/src/middleware/auth.ts:3`  
**Severity:** Critical  
**Category:** Authentication & Secrets Management  

```ts
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
```

**Problem:** If `.env` is missing or `JWT_SECRET` is unset, the server silently starts with a known, guessable secret. Any attacker can forge valid JWTs for any user ID. This is the single most dangerous finding — it completely bypasses authentication.

**Recommended Fix:**
```ts
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'change-me-in-production') {
  console.error('[SipWise] FATAL: JWT_SECRET is not set or is the default. Refusing to start.');
  process.exit(1);
}
```

---

#### C-02: CORS Allows All Origins
**File:** `server/src/index.ts:23`  
**Severity:** Critical  
**Category:** Cross-Origin Security  

```ts
app.use('*', cors());
```

**Problem:** `cors()` with no options sets `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Credentials: true`. Any website can make authenticated requests to this API on behalf of a logged-in user. Combined with the JWT-in-localStorage pattern, this enables full account takeover from any malicious site.

**Recommended Fix:** Configure CORS with explicit origin allowlist and disable credentials wildcard:
```ts
app.use('*', cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:8080'],
  credentials: true,
}));
```

**Note:** The external API (`server/src/routes/api.ts`) has its own `corsHeaders()` function that reads `ALLOWED_ORIGINS` — this is the correct pattern. The global middleware in `index.ts` should follow the same approach.

---

#### C-03: No HTTPS / No TLS
**Files:** `docker/nginx.conf`, `docker-compose.yml`  
**Severity:** Critical  
**Category:** Transport Security  

**Problem:** Nginx listens on port 80 (plain HTTP). JWT tokens, passwords, and API keys are transmitted in cleartext. Docker Compose exposes ports without TLS termination.

**Impact:** Any network observer (Wi-Fi, ISP, cloud network) can intercept all traffic including auth credentials.

**Recommended Fix:** Add TLS termination via:
- Nginx with Let's Encrypt certbot sidecar, OR
- Caddy auto-TLS reverse proxy, OR
- Cloudflare Tunnel / Cloudflare as edge proxy

At minimum, document that TLS must be terminated by an upstream reverse proxy in production.

---

#### C-04: PostgreSQL Port Exposed to Host Network
**File:** `docker-compose.yml:14`  
**Severity:** Critical  
**Category:** Network Security  

```yaml
ports:
  - "5432:5432"
```

**Problem:** PostgreSQL is accessible from the host network (and potentially the wider network depending on firewall). Anyone with host access can connect directly to the database, bypassing all API authentication.

**Recommended Fix:** Remove the `ports:` mapping for PostgreSQL. The `api` container connects via the Docker internal network (`pg:5432`), so host exposure is unnecessary.

---

#### C-05: No Request Body Size Limits
**File:** `server/src/index.ts` (Hono default)  
**Severity:** Critical  
**Category:** Availability / Denial of Service  

**Problem:** Hono (and the underlying `@hono/node-server`) have no default request body size limit. An attacker can send gigabyte payloads to `/api/data` PUT endpoint, consuming all memory and crashing the server.

**Recommended Fix:** Add body size middleware:
```ts
import { sizeLimiter } from 'hono/body-limit';
app.use('*', sizeLimiter({ maxSize: 1024 * 1024 })); // 1MB
```

Or limit at the Nginx level:
```nginx
client_max_body_size 1m;
```

---

#### C-06: Hardcoded Default JWT Secret in docker-compose.yml
**File:** `docker-compose.yml:33`  
**Severity:** Critical  
**Category:** Secrets Management  

```yaml
JWT_SECRET: ${JWT_SECRET:-change-me-in-production}
```

**Problem:** Even with the env var documented, `change-me-in-production` as a fallback means anyone deploying with `docker compose up` (without editing `.env`) runs a fully compromised auth system.

**Recommended Fix:** Remove the default entirely. Fail loudly if not set:
```yaml
JWT_SECRET: ${JWT_SECRET:?Set JWT_SECRET in .env}
```

---

### 🟠 HIGH (must fix before public-facing deployment)

---

#### H-01: No Password Complexity Validation
**File:** `server/src/routes/auth.ts:19`  
**Severity:** High  
**Category:** Authentication  

```ts
if (password.length < 6) {
  return c.json({ error: 'Password must be at least 6 characters' }, 400);
}
```

**Problem:** Only minimum length is enforced. No upper bound, no complexity requirements. Users can set `123456` or `aaaaaa` as passwords.

**Recommended Fix:** Add complexity check:
```ts
if (password.length < 8 || password.length > 128) {
  return c.json({ error: 'Password must be 8-128 characters' }, 400);
}
if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
  return c.json({ error: 'Password must include uppercase, lowercase, and a digit' }, 400);
}
```

---

#### H-02: JWT Stored in localStorage — XSS Vulnerable
**Files:** `src/utils/api.ts:5-13`, `src/context/AppContext.tsx`  
**Severity:** High  
**Category:** Token Security  

```ts
function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
```

**Problem:** JWT is stored in `localStorage`. Any XSS vulnerability in the app (including in third-party browser extensions or compromised CDN scripts) can steal the token via `localStorage.getItem('sipwise_api_token')`.

**Recommended Fix:** Move JWT to an httpOnly, Secure, SameSite=Strict cookie set by the server on login. This prevents JavaScript from reading the token while still sending it with requests.

---

#### H-03: In-Memory Rate Limiter — Not Persistent
**File:** `server/src/middleware/rateLimit.ts`  
**Severity:** High  
**Category:** Availability  

**Problem:** Rate limits live in a `Map` in Node.js memory. They reset on server restart, are not shared across instances (if scaled to multiple containers), and are lost on crash. An attacker can bypass limits by simply waiting for a restart.

**Impact:** Combined with no body size limits, this allows repeated brute-force attacks and DoS.

**Recommended Fix:** Use the existing `sipwise_rate_limits` PostgreSQL table (already created in `init.sql` but unused by the code), or use Redis. The table already exists — wire it up.

---

#### H-04: No Graceful Shutdown
**File:** `server/src/index.ts`  
**Severity:** High  
**Category:** Reliability  

**Problem:** The server doesn't handle `SIGTERM` or `SIGINT`. On `docker compose down` or container orchestration events, in-flight requests are killed immediately, potentially corrupting data writes in progress.

**Recommended Fix:**
```ts
const server = serve({ fetch: app.fetch, port }, () => { ... });

const shutdown = async () => {
  console.log('[SipWise] Shutting down gracefully...');
  server.close(() => db.end());
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

---

#### H-05: No Frontend Container Healthcheck
**File:** `docker-compose.yml`  
**Severity:** High  
**Category:** Orchestration  

**Problem:** `api` depends on `pg` with `condition: service_healthy`, but `frontend` has no healthcheck. If Nginx fails to start (bad config, port conflict), Docker considers the container "running" and dependent services may route traffic to a dead endpoint.

**Recommended Fix:**
```yaml
frontend:
  # ...
  healthcheck:
    test: ["CMD", "wget", "--spider", "-q", "http://localhost:80/api/health"]
    interval: 10s
    timeout: 3s
    retries: 3
```

---

#### H-06: No Resource Limits on Containers
**File:** `docker-compose.yml`  
**Severity:** High  
**Category:** Infrastructure  

**Problem:** No `mem_limit`, `cpus`, or `deploy.resources` set on any container. A single misbehaving container (memory leak, infinite loop) can consume all host resources and take down all services.

**Recommended Fix:**
```yaml
services:
  pg:
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '1.0'
  api:
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: '0.5'
  frontend:
    deploy:
      resources:
        limits:
          memory: 128M
          cpus: '0.25'
```

---

#### H-07: No Structured Logging / No Observability
**Files:** `server/src/index.ts`, `server/src/cron/checkAlerts.ts`  
**Severity:** High  
**Category:** Operations  

**Problem:** All logging is via `console.log`/`console.error`. No structured JSON logging, no request tracing (correlation IDs), no metrics endpoint, no health check beyond `{ status: 'ok' }`. In production with multiple containers, this makes debugging nearly impossible.

**Recommended Fix:**
- Add structured JSON logger (e.g., `pino` which pairs well with Hono)
- Add request ID middleware for correlation
- Add `/api/health` endpoint that also checks DB connectivity:
  ```ts
  app.get('/api/health', async (c) => {
    try {
      await db.query('SELECT 1');
      return c.json({ status: 'ok', db: 'ok', version: '...' });
    } catch {
      return c.json({ status: 'degraded', db: 'error' }, 503);
    }
  });
  ```

---

#### H-08: No CSRF Protection
**Files:** `server/src/index.ts`, `server/src/routes/auth.ts`  
**Severity:** High  
**Category:** Web Security  

**Problem:** No CSRF token validation. With CORS `*` (C-02), any website can send authenticated POST/PUT requests. Even after fixing CORS, CSRF should be addressed with either:
- SameSite cookies (preferred if moving to cookie-based auth per H-02)
- CSRF token header validation
- Strict `Origin` header checking

---

### 🟡 MEDIUM (fix before scaling or accepting sensitive data)

---

#### M-01: Idempotency Keys Never Expire
**File:** `server/src/routes/api.ts:155-160`, `docker/init.sql:60-68`  
**Severity:** Medium  
**Category:** Database Hygiene  

```ts
db.query(
  'INSERT INTO sipwise_idempotency_keys (key, user_id, response_body) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING',
  [idempotencyKey, auth.userId, JSON.stringify(responsePayload)],
).then();
```

**Problem:** Idempotency keys are stored forever with no TTL cleanup. Over time, `sipwise_idempotency_keys` will grow unbounded. The index exists on `created_at` but nothing deletes old rows.

**Recommended Fix:** Add a periodic cleanup job or TTL:
```sql
-- In cron or as a scheduled task:
DELETE FROM sipwise_idempotency_keys WHERE created_at < now() - interval '7 days';
```

---

#### M-02: No TLS on Database Connection
**File:** `server/src/db.ts`  
**Severity:** Medium  
**Category:** Transport Security  

```ts
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
```

**Problem:** Database connection uses plain TCP. Even within Docker's network, this means database traffic is unencrypted. In cloud deployments, this may violate compliance requirements.

**Recommended Fix:** Support optional TLS:
```ts
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  // ...
});
```

---

#### M-03: No Backup Strategy
**File:** `docker-compose.yml`  
**Severity:** Medium  
**Category:** Data Protection  

**Problem:** PostgreSQL data is in a Docker named volume (`pgdata`) with no backup mechanism. A single disk failure or accidental `docker volume rm` destroys all user data permanently.

**Recommended Fix:**
- Add a `pg-backup` sidecar service that runs `pg_dump` daily to a mounted backup volume
- Document restore procedures
- Add to `docker-compose.yml`:
  ```yaml
  backup:
    image: postgres:16-alpine
    volumes:
      - ./backups:/backups
    depends_on:
      pg:
        condition: service_healthy
    entrypoint: >
      sh -c 'while true; do
        pg_dump -U sipwise -h pg sipwise | gzip > /backups/sipwise_$$(date +%Y%m%d_%H%M%S).sql.gz;
        find /backups -name "*.sql.gz" -mtime +30 -delete;
        sleep 86400;
      done'
  ```

---

#### M-04: No Input Validation on Drink Data
**File:** `server/src/routes/data.ts:20-25`  
**Severity:** Medium  
**Category:** Data Integrity  

```ts
const body = await c.req.json<{
  profile?: unknown;
  drinks?: unknown;
  presets?: unknown;
  is_sober?: boolean;
}>();
```

**Problem:** Profile, drinks, and presets are typed as `unknown` and written directly to the database. No schema validation means a malicious client can write arbitrary JSON to PostgreSQL.

**Recommended Fix:** Add schema validation (e.g., with `zod`):
```ts
import { z } from 'zod';
const BodySchema = z.object({
  profile: z.object({ weight: z.number(), gender: z.enum(['male','female']), ... }).optional(),
  drinks: z.array(z.object({ id: z.string(), volume: z.number(), abv: z.number(), ... })).optional(),
  presets: z.array(z.object({ name: z.string(), volume: z.number(), abv: z.number(), ... })).optional(),
  is_sober: z.boolean().optional(),
});
const body = BodySchema.parse(await c.req.json());
```

---

#### M-05: No Request Timeout on Frontend Fetch
**File:** `src/utils/api.ts:28-36`  
**Severity:** Medium  
**Category:** Resilience  

```ts
const res = await fetch(`${API_URL}${path}`, {
  method,
  headers,
  body: body !== undefined ? JSON.stringify(body) : undefined,
});
```

**Problem:** No `AbortController` timeout. If the server hangs (DB connection pool exhausted, etc.), the UI hangs indefinitely with no feedback to the user.

**Recommended Fix:**
```ts
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 15_000);
const res = await fetch(`${API_URL}${path}`, {
  method, headers, body,
  signal: controller.signal,
}).finally(() => clearTimeout(timeout));
```

---

#### M-06: No Graceful Database Pool Shutdown
**File:** `server/src/db.ts`  
**Severity:** Medium  
**Category:** Reliability  

**Problem:** The pool is created but `pool.end()` is only called from the (non-existent) graceful shutdown handler. On crash, open connections are abandoned, potentially causing connection leaks in PostgreSQL.

**Impact:** PostgreSQL connection limit exhaustion over time.

---

#### M-07: Supabase Client Unconditionally Loaded
**Files:** `src/utils/supabase.ts`, `src/utils/logger.ts`, `src/context/AppContext.tsx`  
**Severity:** Medium  
**Category:** Architecture / Bundle Size  

```ts
import { supabase } from './supabase';
```

**Problem:** `supabase.ts` is imported even in local mode. It calls `createClient()` with placeholder values and logs a warning. This is a 40KB+ bundle overhead and creates a console warning on every page load in local mode.

**Recommended Fix:** Lazy-import or tree-shake:
```ts
// Only import supabase when not in local mode
const supabase = isLocalMode ? null : (await import('./supabase')).supabase;
```

Or use Vite's dynamic imports with `import()`.

---

#### M-08: No Database Migration Strategy
**File:** `docker/init.sql`  
**Severity:** Medium  
**Category:** Operations  

**Problem:** `init.sql` runs only on first database creation. There is no migration framework. Any future schema change (new column, index, table) requires manual intervention or data loss.

**Recommended Fix:** Adopt a migration tool (e.g., `node-pg-migrate`, `drizzle-kit`, or `knex` migrations). Add a `server/src/migrations/` directory and run migrations on server startup.

---

### 🟢 LOW (improve before scale / hardening)

---

#### L-01: No Error Retry on Frontend
**File:** `src/utils/api.ts`  
**Severity:** Low  
**Category:** UX / Resilience  

Transient network errors (502, 503, 504) immediately surface as errors. A retry with exponential backoff for GET requests would improve reliability on flaky networks.

---

#### L-02: bcrypt Rounds Not Configurable
**File:** `server/src/routes/auth.ts:33`  
**Severity:** Low  
**Category:** Security  

```ts
const passwordHash = await bcrypt.hash(password, 10);
```

**Problem:** Hardcoded to 10 rounds. Not tunable via environment variable for performance tuning.

**Recommended Fix:** `const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);`

---

#### L-03: No Audit Trail
**Files:** All server routes  
**Severity:** Low  
**Category:** Compliance  

No record of who created/deleted API keys, when data was last modified, or login attempts. For personal use this is acceptable; for multi-user deployments, an audit log is essential.

---

#### L-04: Push Subscription Endpoint Not Validated
**File:** `server/src/routes/push.ts`  
**Severity:** Low  
**Category:** Input Validation  

Push subscription endpoint URLs are stored as-is. No validation that the URL is a valid push service endpoint. A malformed URL could cause push notification failures in the cron job.

---

#### L-05: No Docker Build Pipeline in CI
**Files:** `.github/workflows/deploy.yml`  
**Severity:** Low  
**Category:** CI/CD  

The existing CI runs `npm run build` but doesn't test the Docker build or run integration tests against the Docker Compose stack.

**Recommended Fix:** Add a `docker-build` job:
```yaml
docker-build:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - run: docker compose build
    - run: docker compose up -d
    - run: sleep 10 && curl -f http://localhost:8080/api/health
```

---

## POSITIVE FINDINGS (what's done well)

| Area | Detail |
|------|--------|
| **Dual-mode architecture** | `VITE_API_URL` toggle is clean; `isLocalMode` detection works correctly across all components |
| **Route alignment** | Frontend and server routes match perfectly after fix: `/api/data`, `/api/push-subscriptions`, `/api/logs` |
| **JWT auth flow** | Token sign/verify is correct; auth middleware properly extracts user ID; 7-day expiry is reasonable |
| **API key auth** | SHA-256 hashed storage, prefix for identification, one-time display — follows best practices |
| **Idempotency** | External API POST `/bac` correctly implements idempotency key deduplication |
| **Data migration** | `alcoclone_*` → `sipwise_*` localStorage migration is correctly handled on first load |
| **Cron sober alerts** | `node-cron` correctly replaces `pg_cron`; cleanup of stale push subscriptions (410 GONE) is handled |
| **Build tooling** | Multi-stage Dockerfile (node → nginx) is correct; Dockerfile.api compiles TypeScript properly |
| **Database schema** | Proper foreign keys with `ON DELETE CASCADE`, correct indexes, `updated_at` trigger |
| **Test suite** | 18/18 tests passing; build succeeds; lint clean |
| **BAC calculation** | Correctly ported from edge functions to `server/src/utils/bac.ts` |
| **Health check** | `/api/health` endpoint exists (could be deeper — see H-07) |

---

## PRIORITY REMEDIATION PLAN

### Phase 1 — IMMEDIATE (block production)
1. **C-01**: Fail on missing/default JWT secret
2. **C-02**: Configure CORS with explicit origin list
3. **C-04**: Remove PostgreSQL port exposure
4. **C-05**: Add request body size limits
5. **C-06**: Remove default JWT fallback in docker-compose
6. **H-07**: Add DB connectivity check to `/api/health`

### Phase 2 — BEFORE PUBLIC-FACING
7. **C-03**: Add TLS termination documentation or implementation
8. **H-01**: Add password complexity validation
9. **H-02**: Move JWT to httpOnly cookies
10. **H-04**: Add graceful shutdown handlers
11. **H-03**: Wire up PostgreSQL-backed rate limiter
12. **H-08**: Add CSRF protection

### Phase 3 — BEFORE SCALE
13. **M-01**: Add idempotency key cleanup cron
14. **M-04**: Add request body schema validation
15. **M-03**: Add automated backup mechanism
16. **M-05**: Add frontend request timeouts
17. **M-07**: Lazy-load Supabase client in local mode
18. **M-08**: Adopt a migration framework

### Phase 4 — HARDENING
19. All LOW findings
20. Structured logging with `pino`
21. Request ID correlation
22. Docker security scanning in CI
23. E2E test suite

---

## VERDICT

The local deployment feature is a solid MVP with correct architecture and functional parity. However, **it is not production-ready in its current state**. The critical security findings (especially C-01 through C-06) represent real attack vectors that could lead to full account takeover, data exfiltration, or service destruction. Phase 1 remediation should be completed and tested before any real deployment.
