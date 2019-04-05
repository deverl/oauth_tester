const request = require('request');
const db = require('./db');

function make_token_data(token) {
    if (typeof token === 'string') {
        token = JSON.parse(token);
    }

    let token_data = {
        token: token
    };

    let t = new Date();
    let ms = t.getTime();
    let expire_time_ms = ms + token.expires_in * 1000;
    token_data.expire_time_ms = expire_time_ms;
    let t2 = new Date(expire_time_ms);

    token_data.expiration = t2.toString();

    return token_data;
}

function get_api_server_base_url(api_server, username) {
    let server_ext = '';
    if (api_server === 'lntxweb1') {
        server_ext = '-dev';
    }

    const url = `https://${username}.tsheets${server_ext}.com/api`;

    return url;
}

function get_token(api_server, client_id, client_secret, username, code) {
    console.log(`DEBUG => (get_token): api_server = ${api_server}`);
    console.log(`DEBUG => (get_token): client_id = ${client_id}`);
    console.log(`DEBUG => (get_token): client_secret = ${client_secret}`);
    console.log(`DEBUG => (get_token): username = ${JSON.stringify(username)}`);
    console.log(`DEBUG => (get_token): code = ${JSON.stringify(code)}`);

    let p = new Promise((resolve, reject) => {
        const base_url = get_api_server_base_url(api_server, username);
        const url = `${base_url}/v1/grant`;
        const redirect_uri = 'http://localhost:3000/api/v1/oauth_handler/';

        const opts = {
            url: url,
            form: {
                grant_type: 'authorization_code',
                client_id: client_id,
                client_secret: client_secret,
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

module.exports.get_api_server_base_url = get_api_server_base_url;
module.exports.get_token = get_token;
