const fs = require('fs');

/**
 * Utility function that reads the contents of a file and returns it as a utf-8 string.
 * @param {string} path
 * @returns {string} the contents of the file.
 */
const read_file = path => {
    let data = null;
    if (fs.existsSync(path)) {
        data = fs.readFileSync(path);

        if (data) {
            data = data.toString('utf8');
        }
    }

    return data;
};

/**
 * Utility function to write a string or object to a file.
 * @param {string} path
 * @param {string|object} data
 */
const write_file = (path, data) => {
    fs.writeFileSync(path, data, { encoding: 'utf8', flag: 'w' });
};

/**
 * Saves the code for the specified user.
 * @param {string} username
 * @param {string} code
 */
function store_code(username, code) {
    const path = `${global.appRoot}/db/${username}.code`;
    write_file(path, code);
}

/**
 * Retrieves the code that was last stored for the given username, then deletes the code.
 * @param {string} username
 * @returns {string} the code that was previously stored for the given user
 */
function read_code(username) {
    const path = `${global.appRoot}/db/${username}.code`;

    let data = read_file(path);

    if (data) {
        fs.unlinkSync(path); // We get one chance to use the code.
    }

    return data;
}

/**
 * Utility function to delete the code file associated with the given username.
 * @param {string} username
 */
function delete_code(username) {
    let result = false;
    const path = `${global.appRoot}/db/${username}.code`;
    if (fs.existsSync(path)) {
        fs.unlinkSync(path);
        result = true;
    }

    return true;
}

/**
 * Stores a token for the given username. Ensures that the token is part of a container
 * object that includes meta data about the expiration date/time of the token.
 * @param {string} username
 * @param {string} token
 */
function store_token(username, token) {
    const path = `${global.appRoot}/db/${username}.token`;

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

    token = JSON.stringify(token, null, 4);

    write_file(path, token);
}

/**
 * Retrieves the token (with associated meta data) for the given username
 * @param {string} username
 * @returns {object} token, including meta data
 */
function read_token(username) {
    let token = null;

    const path = `${global.appRoot}/db/${username}.token`;

    const s = read_file(path);

    if (s) {
        try {
            token = JSON.parse(s);
        } catch (e) {
            console.log(`ERROR => Couldn't parse string '${s}'!`);
        }
    }

    return token;
}

/**
 * Deletes a token (and meta data) for the given username.
 * @param {string} username
 * @returns {boolean} true if the token was found and deleted, false otherwise.
 */
function delete_token(username) {
    let result = false;
    const path = `${global.appRoot}/db/${username}.token`;
    if (fs.existsSync(path)) {
        fs.unlinkSync(path);
        result = true;
    }

    return result;
}

/**
 * Saves the state value associated iwth the given username.
 * Later, when TSheets redirects to our redirect_uri, we will use the
 * state value that they return to use to lookup the user.
 * @param {string} username
 * @param {string} state
 */
function save_state(username, state) {
    const path = `${global.appRoot}/db/${state}.state`;
    write_file(path, username);
}

/**
 * Looks up the username associated with the specified state value, then deletes the state file.
 * @param {string} state
 * @returns {string|null} username associated with the given state value, or null if not found.
 */
function get_username_from_state(state) {
    const path = `${global.appRoot}/db/${state}.state`;
    let username = read_file(path);
    if (fs.existsSync(path)) {
        fs.unlinkSync(path); // One shot.
    }

    return username;
}

/**
 * Utility function to fetch a list of all of the state files in our storage.
 * @returns {Array} The names of all of the state files in storage.
 */
const get_state_files = () => {
    let state_files = [],
        files;
    const path = `${global.appRoot}/db/`;
    files = fs.readdirSync(path);
    state_files = files.filter(f => {
        return f.endsWith('.state');
    });
    return state_files;
};

/**
 * Deletes all of the state files from storage. This is just a maintenance
 * function to ensure we don't end up with a bunch of orphaned state files.
 */
function delete_all_state() {
    let state_files = get_state_files();
    state_files.map(f => {
        const path = `${global.appRoot}/db/${f}`;
        fs.unlinkSync(path);
    });
}

function save_config(username, client_id, client_secret, api_server) {
    if (username && client_id && client_secret && api_server) {
        const path = `${global.appRoot}/db/${username}.config`;
        const config = {
            username: username,
            client_id: client_id,
            client_secret: client_secret,
            api_server: api_server
        };
        const data = JSON.stringify(config, null, 4);
        write_file(path, data);
    } else {
        console.log('ERROR => (save_config) Invalid request, missing or empty parameters');
    }
}

function read_config(username) {
    let config = null;
    if (username) {
        const path = `${global.appRoot}/db/${username}.config`;
        const config_string = read_file(path);
        try {
            config = JSON.parse(config_string);
        } catch (e) {
            console.log('ERROR => (read_config) Failed to read file!', e);
        }
    } else {
        console.log('ERROR => (read_config) Invalid request, missing or empty parameters');
    }

    return config;
}

module.exports.store_code = store_code;
module.exports.read_code = read_code;
module.exports.delete_code = delete_code;

module.exports.store_token = store_token;
module.exports.read_token = read_token;
module.exports.delete_token = delete_token;

module.exports.save_state = save_state;
module.exports.get_username_from_state = get_username_from_state;
module.exports.delete_all_state = delete_all_state;

module.exports.save_config = save_config;
module.exports.read_config = read_config;
