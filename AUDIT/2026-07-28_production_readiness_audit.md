# Elite Production Readiness Audit Report — 2026-07-28

This report documents a real-world production readiness audit of the **SipWise** application codebase, highlighting architectural weaknesses, security vulnerabilities, reliability concerns, scalability bottlenecks, and missing systems that could compromise a commercial launch.

---

## 1. FINDINGS & ISSUES

### Issue 1: Unvalidated JSON Input via z.any() on Sync Endpoints
- **File:** [server/src/routes/data.ts](file:///home/michael/sipwise/server/src/routes/data.ts)
- **Function/Class:** `PutDataSchema` / `data.put('/')`
- **Severity:** 🟠 Major
- **Category:** Input Validation / Denial of Service / Stored XSS
- **Problem:** The synchronization schema uses `z.any()` for the `profile`, `drinks`, and `presets` fields. This allows users to post arbitrary JSON payloads of unlimited depth and size.
- **Evidence:**
  ```typescript
  const PutDataSchema = z.object({
    profile: z.any().optional(),
    drinks: z.any().optional(),
    presets: z.any().optional(),
    is_sober: z.boolean().optional(),
  });
  ```
- **Impact:** Attackers can push gigabytes of garbage data, triggering database storage exhaustion (DoS). Additionally, they can inject malicious JavaScript payloads which will be synced and run in other client sessions, leading to Stored XSS.
- **Recommended Fix:** Implement strict Zod schemas for the `Profile`, `Drink[]`, and `Preset[]` structures on the backend to match the frontend expectations, rejecting arbitrary JSON.

---

### Issue 2: Pre-auth Database Hitting on API Routes
- **File:** [server/src/routes/api.ts](file:///home/michael/sipwise/server/src/routes/api.ts)
- **Function/Class:** `authenticateApiKey` / `api.get('/bac')`
- **Severity:** 🟠 Major
- **Category:** API Abuse / Denial of Service (DoS)
- **Problem:** The API key verification logic runs a database hash query *before* checking the client's rate limits.
- **Evidence:**
  ```typescript
  // Inside api.get('/bac')
  const auth = await authenticateApiKey(c.req.raw); // <-- DB Query
  if (!auth) { ... }
  const rateLimitResult = await checkRateLimit(`rate_limit:${auth.userId}`); // <-- Rate limit check
  ```
- **Impact:** An attacker can flood the server with random API keys. Each invalid request forces a costly database lookup and SHA-256 hash operation. This can easily saturate the Postgres connection pool, locking out legitimate users.
- **Recommended Fix:** Place a general IP-based rate limiter *before* checking the API key authenticity, or cache invalid/valid API key hashes in Redis/in-memory cache to bypass database lookups.

---

### Issue 3: Plaintext Storage of Sensitive Health Data
- **File:** [Database / Schema](file:///home/michael/sipwise/supabase/migrations/20260728215000_add_api_keys_user_data_and_push_subscriptions.sql)
- **Function/Class:** `sipwise_user_data` table
- **Severity:** 🟠 Major
- **Category:** Sensitive Data Exposure / Privacy Compliance (GDPR)
- **Problem:** User profiles (containing physical metrics like weight and biological gender) and drink logs (tracking individual substance intake behavior) are stored in plaintext JSONB columns.
- **Evidence:**
  ```sql
  create table if not exists public.user_data (
    id uuid primary key references auth.users(id) on delete cascade,
    profile jsonb,
    drinks jsonb,
    ...
  ```
- **Impact:** Under GDPR, alcohol consumption logs constitute sensitive medical/health data (Article 9). Plaintext storage exposes the company to massive legal liability and regulatory fines if the database is breached.
- **Recommended Fix:** Encrypt the `profile` and `drinks` payloads at the application level using AES-256-GCM before writing to the database, using keys derived from the user's password or an HSM.

---

### Issue 4: Absence of Graceful Shutdown handling in Hono Server
- **File:** [server/src/index.ts](file:///home/michael/sipwise/server/src/index.ts)
- **Severity:** 🟡 Minor
- **Category:** Infrastructure Reliability
- **Problem:** The Hono server process does not hook into `SIGTERM` or `SIGINT` lifecycle signals.
- **Impact:** During container rollouts or scaling events, the process is abruptly killed by Docker/Kubernetes. Active database queries are severed instantly, which can cause partial transactions and data corruption.
- **Recommended Fix:** Listen for exit signals in the entrypoint script and close the pg connection pool using `db.end()` before shutting down.

---

## 2. EXECUTIVE SUMMARY

SipWise has solid foundational elements (such as secure JWT auth, robust database-backed rate limiting, and CSRF protection), but **is not yet production-ready to serve paying customers**. 

The most critical business risk is **privacy and compliance exposure**. Because alcohol logging data counts as health telemetry, the lack of application-layer encryption and schema enforcement on synced data represents a compliance and database bloat vector. Furthermore, pre-authentication database query execution on `/api/bac` exposes the system to denial-of-service vectors under minor load.

---

## 3. PRODUCTION READINESS SCORECARD

Category| Score /10| Notes
---|---|---
Security| 7/10| Auth and CSRF are strong, but schema bypasses on sync and health data plaintext storage are major gaps.
Backend Architecture| 8/10| Standard Hono + pg stack, clean structure, but lacks graceful shutdown and pre-auth rate limiting.
Frontend| 9/10| Clean, reactive, typescript-compliant UI.
Database| 8/10| Idempotency and rate limiting tables are solid.
Infrastructure| 8/10| Dockerized, but lacks resource caps and backup automation.
Reliability| 8/10| Good fallback limits but needs process signaling.
Scalability| 8/10| Decoupled state, but database connection pooling needs defensive query caching.
Testing| 9/10| Solid unit tests but lacks API integrations tests.
Observability| 7/10| Centralized error logging endpoint exists, but lacks metrics (Prometheus/Grafana).
AI Safety| N/A| No active AI components.

---

## 4. SECURITY RISK MATRIX

Severity| Finding| Impact
---|---|---
🟠 Major| Unvalidated JSON payloads via `z.any()` in ` PutDataSchema`| Denial of service via DB bloating; stored XSS vectors.
🟠 Major| Pre-auth DB querying on API endpoints| Exhaustion of Postgres connection pool.
🟠 Major| Plaintext storage of sensitive drinking & physical logs| GDPR breach risk; exposure of medical telemetry in DB compromise.

---

## 5. TECHNICAL DEBT MATRIX

Priority| Debt Item| Effort to Fix
---|---|---
1| Lack of strict schemas for synced user data| Low
2| Lack of application-layer payload encryption| Medium
3| Absence of Prometheus/Grafana system metrics| Medium

---

## 6. SCALABILITY ASSESSMENT

- **100 Users:** Standard operation; fully operational.
- **1,000 Users:** High performance; node handles load cleanly.
- **10,000 Users:** Database connection pool might saturate if invalid API keys are hammered due to pre-auth lookups.
- **100,000 Users:** Read/write load on JSONB blobs will saturate pg CPU. Database read replication and Redis caching for API validation become mandatory.
- **1,000,000 Users:** Single database instance limit hit. Sharding by `user_id` or migrating user state to a optimized NoSQL datastore is required.

---

## 7. MISSING SYSTEMS REPORT

Priority| System| Purpose
---|---|---
1| System Backups & DR| Daily automated pg_dump backfills to isolated S3 storage.
2| Application-Layer Encryption| Protects sensitive health telemetry at rest.
3| APM/Metrics (Prometheus)| Tracks endpoint latency, connection pool utilization, and container health.
4| CDN/Edge Protection| Fronts APIs and protects origin nodes from volumetric DDoS attacks.

---

## 8. TOP FIXES BY ROI

1. **Enforce strict schemas in `data.ts` (Low effort, High impact)**: Replace `z.any()` with concrete validation models matching frontend structures.
2. **Apply global IP rate-limiter before authentication (Low effort, High impact)**: Protect database pools from invalid token/key validation attacks.
3. **Listen for OS process signals (Low effort, Medium impact)**: Implement graceful database pool shutdowns on container lifecycle transitions.

---

## 9. TOP 10 PRODUCTION BLOCKERS

1. Unvalidated JSON inputs on data synchronizations (`z.any()`).
2. Database exhaustion vector via pre-authentication lookups on `/api/bac`.
3. Lack of automated production database backups.
4. No application resource constraints (CPU/RAM caps) in docker-compose.
5. Insecure default secrets in environment configurations.

---

## 10. 30-DAY REMEDIATION PLAN

### Week 1: Core Security & Input Validation
- Implement full Zod schema validation on `PutDataSchema` fields.
- Re-order middleware in `api.ts` to enforce rate-limiting before executing API Key database queries.

### Week 2: Infrastructure & Resilience
- Add memory and CPU limits to docker containers.
- Hook exit signals in the node backend to gracefully terminate database connections.

### Week 3: Database & Backups
- Configure automated pg_dump cron jobs pushing to encrypted cloud storage.
- Introduce indexing on missing audit tables.

### Week 4: Metrics & Monitoring
- Instrument Hono with prometheus metrics.
- Configure alerting rules on rate limit triggers and SQL query latency.

---

## FINAL VERDICT

**READY WITH MINOR CHANGES**

The application is highly polished and features strong core security protocols, but the schema bypass on user data sync and database vulnerability under unauthenticated endpoint abuse must be corrected before accepting live commercial traffic.
