const express = require('express');
const router = express.Router();
const db = require('../server/db');
const ts = require('../server/ts');

/**
 * Handler for the get_startup_data end point.
 */
router.post('/get_startup_data', (req, res, next) => {
    let code, token, token_string, username, o;

    if (req.body.username) {
        username = req.body.username;

        code = db.read_code(username);

        token = db.read_token(username);

        if (code) {
            o = { code: code };
        } else if (token) {
            let timestamp = new Date().getTime();
            if (token.expire_time_ms && token.expire_time_ms > timestamp) {
                o = { token: token };
            } else {
                o = { message: 'Token is invalid (expired)' };
            }
        } else {
            o = { message: 'No token in storage' };
        }
    } else {
        res.status(400);
        o = 'Invalid request';
    }

    res.send(o);
});

/**
 * Handler for the delete_token end point.
 */
router.post('/delete_token', (req, res, next) => {
    let username,
        o = { status: 'fail' };

    if (req.body.username) {
        username = req.body.username;
        try {
            db.delete_token(username);
            o = { status: 'ok', message: 'No token in storage' };
        } catch (e) {
            o = { status: 'fail' };
        }
    } else {
        res.status(400);
        o = { status: 'fail', message: 'Invalid request' };
    }

    res.send(o);
});

/**
 * Handler for the save_state_data end point.
 */
router.post('/save_state_data', (req, res, next) => {
    let o,
        body = req.body;

    if (body.username && body.client_id && body.client_secret && body.state) {
        db.save_state(body.username, body.state);
        o = { status: 'ok' };
    } else {
        res.status(400);
        o = { status: 'fail', message: 'Invalid request' };
    }

    res.send(o);
});

/**
 * Handler for the oauth_handler end point.
 */
router.get('/oauth_handler', (req, res, next) => {
    if (req.query.code && req.query.state) {
        let username = db.get_username_from_state(req.query.state);
        if (username) {
            db.store_code(username, req.query.code);
        } else {
            console.log(`ERROR => (oauth_handler) no username retrieved for code. query = ${req.query}`);
        }
    }

    res.redirect('/');
});

/**
 * Handler for the exchange_code_for_token end point.
 */
router.post('/exchange_code_for_token', (req, res, next) => {
    let o,
        body = req.body;

    if (body.api_server && body.username && body.client_id && body.client_secret && body.code) {
        const tsheets_api_server = body.api_server;
        const client_id = body.client_id;
        const client_secret = body.client_secret;
        const username = body.username;
        const code = body.code;

        ts.get_token(tsheets_api_server, client_id, client_secret, username, code)
            .then(token => {
                o = { status: 'ok', token: token };
                res.send(o);
            })
            .catch(err => {
                res.status(400);
                o = { status: 'fail', message: 'API failure' };
            });
    } else {
        res.status(400);
        o = { status: 'fail', message: 'Invalid request' };
        res.send(o);
    }
});

/**
 * Handler for the refresh_token end point.
 */
router.post('/refresh_token', (req, res, next) => {
    let o,
        body = req.body;

    if (body.api_server && body.username && body.client_id && body.client_secret) {
        const tsheets_api_server = body.api_server;
        const client_id = body.client_id;
        const client_secret = body.client_secret;
        const username = body.username;
        const code = body.code;

        ts.refresh_token(tsheets_api_server, client_id, client_secret, username)
            .then(token => {
                o = { status: 'ok', token: token };
                res.send(o);
            })
            .catch(err => {
                res.status(400);
                o = { status: 'fail', message: 'API failure' };
            });
    } else {
        res.status(400);
        o = { status: 'fail', message: 'Invalid request' };
        res.send(o);
    }
});

module.exports = router;
