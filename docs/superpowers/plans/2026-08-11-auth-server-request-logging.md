# Auth Server Request Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add toggleable console logging of all token-endpoint requests and responses via `VERBOSITY` or `--verbose`/`-v`.

**Architecture:** A small `server/verbosity.js` module resolves on/off once from env + argv. `bin/www` initializes it at startup. `server/oauth.js` `token_request` logs full request/response when verbose is on. No UI or API contract changes.

**Tech Stack:** Node.js 22 (built-in `node:test` + `node:assert`), Express app as today, native `fetch` already used for token calls.

## Global Constraints

- Console only; no UI logging.
- Log payloads as-is (no redaction of secrets/codes/tokens).
- Verbose on when `VERBOSITY` (trimmed, lowercased) is set and not one of: ``, `0`, `false`, `no`, `off`; OR argv contains `--verbose` or `-v`.
- Unset `VERBOSITY` alone does not enable logging.
- When verbose is off, add no new logs; leave existing `DEBUG: (token_request)` URL line unchanged.
- Do not commit unless the user explicitly asks.

---

## File structure

| File | Responsibility |
| --- | --- |
| `server/verbosity.js` | Parse env/argv; export `init_verbosity()` and `is_verbose()` |
| `server/verbosity.test.js` | Unit tests for toggle rules |
| `bin/www` | Call `init_verbosity()` early; one-line notice when enabled |
| `server/oauth.js` | When verbose, log request + response around `fetch` in `token_request` |

---

### Task 1: Verbosity module

**Files:**
- Create: `server/verbosity.js`
- Create: `server/verbosity.test.js`

**Interfaces:**
- Consumes: `process.env.VERBOSITY`, `process.argv` (or injectable overrides for tests)
- Produces:
  - `init_verbosity({ env?: object, argv?: string[] } = {}): boolean` — resolve and store flag; returns whether verbose
  - `is_verbose(): boolean` — current flag (false before init)

- [ ] **Step 1: Write the failing tests**

Create `server/verbosity.test.js`:

```js
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { init_verbosity, is_verbose } = require('./verbosity');

describe('verbosity', () => {
    beforeEach(() => {
        init_verbosity({ env: {}, argv: ['node', 'bin/www'] });
    });

    it('is off by default', () => {
        assert.equal(is_verbose(), false);
    });

    it('turns on for VERBOSITY=1', () => {
        assert.equal(init_verbosity({ env: { VERBOSITY: '1' }, argv: ['node'] }), true);
        assert.equal(is_verbose(), true);
    });

    it('turns on for VERBOSITY=true (case-insensitive)', () => {
        assert.equal(init_verbosity({ env: { VERBOSITY: 'TRUE' }, argv: ['node'] }), true);
    });

    it('stays off for VERBOSITY=false / 0 / no / off', () => {
        for (const v of ['false', '0', 'no', 'off', 'FALSE', '  off  ']) {
            assert.equal(init_verbosity({ env: { VERBOSITY: v }, argv: ['node'] }), false, v);
        }
    });

    it('turns on for --verbose', () => {
        assert.equal(init_verbosity({ env: {}, argv: ['node', '--verbose'] }), true);
    });

    it('turns on for -v', () => {
        assert.equal(init_verbosity({ env: {}, argv: ['node', '-v'] }), true);
    });

    it('turns on when flag set even if VERBOSITY=false', () => {
        assert.equal(
            init_verbosity({ env: { VERBOSITY: 'false' }, argv: ['node', '--verbose'] }),
            true
        );
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test server/verbosity.test.js`  
Expected: FAIL (module missing or exports missing)

- [ ] **Step 3: Implement `server/verbosity.js`**

```js
const FALSY = new Set(['', '0', 'false', 'no', 'off']);

let verbose = false;

const env_enables = (env) => {
    if (!Object.prototype.hasOwnProperty.call(env, 'VERBOSITY') || env.VERBOSITY == null) {
        return false;
    }
    const v = String(env.VERBOSITY).trim().toLowerCase();
    return !FALSY.has(v);
};

const argv_enables = (argv) => argv.includes('--verbose') || argv.includes('-v');

/**
 * Resolve verbose mode from env and argv. Call once at process startup.
 * @param {{ env?: NodeJS.ProcessEnv, argv?: string[] }} [opts]
 * @returns {boolean}
 */
const init_verbosity = ({ env = process.env, argv = process.argv } = {}) => {
    verbose = env_enables(env) || argv_enables(argv);
    return verbose;
};

const is_verbose = () => verbose;

module.exports = {
    init_verbosity,
    is_verbose,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test server/verbosity.test.js`  
Expected: all PASS

---

### Task 2: Initialize verbosity in `bin/www`

**Files:**
- Modify: `bin/www`

**Interfaces:**
- Consumes: `init_verbosity`, `is_verbose` from `../server/verbosity`
- Produces: process starts with verbosity resolved; one console line when on

- [ ] **Step 1: Require and init near the top of `bin/www` (after other requires)**

```js
const { init_verbosity, is_verbose } = require('../server/verbosity');

init_verbosity();
if (is_verbose()) {
    console.log('Verbose OAuth logging enabled');
}
```

Place this after the existing `require` block and before port setup.

- [ ] **Step 2: Manual check**

Run: `node ./bin/www --verbose` briefly (or with timeout) and confirm startup prints `Verbose OAuth logging enabled`.  
Run without flag: that line must not appear.  
Stop the server after checking.

---

### Task 3: Log token requests/responses in `oauth.js`

**Files:**
- Modify: `server/oauth.js` (`token_request`)

**Interfaces:**
- Consumes: `is_verbose` from `./verbosity`
- Produces: when verbose, console logs for each token call’s request and response (or network error)

- [ ] **Step 1: Require verbosity and add logging helpers inside `token_request`**

At top of `server/oauth.js`:

```js
const { is_verbose } = require('./verbosity');
```

Replace/extend `token_request` so that when `is_verbose()`:

**Before fetch**, log:

```js
console.log('[oauth] request', {
    method: 'POST',
    url: token_url,
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
    },
    params,
    body: new URLSearchParams(params).toString(),
});
```

Build `body` once and reuse for fetch and logging.

**After reading `body` text**, log:

```js
console.log('[oauth] response', {
    url: token_url,
    status: response.status,
    body,
});
```

**On fetch throw**, after the existing error path is prepared, also:

```js
if (is_verbose()) {
    console.error('[oauth] request failed', { url: token_url, error: e.message || String(e) });
}
```

Keep the existing `console.log(\`DEBUG: (token_request) Posting request to '${token_url}'\`)` unchanged.

Do not change grant logic, PKCE, or DB side effects.

- [ ] **Step 2: Manual verification**

1. Start with verbose: `VERBOSITY=1 npm start` (or `npm start -- --verbose`).
2. Complete (or attempt) code exchange or refresh against a configured auth server.
3. Confirm console shows `[oauth] request` (method, url, headers, params/body) and `[oauth] response` (status, body), including secrets when present.
4. Restart without verbose; confirm those `[oauth]` lines do not appear (existing DEBUG URL line may still appear).

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Console-only logging | Task 3 |
| `VERBOSITY` + `--verbose`/`-v` | Task 1–2 |
| Full payloads, no redaction | Task 3 |
| Cover code exchange + refresh via `token_request` | Task 3 |
| Quiet when off; keep existing DEBUG line | Task 3 |
| Startup notice when verbose | Task 2 |
| Network / error response logging | Task 3 |
