# ELITE PRODUCTION READINESS AUDIT

**Target System:** SipWise (Full-Stack Web App & API — React 19, TypeScript, Hono, PostgreSQL, Supabase, Docker)  
**Audit Date:** 2026-07-21  
**Review Board:** Principal Engineer Review Panel (Security, Backend, Frontend, DevOps/Infra, Database, QA/Reliability, AI Security)  
**Scope:** Entire Codebase (`src/`, `server/`, `supabase/`, `docker/`, `.github/`, root SQL & config files)  
**Status:** 🔴 **NOT PRODUCTION READY** — Severe architectural, security, database performance, and infrastructure blockers exist.

---

## 1. FINDINGS & AUDIT ISSUES

### 🔴 CRITICAL SEVERITY FINDINGS

#### Issue C-01: Dual Schema Architecture Divergence (Monolithic JSONB vs Relational SQL)
- **File:** [init.sql](file:///home/michael/sipwise/docker/init.sql#L18-L25) & [20260719182000_init_relational_schema.sql](file:///home/michael/sipwise/supabase/migrations/20260719182000_init_relational_schema.sql#L6-L15)
- **Function/Class:** Database Schema Definitions (`sipwise_user_data` vs `public.drinks`)
- **Severity:** 🔴 Critical
- **Category:** Database Architecture / Scalability / Data Integrity
- **Problem:** The local Docker database schema stores all user drinks inside a single un-indexed JSONB column (`sipwise_user_data.drinks`), whereas the Supabase production migrations utilize a normalized relational table (`public.drinks`). This creates two completely different data persistence paradigms across environments. In local mode, every single drink addition or edit requires serializing and overwriting the entire array of drinks in PostgreSQL.
- **Evidence:**
  [init.sql:L18-L25](file:///home/michael/sipwise/docker/init.sql#L18-L25):
  ```sql
  CREATE TABLE IF NOT EXISTS sipwise_user_data (
    id UUID PRIMARY KEY REFERENCES sipwise_users(id) ON DELETE CASCADE,
    profile JSONB,
    drinks JSONB,
    presets JSONB,
    is_sober BOOLEAN DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
  );
  ```
  [api.ts:L164-L167](file:///home/michael/sipwise/server/src/routes/api.ts#L164-L167):
  ```ts
  drinks.push(newDrink);
  await db.query(
    'UPDATE sipwise_user_data SET drinks = $1, updated_at = now() WHERE id = $2',
    [JSON.stringify(drinks), auth.userId],
  );
  ```
- **Impact:** System degrades exponentially with user activity. As users log hundreds of drinks, database write I/O, network bandwidth, memory consumption, and lock contention skyrocket. Concurrent updates from multiple devices will overwrite each other, causing catastrophic data loss.
- **Attack Scenario / Fail Mode:** A user with 1,000 logged drinks posts a new drink via the API. The server fetches the 500KB JSON payload, deserializes it, appends the drink, and writes back 500KB of raw JSON over a single table row. Under concurrent requests, row-level locks block all reads/writes, causing HTTP 504 gateway timeouts.
- **How To Reproduce:**
  1. Seed `sipwise_user_data.drinks` with 2,000 drink objects.
  2. Perform 50 concurrent `POST /api/bac` requests.
  3. Observe table lock timeouts and data corruption where drinks logged by request B overwrite drinks logged by request A.
- **Recommended Fix:** Unify database schemas across local Docker and Supabase environments. Eliminate the monolithic JSONB array column in favor of a normalized `sipwise_drinks` table with foreign key relationships and index structures.
- **Example Fix:**
  ```sql
  CREATE TABLE IF NOT EXISTS sipwise_drinks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES sipwise_users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Drink',
    volume NUMERIC NOT NULL CHECK (volume > 0),
    abv NUMERIC NOT NULL CHECK (abv >= 0 AND abv <= 100),
    calories NUMERIC DEFAULT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
  );
  CREATE INDEX idx_sipwise_drinks_user_ts ON sipwise_drinks(user_id, timestamp DESC);
  ```

---

#### Issue C-02: Denial of Service via Database-Backed Rate Limiting Write Amplification
- **File:** [rateLimit.ts](file:///home/michael/sipwise/server/src/middleware/rateLimit.ts#L10-L28)
- **Function/Class:** `checkRateLimit`
- **Severity:** 🔴 Critical
- **Category:** Performance / Database / DDoS Exposure
- **Problem:** Every single API request executes a synchronous `DELETE` and an `INSERT ... ON CONFLICT DO UPDATE` query against the PostgreSQL database (`sipwise_rate_limits` table) to check rate limits. 
- **Evidence:**
  [rateLimit.ts:L10-L28](file:///home/michael/sipwise/server/src/middleware/rateLimit.ts#L10-L28):
  ```ts
  await db.query('DELETE FROM sipwise_rate_limits WHERE window_start < $1', [windowStart]);
  const { rows } = await db.query(
    `INSERT INTO sipwise_rate_limits (key, request_count, window_start) ...`,
    [key, windowStart],
  );
  ```
- **Impact:** Rate limiting is meant to protect the database and server from high load. In this implementation, rate limiting **causes** massive database write amplification. Every incoming HTTP request forces 2 disk writes. Under an actual DDoS or automated bot attack, PostgreSQL disk IOPS and connection pool resources will exhaust instantly, crashing the entire application.
- **Attack Scenario:** An attacker launches a light HTTP flood of 500 requests/second against `/api/bac`. Instead of rejecting requests at the edge, PostgreSQL receives 1,000 DB queries/second (500 DELETEs + 500 INSERTs), consuming all 10 pool connections in `server/src/db.ts` and bringing down all database operations for legitimate users.
- **How To Reproduce:**
  1. Run `autocannon -c 50 -d 10 http://localhost:3000/api/bac` (or any rate-limited endpoint).
  2. Observe PostgreSQL CPU utilization hitting 100% and connection pool depletion errors (`Connection terminated unexpectedly`).
- **Recommended Fix:** Replace database-backed rate limiting with an in-memory token bucket (e.g. `lru-cache` for single-instance) or Redis / KeyDB for distributed cluster deployments.
- **Example Fix:**
  ```ts
  import { LRUCache } from 'lru-cache';

  const rateLimitCache = new LRUCache<string, { count: number; resetAt: number }>({
    max: 10000,
    ttl: 60 * 1000,
  });

  export function checkRateLimitInMemory(key: string, limit = 60) {
    const now = Date.now();
    const entry = rateLimitCache.get(key) || { count: 0, resetAt: now + 60000 };
    if (entry.count >= limit) return { allowed: false };
    entry.count += 1;
    rateLimitCache.set(key, entry);
    return { allowed: true };
  }
  ```

---

#### Issue C-03: Unauthenticated Public Log Injection & Database Storage Flooding
- **File:** [logs.ts](file:///home/michael/sipwise/server/src/routes/logs.ts#L15-L41)
- **Function/Class:** `POST /api/logs` Route Handler
- **Severity:** 🔴 Critical
- **Category:** Security / Storage Exhaustion / Unauthenticated API Abuse
- **Problem:** The `/api/logs` endpoint accepts unauthenticated requests and inserts arbitrary string data (`error_message`, `stack_trace`, `context` JSONB) directly into `sipwise_error_logs`. There is no rate limiting, no payload size restriction, and no validation on the size of `stack_trace` or `context`.
- **Evidence:**
  [logs.ts:L15-L38](file:///home/michael/sipwise/server/src/routes/logs.ts#L15-L38):
  ```ts
  logs.post('/', async (c) => {
    // Token optional...
    const parsed = LogSchema.safeParse(await c.req.json());
    ...
    await db.query(
      'INSERT INTO sipwise_error_logs (user_id, error_message, stack_trace, source, context) VALUES ($1, $2, $3, $4, $5)',
      [userId, error_message, stack_trace ?? null, source ?? 'frontend', context ? JSON.stringify(context) : null],
    );
  });
  ```
- **Impact:** Anyone on the public internet can flood the database with multi-gigabyte log entries, corrupting operational analytics, filling disk volumes, incurring exorbitant hosting costs, and causing complete database outage.
- **Attack Scenario:** An attacker sends a script in a loop posting 10MB JSON payloads to `/api/logs`. Within minutes, PostgreSQL disk space is depleted (100% full), causing database shutdown.
- **How To Reproduce:**
  ```bash
  curl -X POST http://localhost:3000/api/logs \
    -H "Content-Type: application/json" \
    -d "{\"error_message\": \"Boom\", \"stack_trace\": \"$(python3 -c 'print("A"*1000000)')\"}"
  ```
- **Recommended Fix:** Enforce rate limiting on `/api/logs`, cap field lengths in `LogSchema` (e.g. `stack_trace` max 4096 chars), and restrict log ingestion to authenticated sessions or remove public endpoint in favor of standard client APM (Sentry).
- **Example Fix:**
  ```ts
  const LogSchema = z.object({
    error_message: z.string().min(1).max(500),
    stack_trace: z.string().max(4096).optional(),
    source: z.string().max(50).optional(),
    context: z.record(z.unknown()).optional(),
  });
  ```

---

#### Issue C-04: Multi-Worker Scheduled Task Duplicate Execution & Push Notification Storm
- **File:** [checkAlerts.ts](file:///home/michael/sipwise/server/src/cron/checkAlerts.ts#L101-L107) & [index.ts](file:///home/michael/sipwise/server/src/index.ts#L61-L64)
- **Function/Class:** `startCron`
- **Severity:** 🔴 Critical
- **Category:** Architecture / Concurrency / Background Processing
- **Problem:** The background alert worker runs in-process via `node-cron` inside the HTTP server process. When scaling the backend horizontally across multiple containers/replicas, every server instance runs its own cron scheduler independently without leadership election or distributed locking.
- **Evidence:**
  [index.ts:L61-L64](file:///home/michael/sipwise/server/src/index.ts#L61-L64):
  ```ts
  const server: ServerType = serve({ fetch: app.fetch, port }, (info) => {
    logger.info({ port: info.port }, 'SipWise API server started');
    startCron();
  });
  ```
- **Impact:** If 4 backend instances are deployed behind a load balancer, users will receive 4 duplicate Web Push notifications every 5 minutes when reaching 0.00% BAC. Furthermore, concurrent database update queries (`UPDATE sipwise_user_data SET is_sober = true`) will cause transaction deadlocks.
- **Attack Scenario / Failure Mode:** System auto-scales under traffic load to 10 container instances. At the 5-minute mark, all 10 instances fetch the subscription list concurrently and trigger 10 redundant push API requests per user, exhausting push service quotas and frustrating users.
- **Recommended Fix:** Decouple background jobs from the API server. Run background tasks in a standalone single-instance worker container or use Redis-backed task queue with advisory locks (`pg_advisory_lock` or BullMQ).

---

### 🟠 MAJOR SEVERITY FINDINGS

#### Issue M-01: Insecure Token Storage in Client (LocalStorage XSS Exposure)
- **File:** [api.ts](file:///home/michael/sipwise/src/utils/api.ts#L3-L17)
- **Function/Class:** `getToken`, `setToken`, `clearToken`
- **Severity:** 🟠 Major
- **Category:** Security / Session Handling
- **Problem:** Authentication tokens (`sipwise_api_token`) are stored directly in browser `localStorage`. Any Cross-Site Scripting (XSS) vulnerability in any third-party npm package or dynamic script execution allows immediate extraction of user JWTs.
- **Evidence:**
  [api.ts:L8](file:///home/michael/sipwise/src/utils/api.ts#L8):
  ```ts
  function getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }
  ```
- **Impact:** Total account compromise if an attacker achieves script injection or compromises an npm dependency.
- **Recommended Fix:** Use `HttpOnly`, `Secure`, `SameSite=Strict` cookies for web session authentication instead of raw localStorage JWT bearer tokens.

---

#### Issue M-02: Non-Atomic Dual Database Writes in User Registration
- **File:** [auth.ts](file:///home/michael/sipwise/server/src/routes/auth.ts#L43-L52)
- **Function/Class:** `POST /api/auth/signup`
- **Severity:** 🟠 Major
- **Category:** Database / Data Consistency
- **Problem:** User registration performs two separate, un-transactioned `db.query` calls to `sipwise_users` and `sipwise_user_data`.
- **Evidence:**
  [auth.ts:L43-L52](file:///home/michael/sipwise/server/src/routes/auth.ts#L43-L52):
  ```ts
  const { rows } = await db.query('INSERT INTO sipwise_users ...');
  const user = rows[0];
  await db.query('INSERT INTO sipwise_user_data ...');
  ```
- **Impact:** If the database connection drops or the second query fails (e.g. key constraint error), an orphaned user account exists in `sipwise_users` without a corresponding `sipwise_user_data` record. Future logins for this user will throw 500 errors.
- **Recommended Fix:** Wrap multi-statement database modifications in explicit `BEGIN ... COMMIT` PostgreSQL transaction blocks.

---

#### Issue M-03: Lack of Input Bounds Validation on Alcohol Consumption Inputs
- **File:** [DrinkLogger.tsx](file:///home/michael/sipwise/src/components/DrinkLogger.tsx#L136-L155) & [api.ts](file:///home/michael/sipwise/server/src/routes/api.ts#L104-L111)
- **Function/Class:** `DrinkLogger` Form Handler & `AddDrinkSchema`
- **Severity:** 🟠 Major
- **Category:** Frontend / QA / Edge Cases
- **Problem:** The frontend drink logger allows users to input arbitrary numbers for volume and ABV without enforcing upper/lower sanity checks or HTML attributes. In the backend `AddDrinkSchema`, while `volume` must be positive, `abv` is bounded up to 100, but volume has no upper maximum (e.g. 1,000,000 ml).
- **Evidence:**
  [DrinkLogger.tsx:L139-L141](file:///home/michael/sipwise/src/components/DrinkLogger.tsx#L139-L141):
  ```tsx
  <input 
    type="number" 
    value={customDrink.volume} 
    onChange={e => setCustomDrink({...customDrink, volume: Number(e.target.value)})} 
  />
  ```
- **Impact:** Entering extreme values (e.g. 100,000 ml or negative volume in custom forms) skews BAC graphs, produces NaN/Infinity calculations, and corrupts historical trends.
- **Recommended Fix:** Apply strict schema limits: `volume` min 1ml, max 5000ml; `abv` min 0%, max 100%.

---

#### Issue M-04: Missing Unhandled Rejection & Process Safety Handlers in Node.js Backend
- **File:** [index.ts](file:///home/michael/sipwise/server/src/index.ts)
- **Function/Class:** Global Process Setup
- **Severity:** 🟠 Major
- **Category:** Backend / Reliability
- **Problem:** The backend process handles `SIGTERM` and `SIGINT`, but lacks listeners for `unhandledRejection` and `uncaughtException`.
- **Evidence:** [index.ts:L94-L95](file:///home/michael/sipwise/server/src/index.ts#L94-L95) listen for shutdown signals only.
- **Impact:** An uncaught asynchronous rejection (e.g. database pool loss or network timeout in cron) will crash the Node process instantly without graceful logging or cleanup.
- **Recommended Fix:** Add global safety event handlers:
  ```ts
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled Promise Rejection');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught Exception');
    process.exit(1);
  });
  ```

---

#### Issue M-05: Docker Containers Execute with Root Privileges
- **File:** [Dockerfile](file:///home/michael/sipwise/Dockerfile#L12-L16) & [Dockerfile.api](file:///home/michael/sipwise/docker/Dockerfile.api#L2-L9)
- **Function/Class:** Container Build Definitions
- **Severity:** 🟠 Major
- **Category:** DevOps / Container Security
- **Problem:** Both Nginx and Node.js Docker containers run as default `root` user (`uid=0`).
- **Evidence:** Neither Dockerfile includes a `USER node` or unprivileged Nginx user directive.
- **Impact:** In the event of a container breakout vulnerability (e.g. Node execution exploit or Nginx privilege escalation), the attacker gains root privilege on the host system.
- **Recommended Fix:** Include non-root user switching in container build steps:
  ```dockerfile
  USER node
  ```

---

#### Issue M-06: Unvalidated Cloud API Data Ingestion (Casting `as T`)
- **File:** [api.ts](file:///home/michael/sipwise/src/utils/api.ts#L57) & [AppContext.tsx](file:///home/michael/sipwise/src/context/AppContext.tsx#L256-L260)
- **Function/Class:** `request<T>` / `pullFromCloud`
- **Severity:** 🟠 Major
- **Category:** Frontend / Reliability
- **Problem:** API fetch responses are blindly cast to TypeScript types using `as T` without runtime validation.
- **Evidence:** [api.ts:L57](file:///home/michael/sipwise/src/utils/api.ts#L57): `return data as T;`.
- **Impact:** If cloud storage data is corrupted or modified by API updates, calling methods like `.map()` or `.sort()` on unexpected data structures causes white-screen React application crashes.
- **Recommended Fix:** Validate API responses using Zod schemas before updating application state.

---

### 🟡 MINOR SEVERITY FINDINGS

#### Issue Y-01: Hardcoded Database Connection Pool Size
- **File:** [db.ts](file:///home/michael/sipwise/server/src/db.ts#L4-L9)
- **Function/Class:** PostgreSQL Pool Instantiation
- **Severity:** 🟡 Minor
- **Category:** Backend Architecture
- **Problem:** Connection pool size is hardcoded to `max: 10` instead of reading from `process.env.DB_POOL_MAX`.

#### Issue Y-02: Missing Focus Trapping & Accessibility Roles in Modal Dialogs
- **File:** [DrinkLogger.tsx](file:///home/michael/sipwise/src/components/DrinkLogger.tsx) & [ConfirmModal.tsx](file:///home/michael/sipwise/src/components/ConfirmModal.tsx)
- **Function/Class:** Modal Render Components
- **Severity:** 🟡 Minor
- **Category:** Frontend Accessibility (a11y)
- **Problem:** Modals lack `role="dialog"`, `aria-modal="true"`, and focus trapping, allowing keyboard navigation to tab behind open dialogs.

#### Issue Y-03: Hardcoded API Version String Fallbacks
- **File:** [index.ts](file:///home/michael/sipwise/server/src/index.ts#L35-L38)
- **Function/Class:** `/api/health`
- **Severity:** 🟡 Minor
- **Category:** Maintainability
- **Problem:** Version string `'0.1.25'` is hardcoded in the health check route, drifting out of sync with `package.json` / `VERSION.txt` (`0.1.26`).

---

## 2. EXECUTIVE SUMMARY

### Is this production ready?
**NO.** SipWise is **NOT production ready** for public or paying customers in its current state.

### Can it safely serve paying customers?
**No.** Serving paying customers on this architecture presents severe security, compliance, reliability, and financial risks.

### Biggest Business Risks:
1. **Catastrophic Data Loss & Corruption:** Monolithic JSONB storage coupled with non-atomic state overwrites will result in corrupted drink logs and lost session history under multi-device usage.
2. **Denial of Service & Outages:** Database-backed rate limiting creates 2 disk writes per request. A minor traffic spike or bot flood will lock PostgreSQL IOPS and crash the service.
3. **Storage & Infrastructure Cost Amplification:** Unauthenticated `/api/logs` endpoint allows malicious parties to write infinite payload data to database disk storage.
4. **Push Notification Spam:** Multi-node container scaling triggers duplicate background cron runs, spamming users with multiple push notifications per alert.

---

## 3. PRODUCTION READINESS SCORECARD

| Category | Score /10 | Notes |
| :--- | :---: | :--- |
| **Security** | `5 / 10` | Insecure token storage, unauthenticated log injection, missing IP-based rate limiting. |
| **Backend Architecture** | `4 / 10` | Dual-schema divergence, in-process cron without locks, lack of global error handlers. |
| **Frontend** | `6 / 10` | Clean UI & Recharts integration, but lacks runtime API validation (Zod) & a11y focus traps. |
| **Database** | `3 / 10` | Severe bottleneck: local mode stores drinks in monolithic JSONB, executing full table updates per drink. |
| **Infrastructure** | `5 / 10` | Docker containers run as root, hardcoded pool limits, missing log rotation & monitoring. |
| **Reliability** | `5 / 10` | Good unit tests (18/18 passing), but background tasks and database transactions lack atomicity. |
| **Scalability** | `3 / 10` | Will fail under low concurrency due to rate-limit write amplification and full JSON serialization. |
| **Testing** | `6 / 10` | Unit tests exist for BAC and logger, but end-to-end integration and load testing are missing. |
| **Observability** | `3 / 10` | Basic health check exists, but lacks Prometheus metrics, APM tracing, or structured log shipping. |
| **AI Safety** | `N/A` | No AI features currently implemented in SipWise codebase. |

---

## 4. SECURITY RISK MATRIX

| Risk ID | Vulnerability / Issue | Severity | Business Impact | Attack Complexity |
| :--- | :--- | :---: | :--- | :--- |
| **SEC-01** | Public `/api/logs` storage flooding | 🔴 Critical | Database disk exhaustion & unexpected billing spikes | Low (Public HTTP POST) |
| **SEC-02** | Rate limiting DB write amplification DDoS | 🔴 Critical | Total system outage under light traffic flood | Low (Automated script) |
| **SEC-03** | LocalStorage API Token Storage | 🟠 Major | Account compromise via XSS in dependencies | Medium (XSS requirement) |
| **SEC-04** | Docker containers running as root | 🟠 Major | Host system compromise upon container breakout | High (Exploit chain) |
| **SEC-05** | Missing IP-level brute-force protection | 🟠 Major | Password guessing on `/api/auth/login` | Low (Credential stuffing) |

---

## 5. TECHNICAL DEBT MATRIX

| Priority | Technical Debt Item | Affected Subsystem | Effort to Remediate | Impact of Fix |
| :---: | :--- | :--- | :---: | :--- |
| **1** | Replace local JSONB `sipwise_user_data` with relational `sipwise_drinks` table | Database & Server API | Medium (2 days) | Eliminates lock contention & data loss risk |
| **2** | Move rate limiting from PostgreSQL to in-memory / Redis cache | Server Middleware | Low (0.5 days) | Prevents DB disk IOPS exhaustion |
| **3** | Transition in-process `node-cron` to standalone worker with advisory locks | Background Services | Medium (1 day) | Prevents duplicate push notifications |
| **4** | Wrap user signup and data mutations in database transactions | Server Routes | Low (0.5 days) | Guarantees data integrity |
| **5** | Add Zod runtime schema validation on client API fetch responses | Frontend Context | Low (0.5 days) | Prevents UI white-screen crashes |

---

## 6. SCALABILITY ASSESSMENT

| Load Level | Concurrent Users | Predicted System Behavior & Failure Points |
| :--- | :--- | :--- |
| **100 Users** | ~5 req/sec | **Functional.** App runs smoothly, database handles small JSONB read/writes without noticeable lag. |
| **1,000 Users** | ~50 req/sec | **Degraded.** PostgreSQL rate-limiting table (`sipwise_rate_limits`) experiences high lock contention. Disk IOPS increase significantly. |
| **10,000 Users** | ~500 req/sec | **Severe Failures.** DB pool connection exhaustion (`max: 10`). API requests return 500/504 errors. JSONB updates block concurrently. |
| **100,000 Users** | ~5,000 req/sec | **System Collapse.** PostgreSQL disk space / IOPS completely saturated by rate limit writes and log ingestion. App unavailable. |
| **1,000,000 Users** | ~50,000 req/sec | **Total Outage.** Impossible under current monolithic database and single-node in-process architecture. |

---

## 7. MISSING SYSTEMS REPORT

1. **In-Memory / Redis Caching & Rate Limiting Layer (Priority 1 - High)**
   - *Description:* Required to offload rate limiting checks and session caching from PostgreSQL.
2. **Distributed Job Queue & Advisory Locking System (Priority 2 - High)**
   - *Description:* Required to run background alerts safely across multi-replica deployments without duplicate execution.
3. **Application Performance Monitoring (APM) & Error Tracking (Priority 3 - Medium)**
   - *Description:* Integration with Sentry or OpenTelemetry for frontend and backend stack trace capturing.
4. **Offsite Automated Database Backup & Disaster Recovery Validation (Priority 4 - Medium)**
   - *Description:* Currently, backups are stored on local container disk without S3 upload or automated restore validation.
5. **Centralized Log Aggregation & Rotation (Priority 5 - Medium)**
   - *Description:* Shipping structured Pino JSON logs to Loki/Datadog with automatic log rotation.

---

## 8. TOP 20 FIXES BY ROI

1. **Switch rate-limiter to in-memory store** (*Effort: 2 hrs \| Impact: High*)
2. **Add payload size and rate limits to `/api/logs`** (*Effort: 1 hr \| Impact: High*)
3. **Enforce non-root user in Dockerfiles** (*Effort: 30 mins \| Impact: High*)
4. **Wrap multi-statement DB queries in transactions** (*Effort: 2 hrs \| Impact: High*)
5. **Add unhandled promise rejection handlers** (*Effort: 30 mins \| Impact: High*)
6. **Migrate local Docker schema to normalized `sipwise_drinks` table** (*Effort: 1 day \| Impact: Critical*)
7. **Add input validation bounds (min/max volume & ABV) in frontend** (*Effort: 1 hr \| Impact: Medium*)
8. **Add Zod runtime response validation in frontend `api.ts`** (*Effort: 2 hrs \| Impact: Medium*)
9. **Implement IP-based rate limiting on `/api/auth/*` routes** (*Effort: 2 hrs \| Impact: Medium*)
10. **Add `DB_POOL_MAX` environment configuration** (*Effort: 30 mins \| Impact: Medium*)
11. **Decouple cron worker from API server process** (*Effort: 4 hrs \| Impact: High*)
12. **Set up HTTP-only secure cookie auth option** (*Effort: 1 day \| Impact: Medium*)
13. **Add ARIA accessibility roles and focus traps to modals** (*Effort: 2 hrs \| Impact: Low*)
14. **Configure S3 offsite export for database backup service** (*Effort: 3 hrs \| Impact: Medium*)
15. **Add Prometheus `/metrics` endpoint to Hono API** (*Effort: 3 hrs \| Impact: Medium*)
16. **Dynamic version injection in `/api/health` from `package.json`** (*Effort: 30 mins \| Impact: Low*)
17. **Add automated integration testing (Playwright/Cypress)** (*Effort: 2 days \| Impact: High*)
18. **Add strict CORS origin checks for production domain allowlists** (*Effort: 1 hr \| Impact: Medium*)
19. **Set up automated log rotation for Docker container stdout** (*Effort: 1 hr \| Impact: Medium*)
20. **Implement cache headers for dynamic web asset proxying** (*Effort: 1 hr \| Impact: Low*)

---

## 9. TOP 10 PRODUCTION BLOCKERS

1. **Un-normalized JSONB Database Schema (C-01):** Must migrate local mode to relational `sipwise_drinks` table.
2. **Database Rate Limiting IOPS Flooding (C-02):** Must move rate limiter out of database writes.
3. **Unauthenticated Public Log Ingestion (C-03):** Must cap payload size and enforce rate limits on `/api/logs`.
4. **Multi-Node Cron Task Duplication (C-04):** Must decouple background workers or add advisory locks.
5. **Non-Transactional Database Updates (M-02):** Must wrap user creation in SQL transactions.
6. **Root User Execution in Containers (M-05):** Must run Docker services as non-root users.
7. **Unbounded Form Inputs (M-03):** Must enforce sanity limits on volume and ABV inputs.
8. **Missing Global Rejection Handlers (M-04):** Must handle `unhandledRejection` gracefully.
9. **Unvalidated API Payload Ingestion (M-06):** Must validate API responses before React state updates.
10. **Insecure LocalStorage Token Handling (M-01):** Must provide secure cookie fallback for auth.

---

## 10. 30-DAY REMEDIATION PLAN

### Week 1: Critical Architectural & Security Hardening
- [ ] Migrate local Docker database schema from monolithic `sipwise_user_data.drinks` JSONB to relational `sipwise_drinks` table.
- [ ] Replace PostgreSQL-backed rate limiter with in-memory / Redis cache store.
- [ ] Secure `/api/logs` with payload bounds (max 500 chars message, 4KB stack trace) and rate limiting.
- [ ] Add `USER node` and non-root user execution to all Dockerfiles.

### Week 2: Reliability & Concurrency
- [ ] Wrap database user signup and profile updates in PostgreSQL transactions (`BEGIN...COMMIT`).
- [ ] Decouple cron execution from Hono API process or implement PostgreSQL advisory locks (`pg_advisory_lock`).
- [ ] Add `unhandledRejection` and `uncaughtException` process listeners in `server/src/index.ts`.
- [ ] Implement IP-based rate limiting on `/api/auth/login` and `/api/auth/signup`.

### Week 3: Frontend Validation & UX Hardening
- [ ] Add Zod runtime schema validation to client API response parsing in `src/utils/api.ts`.
- [ ] Enforce strict min/max input bounds on custom drink form (`volume`: 1–5000ml, `abv`: 0–100%).
- [ ] Fix unsorted state array bugs when backdating drinks in `AppContext.tsx`.
- [ ] Add accessibility ARIA tags and focus trapping to `DrinkLogger` and `ConfirmModal`.

### Week 4: Observability & Production Readiness Validation
- [ ] Implement offsite backup shipping (e.g. S3 integration) in `docker-compose.yml` backup service.
- [ ] Add Prometheus `/metrics` endpoint for monitoring API request latencies and error rates.
- [ ] Conduct end-to-end load testing using `autocannon` to verify 1,000+ req/sec stability.
- [ ] Perform final readiness review and release checklist.

---

## 11. FINAL VERDICT

# 🔴 NOT PRODUCTION READY

**Justification:** While the codebase is structured cleanly and passes basic unit tests, the **dual schema architecture divergence**, **database write amplification in rate limiting**, **unbounded public log ingestion**, and **in-process cron duplicate execution** make launching for paying customers unviable. Addressing the Top 10 Production Blockers outlined in this report will elevate the platform to a secure, resilient, and enterprise-grade state.
