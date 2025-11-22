# SOLUTION.md

# SOLUTION.md

## 1. Approach Overview

This project implements a production-ready **loan disbursement & repayment processing** core focusing on correctness, auditability, and recoverability. The main goals were:

* Make operations using Prisma transactions.
* Provide **idempotency** and **duplicate prevention** for disbursements and repayments.
* Keep a **complete audit trail** for all operations and compensations.
* Provide a robust **rollback/compensation** mechanism for partially applied operations.
* Expose security controls (JWT, validation, guards) and **structured logging** for observability.

---

## 🔐 Deep Security Section (Architecture, Threat Modeling, Mitigations)

### **1. Authentication Architecture**

The system uses JWT Bearer Authentication with:

* `passport-jwt`
* A custom `JwtStrategy`
* `JwtAuthGuard` to protect routes
* `JwtModule` for signing and verifying tokens

Token extraction uses:

```
ExtractJwt.fromAuthHeaderAsBearerToken()
```

Token payload structure:

```
{
  sub: string,   // userId or system actor
  email?: string,
  roles?: string[],
}
```

During validation, it is transformed into a normalized object:

```
{
  userId: payload.sub,
  email: payload.email,
  roles: payload.roles ?? [],
}
```

This becomes `req.user` for all controllers.

---

### **2. Authorization Strategy**

Roles such as:

* `disbursement:write`
* `repayment:write`
* `audit:read`

---

### **3. CORS Security**

Allowed origins:

```
origin: [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://frontend:5173',
  /^http:\/\/localhost:\d+$/,
]
```

Why this is secure:

* Only local development URLs are allowed
* No wildcard `*` (prevents production exposure)
* Regex allows localhost flexibility without security risk
* Credentials are enabled but restricted to known origins
* Prevents CSRF naturally since JWT is sent in headers (not cookies)

---

### **4. Threat Model & Mitigations**

#### **Threat: Token Theft**

Mitigations:

* 1-hour token expiration
* `JWT_SECRET` stored in `.env` (not hardcoded)
* Token used only in `Authorization` header

#### **Threat: CORS Domain Spoofing**

Mitigations:

* Explicit allowlist
* No wildcard origin
* Regex only matches `localhost:*`

#### **Threat: Payload Injection**

Mitigations:

* `ValidationPipe({ whitelist: true })` removes unexpected fields
* DTOs enforce schemas

#### **Threat: Privilege Escalation**

Mitigations:

* Roles embedded in JWT
* Guards enforce (or can enforce) roles
* Roles cannot be modified by user inputs

#### **Threat: DoS / Malformed Requests**

Mitigations:

* Global HTTP Exception Filter
* Swagger validation
* Structured logging detects anomalies

#### **Threat: Replay Attacks**

Mitigations:

* Token expiration enforced (`ignoreExpiration: false`)
* Short TTL (1 hour)
* Expired tokens are automatically rejected

---

## 2. Key Technical Decisions & Why

### 2.1 Transaction pattern (AuditService.run)

* **Decision:** Centralize transaction execution via `AuditService.run(...)`, which wraps Prisma transactions and handles idempotency and rollback orchestration.
* **Why:** Centralizing transaction entry points ensures consistent audit logging, idempotency enforcement and a single place to attach rollback behavior. It avoids repeating transaction boilerplate across services and guarantees that audit records are created in the same transactional context.

### 2.2 Rollback as compensating transaction

* **Decision:** Implement rollback as a *durable compensating transaction* persisted in `rollbackRecord`. The rollback is executed in its own transaction (outside the failed transaction) and stores compensating actions as structured JSON.
* **Why:** If the original transaction failed mid-flight or the process crashed, doing compensation outside the original (possibly already aborted) transaction ensures compensation can be committed independently and remains durable.

### 2.3 Idempotency checks + heuristic protections

* **Decision:** Use idempotency checks in `AuditService.run` (custom check/onDuplicate) and lightweight heuristics for repayments (same loan/date/amount guard). Disbursement uses a stronger check by `loanId` unique disbursement constraint.
* **Why:** Prevents double disbursements or duplicate payments due to retries. The pattern balances pragmatic implementation and production safety.

### 2.4 Structured logging + minimal sensitive data

* **Decision:** Use `StructuredLoggerService` to emit contextual JSON log entries; avoid logging raw sensitive fields (full card numbers, secrets). Audit logs store metadata but avoid full sensitive payload.
* **Why:** Structured logs are easier to query and integrate with log aggregation systems. Minimizing sensitive logs reduces exposure in logging backends.

### 2.5 Separation of concerns

* **Decision:** Domain logic (DisbursementService, RepaymentsService) performs business logic; AuditService orchestrates transactions and rollback; RollbackService performs compensating actions; StructuredLoggerService handles logging.
* **Why:** Small, well-defined responsibilities improve maintainability and testability.

---

## 3. Rollback System – How It Works Internally

This section explains the lifecycle of a rollback in three scenarios: disbursement failure, repayment failure, and manual rollback.

### 3.1 Core ideas

* **Rollback record is never deleted** — `rollbackRecord` is append-only and contains `compensatingActions` (JSON) and metadata.
* **Transactions are never lost** — original transactions remain in `auditLog` with `_FAILED` or `_ROLLBACK` markers.
* **Compensation is idempotent** — Rollback creation checks for existing records to avoid duplicate compensation.

### 3.2 Automatic rollback on failure (within `AuditService.run`)

1. `AuditService.run` begins a Prisma transaction and writes a `${operation}_START` audit log.
2. Business logic runs inside the transaction.
3. If the business logic throws:

   * `AuditService` checks `context.rollback.canRollback(tx)`. This determines if compensation is allowed (e.g., no prior rollback record exists).
   * If allowed, `context.rollback.compensate(tx)` is invoked. In the current design the `compensate` typically calls `RollbackService.rollbackTransaction(transactionId, reason)` which runs its own Prisma transaction to perform the reversal and persist `rollbackRecord`.
   * `AuditService` writes `${operation}_ROLLBACK` audit log including `compensateResult`.
4. `AuditService` writes `${operation}_FAILED` audit log and rethrows the original error.

**Why separate transactions?** Compensation must persist even if the original transaction was reverted. Running it outside guarantees durability.

### 3.3 Manual or on-demand rollback

* Consumers can call `RollbackService.rollbackTransaction(transactionId, reason)` directly. The service:

  * Validates no existing rollback record (idempotency)
  * Reads audit logs to determine original operation type
  * Executes appropriate compensating actions (`rollbackDisbursement` or `rollbackRepayment`) in a Prisma transaction
  * Persists a `rollbackRecord` with serialized compensating actions
  * Returns a typed `RollbackRecord` object

### 3.4 Example compensations

* **Disbursement:** mark disbursement as `ROLLED_BACK`, create a reversal payment with negative amount, revert loan status to `APPROVED`, delete repayment schedules when appropriate.
* **Repayment:** mark payment `ROLLED_BACK`, create a reversal payment, update repayment schedules `paidDate` → `null` and `status` → `PENDING` for affected schedules.

---

## 4. Logging Strategy

Two complementary systems are used:

### 4.1 Structured runtime logging (`StructuredLoggerService`)

* Logs follow a small JSON schema with `timestamp`, `level`, `service`, `operation`, `transactionId`, `userId`, `duration`, `metadata`, and `error`.
* Use `Logger` under the hood (NestJS). In production, replace with `winston` or `pino` integrations for better transports.
* Avoid logging sensitive data. Use metadata keys that are safe (IDs, amounts, mask PII).

### 4.2 Audit logs (DB-backed)

* `AuditLog` entries are written in the same transaction as business operations. Each record includes `transactionId`, `operation`, `userId`, and `metadata`.
* Important events: `${operation}_START`, `${operation}_SUCCESS`, `${operation}_FAILED`, `${operation}_ROLLBACK`.

### 4.3 Queryability & Observability

* Structured logs are intended to be shipped to centralized logging (e.g., ELK, Datadog).
* Audit logs remain in DB for regulatory needs and can be exported.

---

## 5. Security (Threat Model + Mitigations)

This section outlines threats considered, the implemented mitigations, rationales, and future hardening steps.

### 5.1 Threats considered

* **Replay / duplicate requests** (leading to double disbursements).
* **Unauthorized operations** (unauthenticated/insufficiently privileged users attempting rollbacks).
* **Injection / tampering** (malformed payloads or malicious JSON).
* **Sensitive data leakage** via logs or responses.
* **Race conditions** (concurrent disbursement attempts).
* **Data corruption** due to partial failure.

### 5.2 Implemented mitigations

1. **Authentication & Authorization**

   * JWT guards protect endpoints. Only authenticated principals can call critical endpoints.
   * Services accept `userId` and include it in audit logs for non-repudiation. (Role-based checks can be added.)

2. **Idempotency & Duplicate Prevention**

   * Disbursements use `idempotency` check on `loanId` (single disbursement per loan). Attempting duplicate triggers conflict.
   * Repayments use a heuristic check: same loan + date + amount to avoid trivial duplicates. For stronger guarantees implement idempotency keys provided by client.

3. **Validation & DTOs**

   * DTOs ensure only valid shapes reach business logic. Validation pipe rejects invalid data early.

4. **Database Transactions**

   * Use Prisma transactions for all multi-step operations. This prevents partial writes from leaving inconsistent state.

5. **Audit Trail**

   * Every operation is logged in `AuditLog` including failures and rollbacks for forensic analysis.

6. **Least-privilege Logging**

   * StructuredLogger avoids PII and secrets. Audit logs are restricted to IDs/amounts and other non-sensitive metadata.

7. **Compensating Transactions**

   * Rollback operations are durable and idempotent. They cannot be executed multiple times due to `rollbackRecord` checks.

---

## Challenges Faced & Solutions

1. **Partial transaction visibility:** Original transaction might abort — solved by performing compensating actions in independent transactions and persisting rollback records.
2. **Calculating interest with partial principal reductions:** Created `RepaymentCalculationService` to calculate day-based accruals and handle leap years.
3. **Idempotency vs correctness:** Used conservative checks (unique disbursement per loan) and left room for client-provided idempotency keys.

---

## Tests & Coverage

* Unit tests should cover: calculation service, schedule updates, idempotency heuristics, and rollback behavior.
* E2E tests should simulate: successful disbursements, successful repayments (incl. overpayment), failed operations that trigger rollbacks.

---

## Closing Notes

This SOLUTION.md explains the rationale and choices made in the implementation. The system balances production safety and pragmatic complexity, prioritizing auditability, atomicity, and recoverability. With the recommended improvements (idempotency keys, structured logging), the system will be ready for stricter production requirements.
