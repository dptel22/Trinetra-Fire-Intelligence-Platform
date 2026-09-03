## 2026-03-03 - API Exception Detail Leakage Prevention
**Vulnerability:** API endpoints formatted uncaught internal exception string representations `str(e)` directly into FastAPI `HTTPException` detail fields during 500 server errors, leaking backend internals (file paths, database errors, and stack details) to clients.
**Learning:** Returning exception text in HTTP responses for debugging convenience risks exposing sensitive environment details and query logic to unauthorized API clients.
**Prevention:** Catch generic internal exceptions in route handlers, log the full traceback internally using Python's standard `logger.exception(...)`, and return sanitized generic HTTP 500 error messages to callers.
