# Loan Management System – README

## 📌 Overview

The **Loan Management System** is a modular and secure backend built using **NestJS**, **Prisma**, and **PostgreSQL**. It handles the full lifecycle of a loan:

* Loan retrieval & audit trail
* Loan disbursement
* Repayment scheduling
* Repayment processing
* Rollbacks with full audit logging
* Security & validation layers
* Dockerized environment with Swagger & Prisma Studio

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────┐
│                 NestJS API                  │
├─────────────────────────────────────────────┤
│  Modules                                     │
│   ├── Loans                                  │
│   ├── Disbursements                          │
│   ├── Repayments                             │
│   ├── Rollbacks                              │
│   └── Audit                                  │
│                                             │
│  Common Layer                                │
│   ├── Guards (JWT)                           │
│   ├── Filters (Exception Filter)             │
│   ├── Interceptors (Logging)                 │
│   └── Utils                                  │
└─────────────────────────────────────────────┘

           ▼
┌──────────────────────────────┐
│         Prisma ORM           │
└──────────────────────────────┘
           ▼
┌──────────────────────────────┐
│         PostgreSQL DB        │
└──────────────────────────────┘
```

---

## 🏃 Running the System

### **1. Clone the repository**

```
git clone <https://github.com/NancELSherbiny/Loan-Disbursement-Repayment-System.git>
cd backend
```

### **2. Install dependencies**

```
npm install
```

### **3. Set environment variables (.env)**

```
DATABASE_URL=postgresql://admin:password@localhost:5432/loan_system
JWT_SECRET=some-long-random-string
```

### **4. Run migrations**

```
npx prisma migrate dev
npx ts-node prisma/seed.ts
npx prisma studio  
```

### **5. Generating JWT token**

```
npx ts-node scripts/generate-token.ts
```
Take it and authurize either in swagger if you are testing or in front end 

### **6. Start development server**

```
npm run start:dev
```

---

## 🐳 Running with Docker

```
docker-compose up --build
```

### URLs:

* API → [http://localhost:3000](http://localhost:3000)
* Swagger → [http://localhost:3000/docs](http://localhost:3000/docs)
* Prisma Studio → [http://localhost:5555](http://localhost:5555)
* UI → [http://localhost:5173](http://localhost:5173)

---

## 🧪 Testing

```
npm run test
npm run test:e2e
```

---

## 📂 Module Responsibilities

### **Loans Module**

* Loan retrieval
* Audit trail aggregation

### **Disbursements Module**

* Create and manage loan disbursement transactions

### **Repayments Module**

* Generate repayment schedules
* Create repayment payments
* Calculate outstanding balances

### **Rollbacks Module**

* Reverse repayments or disbursement if needed

### **Audit Module**

* Logs every action (repayments, rollbacks, disbursements)
* Useful for traceability and debugging

---

## 🗃️ Prisma Schema (Summary)

### Core Entities:

* **Loan** → main entity
* **Disbursement** → one per loan
* **Payment** → multiple repayments
* **Rollback** → reversal records
* **AuditLog** → historical events

---

## 🔐 Security Breakdown

### **1. JWT Authentication**

The project uses JWT Bearer Authentication via `passport-jwt` and NestJS’s authentication layer.

#### How it works:

* Tokens are extracted from the `Authorization: Bearer <token>` header.
* The `JwtStrategy` validates the token using the secret stored in `.env`.
* The payload is mapped into:

```
{
  userId: payload.sub,
  email: payload.email,
  roles: payload.roles ?? [],
}
```

This becomes `req.user` in controllers.

#### Token Expiration

```
JwtModule.register({
  secret: process.env.JWT_SECRET ?? 'dev-secret',
  signOptions: { expiresIn: '1h' },
})
```

Tokens expire in **1 hour**.

#### Token Generation

A script generates admin/dashboard tokens.

### 🔑 Generating Admin Tokens

Run:

```
npx ts-node scripts/generate-token.ts
```

Copy the generated JWT and paste it into your frontend or local environment as needed.

A script generates admin/dashboard tokens:

```
const payload = {
  sub: 'dashboard-admin',
  roles: ['disbursement:write'],
};
const token = sign(payload, secret, { expiresIn: '1h' });
```

Used for internal dashboards.

---

### **2. CORS Setup**

```
app.enableCors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://frontend:5173',
    /^http:\/\/localhost:\d+$/,
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true,
})
```

#### Why this is secure:

* Only localhost + Docker frontend allowed.
* Regex allows dev ports.
* Credentials allowed for cookies/tokens.
* `Authorization` header explicitly permitted.

---

### **3. Validation + Global Exception Handling**

* `ValidationPipe({ whitelist: true })` removes unknown fields.
* Custom `HttpExceptionFilter` provides structured error output.

---

## 🧾 Logging System

### **Logging Interceptor**

* Logs incoming request
* Logs response time & method

### **Audit Logging**

Each repayment, rollback, and disbursement logs:

* Action type
* Metadata
* User
* Timestamp

---

## 🔁 Rollback Architecture

1. Validate repayment/disbursement exists
2. Create rollback record
3. Reverse amount
4. Mark repayment as rolled back
5. Log audit event

All within a **Prisma atomic transaction**.

---

## ⚠️ Known Issues

* No user roles
* No pagination for repayment history
* No soft deletes
* Audit logs lack user filtering

---
