const express = require('express');
const router = express.Router();
const db = require('../server/db');

router.post('/get_startup_data', (req, res, next) => {
    let code, token_string, username, o;

    if (req.body.username) {
        username = req.body.username;

        code = db.read_code(username);

        token_string = db.read_token(username);

        if (code) {
            o = { code: code };
        } else if (token_string) {
            let timestamp = new Date().getTime();
            try {
                let token = JSON.parse(token_string);
                if (token.expire_time_ms && token.expire_time_ms > timestamp) {
                    o = { token: token };
                } else {
                    o = { message: 'Token is invalid (expired)' };
                }
            } catch (e) {
                o = { message: 'No token in storage' };
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

router.post('/delete_token', (req, res, next) => {
    let username,
        o = { status: 'fail' };

    if (req.body.username) {
        username = req.body.username;
        try {
            db.delete_token(username);
            o = { status: 'ok' };
        } catch (e) {
            o = { status: 'fail' };
        }
    } else {
        res.status(400);
        o = { status: 'fail', message: 'Invalid request' };
    }

    res.send(o);
});

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

router.get('/oauth_handler', (req, res, next) => {
    if (req.query.code && req.query.state) {
        let username = db.get_username_from_state(req.query.state);
        db.store_code(username, req.query.code);
    }

    res.redirect('/');
});

router.post('/exchange_code_for_token', (req, res, next) => {
    let o,
        body = req.body;

    if (body.api_server && body.username && body.client_id && body.client_secret && body.code) {
        const tsheets_api_server = body.api_server;
        const client_id = body.client_id;
        const client_secret = body.client_secret;
        const username = body.username;
        const code = body.code;

        o = { status: 'ok' };
    } else {
        res.status(400);
        o = { status: 'fail', message: 'Invalid request' };
    }

    res.send(o);
});

module.exports = router;
