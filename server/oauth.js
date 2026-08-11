const db = require('./db');
const constants = require('../constants/constants');
const { is_verbose } = require('./verbosity');

/**
 * The redirect_uri registered with the authorization server. It must be identical
 * in the authorization request and the token request (RFC 6749 section 4.1.3).
 */
const REDIRECT_URI = `http://localhost:${constants.HTTP_PORT}/api/v1/oauth_handler/`;

/**
 * Format headers for verbose logging (Headers object or plain object).
 * @param {Headers|Object} headers
 * @returns {string}
 */
const format_headers = (headers) => {
    if (!headers) {
        return '(none)';
    }
    if (typeof headers.forEach === 'function') {
        const lines = [];
        headers.forEach((value, key) => {
            lines.push(`${key}: ${value}`);
        });
        return lines.length ? lines.join('\n') : '(none)';
    }
    return Object.entries(headers)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
};

/**
 * Try to pretty-print a body as JSON; otherwise return the raw string.
 * @param {string} body
 * @returns {string}
 */
const format_body = (body) => {
    if (body == null || body === '') {
        return '(empty)';
    }
    try {
        return JSON.stringify(JSON.parse(body), null, 2);
    } catch (e) {
        return body;
    }
};

/**
 * POSTs a form-encoded request to the token endpoint and returns the parsed JSON body.
 * @param {string} token_url    The token endpoint of the authorization server.
 * @param {Object} params       Form parameters to send.
 * @returns {Promise<Object>}   Resolved with the token response, rejected with an error message.
 */
const token_request = async (token_url, params) => {
    console.log(`DEBUG: (token_request) Posting request to '${token_url}'`);

    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
    };
    const body_string = new URLSearchParams(params).toString();

    if (is_verbose()) {
        console.log(
            [
                '[oauth] >>> request to authorization server',
                `POST ${token_url}`,
                format_headers(headers),
                `Content-Length: ${Buffer.byteLength(body_string)}`,
                '',
                '--- form params ---',
                JSON.stringify(params, null, 2),
                '--- raw POST body ---',
                body_string || '(empty)',
                '[oauth] >>> end request',
            ].join('\n')
        );
    }

    let response;
    try {
        response = await fetch(token_url, {
            method: 'POST',
            headers,
            body: body_string,
        });
    } catch (e) {
        if (is_verbose()) {
            console.error(
                [
                    '[oauth] !!! request failed (network/DNS/TLS)',
                    `POST ${token_url}`,
                    `error: ${e.message || String(e)}`,
                    e.cause ? `cause: ${e.cause.message || String(e.cause)}` : null,
                ]
                    .filter(Boolean)
                    .join('\n')
            );
        }
        throw new Error(`Token request to ${token_url} failed: ${e.message || e}`);
    }

    const body = await response.text();

    if (is_verbose()) {
        console.log(
            [
                '[oauth] <<< response from authorization server',
                `HTTP ${response.status} ${response.statusText || ''}`.trim(),
                `url: ${response.url || token_url}`,
                format_headers(response.headers),
                '',
                '--- response body ---',
                format_body(body),
                '[oauth] <<< end response',
            ].join('\n')
        );
    }

    let json;
    try {
        json = JSON.parse(body);
    } catch (e) {
        throw new Error(`Token endpoint returned non-JSON response (HTTP ${response.status}): ${body}`);
    }

    // Error responses use the 'error' member (RFC 6749 section 5.2).
    if (json.error) {
        const description = json.error_description ? `: ${json.error_description}` : '';
        throw new Error(`${json.error}${description}`);
    }

    if (!response.ok) {
        throw new Error(`Token endpoint returned HTTP ${response.status}: ${body}`);
    }

    return json;
};

/**
 * Builds the authorization endpoint URL for a browser redirect (RFC 6749 §4.1.1 + PKCE).
 * When verbose logging is on, logs the GET as an outbound auth-server request.
 * (The browser performs the navigation; this app does not fetch the authorize URL itself.)
 *
 * @param {Object} config
 * @param {{ state: string, code_challenge: string, code_challenge_method?: string }} opts
 * @returns {string}
 */
const build_authorize_url = (config, { state, code_challenge, code_challenge_method = 'S256' }) => {
    if (!config || !config.authorize_url) {
        throw new Error('Invalid config (no authorize_url)');
    }

    const params = {
        response_type: 'code',
        client_id: config.client_id,
        redirect_uri: REDIRECT_URI,
        state,
        code_challenge,
        code_challenge_method,
    };

    if (config.scope) {
        params.scope = config.scope;
    }

    const query = Object.entries(params)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');
    const separator = config.authorize_url.includes('?') ? '&' : '?';
    const authorize_url = `${config.authorize_url}${separator}${query}`;

    if (is_verbose()) {
        console.log(
            [
                '[oauth] >>> request to authorization server (browser redirect)',
                `GET ${authorize_url}`,
                '(no request headers or body — browser navigation)',
                '',
                '--- query params ---',
                JSON.stringify(params, null, 2),
                '[oauth] >>> end request',
            ].join('\n')
        );
    }

    return authorize_url;
};

/**
 * Logs the authorization server's redirect back to our redirect_uri (verbose mode).
 * @param {Object} query  Express req.query (code/state or error fields)
 */
const log_authorize_callback = (query) => {
    if (!is_verbose()) {
        return;
    }

    const qs = new URLSearchParams(query).toString();
    console.log(
        [
            '[oauth] <<< response from authorization server (redirect to redirect_uri)',
            `GET ${REDIRECT_URI}${qs ? `?${qs}` : ''}`,
            '(browser redirected here after /authorize)',
            '',
            '--- query params ---',
            JSON.stringify(query, null, 2),
            '[oauth] <<< end response',
        ].join('\n')
    );
};

/**
 * Handles the details of exchanging an authorization code for a token.
 * If a token is obtained, it is stored in the database.
 * @param {Object} config
 * @param {string} code
 * @returns {Promise} Resolved with the token, or rejected with an error message.
 */
const get_token = async (config, code) => {
    if (!config || !config.token_url) {
        throw new Error('Invalid config (no token_url)');
    }

    const params = {
        grant_type: 'authorization_code',
        client_id: config.client_id,
        code: code,
        redirect_uri: REDIRECT_URI,
    };

    // Confidential clients include a secret; public clients rely on PKCE alone.
    if (config.client_secret) {
        params.client_secret = config.client_secret;
    }

    // Include the PKCE code verifier if one was generated for this flow (RFC 7636).
    const verifier = db.read_verifier(config.name);
    if (verifier) {
        params.code_verifier = verifier;
        db.delete_verifier(config.name);
    }

    const response = await token_request(config.token_url, params);

    db.save_token(config.name, response);
    const token = db.read_token(config.name);

    if (!token) {
        throw new Error('Failed to store the token');
    }

    return token;
};

/**
 * Handles the details of refreshing an OAuth token (RFC 6749 section 6).
 * If a new token is obtained, it is stored in the database.
 * @param {Object} config
 * @returns {Promise} Resolved with the new token, or rejected with an error message.
 */
const refresh_token = async (config) => {
    if (!config || !config.token_url) {
        throw new Error('Invalid config (no token_url)');
    }

    const token_wrapper = db.read_token(config.name);

    if (!token_wrapper || !token_wrapper.token) {
        throw new Error('No token data');
    }

    const current_token = token_wrapper.token;

    if (!current_token.refresh_token) {
        throw new Error('No refresh token');
    }

    const params = {
        grant_type: 'refresh_token',
        client_id: config.client_id,
        refresh_token: current_token.refresh_token,
    };

    if (config.client_secret) {
        params.client_secret = config.client_secret;
    }

    const response = await token_request(config.token_url, params);

    // Some servers do not issue a new refresh token on refresh; keep the old one.
    if (!response.refresh_token) {
        response.refresh_token = current_token.refresh_token;
    }

    db.save_token(config.name, response);
    const token = db.read_token(config.name);

    if (!token) {
        throw new Error('Failed to store the refreshed token');
    }

    return token;
};

/**
 * GETs the configured verification URL with the stored access token as a Bearer token.
 * @param {Object} config
 * @returns {Promise<{http_status: number, http_status_text: string, body: string}>}
 */
const verify_access = async (config) => {
    if (!config || !config.verify_url) {
        throw new Error('Invalid config (no verify_url)');
    }

    const token_wrapper = db.read_token(config.name);

    if (!token_wrapper || !token_wrapper.token) {
        throw new Error('No token data');
    }

    const access_token = token_wrapper.token.access_token;
    if (!access_token) {
        throw new Error('No access token');
    }

    const headers = {
        Authorization: `Bearer ${access_token}`,
        Accept: 'application/json',
    };

    if (is_verbose()) {
        console.log(
            [
                '[oauth] >>> verify request',
                `GET ${config.verify_url}`,
                format_headers(headers),
                '[oauth] >>> end request',
            ].join('\n')
        );
    }

    let response;
    try {
        response = await fetch(config.verify_url, {
            method: 'GET',
            headers,
        });
    } catch (e) {
        if (is_verbose()) {
            console.error(
                [
                    '[oauth] !!! verify request failed (network/DNS/TLS)',
                    `GET ${config.verify_url}`,
                    `error: ${e.message || String(e)}`,
                ].join('\n')
            );
        }
        throw new Error(`Verify request to ${config.verify_url} failed: ${e.message || e}`);
    }

    const body = await response.text();

    if (is_verbose()) {
        console.log(
            [
                '[oauth] <<< verify response',
                `HTTP ${response.status} ${response.statusText || ''}`.trim(),
                `url: ${response.url || config.verify_url}`,
                format_headers(response.headers),
                '',
                '--- response body ---',
                format_body(body),
                '[oauth] <<< end response',
            ].join('\n')
        );
    }

    return {
        http_status: response.status,
        http_status_text: response.statusText || '',
        body: body,
    };
};

module.exports = {
    REDIRECT_URI,
    build_authorize_url,
    log_authorize_callback,
    get_token,
    refresh_token,
    verify_access,
};
