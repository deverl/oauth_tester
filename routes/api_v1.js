const express = require('express');
const router = express.Router();
const db = require('../server/db');
const ts = require('../server/qbt');
const constants = require('../constants/constants');

/**
 * Handler for the get_startup_data end point.
 */
router.post('/get_startup_data', (req, res, next) => {
    let code,
        token,
        config,
        username,
        o = {};

    if (req.body.username) {
        username = req.body.username;

        code = db.read_code(username);
        token = db.read_token(username);
        config = db.read_config(username);

        if (config) {
            o.config = config;
        }

        o.port = constants.HTTP_PORT;

        if (code) {
            o.code = code;
        } else if (token) {
            let timestamp = new Date().getTime();
            if (token.expire_time_ms && token.expire_time_ms > timestamp) {
                o.token = token;
            } else {
                o.message = 'Token is invalid (expired)';
            }
        } else {
            o.message = 'No token in storage';
        }
    } else {
        res.status(400);
        o.message = 'Invalid request';
    }

    res.send(o);
});

/**
 * Handler for the save_config end point.
 */
router.post('/save_config', (req, res, next) => {
    let o,
        body = req.body;

    if (body.username && body.client_id && body.client_secret && body.api_server) {
        db.save_config(body.username, body.client_id, body.client_secret, body.api_server);
        o = { status: 'ok' };
    } else {
        res.status(400);
        o = { status: 'fail', message: 'Invalid request' };
    }

    res.send(o);
});

/**
 * Handler for the read_config end point.
 */
router.post('/read_config', (req, res, next) => {
    let o,
        body = req.body;

    if (body.username) {
        const config = db.read_config(body.username);
        if (config) {
            o = { status: 'ok', config: config };
        } else {
            o = { status: 'fail', message: 'No config found' };
        }
    } else {
        res.status(400);
        o = { status: 'fail', message: 'Invalid request' };
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

    if (body.username && body.state) {
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

    if (body.username && body.code) {
        const username = body.username;
        const code = body.code;

        ts.get_token(username, code)
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

    if (body.username) {
        const username = body.username;

        ts.refresh_token(username)
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
