const util = Utility();

const username_cookie_name = 'username';
const client_id_cookie_name = 'client_id';
const client_secret_cookie_name = 'client_secret';
const api_server_cookie_name = 'api_server';

const api_base_url = '/api';

let config = {
    username: null,
    client_id: null,
    client_secret: null,
    api_server: null
};

let ui = {
    response_area: null,
    login_button: null,
    refresh_token_button: null,
    request_token_button: null,
    delete_token_button: null,
    overlay: null,
    busy_overlay: null
};

$(document).ready(() => {
    ui.login_button = $('#login_to_tsheets');
    ui.response_area = $('#response_body');
    ui.refresh_token_button = $('#refresh_token_button');
    ui.request_token_button = $('#request_token');
    ui.delete_token_button = $('#delete_token_button');
    ui.setup_button = $('#setup_button');

    ui.overlay = $('#overlay');
    ui.busy_overlay = $('#busy_overlay');
    ui.dialog = $('#form_container');

    ui.form = {};
    ui.form.close_x = $('div.inner-container div.dialog-close-x');
    ui.form.username = $('#username_input');
    ui.form.client_id = $('#client_id_input');
    ui.form.client_secret = $('#client_secret_input');
    // ui.form.cancel = $("#form_cancel_button");
    // ui.form.submit = $('#form_submit_button');

    ui.login_button.click(handle_login_button);
    ui.refresh_token_button.click(handle_refresh_button);
    ui.request_token_button.click(handle_request_token);
    ui.delete_token_button.click(handle_delete_token);

    $('form#oauth_config_form').on('submit', evt => {
        evt.stopPropagation();
        evt.preventDefault();
        handle_form_submit(evt);
    });

    ui.form.close_x.click(evt => {
        ui.dialog.hide();
        ui.overlay.hide();
    });

    ui.setup_button.click(handle_setup);

    configure_app();
});

/**
 * Puts up the overlay and the busy spinner.
 */
function show_busy() {
    ui.overlay.show();
    ui.busy_overlay.show();
}

/**
 * Removes the overlay and the busy spinner.
 */
function hide_busy() {
    ui.overlay.hide();
    ui.busy_overlay.hide();
}

/**
 * Hides the action buttons, and conditionally hides the login button.
 * @param {boolean} hide_all if true, hides all of the action buttons, including the login buttons.
 */
function hide_action_buttons(hide_all = false) {
    if (hide_all) {
        ui.login_button.hide();
    }
    ui.refresh_token_button.hide();
    ui.request_token_button.hide();
    ui.delete_token_button.hide();
}

/**
 * Puts a string in the response area.
 * @param {string|object} s -- the string, or object, to display
 */
function set_response_area(s) {
    if (typeof s === 'object') {
        s = JSON.stringify(s, null, 4);
    }
    ui.response_area.text(s);
}

/**
 * Sets the response area to an empty string, effectively clearing it.
 */
function clear_response_area() {
    set_response_area('');
}

/**
 * Utility function to create the API url to be used with TSheets for
 * the current username and server name.
 * @returns {string} The base API URL to use with TSheets.
 */
function get_base_api_url() {
    let server_type;

    if (config.api_server === 'shazdev') {
        server_type = '';
    } else {
        server_type = '-dev';
    }

    const url = `https://${config.username}.tsheets${server_type}.com/api`;

    console.log(`DEUBG => base_api_url = ${url}`);

    return url;
}

/**
 * Handler for the login button.
 * @param {Event} evt
 */
function handle_login_button(evt) {
    console.log('INFO => in handle_login_button');
    hide_action_buttons();
    clear_response_area();
    show_busy();

    const state = util.create_state();

    const url = `${api_base_url}/v1/save_state_data`;

    const opts = {
        method: 'POST',
        data: {
            username: config.username,
            state: state
        },
        dataType: 'json'
    };

    $.ajax(url, opts)
        .then((data, textStatus, jqXHR) => {
            console.log(`INFO => save_state_data success. data: `, data);
            const base_api_url = get_base_api_url();
            if ('status' in data && data.status === 'ok') {
                const redirect_uri = `http://localhost:3000/api/v1/oauth_handler/`;
                const query_string = `client_id=${config.client_id}&state=${state}&redirect_uri=${redirect_uri}`;
                const url = `${base_api_url}/v1/authorize?response_type=code&${query_string}`;
                console.log(`DEBUG => redirect url: ${url}`);
                hide_busy();
                window.location.assign(url);
            } else {
                let error = data.message ? data.message : 'unknown error';
                set_response_area(`Couldn't save state! err = ${error}`);
            }
        })
        .fail((jqXHR, textStatus, errorThrown) => {
            set_response_area("Couldn't save state!");
        });
}

function handle_refresh_button(evt) {
    console.log('INFO => in handle_refresh_button');
    clear_response_area();
    hide_action_buttons();
    show_busy();

    const url = `${api_base_url}/v1/refresh_token`;

    const opts = {
        method: 'POST',
        data: {
            username: config.username
        },
        dataType: 'json'
    };

    $.ajax(url, opts)
        .then((data, textStatus, jqXHR) => {
            hide_busy();
            console.log('INFO => refresh_token success');
            if (data.token) {
                let s = '';

                if (typeof data.token === 'string') {
                    let o = JSON.parse(data.token);
                    s = JSON.stringify(o, null, 4);
                } else {
                    s = JSON.stringify(data.token, null, 4);
                }

                set_response_area(s);
                ui.refresh_token_button.show();
                ui.delete_token_button.show();
            }
        })
        .fail((jqXHR, textStatus, errorThrown) => {
            hide_busy();
            console.log('ERROR => refresh_token failed');
        });
}

/**
 * Handler for the delete-token button.
 * @param {Event} evt
 */
function handle_delete_token(evt) {
    hide_action_buttons();
    set_response_area('');
    show_busy();

    const url = `${api_base_url}/v1/delete_token`;

    const opts = {
        method: 'POST',
        data: {
            username: config.username
        },
        dataType: 'json'
    };

    $.ajax(url, opts)
        .then((data, textStatus, jqXHR) => {
            hide_busy();
            if ('status' in data) {
                if (data.status == 'ok') {
                    if ('message' in data) {
                        set_response_area(data.message);
                    }
                } else if (data.status == 'fail') {
                    if ('error' in data) {
                        set_response_area(data.error);
                    } else {
                        set_response_area('ERROR: No error message in response!');
                    }
                } else {
                    set_response_area(`ERROR: Invalid status (${data.status}) in response.`);
                }
            } else {
                set_response_area('ERROR: No status in response!');
            }
        })
        .fail((jqXHR, textStatus, errorThrown) => {
            hide_busy();
            console.log('ERROR => delete_token failed');
        });
}

/**
 * Handler for the request-token button.
 * @param {Event} evt
 */
function handle_request_token(evt) {
    console.log('INFO => in handle_request_token');

    const code = ui.response_area.text();

    clear_response_area();
    hide_action_buttons();
    show_busy();

    const url = `${api_base_url}/v1/exchange_code_for_token`;

    let opts = {
        method: 'POST',
        data: {
            username: config.username,
            code: code
        },
        dataType: 'json'
    };

    $.ajax(url, opts)
        .then((data, textStatus, jqXHR) => {
            hide_busy();
            console.log('INFO => exchange_code_for_token success');
            if ('token' in data) {
                set_response_area(data);
                ui.refresh_token_button.show();
                ui.delete_token_button.show();
            }
        })
        .fail((jqXHR, textStatus, errorThrown) => {
            hide_busy();
            set_response_area(errorThrown);
        });
}

/**
 * Verifies that the required fields are present, and if so saves them as the current config.
 * @param {Event} evt
 */
function handle_form_submit(evt) {
    config.username = ui.form.username.val();
    config.client_id = ui.form.client_id.val();
    config.client_secret = ui.form.client_secret.val();
    config.api_server = $('input[name=api_server]:checked').val();
    console.log('INFO handle_form_submit, config: ', config);
    if (config.username && config.client_id && config.client_secret) {
        ui.dialog.hide();
        ui.overlay.hide();

        save_config(config);

        ui.login_button.show();
        get_startup_data();
    } else {
        alert('All fields are required!');
    }
}

/**
 * Reads configuration data from cookies into the global config object, and sets the values into the form.
 * @returns {Promise} resolved on success, or rejected with an error string.
 */
function load_config() {
    let p = new Promise((resolve, reject) => {
        const username = localStorage.getItem(username_cookie_name);

        read_config(username)
            .then(cfg => {
                config = cfg;
                ui.form.username.val(config.username);
                ui.form.client_id.val(config.client_id);
                ui.form.client_secret.val(config.client_secret);

                $(`input[value=${config.api_server}]`).prop('checked', true);
                resolve();
            })
            .catch(error => {
                reject(error);
            });
    });

    return p;
}

/**
 * Saves the config on the server.
 * @param {Object} config
 */
function save_config(config) {
    localStorage.setItem(username_cookie_name, config.username);

    const url = `${api_base_url}/v1/save_config`;

    const opts = {
        method: 'POST',
        data: {
            username: config.username,
            client_id: config.client_id,
            client_secret: config.client_secret,
            api_server: config.api_server
        },
        dataType: 'json'
    };

    $.ajax(url, opts)
        .then((data, textStatus, jqXHR) => {
            console.log('INFO => save_config success');
            if (data.status) {
                if (data.status === 'ok') {
                    console.log('Successfully saved the config on the server.');
                } else {
                    alert('Failed to save the config');
                }
            } else {
                alert('Invalid response from the server');
            }
        })
        .fail((jqXHR, textStatus, errorThrown) => {
            console.log('ERROR => save_config failed');
            alert('Failed to save the config');
        });
}

/**
 * Fetches the config from the server.
 * @param {Object} config
 * @returns {Promise} resolves with the config object if successful, otherwise rejects with an error message.
 */
function read_config(username) {
    let p = new Promise((resolve, reject) => {
        const url = `${api_base_url}/v1/read_config`;

        const opts = {
            method: 'POST',
            data: {
                username: username
            },
            dataType: 'json'
        };

        $.ajax(url, opts)
            .then((data, textStatus, jqXHR) => {
                console.log('INFO => (read_config) success');
                if (data.status) {
                    if (data.status === 'ok' && data.config) {
                        console.log('Successfully read the config from the server.');
                        resolve(data.config);
                    } else {
                        reject('Failed to read the config');
                    }
                } else {
                    reject('Invalid response from the server');
                }
            })
            .fail((jqXHR, textStatus, errorThrown) => {
                console.log('ERROR => (read_config) failed');
                reject('Failed to read the config from the server');
            });
    });

    return p;
}

/**
 * Event handler for the setup button. Displays the setup dialog.
 * @param {Event} evt
 */
function handle_setup(evt) {
    show_setup_dialog();
}

/**
 * Displays the setup dialog.
 */
function show_setup_dialog() {
    ui.form.username.val(config.username);
    ui.form.client_id.val(config.client_id);
    ui.form.client_secret.val(config.client_secret);

    $(`input[value=${config.api_server}]`).prop('checked', true);

    ui.overlay.show();
    ui.dialog.show();
}

/**
 * Read config and code/token data and configure the UI according to what we hve.
 */
function configure_app() {
    clear_response_area();
    get_startup_data()
        .then(data => {
            if ('config' in data) {
                config = data.config;
            }

            if (config.username && config.client_id && config.client_secret) {
                ui.login_button.show();
            } else {
                show_setup_dialog();
            }

            if ('code' in data) {
                set_response_area(data.code);
                ui.request_token_button.show();
            } else if ('token' in data) {
                set_response_area(data.token);
                ui.refresh_token_button.show();
                ui.delete_token_button.show();
            } else if ('message' in data) {
                set_response_area(data.message);
                hide_action_buttons();
            }
        })
        .catch(error => {});
}

/**
 * Fetches startup data from the server and configure the app.
 * @returns {Promise} resolves with startup data, or rejects with error message.
 */
function get_startup_data() {
    console.log('INFO => in handle_refresh_button');

    let p = new Promise((resolve, reject) => {
        const username = localStorage.getItem(username_cookie_name);
        if (username) {
            const url = `${api_base_url}/v1/get_startup_data`;

            const opts = {
                method: 'POST',
                data: {
                    username: username
                },
                dataType: 'json'
            };

            $.ajax(url, opts)
                .then((data, textStatus, jqXHR) => {
                    console.log('INFO => get_startup_data success');
                    resolve(data);
                })
                .fail((jqXHR, textStatus, errorThrown) => {
                    console.log('ERROR => get_startup_data failed');
                    reject('Failed to get startup data');
                });
        } else {
            show_setup_dialog();
        }
    });

    return p;
}
