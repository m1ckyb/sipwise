# SipWise — Elite Production Readiness Audit
**Date:** 2026-08-06  
**Audited Version:** `0.2.10` (frontend) / `0.2.0-rc3` (server)  
**Panel:** Security, Backend, Frontend, DevOps, QA, Database Engineers  
**Verdict Preview:** ⚠️ **HIGH RISK** — Not yet safe for paying customers

---

## Table of Contents
1. [Security Findings](#security-findings)
2. [Backend Architecture Findings](#backend-architecture-findings)
3. [Frontend Findings](#frontend-findings)
4. [Database Findings](#database-findings)
5. [Infrastructure / DevOps Findings](#infrastructure--devops-findings)
6. [Reliability & QA Findings](#reliability--qa-findings)
7. [Executive Summary](#executive-summary)
8. [Production Readiness Scorecard](#production-readiness-scorecard)
9. [Security Risk Matrix](#security-risk-matrix)
10. [Technical Debt Matrix](#technical-debt-matrix)
11. [Scalability Assessment](#scalability-assessment)
12. [Missing Systems Report](#missing-systems-report)
13. [Top 20 Fixes by ROI](#top-20-fixes-by-roi)
14. [Top 10 Production Blockers](#top-10-production-blockers)
15. [30-Day Remediation Plan](#30-day-remediation-plan)
16. [Final Verdict](#final-verdict)

---

# Security Findings

---

## SEC-001 — Live Production Secrets Committed to Repository

**File:** `.env`  
**Severity:** 🔴 Critical  
**Category:** Secrets Management / Data Exposure

**Problem:**  
The `.env` file containing live production credentials is committed to the git repository. Once a secret is committed to git history, rotating the key is insufficient — the entire git history must be scrubbed.

**Evidence:**
```
VITE_SUPABASE_URL=https://fpemlrcggtcnpjhfdsvs.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_9WqFucOVPapSD0DDL1QsQg_1Apc6iy9
VITE_VAPID_PUBLIC_KEY=BM_gBTxk1d6pwFNi4oaGO6bQjgawAxaT3a7C-zIPR-YQng5rQOrtDqCcGFQEJTmSiH0Nevql6Vf3imuxtFQOCmY
```
These are live values, not placeholders.

**Impact:**  
Any person with read access to the repository has direct access to the Supabase project and can query all user data via the REST API or send fraudulent push notifications.

**Attack Scenario:**  
1. Attacker clones repo or browses GitHub.
2. Reads `.env` → gets Supabase anon key and project URL.
3. `GET /rest/v1/user_data?select=*` → exfiltrates all user health data.

**Recommended Fix:**  
1. **Immediately rotate** ALL credentials in Supabase dashboard and regenerate VAPID keys.
2. Remove `.env` from git history: `git filter-repo --path .env --invert-paths`.
3. Confirm `.env` is in `.gitignore` before committing.
4. Use GitHub Secrets exclusively for CI/CD.

---

## ~~SEC-002 — Token Blacklist: No Cleanup, Full JWT Stored, Unbounded Growth~~

**File:** `server/src/middleware/auth.ts`, `docker/init.sql`  
**Severity:** 🔴 Critical  
**Category:** Authentication / Resource Exhaustion

**Problem:**  
- The `sipwise_token_blacklist` table stores **full raw JWT strings** (300-500 bytes each) as primary keys.
- There is **no cron job** to clean up expired entries — the table grows indefinitely.
- A full JWT string lookup on every authenticated request is a significant performance bottleneck.
- Storing raw JWTs means a DB breach exposes the full token corpus.

**Evidence:**
```typescript
// auth.ts line 43-48 — full JWT on every request
const { rows } = await db.query(
  'SELECT 1 FROM sipwise_token_blacklist WHERE token = $1',
  [token]
);
```
```sql
-- init.sql — no cleanup trigger or cron registered for this table
CREATE TABLE IF NOT EXISTS sipwise_token_blacklist (
  token TEXT PRIMARY KEY,  -- Full raw JWT stored
  expires_at TIMESTAMPTZ NOT NULL,
```

**Impact:**  
Database disk exhaustion over time. All tokens exposed if DB is breached.

**Recommended Fix:**  
Store `SHA-256(token)` instead of raw token. Add cron: `DELETE FROM sipwise_token_blacklist WHERE expires_at < now()`.

---

## ~~SEC-003 — Push Subscription Deletion: Authorization Bypass (IDOR)~~

**File:** `server/src/routes/push.ts`, line 45-48  
**Severity:** 🔴 Critical  
**Category:** Broken Access Control

**Problem:**  
The `DELETE /api/push-subscriptions/:endpoint` endpoint deletes any subscription matching the endpoint URL without checking `user_id`. Any authenticated user can delete any other user's push subscription, silently disabling their safety-critical sober alerts.

**Evidence:**
```typescript
push.delete('/:endpoint', async (c) => {
  const endpoint = decodeURIComponent(c.req.param('endpoint'));
  await db.query('DELETE FROM sipwise_push_subscriptions WHERE endpoint = $1', [endpoint]);
  // ☠️ No user_id filter — IDOR
  return c.json({ success: true });
});
```

**Attack Scenario:**  
User A authenticates, sends `DELETE /api/push-subscriptions/{user_B_endpoint}`. User B silently stops receiving sober alerts. They drink, drive, get injured.

**Recommended Fix:**
```typescript
push.delete('/:endpoint', async (c) => {
  const userId = c.get('userId') as string;
  const endpoint = decodeURIComponent(c.req.param('endpoint'));
  await db.query(
    'DELETE FROM sipwise_push_subscriptions WHERE endpoint = $1 AND user_id = $2',
    [endpoint, userId]
  );
  return c.json({ success: true });
});
```

---

## ~~SEC-004 — Push Subscription Check: No user_id Scoping (Information Disclosure)~~

**File:** `server/src/routes/push.ts`, line 15-22  
**Severity:** 🟠 Major  
**Category:** Information Disclosure / Broken Access Control

**Problem:**  
`GET /check/:endpoint` allows any authenticated user to probe whether any endpoint is registered, leaking other users' subscription existence.

**Evidence:**
```typescript
const { rows } = await db.query(
  'SELECT endpoint FROM sipwise_push_subscriptions WHERE endpoint = $1',
  [endpoint],
  // No user_id = $2 filter
);
```

**Recommended Fix:** Add `AND user_id = $2` and pass `c.get('userId')`.

---

## SEC-005 — Per-User Encryption Key Derived from Single Master Secret (No Key Rotation)

**File:** `server/src/utils/crypto.ts`, line 21-23  
**Severity:** 🟠 Major  
**Category:** Cryptographic Weakness

**Problem:**  
`getUserKey(userId) = HMAC-SHA256(ENCRYPTION_SECRET, userId)`. A single compromised `ENCRYPTION_SECRET` decrypts ALL users' data. There is no key versioning, no per-user key material, and no rotation path without re-encrypting every row.

**Evidence:**
```typescript
function getUserKey(userId: string): Buffer {
  return crypto.createHmac('sha256', activeSecret).update(userId).digest();
}
```

**Recommended Fix:**  
Envelope encryption: generate a random DEK per user, store DEK encrypted with a versioned master key. Rotation only requires re-encrypting DEKs.

---

## SEC-006 — Rate Limiting IP Spoofable When TRUST_PROXY=true

**File:** `server/src/middleware/rateLimit.ts`, line 6-9  
**Severity:** 🟠 Major  
**Category:** Rate Limiting Bypass

**Problem:**  
When `TRUST_PROXY=true`, the `X-Real-IP` header is trusted verbatim from the client. An attacker who bypasses Nginx can set any IP header and cycle through arbitrary addresses to defeat per-IP rate limiting.

**Evidence:**
```typescript
const xRealIp = c.req.header('x-real-ip');
if (xRealIp && process.env.TRUST_PROXY === 'true') {
  return xRealIp;  // Client-controlled
}
```

**Recommended Fix:** Only trust proxy headers from known proxy CIDR ranges, or enforce rate limiting at the Nginx layer.

---

## ~~SEC-007 — CSRF Silently Disabled When ALLOWED_ORIGINS Not Configured~~

**File:** `server/src/middleware/csrf.ts`, line 13  
**Severity:** 🟠 Major  
**Category:** CSRF

**Problem:**
```typescript
if (allowedOrigins.length === 0) return next(); // No-op — CSRF protection disabled
```
If `ALLOWED_ORIGINS` is not set, all state-changing requests bypass CSRF validation. This affects any deployment where the operator forgets this variable.

**Recommended Fix:** Fail closed: in `NODE_ENV=production`, fail startup or enforce a strict default policy when `ALLOWED_ORIGINS` is empty.

---

## SEC-008 — 7-Day JWT Lifetime with No Refresh Token

**File:** `server/src/middleware/auth.ts`, line 22-24  
**Severity:** 🟠 Major  
**Category:** Session Management

**Problem:**
```typescript
return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
```
A stolen token is valid for up to 7 days. No `/refresh` endpoint, no short-lived access tokens.

**Recommended Fix:** 15-60 minute access tokens with refresh token rotation via HttpOnly cookies.

---

## SEC-009 — Audit Log IP Reads Wrong Header (Bypasses Proxy Trust Logic)

**File:** `server/src/routes/auth.ts`, line 66, 96  
**Severity:** 🟡 Minor  
**Category:** Audit Integrity

**Problem:**
```typescript
await logAuditEvent(user.id, 'signup', { email }, c.req.header('x-forwarded-for') || undefined);
// Should use getClientIp(c) which has proper proxy trust logic
```

---

## ~~SEC-010 — No Content-Security-Policy Header~~

**File:** `server/src/index.ts`, `docker/nginx.conf`  
**Severity:** 🟠 Major  
**Category:** XSS Defence

**Problem:**  
`X-XSS-Protection` (deprecated) is set but no `Content-Security-Policy`. Any XSS vulnerability allows full script execution with no browser-level mitigation.

**Recommended Fix:**
```typescript
c.header('Content-Security-Policy',
  "default-src 'self'; script-src 'self'; connect-src 'self' https://*.supabase.co; style-src 'self' 'unsafe-inline';");
```

---

## SEC-011 — API Keys: No Scopes, No Expiry, No Per-User Creation Limit

**File:** `server/src/routes/apiKeys.ts`  
**Severity:** 🟡 Minor  
**Category:** Authorization

**Problem:** API keys are permanent, unlimited in count per user, and have no scope restrictions. A leaked key can write drinks indefinitely.

---

## SEC-012 — Idempotency Keys Unbounded Per User Within Rate Limit Window

**File:** `server/src/routes/api.ts`, line 155-163  
**Severity:** 🟡 Minor  
**Category:** Resource Exhaustion

**Problem:** Within the rate limit, a user can insert 60 rows/min to the idempotency table for 7 days before cleanup = up to 604,800 rows per user.

---

# Backend Architecture Findings

---

## BACK-001 — Data Stored as Encrypted JSONB Blob (No Queryability, No Concurrency Safety)

**File:** `docker/init.sql`, `server/src/routes/data.ts`  
**Severity:** 🔴 Critical  
**Category:** Database Design / Data Integrity

**Problem:**  
All user data (profile, drinks, presets) is a single encrypted JSONB blob. This means:
1. No DB-level querying, pagination, or aggregation of drinks.
2. No schema enforcement — corrupt blob = silent data loss.
3. Concurrent writes silently drop data (last writer wins).
4. Users with 5+ years of history transmit and decrypt 50-200KB per request.
5. Analytics are impossible.

**Evidence:**
```typescript
// data.ts — Returns entire life history as one blob
const { rows } = await db.query(
  'SELECT profile, drinks, presets, is_sober, updated_at FROM sipwise_user_data WHERE id = $1',
  [userId],
);
```

**Recommended Fix:**  
Migrate to the relational `public.drinks` table already defined in Supabase migrations. The migration path partially exists.

---

## BACK-002 — Race Condition: Read-Modify-Write for Drink Addition (Silent Data Loss)

**File:** `server/src/routes/api.ts`, line 166-193  
**Severity:** 🔴 Critical  
**Category:** Data Integrity / Race Condition

**Problem:**  
Adding a drink via API:
1. Read encrypted blob → 2. Decrypt → 3. Append drink → 4. Encrypt → 5. Write back.

This is non-atomic. Two concurrent calls both read stale state; one overwrites the other's drink silently.

**Evidence:**
```typescript
const { rows } = await db.query('SELECT drinks, profile FROM sipwise_user_data WHERE id = $1', [auth.userId]);
const drinks = (decryptData(rows[0].drinks, auth.userId) as Drink[]) || [];
drinks.push(newDrink);
await db.query('UPDATE sipwise_user_data SET drinks = $1 ...', [encryptedDrinks, auth.userId]);
// No transaction, no optimistic locking, no version check
```

**Impact:** Real drink data loss when Home Assistant automation and frontend log simultaneously.

---

## ~~BACK-003 — Inline DB DELETE on Every Rate Limit Check (Write Amplification)~~

**File:** `server/src/middleware/rateLimit.ts`, line 33  
**Severity:** 🟠 Major  
**Category:** Performance / Scalability

**Problem:**
```typescript
await db.query('DELETE FROM sipwise_rate_limits WHERE window_start < $1', [windowStartLimit]);
```
Every request fires a DELETE before the check. At 100 req/sec = 200 extra DB operations/second. The hourly cron cleanup already handles this.

**Recommended Fix:** Remove the inline DELETE entirely.

---

## BACK-004 — No API Versioning Strategy

**File:** `server/src/index.ts`  
**Severity:** 🟠 Major  
**Category:** API Design

**Problem:** All routes at `/api/*` with no version prefix. Breaking changes will immediately break all Home Assistant and other API key integrations.

**Recommended Fix:** Prefix all routes with `/api/v1/`.

---

## BACK-005 — Health Check Hardcodes Version String

**File:** `server/src/index.ts`, line 42  
**Severity:** 🟡 Minor

```typescript
return c.json({ status: 'ok', db: 'ok', version: '0.2.0-rc3' }); // Never updates
```

---

## BACK-006 — Alert Cron is O(N) Decrypt All Users Every 5 Minutes

**File:** `server/src/cron/checkAlerts.ts`  
**Severity:** 🟠 Major  
**Category:** Scalability

**Problem:** Every 5 minutes: fetch ALL subscriptions → fetch ALL user data → decrypt each user's drink blob → calculate BAC. At 10K subscribers this is 10K decryptions per 5 minutes.

**Evidence:**
```typescript
const { rows: subscriptions } = await db.query(
  'SELECT user_id, subscription, endpoint FROM sipwise_push_subscriptions',
  // No WHERE clause
);
```

**Recommended Fix:** Store `estimated_sober_at` as a plaintext column updated on each drink addition. Cron queries only `WHERE is_sober = false AND estimated_sober_at < now()`.

---

## BACK-007 — No UUID Validation on Path Parameters

**File:** `server/src/routes/apiKeys.ts`  
**Severity:** 🟡 Minor

The `keyId` path parameter is not validated as a UUID before being passed to queries.

---

# Frontend Findings

---

## FRONT-001 — Monolithic 806-Line AppContext with 22-Dependency Memo

**File:** `src/context/AppContext.tsx`, line 776-791  
**Severity:** 🟠 Major  
**Category:** Performance / Architecture

**Problem:**  
Single context holds all state. The `contextValue` useMemo has 22 dependencies and re-computes on nearly every state change (toast, sync tick, any drink addition), causing cascading re-renders across all consuming components.

**Evidence:**
```tsx
const contextValue = useMemo(() => ({...}), [
  profile, setProfile, drinks, addDrink, removeDrink, updateDrink,
  presets, addPreset, removePreset, updatePreset,
  inventory, addInventoryItem, removeInventoryItem, updateInventoryItem, consumeFromInventory,
  clearHistory, importData, user, lastSynced, isSyncing, pushError, storageWarning, toasts,
  showToast, pullFromCloud, pushToCloud, signOut
]); // 22 dependencies
```

**Recommended Fix:** Split into domain slices (AuthContext, DataContext, UIContext).

---

## FRONT-002 — JWT Token Stored in localStorage (XSS-Accessible)

**File:** `src/utils/api.ts`, line 7-13  
**Severity:** 🟠 Major  
**Category:** Security / XSS

**Problem:**
```typescript
localStorage.setItem(TOKEN_KEY, token); // XSS-readable by any injected script
```

**Recommended Fix:** Use HttpOnly cookies. Backend sets the token; frontend never touches it.

---

## FRONT-003 — Push+Pull 500ms Debounce Race Condition (Silent Data Rollback)

**File:** `src/context/AppContext.tsx`, line 691-699  
**Severity:** 🟠 Major  
**Category:** Data Integrity

**Problem:** Every data change triggers a push-then-pull. Under rapid concurrent changes, the pull may return state that predates the latest push, rolling back the most recent user action.

---

## FRONT-004 — Health Data Stored Plaintext in localStorage

**File:** `src/context/AppContext.tsx`, line 627-637  
**Severity:** 🟠 Major  
**Category:** Privacy / Compliance

**Problem:** Weight, age, gender, and full drink history stored unencrypted in localStorage. On shared devices or devices with browser extensions, this data is accessible.

---

## FRONT-005 — Error Boundary May Not Protect Against AppProvider Throws

**File:** `src/components/ErrorBoundary.tsx`  
**Severity:** 🟡 Minor

ErrorBoundary must wrap the throwing component, not be inside it. If AppProvider throws during initialization, the ErrorBoundary may not catch it.

---

## FRONT-006 — Toast ID Not Collision-Safe

**File:** `src/context/AppContext.tsx`, line 223-226  
**Severity:** 🟡 Minor

```typescript
const id = Date.now() + Math.random(); // Can collide; use crypto.randomUUID()
```

---

## FRONT-007 — No aria-label on Sync Button, No aria-live on BAC Display

**File:** `src/components/Dashboard.tsx`, line 98-118  
**Severity:** 🟡 Minor  
**Category:** Accessibility

---

## FRONT-008 — No Loading Skeleton During Initial Cloud Pull

**File:** `src/context/AppContext.tsx`  
**Severity:** 🟡 Minor  
**Category:** UX

User sees stale/empty local state while cloud sync runs with no visual indication.

---

## FRONT-009 — `applyVolumeRepair` Hard-Coded One-Time Fix Runs on Every Load

**File:** `src/context/AppContext.tsx`, line 39-49  
**Severity:** 🟡 Minor  
**Category:** Technical Debt

```typescript
if (d.name?.toLowerCase().includes('black') && d.volume === 365) {
  // Historical one-time bug fix running forever on every app load
```

---

## FRONT-010 — Inline styles Prevent Future CSP Hardening

**File:** Throughout components  
**Severity:** 🟡 Minor

Extensive `style={}` props require `'unsafe-inline'` in CSP, weakening the XSS defence.

---

# Database Findings

---

## DB-001 — Token Blacklist: No Cleanup (see SEC-002)
**Severity:** 🔴 Critical

---

## ~~DB-002 — Supabase push_subscriptions RLS Allows Unauthenticated Access~~

**File:** `supabase/migrations/20260728215000_add_api_keys_user_data_and_push_subscriptions.sql`, line 49-64  
**Severity:** 🔴 Critical  
**Category:** RLS / Broken Access Control

**Problem:**
```sql
create policy "Allow insert for push subscriptions"
  on public.push_subscriptions for insert
  with check (user_id is null or auth.uid() = user_id or auth.uid() is null);
-- ☠️ auth.uid() is null = unauthenticated — passes check
```
Unauthenticated users can insert, read, update, and delete push subscriptions.

**Recommended Fix:**
```sql
create policy "Allow insert for push subscriptions"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);
```

---

## DB-003 — push_subscriptions user_id Nullable Creates Orphaned Rows

**File:** `docker/init.sql`, line 31-33  
**Severity:** 🟡 Minor

`user_id` is nullable; the cron processes all subscriptions including null-user ones, failing silently.

---

## DB-004 — Rate Limits Table: Cleanup Index Expensive Under Load

**File:** `docker/init.sql`  
**Severity:** 🟠 Major

The inline `DELETE WHERE window_start < $1` on every request scans the `window_start` index under high load.

---

## DB-005 — No `updated_at` Trigger on `sipwise_user_data`

**File:** `docker/init.sql`  
**Severity:** 🟡 Minor

`handle_updated_at` trigger only applied to push_subscriptions. `sipwise_user_data` relies on manual `updated_at = now()` in queries.

---

## DB-006 — 7-Day Idempotency Key TTL Is Excessive

**File:** `server/src/cron/checkAlerts.ts`, line 103  
**Severity:** 🟡 Minor

Standard is 24-48 hours. 7 days quadruples table storage.

---

## DB-007 — Supabase Schema Diverges from Local Docker Schema

**File:** `supabase/migrations/` vs `docker/init.sql`  
**Severity:** 🟠 Major  
**Category:** Schema Consistency

Supabase uses relational `drinks` table + stored procedures. Docker uses encrypted JSONB blobs. Two entirely different data models means bugs in one mode don't appear in the other. Testing in Supabase mode doesn't validate local mode.

---

# Infrastructure / DevOps Findings

---

## ~~INFRA-001 — TLS Disabled: All Traffic is Plaintext HTTP~~

**File:** `docker/nginx.conf`, line 41-48  
**Severity:** 🔴 Critical  
**Category:** Transport Security

**Problem:**  
Nginx only listens on port 80. TLS configuration is commented out. No HTTPS, no HSTS.

**Evidence:**
```nginx
# listen 443 ssl http2;
# ssl_certificate /etc/nginx/certs/fullchain.pem;
# ... all commented out
```

**Impact:** All JWTs, drink data, and profile data (weight, age, gender) transmitted in plaintext. Trivially interceptable on any network.

**Recommended Fix:** Let's Encrypt + Certbot or Caddy with automatic TLS. Add `add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;`.

---

## INFRA-002 — Backup Service: No Alerting, No Offsite Storage, No Integrity Check

**File:** `docker-compose.yml`, line 77-94  
**Severity:** 🟠 Major  
**Category:** Disaster Recovery

**Problem:**  
- Silent failures: if `pg_dump` fails, corrupt `.sql.gz` is created with no notification.
- Backups are stored on the same host as the database (`./backups/`) — host failure = all backups lost.
- No integrity check (`gunzip -t`).
- No documented restore procedure.
- Backup timing is unpredictable (offset from container start).

**Recommended Fix:**  
Use `pgbackrest`. Upload to S3-compatible storage immediately. Check integrity after creation. Alert on failure.

---

## ~~INFRA-003 — API Container Has No Node.js Heap Limit~~

**File:** `docker-compose.yml`, line 49-53  
**Severity:** 🟠 Major

Container is limited to 256MB but `NODE_OPTIONS` is not set. Node.js defaults to ~1.5GB heap → OOM-kill before GC can help.

**Fix:**
```yaml
environment:
  NODE_OPTIONS: "--max-old-space-size=200"
```

---

## INFRA-004 — Trivy Scan `continue-on-error: true` Makes CVE Check Decorative

**File:** `.github/workflows/deploy.yml`, line 105  
**Severity:** 🟠 Major

```yaml
continue-on-error: true  # CRITICAL/HIGH CVEs never block deployment
```

**Fix:** Remove `continue-on-error: true`.

---

## INFRA-005 — No Readiness Probe; Nginx May Route Before API Initializes

**File:** `docker-compose.yml`  
**Severity:** 🟡 Minor

Docker Compose has no readiness/startup probe distinction. On restart, Nginx may proxy requests to API before DB pool and cron are ready.

---

## INFRA-006 — Frontend Health Check Tests Through API Proxy (Misleading)

**File:** `docker-compose.yml`, line 67  
**Severity:** 🟡 Minor

```yaml
test: ["CMD", "wget", "--spider", "-q", "http://localhost:80/api/health"]
# Tests API health through proxy — not frontend health
```

---

## INFRA-007 — No Centralized Log Aggregation

**File:** All services  
**Severity:** 🟠 Major

Logs go to container stdout with no aggregation. No searchable history. Incident investigation is impossible after container restart.

---

## INFRA-008 — Migration Repair Pattern in CI is Fragile

**File:** `.github/workflows/deploy.yml`, line 57-60  
**Severity:** 🟠 Major

```bash
supabase migration repair --status applied 20260719182000 ...
supabase db push
```
Pre-marking migrations as applied before pushing is error-prone. New migrations added without updating this list will silently diverge from production schema.

---

## INFRA-009 — No Staging Environment; All Migrations Hit Production Directly

**File:** `.github/workflows/`  
**Severity:** 🟠 Major

No running staging environment. Every migration lands directly on production Supabase on merge to `main`.

---

## INFRA-010 — VAPID Contact Email Defaults to `admin@localhost`

**File:** `server/src/utils/vapid.ts`, line 6  
**Severity:** 🟡 Minor

```typescript
const VAPID_CONTACT_EMAIL = process.env.VAPID_CONTACT_EMAIL || 'mailto:admin@localhost';
```
Invalid email → push services may reject VAPID requests silently.

---

# Reliability & QA Findings

---

## ~~QA-001 — `decryptData` Returns null on Failure: Silent Data Loss~~

**File:** `server/src/utils/crypto.ts`, line 73-76  
**Severity:** 🔴 Critical  
**Category:** Error Handling / Data Integrity

**Problem:**
```typescript
} catch (err) {
  console.error('[SipWise] Decryption failed, returning null context:', err);
  return null; // Caller treats this as "no data"
}
```
```typescript
// api.ts line 84
const drinks = (decryptData(rows[0].drinks, auth.userId) as Drink[]) || [];
// Decryption failure → empty array. User thinks all history is gone.
```
A user whose `ENCRYPTION_SECRET` is rotated without data re-encryption silently loses all historical data.

**Recommended Fix:** Return a typed result: `{ ok: true; data: T } | { ok: false; error: string }`. Surface error to user. Log to audit trail.

---

## QA-002 — BAC Physiological Model Diverges Between Frontend and Server

**File:** `server/src/utils/bac.ts` vs `src/utils/bac.ts`  
**Severity:** 🟠 Major  
**Category:** Correctness / Safety

**Problem:**  
The server-side `bac.ts` does not implement the physiological absorption model — it uses instant absorption regardless of profile setting. The frontend uses the physiological model correctly. This means users who enable physiological mode will get different BAC values from the API (Home Assistant) vs. the app — a medically significant discrepancy in a safety-critical feature.

---

## QA-003 — `consumeFromInventory` Duplicates Logic Across Check and Mutation

**File:** `src/context/AppContext.tsx`, line 504-597  
**Severity:** 🟠 Major  
**Category:** Correctness

The success check and the actual deduction are separate closures operating on the same stale snapshot. Race between check and `setInventory` callback can cause incorrect deductions.

---

## QA-004 — `cleanupRateLimitEntries` Cron Window Inconsistent with Inline Cleanup

**File:** `server/src/cron/checkAlerts.ts`, line 115-116  
**Severity:** 🟡 Minor

Cron uses 2-hour window; inline uses current window (60s). Inconsistent — table retains 119 minutes of stale entries unnecessarily.

---

## QA-005 — `initialPullDone.current` Not Reset on Sign-Out (Multi-Account Bug)

**File:** `src/context/AppContext.tsx`, line 612-621  
**Severity:** 🟡 Minor

After logout + re-login in same session, the initial cloud pull is skipped. New user sees previous user's data until page reload.

---

## QA-006 — Sober Timer Can Hold Massive setTimeout Handles

**File:** `src/context/AppContext.tsx`, line 755-765  
**Severity:** 🟡 Minor

For historical drinks, `timeToZero` may produce a delay of many hours → `setTimeout` holds a ref and memory indefinitely.

---

## ~~QA-007 — Zero Server-Side Tests (Auth, Encryption, API, Push)~~

**File:** `server/`  
**Severity:** 🟠 Major  
**Category:** Testing

No test files exist in `server/`. Auth flows, rate limiting, encryption/decryption, BAC calculation API — none tested automatically. Frontend has 2 test files covering ~5% of codebase (BAC calculation and logger only).

---

## ~~QA-008 — `limit` Query Parameter Not Validated (Unbounded Response)~~

**File:** `server/src/routes/api.ts`, line 99-100  
**Severity:** 🟡 Minor

```typescript
const limit = limitParam ? parseInt(limitParam, 10) : 50;
// ?limit=999999 → returns entire drink history in one response
```

**Fix:** `const limit = Math.min(Math.max(parseInt(limitParam || '50', 10), 1), 200);`

---

---

# Executive Summary

SipWise demonstrates genuine engineering care: structured logging, audit trails, bcrypt with configurable rounds, AES-256-GCM encryption, JWT blacklisting, advisory lock cron coordination. The developer clearly understands security concepts.

**However, it is not production-ready for paying customers.** The following systemic issues must be resolved:

1. **Live production secrets committed to git.** This is an active compromise requiring immediate P0 incident response.
2. **TLS disabled.** All user health data and JWTs transit the network in plaintext.
3. **Data integrity flaw:** Blob-based data with read-modify-write pattern silently drops drinks under concurrency.
4. **Silent data loss on decryption failure:** Users see empty app with no explanation.
5. **Critical authorization bypass:** Any user can disable other users' safety-critical sober alerts.
6. **Unauthenticated Supabase RLS access** to push subscriptions.
7. **Zero server-side tests** on any of the critical paths.
8. **No CSP headers** — any XSS is fully exploitable.
9. **Token blacklist grows forever** — eventual disk exhaustion.
10. **BAC calculations diverge** between frontend and server in physiological mode — safety-critical discrepancy.

---

# Production Readiness Scorecard

| Category | Score /10 | Notes |
|---|---|---|
| **Security** | 3/10 | Committed secrets, no TLS, no CSP, push auth bypass, XSS-accessible tokens |
| **Backend Architecture** | 4/10 | Blob model, race conditions, no API versioning, O(N) cron |
| **Frontend** | 5/10 | Monolithic context, unencrypted localStorage, XSS-readable JWT |
| **Database** | 5/10 | Schema divergence, no blacklist cleanup, permissive RLS |
| **Infrastructure** | 4/10 | No TLS, no staging, fragile backup, no log aggregation |
| **Reliability** | 5/10 | Silent decryption failures, race conditions, no recovery |
| **Scalability** | 3/10 | O(N) cron, blob model, inline DB deletes every request |
| **Testing** | 2/10 | Zero server tests, ~5% frontend coverage |
| **Observability** | 4/10 | No metrics, no log aggregation, incomplete Gatus config |
| **AI Safety** | N/A | No AI features |

**Overall: 3.9/10 — HIGH RISK**

---

# Security Risk Matrix

| ID | Issue | Severity | Exploitability |
|---|---|---|---|
| SEC-001 | Live secrets in git repo | 🔴 Critical | Immediate (public repo read) |
| SEC-003 | Push subscription deletion IDOR | 🔴 Critical | Trivial (any auth user) |
| INFRA-001 | No TLS — plaintext HTTP | 🔴 Critical | Network access required |
| DB-002 | Supabase RLS: unauthenticated push access | 🔴 Critical | Any HTTP client |
| SEC-002 | Token blacklist unbounded growth + full JWT stored | 🔴 Critical | Automated over time |
| QA-001 | Silent decryption failure = data loss | 🔴 Critical | Triggered by key rotation |
| SEC-010 | No CSP header | 🟠 Major | Requires XSS vector |
| FRONT-002 | JWT in localStorage (XSS-readable) | 🟠 Major | Requires XSS vector |
| SEC-007 | CSRF disabled when ALLOWED_ORIGINS empty | 🟠 Major | Deployment misconfiguration |
| SEC-006 | Rate limit bypass via IP spoofing | 🟠 Major | Direct server access |
| SEC-008 | 7-day JWT, no refresh | 🟠 Major | Token theft required |
| SEC-004 | Push subscription existence disclosure | 🟠 Major | Any authenticated user |

---

# Technical Debt Matrix

| Rank | Item | Type | Cost |
|---|---|---|---|
| 1 | Blob data model (BACK-001) | Architectural | High |
| 2 | Dual schema Supabase vs Docker (DB-007) | Architectural | High |
| 3 | Monolithic AppContext (FRONT-001) | Architectural | Medium |
| 4 | Zero server tests (QA-007) | Testing | Medium |
| 5 | BAC model divergence frontend/server (QA-002) | Correctness | Medium |
| 6 | applyVolumeRepair hot path hack (FRONT-009) | Maintenance | Low |
| 7 | Inline rate limit DB deletes (BACK-003) | Performance | Low |
| 8 | No CSP policy (SEC-010) | Security | Low |
| 9 | Hardcoded version in health check (BACK-005) | Maintenance | Low |
| 10 | localStorage health data plaintext (FRONT-004) | Privacy | Medium |

---

# Scalability Assessment

| Traffic | Likely Failure |
|---|---|
| **100 users** | ✅ Functional. Minor UX issues. |
| **1,000 users** | ⚠️ Token blacklist grows visibly. Alert cron 5-10 seconds. Rate limit inline deletes add latency. |
| **10,000 users** | 🔴 Alert cron infeasible (10K decryptions per 5 min). Large drink blobs slow requests. Token blacklist index bloat. In-memory rate limiter diverges across restarts. |
| **100,000 users** | 🔴🔴 Blob model completely infeasible. Cron OOM-kills. DB pool exhausted. Single PostgreSQL, no read replicas. 100GB+ backups. |
| **1,000,000 users** | 🔴🔴🔴 Full architectural rewrite needed. Requires sharding, read replicas, Redis, queue-based processing. |

---

# Missing Systems Report

| Priority | Missing System | Business Impact |
|---|---|---|
| 🔴 P0 | TLS / HTTPS | All tokens and health data in plaintext |
| 🔴 P0 | Secret rotation (post-commit leak) | Production compromised |
| 🔴 P0 | Token blacklist cleanup cron | DB disk exhaustion |
| 🟠 P1 | Staging environment | All migrations hit production |
| 🟠 P1 | Server-side test suite | Regressions ship undetected |
| 🟠 P1 | CSP headers | XSS fully exploitable |
| 🟠 P1 | Centralized log aggregation | No incident investigation |
| 🟠 P1 | Metrics / APM (Prometheus, Datadog) | No perf baseline |
| 🟠 P1 | Offsite backup storage | Single-host backup = no DR |
| 🟠 P1 | GDPR data deletion endpoint | Legal compliance |
| 🟡 P2 | Email verification on signup | No email ownership proof |
| 🟡 P2 | Password reset via email | Users permanently locked out |
| 🟡 P2 | Feature flags | No staged rollouts |
| 🟡 P2 | API versioning `/api/v1/` | Breaking changes break all integrations |
| 🟡 P2 | Rate limit response headers | Clients can't implement backoff |
| 🟡 P2 | Terms of Service / Privacy Policy | Legal requirement for paying customers |

---

# Top 20 Fixes by ROI

*Sorted: lowest effort → highest impact*

| # | Fix | Effort | Impact |
|---|---|---|---|
| 1 | Rotate all secrets immediately (SEC-001) | 30 min | 🔴 Critical |
| 2 | Remove .env from git history (SEC-001) | 1 hour | 🔴 Critical |
| 3 | Fix push DELETE to include user_id (SEC-003) | 15 min | 🔴 Critical |
| 4 | Fix push CHECK to include user_id (SEC-004) | 15 min | 🟠 Major |
| 5 | Remove inline DELETE from checkRateLimit (BACK-003) | 30 min | 🟠 Major |
| 6 | Add token blacklist cleanup cron (SEC-002) | 1 hour | 🔴 Critical |
| 7 | Add CSP header (SEC-010) | 1 hour | 🟠 Major |
| 8 | Fix Supabase push_subscriptions RLS (DB-002) | 1 hour | 🔴 Critical |
| 9 | Validate `limit` param: max 200 (QA-008) | 30 min | 🟡 Minor |
| 10 | Fix CSRF bypass for empty ALLOWED_ORIGINS (SEC-007) | 1 hour | 🟠 Major |
| 11 | Surface decryption error to user (QA-001) | 2 hours | 🔴 Critical |
| 12 | Remove `continue-on-error` from Trivy (INFRA-004) | 5 min | 🟠 Major |
| 13 | Enable TLS in Nginx with Let's Encrypt (INFRA-001) | 2 hours | 🔴 Critical |
| 14 | Add `NODE_OPTIONS: --max-old-space-size=200` (INFRA-003) | 5 min | 🟠 Major |
| 15 | Fix audit log to use `getClientIp(c)` (SEC-009) | 15 min | 🟡 Minor |
| 16 | Reset `initialPullDone.current` on signOut (QA-005) | 15 min | 🟡 Minor |
| 17 | Store token hash in blacklist not raw token (SEC-002) | 2 hours | 🔴 Critical |
| 18 | Write server auth integration tests (QA-007) | 1 day | 🟠 Major |
| 19 | Add password reset via email (Missing Systems) | 1 day | 🟠 Major |
| 20 | Add `X-RateLimit-*` headers (Missing Systems) | 2 hours | 🟡 Minor |

---

# Top 10 Production Blockers

These MUST be fixed before any paying customer uses this product:

1. 🔴 **SEC-001** — Live credentials in git repository. Immediate key rotation + history scrub required.
2. 🔴 **INFRA-001** — No TLS. All user health data and JWTs in plaintext.
3. 🔴 **SEC-003** — Any authenticated user can silence other users' safety-critical sober alerts.
4. 🔴 **DB-002** — Supabase RLS allows unauthenticated manipulation of push subscriptions.
5. 🔴 **BACK-002** — Silent drink loss under concurrent writes (Home Assistant + frontend).
6. 🔴 **QA-001** — Decryption failure silently shows empty app; user believes all data is gone.
7. 🔴 **SEC-002** — Token blacklist grows forever → eventual disk exhaustion.
8. 🟠 **QA-007** — Zero server tests. Regressions in auth/encryption ship undetected.
9. 🟠 **Missing** — No password reset. Users who forget their password are permanently locked out.
10. 🟠 **Missing** — No Terms of Service, Privacy Policy, or GDPR data deletion. Legal requirement before charging.

---

# 30-Day Remediation Plan

## Week 1 — P0 Security & Stability

- **Day 1:** Rotate ALL credentials (Supabase keys, VAPID). Remove `.env` from git history.
- **Day 1:** Fix SEC-003 (push DELETE IDOR) and DB-002 (Supabase RLS) — 30 min combined.
- **Day 2:** Enable TLS in Nginx. Configure Let's Encrypt or Caddy with automatic cert.
- **Day 2:** Add token blacklist cleanup cron + store token hash (not raw token).
- **Day 3:** Add CSP header. Fix CSRF bypass for empty ALLOWED_ORIGINS.
- **Day 4:** Fix decryption failure to surface clear error to user (not silent empty state).
- **Day 4:** Remove inline DB DELETE from rate limit hot path.
- **Day 5:** Write integration tests for signup, login, logout, /me auth routes.

## Week 2 — Data Integrity & Auth Hardening

- Short-lived JWTs (15 min) + refresh token rotation.
- Move JWT from localStorage to HttpOnly cookies.
- Fix push subscription check IDOR (SEC-004).
- Fix `initialPullDone.current` not resetting on logout.
- Implement password reset via email.
- Validate all path parameters (UUID format check).
- Add `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After` headers to 429 responses.

## Week 3 — Architecture & Observability

- Set up centralized log aggregation (Loki + Grafana, or Papertrail).
- Set up Prometheus metrics (request count, error rate, latency).
- Alerting for error rate > 1% 5xx sustained.
- Create staging environment (separate Supabase project).
- Fix backup service: gzip integrity check + offsite upload to S3.
- Remove `continue-on-error` from Trivy scan.
- Add `NODE_OPTIONS` to API container.
- Add GDPR data deletion endpoint.

## Week 4 — Testing, Legal & Planning

- Integration tests for data routes, API key routes, push routes.
- Test concurrent write scenario (BACK-002 regression test).
- Draft and publish Terms of Service and Privacy Policy.
- Add API versioning (`/api/v1/` prefix).
- Begin planning migration from blob to relational drinks model (multi-sprint).
- Performance test: simulate 1K concurrent users.
- Security penetration test against auth endpoints.

---

# Final Verdict

## ⚠️ HIGH RISK — NOT PRODUCTION READY

SipWise shows genuine engineering intent. The developer understands security concepts (bcrypt, AES-256-GCM, JWT blacklisting, advisory locks, audit trails) and has implemented more security infrastructure than most personal projects.

However, the gap between conceptual awareness and execution is significant. **Live production secrets are committed to the repository right now** — this alone is an active compromise requiring immediate incident response regardless of all other measures.

Beyond the P0 secret exposure: the application has no TLS, a critical authorization bypass that silences users' safety alerts, silent data loss on decryption failure, and zero server-side tests on any security-critical path. It also serves BAC numbers that users may use to make driving decisions, while the physiological absorption model gives different answers in the app vs. the API — a medically significant discrepancy.

**Do not accept paying customers until at minimum the Week 1 and Week 2 remediation items are complete.**

Estimated timeline to production-ready: **4-6 weeks** with one focused backend engineer working full-time on remediation.
