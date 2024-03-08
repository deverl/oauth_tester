const express = require('express');
const router = express.Router();
const db = require('../server/db');
const ts = require('../server/qbt');
const utils = require('../server/utils');
const constants = require('../constants/constants');

/**
 * Handler for the get_startup_data end point.
 */
router.post('/get_startup_data', (req, res, next) => {
    let code, token, config_name, o;

    if (req.body.config_name) {
        config_name = req.body.config_name;
    } else {
        config_name = null;
    }

    o = load_startup_data(config_name);

    if (!o.code && o.token) {
        let timestamp = new Date().getTime();
        if (o.token.expire_time_ms && o.token.expire_time_ms > timestamp) {
            console.info(`Token for ${config_name} is still good`);
        } else {
            delete o.token;
            db.delete_token(config_name);
            o.message = 'Token is invalid (expired)';
        }
    } else {
        o.message = 'No token in storage';
    }

    res.send(o);
});

/**
 * Handler for the save_config end point.
 */
router.post('/save_config', (req, res, next) => {
    let o,
        body = req.body;

    if (body.name && body.base_url && body.client_id && body.client_secret) {
        if (!body.base_url.startsWith("http://") && !body.base_url.startsWith("https://")) {
            body.base_url = "https://" + body.base_url;
        }
        body.id = utils.force_int(body.id);
        const id = db.save_config(body);
        if (id) {
            o = load_startup_data(body.name);
            o.status = 'ok';
        } else {
            o = { status: 'fail', message: 'DB failure' };
        }
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

    if (body.config_name) {
        const config = db.read_config(body.config_name);
        if (config) {
            o = load_startup_data(body.config_name);
            o.status = 'ok';
        } else {
            o = { status: 'fail', message: 'No config found' };
        }
    } else {
        res.status(400);
        o = { status: 'fail', message: 'Invalid request' };
    }

    res.send(o);
});

router.post('/delete_config', (req, res, next) => {
    let o,
        body = req.body;

    if (body.config_name) {
        const config_name = body.config_name;
        const config = db.read_config(body.config_name);
        if (config) {
            db.delete_code(config_name);
            db.delete_state(config_name);
            db.delete_token(config_name);
            db.delete_config(config_name);
            o = load_startup_data();
            o.status = 'ok';
        } else {
            o = { status: 'fail', message: `Config '${config_name} not found` };
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
    let config_name,
        body = req.body,
        o = { status: 'fail' };

    if (body.config_name) {
        config_name = body.config_name;
        try {
            db.delete_token(config_name);
            o = load_startup_data(config_name);
            o.status = 'ok';
            o.message = 'No token in storage';
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

    if (body.config_name && body.state) {
        const id = db.save_state(body.config_name, body.state);
        if (id) {
            o = load_startup_data(body.config_name);
            o.status = 'ok';
        } else {
            o = { status: 'fail', message: 'DB Failure' };
        }
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
        const config = db.get_config_from_state(req.query.state);
        if (config && config.name) {
            db.delete_state(config.name);
            db.save_code(config.name, req.query.code);
        } else {
            console.log(`ERROR: (oauth_handler) no config retrieved for code. query = ${req.query}`);
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

    if (body.config_name && body.code) {
        const config_name = body.config_name;
        const code = body.code;

        db.delete_code(config_name);

        const config = db.get_config_from_config_name(config_name);

        if (config) {
            ts.get_token(config, code)
                .then((token) => {
                    o = load_startup_data(config_name);
                    o.status = 'ok';
                    res.send(o);
                })
                .catch((err) => {
                    res.status(400);
                    o = { status: 'fail', message: `API failure: ${err}` };
                    db.delete_code(config.name);
                    res.send(o);
                });
        } else {
            res.status(400);
            o = { status: 'fail', message: 'Invalid request' };
            res.send(o);
        }
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

    if (body.config_name) {
        const config_name = body.config_name;

        const config = db.get_config_from_config_name(config_name);

        ts.refresh_token(config)
            .then((token) => {
                o = load_startup_data(config_name);
                o.status = 'ok';
                res.send(o);
            })
            .catch((err) => {
                res.status(400);
                o = { status: 'fail', message: `API failure: ${err}` };
                res.send(o);
            });
    } else {
        res.status(400);
        o = { status: 'fail', message: 'Invalid request' };
        res.send(o);
    }
});

/**
 * Helper to load all of the known configuration data into an object.
 * @param {string|null} config_name
 * @returns {Object}
 */
const load_startup_data = (config_name = null) => {
    let data = {};

    const config_list = db.get_config_list();

    if (Array.isArray(config_list) && config_list.length) {
        data.config_list = config_list;
    }

    data.port = constants.HTTP_PORT;

    if (!config_name) {
        const first_config = db.get_first_config();
        if (first_config && first_config.name) {
            config_name = first_config.name;
        }
    }

    if (config_name) {
        const code = db.read_code(config_name);

        if (code) {
            data.code = code;
        }

        const token = db.read_token(config_name);

        if (token) {
            data.token = token;
        }

        const config = db.read_config(config_name);

        if (config) {
            data.config = config;
        }
    }

    return data;
};

module.exports = router;
