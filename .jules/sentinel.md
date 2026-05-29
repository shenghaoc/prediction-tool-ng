## 2024-05-29 - Server Information Leakage
**Vulnerability:** Express server was leaking `X-Powered-By: Express` header and lacked basic security headers (XSS protection, MIME sniffing protection, clickjacking protection). It also lacked a global error handler, potentially leaking stack traces on SSR failures.
**Learning:** Default Express configuration in Angular SSR (server.ts) does not come with security headers out-of-the-box.
**Prevention:** Always add a global error handler with the signature `(err, req, res, next)` at the end of routes, and explicitly set security headers (e.g., `res.setHeader("X-Content-Type-Options", "nosniff")`) or use libraries like helmet for Express apps.
