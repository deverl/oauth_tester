# Auth server request/response logging

**Date:** 2026-08-11  
**Status:** Draft for review

## Problem

Debugging code-for-token exchange is hard because outbound calls to the authorization server’s token endpoint are barely logged (URL only). Failures and unexpected response shapes are opaque.

## Goals

- Log every HTTP request this app makes to the authorization server, plus the response.
- Console only (no UI surface).
- Toggleable via `VERBOSITY` environment variable **or** a CLI flag (`--verbose` / `-v`).
- Log payloads as-is (including secrets, codes, and tokens) — this is a local OAuth test tool.

## Non-goals

- Redacting secrets.
- Structured log shipping, log levels beyond on/off, or a runtime UI toggle.
- Changing OAuth request/response behavior (aside from building the authorize URL on the server so it can be logged).

## Design

### Toggle (both env and CLI)

Verbose logging is **on** when either:

1. `process.env.VERBOSITY` is set and, after trim + lowercasing, is **not** one of: empty string, `0`, `false`, `no`, `off` (so `1`, `true`, `yes`, `on`, `debug`, `2`, etc. all enable it), **or**
2. `process.argv` contains `--verbose` or `-v`.

Unset `VERBOSITY` does not enable logging by itself. Default is **off**. Resolve once at process startup and expose a boolean (e.g. `is_verbose()`).

Examples:

```bash
VERBOSITY=1 npm start
npm start -- --verbose
node ./bin/www -v
```

### Where logging lives

All token-endpoint traffic already goes through `token_request` in `server/oauth.js` (used by `get_token` and `refresh_token`). Extend that function only — one place covers code exchange and refresh.

### What to log when verbose

For each call:

**Request**

- Method (`POST`)
- URL (`token_url`)
- Headers sent
- Body: form parameters object and/or the `application/x-www-form-urlencoded` string (no redaction)

**Response**

- HTTP status
- Response body (raw text; also log parsed JSON when parse succeeds)

Use clear `console.log` / `console.error` prefixes (e.g. `[oauth] request` / `[oauth] response`) so lines are easy to grep. When verbose is off, add no new logs. Leave the existing URL-only `DEBUG: (token_request)` line unchanged.

### Code shape

1. Add a small module (e.g. `server/verbosity.js`) that:
   - Parses env + argv
   - Exports `is_verbose()` (and optionally `init()` called from `bin/www`)
2. Call init early in `bin/www` so flags are applied before the server listens; log a one-line notice when verbose mode is enabled (`Verbose OAuth logging enabled`).
3. In `token_request`, if `is_verbose()`, log request details before `fetch` and response details after receiving the body (including error/non-JSON paths).

No changes to API routes, frontend, or DB.

### Failure paths

Still log the response (status + body) when:

- HTTP is non-OK
- Body is non-JSON
- Body contains OAuth `error`

Network failures (fetch throws): log the attempted request and the error message.

## Alternatives considered

| Approach | Why not chosen |
| --- | --- |
| Env only | Less convenient for one-off terminal runs |
| CLI only | Worse for VS Code launch configs / nodemon |
| UI logging | User chose console only |
| Redact secrets | User chose full detail for local debugging |

## Success criteria

- With verbose off: no new console noise from token calls.
- With `VERBOSITY=1` or `--verbose`: exchanging a code or refreshing a token prints full request and response to the server console.
- Secrets appear in those logs when present in the request/response.
