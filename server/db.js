// const fs = require('fs');
const sqlite3 = require('better-sqlite3');
const db = new sqlite3('oauth_test.db');

const utils = require('./utils');
const constants = require('./constants');

const { PROP_TYPES } = constants;

const init = () => {
    try {
        const createConfigTable = db.prepare(
            `CREATE TABLE IF NOT EXISTS
             config(id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    base_url TEXT NOT NULL,
                    client_id TEXT NOT NULL,
                    client_secret TEXT NOT NULL
            )`
        );
        createConfigTable.run();

        const createConfigTableConfigNameIndex = db.prepare(`CREATE INDEX IF NOT EXISTS config_name_idx ON config (name)`);
        createConfigTableConfigNameIndex.run();


        const createConfigTableUrlIndex = db.prepare(`CREATE INDEX IF NOT EXISTS config_server_idx ON config (base_url)`);
        createConfigTableUrlIndex.run();

        const createPropsTable = db.prepare(
            `CREATE TABLE IF NOT EXISTS
             props(id INTEGER PRIMARY KEY AUTOINCREMENT,
                   type TEXT CHECK (type IN ('${PROP_TYPES.CODE}', '${PROP_TYPES.STATE}', '${PROP_TYPES.TOKEN}')) NOT NULL,
                   config_id INTEGER NOT NULL,
                   value TEXT NOT NULL
            )`
        );
        createPropsTable.run();

        const createStateTableStateIndex = db.prepare(`CREATE INDEX IF NOT EXISTS value_idx ON props (value)`);
        createStateTableStateIndex.run();

        delete_all_state();
    } catch (e) {
        console.log('ERROR: (init) Exception ' + JSON.stringify(e));
    }
};

/**
 * Gets the last config (by ID) if there are any configs.
 */
const get_first_config = () => {
    let config = null;
    try {
        const q = db.prepare(`SELECT * FROM config ORDER BY id DESC LIMIT 1`);
        const r = q.get();
        if (r) {
            config = r;
        }
    } catch (e) {
        console.error(`ERROR: (get_first_config) Exception: ${e}`);
    }
    return config;
};

/**
 * Lookup a config from the config name.
 * @param {string} config_name
 * @returns { Object}
 */
const get_config_from_config_name = (config_name) => {
    let result = null;
    try {
        const q = db.prepare(`SELECT * FROM config WHERE name = ?`);
        const r = q.get(config_name);
        if (r) {
            result = r;
        }
    } catch (e) {
        console.error(`ERROR: (get_config_from_config_name) Exception ${e}`);
    }
    return result;
};

/**
 * Utility function to look up a config ID from it's name
 * @param {string} config_name      The name of the config
 * @returns {integer|null}          The config ID if found, null otherwise.
 */
const get_config_id_from_config_name = (config_name) => {
    let result = null;
    const config = get_config_from_config_name(config_name);
    if (config && config.id) {
        result = config.id;
    }
    return result;
};

/**
 * Saves the code for the specified config.
 * @param {string} config_name
 * @param {string} code
 * @returns {integer|null}          Record ID or null
 */
const save_code = (config_name, code) => {
    delete_prop(config_name, 'code');
    return save_prop_by_config_name(config_name, 'code', code);
};

/**
 * Retrieves the code that was last stored for the given configuration, then deletes the code.
 * @param {string} config_name
 * @returns {string|null} the code that was previously stored for the given configuration
 */
const read_code = (config_name) => {
    let code = null;
    const prop = read_prop(config_name, 'code');
    if (prop && prop.value) {
        code = prop.value;
    }
    return code;
};

/**
 * Utility function to delete the code file associated with the given configuration.
 * @param {string} config_name
 * @returns {boolean}
 */
const delete_code = (config_name) => {
    return delete_prop(config_name, 'code');
};

/**
 * Stores a token for the given config_name. Ensures that the token is part of a container
 * object that includes meta data about the expiration date/time of the token.
 * @param {string} config_name
 * @param {string} token
 * @returns {integer|null}              Record ID or null
 */
const save_token = (config_name, token) => {
    let result = null;
    if (typeof token === 'string') {
        token = JSON.parse(token);
    }

    if (token.expire_time_ms) {
        // We already have the meta data around the token.
    } else {
        const timestamp = new Date().getTime();
        const expire_time_ms = timestamp + token.expires_in * 1000;
        const expiration = new Date(expire_time_ms).toString();
        token = { token: token, expire_time_ms: expire_time_ms, expiration: expiration };
    }

    const token_string = JSON.stringify(token);

    delete_prop(config_name, PROP_TYPES.TOKEN);

    const id = save_prop_by_config_name(config_name, PROP_TYPES.TOKEN, token_string);

    if (!id) {
        console.error('ERROR: (save_token) Failed to save the token');
    }

    return id;
};

/**
 * Retrieves the token (with associated meta data) for the given configuration
 * @param {string} config_name
 * @returns {object} token, including meta data
 */
const read_token = (config_name) => {
    let token = null;
    try {
        const prop = read_prop(config_name, PROP_TYPES.TOKEN);
        if (prop && prop.value) {
            token = JSON.parse(prop.value);
        }
    } catch (e) {
        console.error(`ERROR: (read_token) Exception ${e}`);
    }
    return token;
};

/**
 * Deletes a token (and meta data) for the given config name.
 * @param {string} config_name
 * @returns {boolean} true if the token was found and deleted, false otherwise.
 */
const delete_token = (config_name) => {
    let result = delete_prop(config_name, PROP_TYPES.TOKEN);
    return result;
};

/**
 * Utility function to look up a prop value
 * @param {string} config_name
 * @param {string} type
 * @returns The prop if found, null otherwise.
 */
const read_prop = (config_name, type) => {
    let result = null;
    try {
        let q = db.prepare(
            `SELECT value FROM props JOIN config ON config.id = props.config_id WHERE name = ? AND props.type = ?`
        );
        let r = q.all(config_name, type);
        if (Array.isArray(r)) {
            if (r.length > 0) {
                result = r[0];
            }
        } else if (r.length > 1) {
            console.error('ERROR: (read_prop) Too many rows of props returned');
        }
    } catch (e) {
        console.error(`ERROR: (read_prop) Exception ${e}`);
    }
    return result;
};

/**
 * Utility function to delete a prop given a config name and prop type
 * @param {string} config_name
 * @param {string} type
 * @returns {boolean}
 */
const delete_prop = (config_name, type) => {
    let result = false;
    try {
        // I should be able to do this with a single query using a join, but I haven't
        // gotten it working, so I'm using 2 queries. Lame, I know.
        const config_id = get_config_id_from_config_name(config_name);
        if (config_id) {
            const q = db.prepare(`DELETE FROM props WHERE type = ? AND config_id = ?`);
            const info = q.run(type, config_id);
            if (info && info.changes) {
                result = true;
            }
        } else {
            console.error(`ERROR: (delete_prop) Couldn't get the config ID`);
        }
    } catch (e) {
        console.error(`ERROR: (delete_prop) Exception: ${e}`);
    }
    return result;
};

/**
 * Store a prop in the DB by config name
 * @param {string} config_name      Name of the config
 * @param {string} type             Type of prop ('code', 'state', or PROP_TYPES.TOKEN)
 * @param {string} value            Prop to be stored.
 * @returns {integer|null}          Record ID or null
 */
const save_prop_by_config_name = (config_name, type, value) => {
    let result = null;
    const config_id = get_config_id_from_config_name(config_name);
    if (config_id) {
        result = save_prop_by_config_id(config_id, type, value);
    } else {
        console.error("ERROR: (save_prop_by_config_name) Didn't get response from GET or it failed");
    }
    return result;
};

/**
 * Store a prop in the DB by config ID
 * @param {integer} config_id       ID of the config
 * @param {string} type             Type of prop ('code', 'state', or PROP_TYPES.TOKEN)
 * @param {string} value            Prop to be stored.
 * @returns {integer|null}          Record ID or null
 */
const save_prop_by_config_id = (config_id, type, value) => {
    let result = null;
    if (typeof value !== 'string') {
        console.error(`ERROR: (save_prop_by_config_id) value is not a string!`);
        return result;
    }
    try {
        const q = db.prepare(`INSERT INTO props (config_id, type, value) VALUES (?, ?, ?)`);
        const info = q.run(config_id, type, value);
        if (info.changes && info.lastInsertRowid) {
            result = info.lastInsertRowid;
        } else {
            console.error("ERROR: (save_prop_by_config_id) Didn't get response from GET or it failed");
        }
    } catch (e) {
        console.error(`ERROR: (save_prop_by_config_id) Exception ${e}`);
    }
    return result;
};

/**
 * Saves the state value associated iwth the given configuration.
 * Later, when TSheets redirects to our redirect_uri, we will use the
 * state value that they return to use to lookup the user.
 * @param {string} config_name Name of the associated config
 * @param {string} state        State value to store
 * @returns {integer|null}      Record ID if successful, null if not
 */
const save_state = (config_name, state) => {
    delete_prop(config_name, 'state');
    return save_prop_by_config_name(config_name, 'state', state);
};

/**
 * Deletes all state objects for the given config
 * @param {string} config_name
 * @returns {boolean}
 */
const delete_state = (config_name) => {
    return delete_prop(config_name, PROP_TYPES.STATE);
};

/**
 * Looks up the config associated with the specified props value value.
 * @param {string} state
 * @returns {Object|null} config associated with the given props value, or null if not found.
 */
const get_config_from_prop_value = (type, value) => {
    let config = null;

    try {
        const q = db.prepare(
            `SELECT config.* FROM config JOIN props ON config.id = props.config_id WHERE props.type = ? AND props.value = ?`
        );
        const r = q.all(type, value);

        console.log('r = ' + JSON.stringify(r));

        if (Array.isArray(r)) {
            if (r.length > 0) {
                config = r[0];
            }
        } else if (r.length > 1) {
            console.error('Too many rows of config returned for props.value = ' + state);
        }
    } catch (e) {
        console.error(`ERROR: (get_config_from_prop_value) Exception ${e}`);
    }

    return config;
};

/**
 * Looks up the config associated with the specified state value, then deletes the state file.
 * @param {string} state
 * @returns {Object|null} config associated with the given state value, or null if not found.
 */
const get_config_from_state = (state) => {
    let r = get_config_from_prop_value('state', state);
    return r;
};

/**
 * Deletes all of the state files from the db. This is just a maintenance
 * function to ensure we don't end up with a bunch of orphaned state records.
 */
const delete_all_state = () => {
    console.log('Deleting all state records!');
    try {
        const q = db.prepare(`DELETE FROM props WHERE type = 'state'`);
        q.run();
    } catch (e) {
        console.error(`ERROR: (delete_all_state) Exception ${e}`);
    }
};

/**
 * Low level function to store a config in the DB.
 * @param {string} config_name
 * @param {string} base_url
 * @param {string} client_id
 * @param {string} client_secret
 * @param {string} id
 * @returns {integer|null}   record id if successful, null if not.
 */
const internal_save_config = (config_name, base_url, client_id, client_secret, id = null) => {
    let result = null;
    if (config_name && base_url && client_id && client_secret) {
        let config = read_config(config_name)
        try {
            let info;
            if (typeof id === 'string') {
                console.warn(`WARN: (internal_save_config) Type of id is string. Converting`);
                id = utils.force_int(id);
            }
            if (id !== null && id !== 0) {
                info = internal_update_config(id, config_name, base_url, client_id, client_secret);

                if (info.changes) {
                    result = id;
                }
            }
            else if (config && config.id) {
                info = internal_update_config(config.id, config_name, base_url, client_id, client_secret);

                if (info.changes) {
                    result = config.id;
                }
            } 
            else {
                q = db.prepare(
                    `INSERT INTO config (name, base_url, client_id, client_secret) VALUES (?, ?, ?, ?)`
                );
                info = q.run(config_name, base_url, client_id, client_secret);

                if (info.changes && info.lastInsertRowid) {
                    result = info.lastInsertRowid;
                }
            }
        } catch (e) {
            console.error('ERROR: (internal_save_config) Exception: ' + e);
        }
    } else {
        console.log('ERROR: (save_config) Invalid request, missing or empty parameters');
    }
    return result;
};

/**
 *
 * @param {Object} config
 */
const save_config = (config) => {
    if (config.name && config.base_url && config.client_id && config.client_secret) {
        const id = config.id ? config.id : null;
        return internal_save_config(
            config.name,
            config.base_url,
            config.client_id,
            config.client_secret
        );
    }
};

/**
 * Update a config record by id
 * @param {integer} id
 * @param {string} config_name
 * @param {string} base_url
 * @param {string} client_id
 * @param {string} client_secret
 * @returns {Object}                better-sqlite3 Info object
 */
const internal_update_config = (id, config_name, base_url, client_id, client_secret) => {
    try {
        const q = db.prepare(
            `UPDATE config SET name = ?, base_url = ?, client_id = ?, client_secret = ? WHERE id = ?`
        );
        const info = q.run(config_name, base_url, client_id, client_secret, id);
        console.log('info = ' + JSON.stringify(info));
        return info;
    } catch (e) {
        console.error(`ERROR: (internal_update_config) Exception: ${e}`);
    }
    return { changes: 0 };
};

/**
 * Read a config when given the config name
 * @param {string} config_name
 * @returns {Object|null}           The config if found, null otherwise
 */
const read_config = (config_name) => {
    let config = null;
    try {
        const q = db.prepare(`SELECT * FROM config WHERE name = ?`);
        const r = q.get(config_name);
        if (r && r.name === config_name) {
            config = r;
        }
    } catch (e) {
        console.error(`ERROR: (read_config) Exception ${e}`);
    }
    return config;
};

/**
 * Deletes a config from the database.
 * @param {string} config_name
 * @returns {boolean}
 */
const delete_config = (config_name) => {
    let result = false;
    try {
        const q = db.prepare(`DELETE FROM config WHERE name = ?`);
        const info = q.run(config_name);
        if (info && info.changes) {
            if (info.changes !== 1) {
                console.error(`ERROR: (delete_config) Deleted ${info.changes} rows (expected 1)`);
            }
            result = true;
        } else {
            console.error(`ERROR: (delete_config) Invalid response from q.run()`);
        }
    } catch (e) {
        console.error(`ERROR: (delete_config) Exception ${e}`);
    }
    return result;
};

/**
 * Gets a list of all stored configuration names.
 * @returns {Array}
 */
const get_config_list = () => {
    let config_list = [];

    try {
        const q = db.prepare(`SELECT name FROM config ORDER BY name ASC`);
        const r = q.all();
        console.log(`INFO: (get_config_list) r = ${JSON.stringify(r)}`);
        if (Array.isArray(r)) {
            config_list = r.map((e) => e.name);
        }
    } catch (e) {
        console.error(`ERROR: (get_config_list) Exception: ${e}`);
    }

    return config_list;
};

module.exports.init = init;
module.exports.save_code = save_code;
module.exports.read_code = read_code;
module.exports.delete_code = delete_code;

module.exports.save_token = save_token;
module.exports.read_token = read_token;
module.exports.delete_token = delete_token;

module.exports.save_state = save_state;
module.exports.delete_state = delete_state;
module.exports.get_config_from_state = get_config_from_state;
module.exports.delete_config = delete_config;

module.exports.get_first_config = get_first_config;
module.exports.get_config_from_config_name = get_config_from_config_name;
module.exports.save_config = save_config;
module.exports.read_config = read_config;
module.exports.get_config_list = get_config_list;
