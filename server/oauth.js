const db = require('./db');
const constants = require('../constants/constants');

/**
 * The redirect_uri registered with the authorization server. It must be identical
 * in the authorization request and the token request (RFC 6749 section 4.1.3).
 */
const REDIRECT_URI = `http://localhost:${constants.HTTP_PORT}/api/v1/oauth_handler/`;

/**
 * POSTs a form-encoded request to the token endpoint and returns the parsed JSON body.
 * @param {string} token_url    The token endpoint of the authorization server.
 * @param {Object} params       Form parameters to send.
 * @returns {Promise<Object>}   Resolved with the token response, rejected with an error message.
 */
const token_request = async (token_url, params) => {
    console.log(`DEBUG: (token_request) Posting request to '${token_url}'`);

    let response;
    try {
        response = await fetch(token_url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
            },
            body: new URLSearchParams(params).toString(),
        });
    } catch (e) {
        throw `Token request to ${token_url} failed: ${e.message || e}`;
    }

    const body = await response.text();

    let json;
    try {
        json = JSON.parse(body);
    } catch (e) {
        throw `Token endpoint returned non-JSON response (HTTP ${response.status}): ${body}`;
    }

    // Error responses use the 'error' member (RFC 6749 section 5.2).
    if (json.error) {
        const description = json.error_description ? `: ${json.error_description}` : '';
        throw `${json.error}${description}`;
    }

    if (!response.ok) {
        throw `Token endpoint returned HTTP ${response.status}: ${body}`;
    }

    return json;
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
        throw 'Invalid config (no token_url)';
    }

    const params = {
        grant_type: 'authorization_code',
        client_id: config.client_id,
        client_secret: config.client_secret,
        code: code,
        redirect_uri: REDIRECT_URI,
    };

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
        throw 'Failed to store the token';
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
        throw 'Invalid config (no token_url)';
    }

    const token_wrapper = db.read_token(config.name);

    if (!token_wrapper || !token_wrapper.token) {
        throw 'No token data';
    }

    const current_token = token_wrapper.token;

    if (!current_token.refresh_token) {
        throw 'No refresh token';
    }

    const params = {
        grant_type: 'refresh_token',
        client_id: config.client_id,
        client_secret: config.client_secret,
        refresh_token: current_token.refresh_token,
    };

    const response = await token_request(config.token_url, params);

    // Some servers do not issue a new refresh token on refresh; keep the old one.
    if (!response.refresh_token) {
        response.refresh_token = current_token.refresh_token;
    }

    db.save_token(config.name, response);
    const token = db.read_token(config.name);

    if (!token) {
        throw 'Failed to store the refreshed token';
    }

    return token;
};

module.exports.REDIRECT_URI = REDIRECT_URI;
module.exports.get_token = get_token;
module.exports.refresh_token = refresh_token;
