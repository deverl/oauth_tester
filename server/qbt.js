const request = require('request');
const db = require('./db');
const constants = require('../constants/constants');

/**
 * Utility function to create the API url to be used with TSheets for
 * the given configuration.
 * @param {Object} config
 * @returns {string} The base API URL to use with TSheets.
 */
const get_api_server_base_url = (config) => {
    const url = `${config.base_url}/api`;

    return url;
};

/**
 * Handles the details of exchanging a code for a token. If a token is obtained, it is stored in the database.
 * @param {Object} config
 * @param {string} code
 * @returns {Promise} Resolved with the token, or rejected with an error message.
 */
const get_token = (config, code) => {
    console.log(`DEBUG: (get_token): config_name = ${JSON.stringify(config.name)}`);

    let p = new Promise((resolve, reject) => {
        if (!config || !config.base_url) {
            reject('Invalid config!');
            return;
        }

        const base_url = get_api_server_base_url(config);
        const url = `${base_url}/v1/grant`;
        const redirect_uri = `http://localhost:${constants.HTTP_PORT}/api/v1/oauth_handler/`;

        const opts = {
            url: url,
            form: {
                grant_type: 'authorization_code',
                client_id: config.client_id,
                client_secret: config.client_secret,
                code: code,
                redirect_uri: redirect_uri,
            },
        };

        console.log(`DEBUG: (get_token) Posting request to '${opts.url}'`);

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
                    db.save_token(config.name, token);
                    token = db.read_token(config.name);
                    resolve(token);
                }
            }
        });
    });

    return p;
};

/**
 * Handles the details of refreshing a TSheets OAuth token.
 * If a new token is obtained, it is stored in the database.
 * @param {Object} config
 * @returns {Promise} Resolved with the new token, or rejected with an error message.
 */
const refresh_token = (config) => {
    let p = new Promise((resolve, reject) => {
        if (!config) {
            reject('No configuration');
            return;
        }

        let token_wrapper = db.read_token(config.name);

        console.log(`DEBUG (do_refresh_token): token_wrapper = ${JSON.stringify(token_wrapper)}`);

        if (!token_wrapper) {
            console.log(`DEBUG (do_refresh_token): No token in database`);
            reject('No token data');
            return;
        }

        let token = token_wrapper.token;

        if ('refresh_token' in token) {
            const base_url = get_api_server_base_url(config);
            const url = `${base_url}/v1/grant`;

            const opts = {
                url: url,
                headers: {
                    Authorization: `Bearer ${token.access_token}`,
                },
                form: {
                    grant_type: 'refresh_token',
                    client_id: config.client_id,
                    client_secret: config.client_secret,
                    refresh_token: token.refresh_token,
                },
            };

            console.log(`DEBUG: (do_refresh_token, before post): opts = ${JSON.stringify(opts)}.`);

            const d1 = new Date();

            console.log(`DEBUG: (do_refresh_token): Posting request to '${opts.url}'`);

            request.post(opts, (err, httpResponse, body) => {
                const d2 = new Date();
                const t1 = d1.getTime();
                const t2 = d2.getTime();
                const elapsed = t2 - t1;

                console.log(
                    `DEBUG: (do_refresh_token, back from post): err = ${JSON.stringify(err)}, httpResponse = ${JSON.stringify(
                        httpResponse
                    )}, body = ${JSON.stringify(body)}, elapsed = ${elapsed}`
                );

                if (err) {
                    console.error(`ERROR: (do_refresh_token): err = ${err}`);
                    reject(err);
                } else {
                    token = JSON.parse(body);
                    db.save_token(config.name, token);
                    token = db.read_token(config.name);
                    if (token) {
                        resolve(token);
                    } else {
                        reject('No data');
                    }
                }
            });
        } else {
            reject('ERROR: (do_refresh_token) no refresh token');
        }
    });

    return p;
};

module.exports.get_api_server_base_url = get_api_server_base_url;
module.exports.get_token = get_token;
module.exports.refresh_token = refresh_token;
