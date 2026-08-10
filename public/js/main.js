const CONFIG_NAME_KEY_NAME = 'config_name';
const API_BASE_URL = '/api';
const DEFAULT_HTTP_PORT = 4000;
const EMPTY_CONFIG = {
    name: '',
    authorize_url: '',
    token_url: '',
    client_id: '',
    client_secret: '',
    public_client: false,
    scope: '',
};

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
    ui.login_button = $('#login_button');
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
    ui.form.clone_config_button = $('#clone_config');
    ui.form.config_name = $('#config_name_input');
    ui.form.authorize_url = $('#authorize_url_input');
    ui.form.token_url = $('#token_url_input');
    ui.form.client_id = $('#client_id_input');
    ui.form.client_secret = $('#client_secret_input');
    ui.form.toggle_client_secret = $('#toggle_client_secret');
    ui.form.public_client = $('#public_client_input');
    ui.form.scope = $('#scope_input');
    ui.form.submit_button = $('#form_submit_button');
    ui.form.save_status = $('#save_status');

    ui.form.submit_button.prop('disabled', true);
    ui.form.clone_config_button.prop('disabled', true);
    ui.form.toggle_client_secret.on('click', handle_toggle_client_secret);
    ui.form.public_client.on('change', handle_public_client_changed);

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
        hide_setup_dialog();
    });

    $(document).on('keydown', (evt) => {
        if (evt.key === 'Escape' && ui.dialog.hasClass('is-open')) {
            hide_setup_dialog();
        }
    });

    ui.setup_button.click(handle_setup);

    configure_app();
});

/**
 * Returns true if all required config fields are present.
 * Client secret is required unless this is a public (PKCE-only) client.
 * @param {Object} cfg
 * @returns {boolean}
 */
const is_config_complete = (cfg) => {
    if (!(cfg && cfg.name && cfg.authorize_url && cfg.token_url && cfg.client_id)) {
        return false;
    }
    return !!(cfg.public_client || cfg.client_secret);
};

/**
 * Returns true if the form has anything worth cloning.
 * @param {Object} cfg
 * @returns {boolean}
 */
const has_cloneable_values = (cfg) => {
    return !!(cfg && (cfg.name || cfg.authorize_url || cfg.token_url || cfg.client_id || cfg.client_secret || cfg.scope));
};

/**
 * Checks to see if we have values for all required fields, and enables the submit button if so.
 */
const handle_config_item_changed = (evt) => {
    const form_config = read_form_values();

    ui.form.submit_button.prop('disabled', !is_config_complete(form_config));
    ui.form.clone_config_button.prop('disabled', !has_cloneable_values(form_config));

    // Only clear status for real user edits (keyup/change/paste), not programmatic refreshes.
    if (evt) {
        clear_save_status();
    }
};

/**
 * Builds a unique configuration name for a clone.
 * @param {string} base_name
 * @returns {string}
 */
const unique_copy_name = (base_name) => {
    const root = (base_name || 'Config').trim() || 'Config';
    let candidate = `${root} (copy)`;
    let n = 2;

    while (config_list.includes(candidate)) {
        candidate = `${root} (copy ${n})`;
        n += 1;
    }

    return candidate;
};

/**
 * Shows a short-lived status message next to Save.
 * @param {string} message
 * @param {boolean} is_error
 */
const show_save_status = (message, is_error = false) => {
    if (!ui.form.save_status) {
        return;
    }

    ui.form.save_status
        .text(message)
        .toggleClass('is-error', !!is_error)
        .addClass('is-visible');

    if (ui.form.save_status_timer) {
        clearTimeout(ui.form.save_status_timer);
    }

    ui.form.save_status_timer = setTimeout(() => {
        clear_save_status();
    }, 2500);
};

/**
 * Clears the Save status message.
 */
const clear_save_status = () => {
    if (!ui.form.save_status) {
        return;
    }

    ui.form.save_status.removeClass('is-visible is-error').text('');

    if (ui.form.save_status_timer) {
        clearTimeout(ui.form.save_status_timer);
        ui.form.save_status_timer = null;
    }
};

/**
 * Sets whether the client secret is shown in plain text.
 * @param {boolean} visible
 */
const set_client_secret_visible = (visible) => {
    const $input = ui.form.client_secret;
    const $button = ui.form.toggle_client_secret;
    const $icon = $button.find('i.icon');

    $input.attr('type', visible ? 'text' : 'password');
    $icon.toggleClass('slash', !!visible);
    $button
        .attr('title', visible ? 'Hide client secret' : 'Show client secret')
        .attr('aria-label', visible ? 'Hide client secret' : 'Show client secret')
        .attr('aria-pressed', visible ? 'true' : 'false');
};

/**
 * Enables or disables the client secret field for public-client mode.
 * @param {boolean} is_public
 * @param {boolean} clear_secret when becoming public, clear the secret value
 */
const set_public_client_mode = (is_public, clear_secret = false) => {
    const $input = ui.form.client_secret;
    const $toggle = ui.form.toggle_client_secret;
    const $wrap = $input.closest('.secret-input');

    ui.form.public_client.prop('checked', !!is_public);
    $input.prop('disabled', !!is_public);
    $toggle.prop('disabled', !!is_public);
    $wrap.toggleClass('is-disabled', !!is_public);

    if (is_public) {
        if (clear_secret) {
            $input.val('');
        }
        set_client_secret_visible(false);
    }
};

/**
 * Handler for the public-client checkbox.
 * @param {Event} evt
 */
const handle_public_client_changed = (evt) => {
    const is_public = ui.form.public_client.is(':checked');
    set_public_client_mode(is_public, is_public);
    handle_config_item_changed(evt);
    if (!is_public) {
        ui.form.client_secret.focus();
    }
};

/**
 * Toggles visibility of the client secret field.
 * @param {Event} evt
 */
const handle_toggle_client_secret = (evt) => {
    evt.preventDefault();
    if (ui.form.client_secret.prop('disabled')) {
        return;
    }
    set_client_secret_visible(ui.form.client_secret.attr('type') === 'password');
};

/**
 * Reads the current form values into a config object.
 * @returns {Object}
 */
const read_form_values = () => {
    const public_client = ui.form.public_client.is(':checked');
    return {
        name: ui.form.config_name.val(),
        authorize_url: ui.form.authorize_url.val(),
        token_url: ui.form.token_url.val(),
        client_id: ui.form.client_id.val(),
        client_secret: public_client ? '' : ui.form.client_secret.val(),
        public_client: public_client,
        scope: ui.form.scope.val(),
    };
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
 * Handler for the login button. Asks the server to begin an authorization flow
 * (which generates the state and PKCE values), then redirects the browser to
 * the configured authorization endpoint.
 * @param {Event} evt
 */
const handle_login_button = (evt) => {
    console.log('INFO: in handle_login_button');
    hide_action_buttons();
    clear_response_area();
    show_busy();

    const url = `${API_BASE_URL}/v1/begin_authorization`;

    const opts = {
        method: 'POST',
        data: {
            config_name: config.name,
        },
        dataType: 'json',
    };

    $.ajax(url, opts)
        .then((data, textStatus, jqXHR) => {
            ui.busy_overlay.hide();
            console.log(`INFO: begin_authorization success. data: `, data);
            if ('status' in data && data.status === 'ok') {
                // Build the query string with encodeURIComponent so every value —
                // including redirect_uri — is consistently percent-encoded.
                // (URLSearchParams is fine too, but this makes the encoding explicit.)
                const params = [
                    `response_type=${encodeURIComponent('code')}`,
                    `client_id=${encodeURIComponent(config.client_id)}`,
                    `redirect_uri=${encodeURIComponent(data.redirect_uri)}`,
                    `state=${encodeURIComponent(data.state)}`,
                    `code_challenge=${encodeURIComponent(data.code_challenge)}`,
                    `code_challenge_method=${encodeURIComponent(data.code_challenge_method)}`,
                ];
                if (config.scope) {
                    params.push(`scope=${encodeURIComponent(config.scope)}`);
                }
                const separator = config.authorize_url.includes('?') ? '&' : '?';
                const authorize_url = `${config.authorize_url}${separator}${params.join('&')}`;
                console.log(`DEBUG: redirect url: ${authorize_url}`);
                window.location.assign(authorize_url);
            } else {
                let error = data.message ? data.message : 'unknown error';
                set_response_area(`Couldn't begin the authorization flow! err = ${error}`);
            }
        })
        .fail((jqXHR, textStatus, errorThrown) => {
            hide_busy();
            set_response_area("Couldn't begin the authorization flow.");
            alert("API failure! Couldn't begin the authorization flow.");
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
            const message =
                jqXHR.responseJSON && jqXHR.responseJSON.message
                    ? jqXHR.responseJSON.message
                    : 'Failed to refresh the token';
            set_response_area(message);
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
            const message =
                jqXHR.responseJSON && jqXHR.responseJSON.message ? jqXHR.responseJSON.message : errorThrown;
            set_response_area(message);
        });
};

/**
 * Verifies that the required fields are present, and if so saves them as the current config.
 * Leaves the settings dialog open so the user can keep editing or close with X.
 * @param {Event} evt
 */
const handle_form_submit = (evt) => {
    const form_config = read_form_values();
    console.log('INFO handle_form_submit, config: ', form_config);
    if (is_config_complete(form_config)) {
        // Keep id when editing/renaming an existing row. Clones and New drafts have no id.
        const next_config = Object.assign({}, form_config);
        if (config && config.id) {
            next_config.id = config.id;
        }
        config = next_config;
        save_config(config);
        ui.login_button.show();
    } else {
        show_save_status('Name, URLs, and Client ID are required (plus Client Secret unless Public client)', true);
    }
};

/**
 * Sets up the config list in the setup dialog using global values.
 */
const load_config_list_values = () => {
    ui.form.config_list.empty();

    if (!config_list.length) {
        ui.form.config_list.append(
            $(`<div class='config-list-empty'>No configurations yet. Use New or fill in the form and Save.</div>`)
        );
        return;
    }

    $.each(config_list, (idx, val) => {
        const $text = $(`<div class='config-list-item-text'></div>`).text(val).attr('title', val);
        const $clone = $(
            `<div class='config-list-item-icon config-list-item-clone' title='Clone'><i class="copy icon"></i></div>`
        );
        const $trash = $(
            `<div class='config-list-item-icon config-list-item-delete' title='Delete'><i class="trash alternate icon"></i></div>`
        );
        const $actions = $(`<div class='config-list-item-actions'></div>`).append($clone, $trash);
        const $item = $(`<div class='config-list-item'></div>`).attr('data-config-name', val);
        $item.append($text, $actions);
        if (val === config.name) {
            $item.addClass('selected');
        }
        ui.form.config_list.append($item);
    });

    ui.form.config_list
        .off('click')
        .on('click', '.config-list-item', handle_config_list_item_name_clicked)
        .on('click', '.config-list-item-clone', handle_clone_from_list_clicked)
        .on('click', '.config-list-item-delete', handle_delete_config_delete_clicked);
};

/**
 * Handler for when a config name is clicked in the config list.
 * @param {*} evt
 */
const handle_config_list_item_name_clicked = (evt) => {
    // Ignore clicks on row action icons (clone / delete).
    if ($(evt.target).closest('.config-list-item-actions').length) {
        return;
    }

    const $e = $(evt.currentTarget);
    const config_name = $e.attr('data-config-name');
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
    evt.preventDefault();
    evt.stopPropagation();

    const $item = $(evt.currentTarget).closest('.config-list-item');
    const config_name = $item.attr('data-config-name');
    if (config_name) {
        console.log(`Clicked on delete for config ${config_name}`);
        if (confirm(`Are you sure you want to delete the ${config_name} configuration?`)) {
            console.log(`Delete configuration: ${config_name}`);
            delete_config(config_name)
                .then(() => {
                    show_save_status('Deleted');
                })
                .catch((err) => {
                    show_save_status('Delete failed', true);
                });
        }
    } else {
        console.log("Couldn't find config item in delete event handler");
    }
};

/**
 * Clones a listed configuration into a new unsaved draft.
 * @param {*} evt
 */
const handle_clone_from_list_clicked = (evt) => {
    evt.preventDefault();
    evt.stopPropagation();

    const $item = $(evt.currentTarget).closest('.config-list-item');
    const config_name = $item.attr('data-config-name');
    if (!config_name) {
        return;
    }

    get_startup_data(config_name).then(() => {
        begin_clone_from_current();
    });
};

/**
 * Handles clicks on the "add new config" button
 * @param {*} evt
 */
const handle_new_config_clicked = (evt) => {
    console.log('Add new config clicked');
    config = Object.assign({}, EMPTY_CONFIG);
    clear_current_config();
    populate_setup_dialog();
    clear_response_area();
    clear_save_status();
    handle_config_item_changed();
    ui.form.config_name.focus();
};

/**
 * Handles clicks on the sidebar Clone button — clones the form/current config.
 * @param {*} evt
 */
const handle_clone_config_clicked = (evt) => {
    const form_config = read_form_values();
    if (!has_cloneable_values(form_config)) {
        return;
    }

    // Prefer form values so in-progress edits are included in the clone.
    config = Object.assign({}, EMPTY_CONFIG, form_config);
    begin_clone_from_current();
};

/**
 * Turns the current config into a new unsaved clone with a unique name.
 */
const begin_clone_from_current = () => {
    const source = Object.assign({}, EMPTY_CONFIG, config, read_form_values());
    const new_name = unique_copy_name(source.name);

    config = {
        name: new_name,
        authorize_url: source.authorize_url || '',
        token_url: source.token_url || '',
        client_id: source.client_id || '',
        client_secret: source.client_secret || '',
        public_client: source.public_client === true || !source.client_secret,
        scope: source.scope || '',
    };

    clear_current_config();
    populate_setup_dialog();
    clear_response_area();
    handle_config_item_changed();
    show_save_status('Cloned — rename and Save');
    ui.form.config_name.focus().select();
};

/**
 * Saves the config on the server.
 * @param {Object} config
 */
const save_config = (config) => {
    set_current_config(config.name);
    ui.form.submit_button.prop('disabled', true);

    const url = `${API_BASE_URL}/v1/save_config`;

    const data = {
        name: config.name,
        authorize_url: config.authorize_url,
        token_url: config.token_url,
        client_id: config.client_id,
        client_secret: config.client_secret || '',
        scope: config.scope,
    };

    if (config.id) {
        data.id = config.id;
    }

    const opts = {
        method: 'POST',
        data: data,
        dataType: 'json',
    };

    $.ajax(url, opts)
        .then((data, textStatus, jqXHR) => {
            console.log('INFO: save_config success');
            process_startup_data(data);
            handle_config_item_changed();
            if (data.status) {
                if (data.status === 'ok') {
                    console.log('Successfully saved the config on the server.');
                    show_save_status('Saved');
                } else {
                    show_save_status('Failed to save', true);
                }
            } else {
                show_save_status('Invalid server response', true);
            }
        })
        .fail((jqXHR, textStatus, errorThrown) => {
            console.log('ERROR: save_config failed');
            handle_config_item_changed();
            show_save_status('Failed to save', true);
        });
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
                if (data.status === 'ok') {
                    console.log('Successfully deleted the config from the server.');
                    resolve(data.config || null);
                } else {
                    reject(data.message || 'Failed to delete the config');
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
    clear_save_status();
    ui.overlay.show();
    ui.dialog.addClass('is-open');
};

/**
 * Hides the setup dialog and overlay.
 */
const hide_setup_dialog = () => {
    ui.dialog.removeClass('is-open');
    ui.overlay.hide();
    clear_save_status();
};

/**
 * Puts values in all of the edit fields.
 */
const populate_setup_dialog = () => {
    const config_name = config && config.name ? config.name : '';
    ui.config_name.text(config_name);
    load_config_list_values();
    ui.form.config_name.val(config.name || '');
    ui.form.authorize_url.val(config.authorize_url || '');
    ui.form.token_url.val(config.token_url || '');
    ui.form.client_id.val(config.client_id || '');
    ui.form.client_secret.val(config.client_secret || '');
    ui.form.scope.val(config.scope || '');
    // Explicit flag wins; otherwise infer public client from a saved row with no secret.
    const is_public = config.public_client === true || (!!config.id && !config.client_secret);
    set_public_client_mode(is_public, false);
    set_client_secret_visible(false);
};

/**
 * Read config and code/token data and configure the UI according to what we have.
 */
const configure_app = () => {
    ui.form.config_name.on('keyup change paste', handle_config_item_changed);
    ui.form.authorize_url.on('keyup change paste', handle_config_item_changed);
    ui.form.token_url.on('keyup change paste', handle_config_item_changed);
    ui.form.client_id.on('keyup change paste', handle_config_item_changed);
    ui.form.client_secret.on('keyup change paste', handle_config_item_changed);
    ui.form.scope.on('keyup change paste', handle_config_item_changed);

    clear_response_area();

    // The oauth_handler redirect may carry an error from the authorization server.
    const query_params = new URLSearchParams(window.location.search);
    const oauth_error = query_params.get('error');

    get_startup_data()
        .then((data) => {
            if ('config_list' in data) {
                config_list = data.config_list;
            }

            if (oauth_error) {
                set_response_area(`Authorization failed: ${oauth_error}`);
            }

            if (is_config_complete(config)) {
                ui.login_button.show();
            } else {
                show_setup_dialog();
            }
        })
        .catch((error) => {
            console.error(`Couldn't fetch startup data: ${error}`);
        });

    ui.form.add_new_config_button.on('click', handle_new_config_clicked);
    ui.form.clone_config_button.on('click', handle_clone_config_clicked);
};

/**
 * Fetches startup data from the server and configure the app.
 * @param {string|null}   config_name if known.
 * @returns {Promise} resolves with startup data, or rejects with error message.
 */
const get_startup_data = (config_name = null) => {
    console.log('INFO: in get_startup_data');

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
            // Persisted public clients have an empty secret; surface that as a UI flag.
            config.public_client = !config.client_secret;
            // Check to see if the stored config name still the current config.
            // If not, update it.
            const config_name = get_current_config();
            if (config_name !== config.name) {
                set_current_config(config.name);
            }
            populate_setup_dialog();
            handle_config_item_changed();
        } else {
            config = Object.assign({}, EMPTY_CONFIG);
            clear_current_config();
            populate_setup_dialog();
            handle_config_item_changed();
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
 * Stores the current config name (in local storage)
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
