const fs = require('fs');

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

const write_file = (path, data) => {
    fs.writeFileSync(path, data, { encoding: 'utf8', flag: 'w' });
};

function store_code(username, code) {
    const path = `${global.appRoot}/db/${username}.code`;
    write_file(path, code);
}

function read_code(username) {
    const path = `${global.appRoot}/db/${username}.code`;

    let data = read_file(path);

    if (data) {
        fs.unlinkSync(path); // We get one chance to use the code.
    }

    return data;
}

function delete_code(username) {
    let result = false;
    const path = `${global.appRoot}/db/${username}.code`;
    if (fs.existsSync(path)) {
        fs.unlinkSync(path);
        result = true;
    }

    return true;
}

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

function delete_token(username) {
    let result = false;
    const path = `${global.appRoot}/db/${username}.token`;
    if (fs.existsSync(path)) {
        fs.unlinkSync(path);
        result = true;
    }

    return result;
}

function save_state(username, state) {
    const path = `${global.appRoot}/db/${state}.state`;
    write_file(path, username);
}

function get_username_from_state(state) {
    const path = `${global.appRoot}/db/${state}.state`;
    let username = read_file(path);
    if (fs.existsSync(path)) {
        fs.unlinkSync(path); // One shot.
    }

    return username;
}

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

function delete_all_state() {
    let state_files = get_state_files();
    state_files.map(f => {
        const path = `${global.appRoot}/db/${f}`;
        fs.unlinkSync(path);
    });
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
