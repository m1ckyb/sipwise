# Production Readiness Audit Report - 2026-07-27 (v2)

This report provides the secondary production readiness audit of the **SipWise** application codebase, identifying minor structural debt, deployment config issues, and security boundaries.

---

## 1. FINDINGS & ISSUES

### Issue 1: Lack of JWT Revocation or Invalidation Mechanism
*   **File:** [server/src/middleware/auth.ts](file:///home/michael/sipwise/server/src/middleware/auth.ts)
*   **Function/Class:** `signToken`, `verifyToken`
*   **Severity:** 🟠 Major
*   **Category:** Session Management / Secrets Revocation
*   **Problem:** Once a JWT is signed, it is valid for 7 days (`expiresIn: '7d'`). There is no mechanism (like blacklists, DB token checks, or refresh token cycles) to invalidate a token if a user changes their password, logs out, or if the token is compromised.
*   **Evidence:** In [auth.ts:L20-L26](file:///home/michael/sipwise/server/src/middleware/auth.ts#L20-L26):
    ```typescript
    export function signToken(payload: JwtPayload): string {
      return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
    }
    ```
*   **Impact:** A stolen session token remains valid for up to 7 days, allowing unauthorized API access with no method for administrators or users to terminate the session.
*   **Attack Scenario:** An attacker steals a JWT token from a client device. Even if the user changes their password immediately, the attacker retains access to the user's data for the remaining lifespan of the 7-day token.
*   **Recommended Fix:** Implement a token blacklist (using Redis or the database) or shift session verification to database-backed session tables.

---

### Issue 2: Missing Container Healthcheck for API Service
*   **File:** [docker-compose.yml](file:///home/michael/sipwise/docker-compose.yml)
*   **Severity:** 🟠 Major
*   **Category:** DevOps / Infrastructure Reliability
*   **Problem:** The `api` service container lacks a `healthcheck` definition in `docker-compose.yml`.
*   **Evidence:** In [docker-compose.yml:L23-L47](file:///home/michael/sipwise/docker-compose.yml#L23-L47), the `pg` and `frontend` services have health checks, but `api` does not.
*   **Impact:** If the Node/Hono API service freezes or enters a deadlock (but the container process remains alive), Nginx will continue forwarding client requests to it, leading to persistent 502/504 errors without Docker triggering an automatic service restart.
*   **Recommended Fix:** Add a health check command targeting the `/api/health` endpoint on the `api` container.
*   **Example Fix:**
    ```yaml
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/api/health"]
      interval: 10s
      timeout: 5s
      retries: 3
    ```

---

### Issue 3: Missing Indexes on Database Foreign Keys (Unindexed user_id)
*   **File:** [docker/init.sql](file:///home/michael/sipwise/docker/init.sql)
*   **Severity:** 🟡 Minor
*   **Category:** Database Performance
*   **Problem:** The foreign key `user_id` in `sipwise_error_logs` is not indexed, resulting in full table scans when users delete their accounts (triggering `ON DELETE SET NULL` operations) or when logs are queried per user.
*   **Evidence:** In [init.sql:L83-L97](file:///home/michael/sipwise/docker/init.sql#L83-L97):
    ```sql
    CREATE TABLE IF NOT EXISTS sipwise_error_logs (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id UUID REFERENCES sipwise_users(id) ON DELETE SET NULL,
      ...
    );
    CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON sipwise_error_logs(created_at DESC);
    -- No index on user_id!
    ```
*   **Impact:** Massive performance degradation and database locks on the `sipwise_error_logs` table as log counts grow.
*   **Recommended Fix:** Create an index on `user_id` for the logs table.
*   **Example Fix:**
    ```sql
    CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON sipwise_error_logs(user_id);
    ```

---

### Issue 4: Potential PII/Sensitive Data Exposure in Error Logs
*   **File:** [server/src/routes/logs.ts](file:///home/michael/sipwise/server/src/routes/logs.ts)
*   **Function/Class:** `logs.post('/')`
*   **Severity:** 🟠 Major
*   **Category:** Security / Data Leakage
*   **Problem:** The frontend error logging route accepts any raw client-side exception context or stack trace and stores it in the database. There is no sanitization or filtering to prevent client-side secrets, tokens, or PII from being stored.
*   **Evidence:** In [logs.ts:L42-L45](file:///home/michael/sipwise/server/src/routes/logs.ts#L42-L45):
    ```typescript
    await db.query(
      'INSERT INTO sipwise_error_logs (user_id, error_message, stack_trace, source, context) VALUES ($1, $2, $3, $4, $5)',
      [userId, error_message, stack_trace ?? null, source ?? 'frontend', context ? JSON.stringify(context) : null],
    );
    ```
*   **Impact:** Passwords, tokens, or personal identifiers included in application state at the time of a crash are stored in clear-text inside database logs, creating compliance violations.
*   **Recommended Fix:** Add regex-based redacting and sanitization filters to scrub parameters like `password`, `token`, `key`, and `auth` from logs.

---

## 2. EXECUTIVE SUMMARY

Remediations have mitigated 100% of the critical vulnerabilities from the first audit. The application is now in a **High Readiness state** and can be deployed with minor changes. Addressing session revocation, logging sanitizers, and database constraints will ensure a robust enterprise-ready system.

---

## 3. PRODUCTION READINESS SCORECARD

Category| Score /10| Notes
---|---|---
Security| 8/10| No active access bypasses, but lacks JWT invalidation.
Backend Architecture| 9/10| Clean, but CPU-intensive bcrypt library can block Hono loop.
Frontend| 9/10| Stable views and low-stock replenishment warnings.
Database| 8/10| Normal schemas but has minor unindexed foreign keys.
Infrastructure| 8/10| Lacks health probe on the API container.
Reliability| 9/10| Excellent catch blocks, needs sanitization controls on logs.
Scalability| 9/10| Shared rate limits, horizontal-ready.
Testing| 9/10| Standard passing tests.
Observability| 8/10| Remote error reporting is functional.
AI Safety| N/A| No AI models.

---

## 4. SECURITY RISK MATRIX

Severity| Finding| Business Impact
---|---|---
🟠 Major| Lack of JWT Session Revocation| Compensated token stays active for 7 days.
🟠 Major| Raw Stack Logs Data Leakage| Accidental ingestion of passwords/PII into database logs.

---

## 5. TECHNICAL DEBT MATRIX

Priority| Debt Item| Effort to Fix
---|---|---
1| Unindexed foreign key constraints| Low
2| Lack of session blacklist/refresh structure| Medium

---

## 6. SCALABILITY ASSESSMENT

*   **100 Users:** Standard operation.
*   **1,000 Users:** Database queries run fast.
*   **10,000 Users:** Full table scan delay on error log queries for deleting accounts.
*   **100,000+ Users:** Redis caching layer required for session revocation checks.

---

## 7. MISSING SYSTEMS REPORT

1.  **Session Revocation Engine:** Necessary to terminate sessions on logout or password change.
2.  **Log Sanitizer/Redactor Middleware:** Protects database logs from swallowing plain-text secrets.

---

## 8. TOP 20 FIXES BY ROI

1.  Add API container healthcheck to Docker Compose (Low effort, High reliability).
2.  Create index on `sipwise_error_logs(user_id)` (Low effort, High DB performance).
3.  Sanitize logs context payloads before insert (Medium effort, High compliance safety).

---

## 9. TOP 10 PRODUCTION BLOCKERS

1. Missing health check probe for Hono API container.
2. Unindexed foreign keys in audit/logs tables.

---

## 10. FINAL VERDICT

**READY WITH MINOR CHANGES**

The previous security issues (auth bypass, spoofable headers) are fixed. Resolving the remaining container probes and indexing needs will prepare the application for production deployment.
