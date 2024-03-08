const util = Utility();

const CONFIG_NAME_KEY_NAME = 'config_name';
const API_BASE_URL = '/api';
const DEFAULT_HTTP_PORT = 4000;
const EMPTY_CONFIG = { name: '', base_url: '', client_id: '', client_secret: '' };

let http_port = DEFAULT_HTTP_PORT; 

let config = EMPTY_CONFIG;

let config_list = [];

let ui = {
    response_area: null,
    login_button: null,
    refresh_token_button: null,
    request_token_button: null,
    delete_token_button: null,
    overlay: null,
    busy_overlay: null,
};

$(document).ready(() => {
    ui.login_button = $('#login_to_tsheets');
    ui.config_name = $('#config_name_header');
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
    ui.form.config_list = $('#config_list');
    ui.form.add_new_config_button = $('#add_new_config');
    ui.form.config_name = $('#config_name_input');
    ui.form.base_url = $('#base_url_input');
    ui.form.client_id = $('#client_id_input');
    ui.form.client_secret = $('#client_secret_input');
    ui.form.submit_button = $('#form_submit_button');

    ui.form.submit_button.prop('disabled', true);

    ui.login_button.click(handle_login_button);
    ui.refresh_token_button.click(handle_refresh_button);
    ui.request_token_button.click(handle_request_token);
    ui.delete_token_button.click(handle_delete_token);

    $('form#oauth_config_form').on('submit', (evt) => {
        evt.stopPropagation();
        evt.preventDefault();
        handle_form_submit(evt);
    });

    ui.form.close_x.click((evt) => {
        ui.dialog.hide();
        ui.overlay.hide();
    });

    ui.setup_button.click(handle_setup);

    configure_app();
});

/**
 * Checks to see if we have values for all fields, and enable the submit button if so.
 */
const handle_config_item_changed = (evt) => {
    const name = ui.form.config_name.val();
    const base_url = ui.form.base_url.val();
    const client_id = ui.form.client_id.val();
    const client_secret = ui.form.client_secret.val();

    console.info(`INFO: (handle_config_item_changed) name = ${name}`);
    console.info(`INFO: (handle_config_item_changed) base_url = ${base_url}`);
    console.info(`INFO: (handle_config_item_changed) client_id = ${client_id}`);
    console.info(`INFO: (handle_config_item_changed) client_secret = ${client_secret}`);

    if (name && base_url && client_id && client_secret) {
        ui.form.submit_button.prop('disabled', false);
    } else {
        ui.form.submit_button.prop('disabled', true);
    }
};

/**
 * Puts up the overlay and the busy spinner.
 */
const show_busy = () => {
    ui.overlay.show();
    ui.busy_overlay.show();
};

/**
 * Removes the overlay and the busy spinner.
 */
const hide_busy = () => {
    ui.overlay.hide();
    ui.busy_overlay.hide();
};

/**
 * Hides the action buttons, and conditionally hides the login button.
 * @param {boolean} hide_all if true, hides all of the action buttons, including the login buttons.
 */
const hide_action_buttons = (hide_all = false) => {
    if (hide_all) {
        ui.login_button.hide();
    }
    ui.refresh_token_button.hide();
    ui.request_token_button.hide();
    ui.delete_token_button.hide();
};

/**
 * Puts a string in the response area.
 * @param {string|object} s -- the string, or object, to display
 */
const set_response_area = (s) => {
    if (typeof s !== 'string') {
        s = JSON.stringify(s, null, 4);
    }
    ui.response_area.text(s);
};

/**
 * Sets the response area to an empty string, effectively clearing it.
 */
const clear_response_area = () => {
    set_response_area('');
};

/**
 * Utility function to create the API url to be used with TSheets for
 * the current configuration.
 * @returns {string} The base API URL to use with TSheets.
 */
const get_base_api_url = () => {
    const url = `${config.base_url}/api`;

    console.info(`DEBUG: (get_base_api_url) base_api_url = ${url}`);

    return url;
};

/**
 * Handler for the login button.
 * @param {Event} evt
 */
const handle_login_button = (evt) => {
    console.log('INFO: in handle_login_button');
    hide_action_buttons();
    clear_response_area();
    show_busy();

    const state = util.create_state();

    const url = `${API_BASE_URL}/v1/save_state_data`;

    const opts = {
        method: 'POST',
        data: {
            config_name: config.name,
            state: state,
        },
        dataType: 'json',
    };

    $.ajax(url, opts)
        .then((data, textStatus, jqXHR) => {
            ui.busy_overlay.hide();
            console.log(`INFO: save_state_data success. data: `, data);
            const base_api_url = get_base_api_url();
            if ('status' in data && data.status === 'ok') {
                const redirect_uri = `http://localhost:${http_port}/api/v1/oauth_handler/`;
                const query_string = `client_id=${config.client_id}&state=${state}&redirect_uri=${redirect_uri}`;
                const url = `${base_api_url}/v1/authorize?response_type=code&${query_string}`;
                console.log(`DEBUG: redirect url: ${url}`);
                window.location.assign(url);
            } else {
                let error = data.message ? data.message : 'unknown error';
                set_response_area(`Couldn't save state! err = ${error}`);
            }
        })
        .fail((jqXHR, textStatus, errorThrown) => {
            hide_busy();
            set_response_area("Couldn't save state.");
            alert("API failure! Couldn't save state.");
        });
};

/**
 * Handler for when the refresh token button is clicked.
 * @param {*} evt
 */
const handle_refresh_button = (evt) => {
    console.log('INFO: in handle_refresh_button');
    clear_response_area();
    hide_action_buttons();
    show_busy();

    const url = `${API_BASE_URL}/v1/refresh_token`;

    const opts = {
        method: 'POST',
        data: {
            config_name: config.name,
        },
        dataType: 'json',
    };

    $.ajax(url, opts)
        .then((data, textStatus, jqXHR) => {
            hide_busy();
            console.log('INFO: refresh_token success');
            if (data.token) {
                set_response_area(data.token);
                ui.refresh_token_button.show();
                ui.delete_token_button.show();
            }
        })
        .fail((jqXHR, textStatus, errorThrown) => {
            hide_busy();
            console.log('ERROR: refresh_token failed');
        });
};

/**
 * Handler for the delete-token button.
 * @param {Event} evt
 */
const handle_delete_token = (evt) => {
    hide_action_buttons();
    set_response_area('');
    show_busy();

    const url = `${API_BASE_URL}/v1/delete_token`;

    const opts = {
        method: 'POST',
        data: {
            config_name: config.name,
        },
        dataType: 'json',
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
            console.log('ERROR: delete_token failed');
        });
};

/**
 * Handler for the request-token button.
 * @param {Event} evt
 */
const handle_request_token = (evt) => {
    console.log('INFO: in handle_request_token');

    const code = ui.response_area.text();

    clear_response_area();
    hide_action_buttons();
    show_busy();

    const url = `${API_BASE_URL}/v1/exchange_code_for_token`;

    let opts = {
        method: 'POST',
        data: {
            config_name: config.name,
            code: code,
        },
        dataType: 'json',
    };

    $.ajax(url, opts)
        .then((data, textStatus, jqXHR) => {
            hide_busy();
            console.log('INFO: exchange_code_for_token success');
            if ('token' in data) {
                set_response_area(data.token);
                ui.refresh_token_button.show();
                ui.delete_token_button.show();
            }
        })
        .fail((jqXHR, textStatus, errorThrown) => {
            hide_busy();
            set_response_area(errorThrown);
        });
};

/**
 * Verifies that the required fields are present, and if so saves them as the current config.
 * @param {Event} evt
 */
const handle_form_submit = (evt) => {
    config.name = ui.form.config_name.val();
    config.base_url = ui.form.base_url.val();
    config.client_id = ui.form.client_id.val();
    config.client_secret = ui.form.client_secret.val();
    console.log('INFO handle_form_submit, config: ', config);
    if (config.name && config.base_url && config.client_id && config.client_secret) {
        hide_setup_dialog();
        save_config(config);
        ui.login_button.show();
        // get_startup_data();
    } else {
        alert('All fields are required!');
    }
};

/**
 * Reads configuration data from cookies into the global config object, and sets the values into the form.
 * @returns {Promise} resolved on success, or rejected with an error string.
 */
const load_config = () => {
    let p = new Promise((resolve, reject) => {
        const config_name = get_current_config();

        read_config(config_name)
            .then((cfg) => {
                config = cfg;
                // Load config_list values.
                load_config_list_values();
                // Load form values.
                ui.form.config_name.val(config.name);
                ui.form.base_url.val(config.base_url);
                ui.form.client_id.val(config.client_id);
                ui.form.client_secret.val(config.client_secret);
                resolve();
            })
            .catch((error) => {
                reject(error);
            });
    });

    return p;
};

/**
 * Sets up the config list in the setup dialog using global values.
 */
const load_config_list_values = () => {
    $('.config-list-item').off('click');
    ui.form.config_list.empty();
    $.each(config_list, (idx, val) => {
        const $text = $(`<div class='config-list-item-text'>${val}</div>`);
        const $icon = $(`<div class='config-list-item-icon'><i class="trash alternate icon"></i></div>`);
        const $item = $(`<div class='config-list-item'></div>`);
        $item.append($text);
        $item.append($icon);
        if (val === config.name) {
            $item.addClass('selected');
        }
        ui.form.config_list.append($item);
    });

    $('.config-list-item').on('click', handle_config_list_item_name_clicked);
    $('.config-list-item-text').on('click', handle_config_list_item_name_clicked);
    $('.config-list-item-icon').on('click', handle_delete_config_delete_clicked);
};

/**
 * Handler for when a config name is clicked in the config list.
 * @param {*} evt
 */
const handle_config_list_item_name_clicked = (evt) => {
    const $e = $(evt.currentTarget);
    const config_name = $e.text();
    if (config_name) {
        set_current_config(config_name);
        get_startup_data(config_name).then((data) => {
            // Startup data has already been copied into global data.
            populate_setup_dialog();
            handle_config_item_changed();
        });
    }
};

/**
 * Handler for when the trash icon is clicked in a config list item.
 * @param {*} evt
 */
const handle_delete_config_delete_clicked = (evt) => {
    const $e = $(evt.currentTarget);
    const $parent = $e.parent();
    const $title = $parent.find('.config-list-item-text');
    const config_name = $title.text();
    if (config_name) {
        console.log(`Clicked on delete for config ${config_name}`);
        if (confirm(`Are you sure you want to delete the ${config_name} configuration?`)) {
            console.log(`Delete configuration: ${config_name}`);
            delete_config(config_name)
                .then(() => {})
                .catch((err) => {});
        }
    } else {
        console.log("Couldn't find config item in delete event handler");
    }
};

/**
 * Handles clicks on the "add new config" button
 * @param {*} evt
 */
const handle_new_config_clicked = (evt) => {
    console.log('Add new config clicked');
    config = EMPTY_CONFIG;
    clear_current_config();
    populate_setup_dialog();
    clear_response_area();
    ui.form.config_name.focus();
};

/**
 * Saves the config on the server.
 * @param {Object} config
 */
const save_config = (config) => {
    set_current_config(config.name);

    const url = `${API_BASE_URL}/v1/save_config`;

    const opts = {
        method: 'POST',
        data: {
            id: config.id,
            name: config.name,
            base_url: config.base_url,
            client_id: config.client_id,
            client_secret: config.client_secret,
            api_server: config.api_server
        },
        dataType: 'json',
    };

    $.ajax(url, opts)
        .then((data, textStatus, jqXHR) => {
            console.log('INFO: save_config success');
            process_startup_data(data);
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
            console.log('ERROR: save_config failed');
            alert('Failed to save the config');
        });
};

/**
 * Fetches the config from the server.
 * @param {string} config_name
 * @returns {Promise} resolves with the config object if successful, otherwise rejects with an error message.
 */
const read_config = (config_name) => {
    let p = new Promise((resolve, reject) => {
        const url = `${API_BASE_URL}/v1/read_config`;

        const opts = {
            method: 'POST',
            data: {
                config_name: config_name,
            },
            dataType: 'json',
        };

        $.ajax(url, opts)
            .then((data, textStatus, jqXHR) => {
                console.log('INFO: (read_config) success');
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
                console.log('ERROR: (read_config) failed');
                reject('Failed to read the config from the server');
            });
    });

    return p;
};

/**
 * Calls the API to delete a configuration from the database.
 * @param {string} config_name
 * @returns
 */
const delete_config = (config_name) => {
    let p = new Promise((resolve, reject) => {
        const url = `${API_BASE_URL}/v1/delete_config`;

        const opts = {
            method: 'POST',
            data: {
                config_name: config_name,
            },
            dataType: 'json',
        };

        $.ajax(url, opts)
            .then((data, textStatus, jqXHR) => {
                console.log('INFO: (delete_config) success');
                process_startup_data(data);
                if (data.status) {
                    if (data.status === 'ok' && data.config) {
                        console.log('Successfully deleted the config from the server.');
                        resolve(data.config);
                    } else {
                        reject('Failed to read the config');
                    }
                } else {
                    reject('Invalid response from the server');
                }
            })
            .fail((jqXHR, textStatus, errorThrown) => {
                console.log('ERROR: (delete_config) failed');
                reject('Failed to delete the config from the server');
            });
    });

    return p;
};

/**
 * Event handler for the setup button. Displays the setup dialog.
 * @param {Event} evt
 */
const handle_setup = (evt) => {
    show_setup_dialog();
};

/**
 * Displays the setup dialog.
 */
const show_setup_dialog = () => {
    populate_setup_dialog();
    handle_config_item_changed();
    ui.overlay.show();
    ui.dialog.show();
};

/**
 * Show the setup dialog and overlay.
 */
const hide_setup_dialog = () => {
    ui.dialog.hide();
    ui.overlay.hide();
};

/**
 * Puts values in all of the edit fields.
 */
const populate_setup_dialog = () => {
    const config_name = config && config.name ? config.name : '';
    ui.config_name.text(config_name);
    load_config_list_values();
    ui.form.config_name.val(config.name);
    ui.form.base_url.val(config.base_url);
    ui.form.client_id.val(config.client_id);
    ui.form.client_secret.val(config.client_secret);
};

/**
 * Read config and code/token data and configure the UI according to what we hve.
 */
const configure_app = () => {
    ui.form.config_name.on('keyup change paste', handle_config_item_changed);
    ui.form.base_url.on('keyup change paste', handle_config_item_changed);
    ui.form.client_id.on('keyup change paste', handle_config_item_changed);
    ui.form.client_secret.on('keyup change paste', handle_config_item_changed);

    clear_response_area();

    get_startup_data()
        .then((data) => {
            if ('config_list' in data) {
                config_list = data.config_list;
            }

            if (config.base_url && config.client_id && config.client_secret) {
                ui.login_button.show();
            } else {
                show_setup_dialog();
            }
        })
        .catch((error) => {
            console.error(`Couldn't fetch startup data: ${error}`);
        });

    ui.form.add_new_config_button.on('click', handle_new_config_clicked);
};

/**
 * Fetches startup data from the server and configure the app.
 * @param {string|null}   config_name if known.
 * @returns {Promise} resolves with startup data, or rejects with error message.
 */
const get_startup_data = (config_name = null) => {
    console.log('INFO: in handle_refresh_button');

    let p = new Promise((resolve, reject) => {
        config_name = config_name || get_current_config();
        const url = `${API_BASE_URL}/v1/get_startup_data`;

        const opts = {
            method: 'POST',
            data: {},
            dataType: 'json',
        };

        if (config_name) {
            opts.data.config_name = config_name;
        }

        $.ajax(url, opts)
            .then((data, textStatus, jqXHR) => {
                console.log('INFO: get_startup_data success');
                process_startup_data(data);
                resolve(data);
            })
            .fail((jqXHR, textStatus, errorThrown) => {
                console.log('ERROR: get_startup_data failed');
                reject('Failed to get startup data');
            });
    });

    return p;
};

/**
 * Handles storing of data from the server in global vars and setting display elements.
 * @param {Object} data
 */
const process_startup_data = (data) => {
    if (data) {
        if (data.config_list) {
            config_list = data.config_list;
        } else {
            config_list = [];
        }

        if (data.config) {
            config = data.config;
            // Check to see if the stored config name still the current config.
            // If not, update it.
            const config_name = get_current_config();
            if (config_name !== config.name) {
                set_current_config(config.name);
            }
            populate_setup_dialog();
        } else {
            config = {};
        }

        if ('port' in data) {
            http_port = data.port;
        } else {
            http_port = DEFAULT_HTTP_PORT;
        }

        if (data.code) {
            set_response_area(data.code);
            ui.request_token_button.show();
        } else if (data.token) {
            set_response_area(data.token);
            ui.refresh_token_button.show();
            ui.delete_token_button.show();
        } else if (data.message) {
            set_response_area(data.message);
            hide_action_buttons();
        }
    }
};

/**
 * Read the current config name (from local storage)
 * @param {string} config_name
 * @returns {string} The inserted value.
 */
const set_current_config = (config_name = '') => {
    return localStorage.setItem(CONFIG_NAME_KEY_NAME, config_name);
};

/**
 * Reads the current config name from local storage.
 * @returns {string|null}
 */
const get_current_config = () => {
    return localStorage.getItem(CONFIG_NAME_KEY_NAME);
};

/**
 * Clear the current config name from local storage.
 * @returns {boolean}     true if the config name was cleared, false otherwise.
 */
const clear_current_config = () => {
    const ret = set_current_config('');
    return ret === '';
};
