const request = require('request');
const db = require('./db');

/**
 * Utility function to create the API url to be used with TSheets for
 * the given username and server name.
 * @param {string} api_server
 * @param {string} username
 * @returns {string} The base API URL to use with TSheets.
 */
function get_api_server_base_url(api_server, username) {
    let server_ext = '';
    if (api_server === 'lntxweb1') {
        server_ext = '-dev';
    }

    const url = `https://${username}.tsheets${server_ext}.com/api`;

    return url;
}

/**
 * Handles the details of exchanging a code for a token. If a token is obtained, it is stored in the database.
 * @param {string} username
 * @param {string} code
 * @returns {Promise} Resolved with the token, or rejected with an error message.
 */
function get_token(username, code) {
    console.log(`DEBUG => (get_token): username = ${JSON.stringify(username)}`);
    console.log(`DEBUG => (get_token): code = ${JSON.stringify(code)}`);

    let p = new Promise((resolve, reject) => {
        const config = db.read_config(username);

        if (!config) {
            reject('Invalid config!');
            return;
        }

        const base_url = get_api_server_base_url(config.api_server, username);
        const url = `${base_url}/v1/grant`;
        const redirect_uri = 'http://localhost:3000/api/v1/oauth_handler/';

        const opts = {
            url: url,
            form: {
                grant_type: 'authorization_code',
                client_id: config.client_id,
                client_secret: config.client_secret,
                code: code,
                redirect_uri: redirect_uri
            }
        };

        request.post(opts, (err, httpResponse, body) => {
            console.log(
                `DEBUG: back from grant request: err = ${err}, httpResponse = ${JSON.stringify(
                    httpResponse
                )}, body = ${JSON.stringify(body)}`
            );
            if (err) {
                console.error(`ERROR: (get_token): err = ${err}`);
                reject(JSON.stringify(err));
            } else {
                let token = JSON.parse(body);
                console.log(`DEBUG (get_token): token = ${JSON.stringify(token)}`);
                if (token.error) {
                    console.error(`ERROR: (get_token): token.error = ${token.error}`);
                    reject(token.error);
                } else {
                    db.store_token(username, token);
                    token = db.read_token(username);
                    resolve(token);
                }
            }
        });
    });

    return p;
}

/**
 * Handles the details of refreshing a TSheets OAuth token.
 * If a new token is obtained, it is stored in the database.
 * @param {string} username
 * @returns {Promise} Resolved with the new token, or rejected with an error message.
 */
function refresh_token(username) {
    let p = new Promise((resolve, reject) => {
        const config = db.read_config(username);

        if (!config) {
            reject('No configuration');
            return;
        }

        let token_wrapper = db.read_token(username);

        console.log(`DEBUG (do_refresh_token): token_wrapper = ${JSON.stringify(token_wrapper)}`);

        if (!token_wrapper) {
            console.log(`DEBUG (do_refresh_token): No token in database`);
            reject('No token data');
            return;
        }

        let token = token_wrapper.token;

        if ('refresh_token' in token) {
            const base_url = get_api_server_base_url(config.api_server, username);
            const url = `${base_url}/v1/grant`;

            const opts = {
                url: url,
                headers: {
                    Authorization: `Bearer ${token.access_token}`
                },
                form: {
                    grant_type: 'refresh_token',
                    client_id: config.client_id,
                    client_secret: config.client_secret,
                    refresh_token: token.refresh_token
                }
            };

            console.log(`DEBUG => (do_refresh_token, before post): opts = ${JSON.stringify(opts)}.`);

            const d1 = new Date();

            request.post(opts, (err, httpResponse, body) => {
                const d2 = new Date();
                const t1 = d1.getTime();
                const t2 = d2.getTime();
                const elapsed = t2 - t1;

                console.log(
                    `DEBUG => (do_refresh_token, back from post): err = ${JSON.stringify(err)}, httpResponse = ${JSON.stringify(
                        httpResponse
                    )}, body = ${JSON.stringify(body)}, elapsed = ${elapsed}`
                );

                if (err) {
                    console.error(`ERROR => (do_refresh_token): err = ${err}`);
                    reject(err);
                } else {
                    token = JSON.parse(body);
                    db.store_token(username, token);
                    token = db.read_token(username);
                    if (token) {
                        resolve(token);
                    } else {
                        reject('No data');
                    }
                }
            });
        } else {
            reject('ERROR => (do_refresh_token) no refresh token');
        }
    });

    return p;
}

module.exports.get_api_server_base_url = get_api_server_base_url;
module.exports.get_token = get_token;
module.exports.refresh_token = refresh_token;
