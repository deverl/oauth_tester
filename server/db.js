const path = require('path');
const Database = require('better-sqlite3');

const utils = require('./utils');
const { PROP_TYPES } = require('../constants/constants');

const DB_PATH = path.join(__dirname, '..', 'oauth_test.db');

/** @type {import('better-sqlite3').Database | null} */
let db = null;

const CONFIG_TABLE_SQL = `CREATE TABLE IF NOT EXISTS
     config(id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            authorize_url TEXT NOT NULL,
            token_url TEXT NOT NULL,
            client_id TEXT NOT NULL,
            client_secret TEXT NOT NULL,
            scope TEXT NOT NULL DEFAULT ''
    )`;

const PROPS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS
     props(id INTEGER PRIMARY KEY AUTOINCREMENT,
           type TEXT CHECK (type IN ('${PROP_TYPES.CODE}', '${PROP_TYPES.STATE}', '${PROP_TYPES.TOKEN}', '${PROP_TYPES.VERIFIER}')) NOT NULL,
           config_id INTEGER NOT NULL,
           value TEXT NOT NULL
    )`;

/**
 * Returns the open database connection.
 * @returns {import('better-sqlite3').Database}
 */
const get_db = () => {
    if (!db) {
        throw new Error('Database has not been initialized; call init() first');
    }
    return db;
};

/**
 * Migrates databases created by older versions of this app.
 * - The config table used to store a single provider `base_url` from which the
 *   authorization and token endpoints were derived. The endpoints are now stored
 *   explicitly (authorize_url, token_url) so any OAuth provider can be used.
 * - The props table used to only allow 'code', 'state', and 'token' types; it now
 *   also allows 'verifier' (PKCE code verifier).
 */
const migrate_legacy_schema = () => {
    const database = get_db();
    const config_table = database
        .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'config'`)
        .get();

    if (config_table && config_table.sql.includes('base_url')) {
        console.log('INFO: (migrate_legacy_schema) Migrating legacy config table');
        database.exec(`
            ALTER TABLE config RENAME TO config_legacy;
            ${CONFIG_TABLE_SQL};
            INSERT INTO config (id, name, authorize_url, token_url, client_id, client_secret)
                SELECT id,
                       name,
                       base_url || '/api/v1/authorize',
                       base_url || '/api/v1/grant',
                       client_id,
                       client_secret
                FROM config_legacy;
            DROP TABLE config_legacy;
        `);
    }

    const props_table = database
        .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'props'`)
        .get();

    if (props_table && !props_table.sql.includes(PROP_TYPES.VERIFIER)) {
        console.log('INFO: (migrate_legacy_schema) Migrating legacy props table');
        database.exec(`
            ALTER TABLE props RENAME TO props_legacy;
            ${PROPS_TABLE_SQL};
            INSERT INTO props (id, type, config_id, value)
                SELECT id, type, config_id, value FROM props_legacy;
            DROP TABLE props_legacy;
        `);
    }
};

const init = () => {
    try {
        if (!db) {
            db = new Database(DB_PATH);
        }

        migrate_legacy_schema();

        const database = get_db();
        database.prepare(CONFIG_TABLE_SQL).run();
        database.prepare(`CREATE INDEX IF NOT EXISTS config_name_idx ON config (name)`).run();

        database.prepare(PROPS_TABLE_SQL).run();
        database.prepare(`CREATE INDEX IF NOT EXISTS value_idx ON props (value)`).run();

        // Transient per-flow values are meaningless across restarts.
        delete_all_of_type(PROP_TYPES.STATE);
        delete_all_of_type(PROP_TYPES.VERIFIER);
    } catch (e) {
        console.error(`ERROR: (init) Exception: ${e}`);
        throw e;
    }
};

/**
 * Gets the most recently created config, if there are any configs.
 */
const get_first_config = () => {
    let config = null;
    try {
        const q = get_db().prepare(`SELECT * FROM config ORDER BY id DESC LIMIT 1`);
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
 * Utility function to look up a config ID from its name
 * @param {string} config_name      The name of the config
 * @returns {number|null}           The config ID if found, null otherwise.
 */
const get_config_id_from_config_name = (config_name) => {
    const config = read_config(config_name);
    if (config && config.id) {
        return config.id;
    }
    return null;
};

/**
 * Saves the authorization code for the specified config.
 * @param {string} config_name
 * @param {string} code
 * @returns {number|null}          Record ID or null
 */
const save_code = (config_name, code) => {
    delete_prop(config_name, PROP_TYPES.CODE);
    return save_prop_by_config_name(config_name, PROP_TYPES.CODE, code);
};

/**
 * Retrieves the authorization code that was last stored for the given configuration.
 * @param {string} config_name
 * @returns {string|null} the code that was previously stored for the given configuration
 */
const read_code = (config_name) => {
    let code = null;
    const prop = read_prop(config_name, PROP_TYPES.CODE);
    if (prop && prop.value) {
        code = prop.value;
    }
    return code;
};

/**
 * Deletes the authorization code associated with the given configuration.
 * @param {string} config_name
 * @returns {boolean}
 */
const delete_code = (config_name) => {
    return delete_prop(config_name, PROP_TYPES.CODE);
};

/**
 * Stores a token for the given config_name. Ensures that the token is part of a container
 * object that includes meta data about the expiration date/time of the token.
 * @param {string} config_name
 * @param {Object|string} token
 * @returns {number|null}              Record ID or null
 */
const save_token = (config_name, token) => {
    if (typeof token === 'string') {
        try {
            token = JSON.parse(token);
        } catch (e) {
            console.error(`ERROR: (save_token) Token is not valid JSON: ${e}`);
            return null;
        }
    }

    if (!token.expire_time_ms) {
        if (typeof token.expires_in !== 'number' || !Number.isFinite(token.expires_in)) {
            console.error('ERROR: (save_token) Missing or invalid expires_in');
            return null;
        }
        const timestamp = Date.now();
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
 * @returns {Object|null} token, including meta data
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
    return delete_prop(config_name, PROP_TYPES.TOKEN);
};

/**
 * Saves the PKCE code verifier associated with the given configuration.
 * @param {string} config_name
 * @param {string} verifier
 * @returns {number|null}      Record ID or null
 */
const save_verifier = (config_name, verifier) => {
    delete_prop(config_name, PROP_TYPES.VERIFIER);
    return save_prop_by_config_name(config_name, PROP_TYPES.VERIFIER, verifier);
};

/**
 * Retrieves the PKCE code verifier for the given configuration.
 * @param {string} config_name
 * @returns {string|null}
 */
const read_verifier = (config_name) => {
    let verifier = null;
    const prop = read_prop(config_name, PROP_TYPES.VERIFIER);
    if (prop && prop.value) {
        verifier = prop.value;
    }
    return verifier;
};

/**
 * Deletes the PKCE code verifier for the given configuration.
 * @param {string} config_name
 * @returns {boolean}
 */
const delete_verifier = (config_name) => {
    return delete_prop(config_name, PROP_TYPES.VERIFIER);
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
        const q = get_db().prepare(
            `SELECT value FROM props JOIN config ON config.id = props.config_id WHERE name = ? AND props.type = ?`
        );
        const r = q.all(config_name, type);
        if (Array.isArray(r) && r.length > 0) {
            if (r.length > 1) {
                console.error('ERROR: (read_prop) Too many rows of props returned');
            }
            result = r[0];
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
        const config_id = get_config_id_from_config_name(config_name);
        if (config_id) {
            const q = get_db().prepare(`DELETE FROM props WHERE type = ? AND config_id = ?`);
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
 * @param {string} type             Type of prop (one of PROP_TYPES)
 * @param {string} value            Prop to be stored.
 * @returns {number|null}          Record ID or null
 */
const save_prop_by_config_name = (config_name, type, value) => {
    let result = null;
    const config_id = get_config_id_from_config_name(config_name);
    if (config_id) {
        result = save_prop_by_config_id(config_id, type, value);
    } else {
        console.error(`ERROR: (save_prop_by_config_name) No config found named '${config_name}'`);
    }
    return result;
};

/**
 * Store a prop in the DB by config ID
 * @param {number} config_id       ID of the config
 * @param {string} type             Type of prop (one of PROP_TYPES)
 * @param {string} value            Prop to be stored.
 * @returns {number|null}          Record ID or null
 */
const save_prop_by_config_id = (config_id, type, value) => {
    let result = null;
    if (typeof value !== 'string') {
        console.error(`ERROR: (save_prop_by_config_id) value is not a string!`);
        return result;
    }
    try {
        const q = get_db().prepare(`INSERT INTO props (config_id, type, value) VALUES (?, ?, ?)`);
        const info = q.run(config_id, type, value);
        if (info.changes && info.lastInsertRowid) {
            result = info.lastInsertRowid;
        } else {
            console.error(`ERROR: (save_prop_by_config_id) Insert failed`);
        }
    } catch (e) {
        console.error(`ERROR: (save_prop_by_config_id) Exception ${e}`);
    }
    return result;
};

/**
 * Saves the state value associated with the given configuration.
 * Later, when the authorization server redirects to our redirect_uri, we will
 * use the state value that they return to look up the configuration.
 * @param {string} config_name Name of the associated config
 * @param {string} state        State value to store
 * @returns {number|null}      Record ID if successful, null if not
 */
const save_state = (config_name, state) => {
    delete_prop(config_name, PROP_TYPES.STATE);
    return save_prop_by_config_name(config_name, PROP_TYPES.STATE, state);
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
 * Looks up the config associated with the specified prop type and value.
 * @param {string} type
 * @param {string} value
 * @returns {Object|null} config associated with the given prop value, or null if not found.
 */
const get_config_from_prop_value = (type, value) => {
    let config = null;

    try {
        const q = get_db().prepare(
            `SELECT config.* FROM config JOIN props ON config.id = props.config_id WHERE props.type = ? AND props.value = ?`
        );
        const r = q.all(type, value);

        if (Array.isArray(r) && r.length > 0) {
            if (r.length > 1) {
                console.error(`ERROR: (get_config_from_prop_value) Too many rows returned for props.value = ${value}`);
            }
            config = r[0];
        }
    } catch (e) {
        console.error(`ERROR: (get_config_from_prop_value) Exception ${e}`);
    }

    return config;
};

/**
 * Looks up the config associated with the specified state value.
 * @param {string} state
 * @returns {Object|null} config associated with the given state value, or null if not found.
 */
const get_config_from_state = (state) => {
    return get_config_from_prop_value(PROP_TYPES.STATE, state);
};

/**
 * Deletes all props of the given type from the db. This is just a maintenance
 * function to ensure we don't end up with a bunch of orphaned records.
 * @param {string} type One of PROP_TYPES
 */
const delete_all_of_type = (type) => {
    try {
        const q = get_db().prepare(`DELETE FROM props WHERE type = ?`);
        q.run(type);
    } catch (e) {
        console.error(`ERROR: (delete_all_of_type) Exception ${e}`);
    }
};

/**
 * Stores a config in the DB. Inserts a new record, or updates an existing one
 * (matched by id if given, otherwise by name).
 * @param {Object} config
 * @returns {number|null}   record id if successful, null if not.
 */
const save_config = (config) => {
    const { name, authorize_url, token_url, client_id } = config;
    // Empty string is valid for public clients (PKCE only, no client secret).
    const client_secret = config.client_secret || '';
    const scope = config.scope || '';

    if (!(name && authorize_url && token_url && client_id)) {
        console.error('ERROR: (save_config) Invalid request, missing or empty parameters');
        return null;
    }

    let id = utils.force_int(config.id) || null;

    if (!id) {
        const existing = read_config(name);
        if (existing && existing.id) {
            id = existing.id;
        }
    }

    try {
        if (id) {
            const q = get_db().prepare(
                `UPDATE config SET name = ?, authorize_url = ?, token_url = ?, client_id = ?, client_secret = ?, scope = ? WHERE id = ?`
            );
            const info = q.run(name, authorize_url, token_url, client_id, client_secret, scope, id);
            return info.changes ? id : null;
        }

        const q = get_db().prepare(
            `INSERT INTO config (name, authorize_url, token_url, client_id, client_secret, scope) VALUES (?, ?, ?, ?, ?, ?)`
        );
        const info = q.run(name, authorize_url, token_url, client_id, client_secret, scope);
        return info.lastInsertRowid || null;
    } catch (e) {
        console.error(`ERROR: (save_config) Exception: ${e}`);
    }

    return null;
};

/**
 * Read a config when given the config name
 * @param {string} config_name
 * @returns {Object|null}           The config if found, null otherwise
 */
const read_config = (config_name) => {
    let config = null;
    try {
        const q = get_db().prepare(`SELECT * FROM config WHERE name = ?`);
        const r = q.get(config_name);
        if (r) {
            config = r;
        }
    } catch (e) {
        console.error(`ERROR: (read_config) Exception ${e}`);
    }
    return config;
};

/**
 * Alias for read_config (kept for existing call sites).
 * @param {string} config_name
 * @returns {Object|null}
 */
const get_config_from_config_name = (config_name) => read_config(config_name);

/**
 * Deletes a config from the database.
 * @param {string} config_name
 * @returns {boolean}
 */
const delete_config = (config_name) => {
    let result = false;
    try {
        const q = get_db().prepare(`DELETE FROM config WHERE name = ?`);
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
        const q = get_db().prepare(`SELECT name FROM config ORDER BY name ASC`);
        const r = q.all();
        if (Array.isArray(r)) {
            config_list = r.map((e) => e.name);
        }
    } catch (e) {
        console.error(`ERROR: (get_config_list) Exception: ${e}`);
    }

    return config_list;
};

module.exports = {
    init,
    save_code,
    read_code,
    delete_code,
    save_token,
    read_token,
    delete_token,
    save_verifier,
    read_verifier,
    delete_verifier,
    save_state,
    delete_state,
    get_config_from_state,
    delete_config,
    get_first_config,
    get_config_from_config_name,
    save_config,
    read_config,
    get_config_list,
};
