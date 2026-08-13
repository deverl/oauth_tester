const CONFIG_NAME_KEY_NAME = 'config_name';
const API_BASE_URL = '/api';
const EMPTY_CONFIG = {
    name: '',
    authorize_url: '',
    token_url: '',
    client_id: '',
    client_secret: '',
    public_client: false,
    scope: '',
    verify_url: '',
};

let config = EMPTY_CONFIG;

let config_list = [];

/** Snapshot of form fields after last load/Apply; used for dirty detection. */
let settings_baseline = null;

/** True for New/Clone drafts that exist only in the form until Apply/OK. */
let settings_unsaved_draft = false;

const ui = {
    response_area: null,
    login_button: null,
    refresh_token_button: null,
    request_token_button: null,
    delete_token_button: null,
    verify_button: null,
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
    ui.verify_button = $('#verify_button');
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
    ui.form.verify_url = $('#verify_url_input');
    ui.form.cancel_button = $('#settings_cancel_button');
    ui.form.apply_button = $('#settings_apply_button');
    ui.form.ok_button = $('#settings_ok_button');
    ui.form.save_status = $('#save_status');

    ui.form.apply_button.prop('disabled', true);
    ui.form.clone_config_button.prop('disabled', true);
    ui.form.toggle_client_secret.on('click', handle_toggle_client_secret);
    ui.form.public_client.on('change', handle_public_client_changed);

    ui.login_button.click(handle_login_button);
    ui.refresh_token_button.click(handle_refresh_button);
    ui.request_token_button.click(handle_request_token);
    ui.delete_token_button.click(handle_delete_token);
    ui.verify_button.click(handle_verify_button);

    $('form#oauth_config_form').on('submit', (evt) => {
        evt.stopPropagation();
        evt.preventDefault();
        handle_settings_ok(evt);
    });

    ui.form.apply_button.on('click', handle_settings_apply);
    ui.form.cancel_button.on('click', handle_settings_cancel);

    ui.form.close_x.click((evt) => {
        handle_settings_cancel(evt);
    });

    $(document).on('keydown', (evt) => {
        if (evt.key === 'Escape' && ui.dialog.hasClass('is-open')) {
            handle_settings_cancel(evt);
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
    return !!(
        cfg &&
        (cfg.name ||
            cfg.authorize_url ||
            cfg.token_url ||
            cfg.client_id ||
            cfg.client_secret ||
            cfg.scope ||
            cfg.verify_url)
    );
};

/**
 * Checks required fields / dirty state and updates Apply + Clone button enablement.
 */
const handle_config_item_changed = (evt) => {
    const form_config = read_form_values();

    ui.form.apply_button.prop('disabled', !is_config_complete(form_config) || !is_settings_dirty());
    ui.form.clone_config_button.prop('disabled', !has_cloneable_values(form_config));

    // Only clear status for real user edits (keyup/change/paste), not programmatic refreshes.
    if (evt) {
        clear_save_status();
    }
};

/**
 * Normalized form snapshot for dirty comparison.
 * @param {Object} cfg
 * @returns {Object}
 */
const settings_snapshot = (cfg) => {
    const public_client = !!(cfg && cfg.public_client);
    return {
        name: (cfg && cfg.name) || '',
        authorize_url: (cfg && cfg.authorize_url) || '',
        token_url: (cfg && cfg.token_url) || '',
        client_id: (cfg && cfg.client_id) || '',
        client_secret: public_client ? '' : (cfg && cfg.client_secret) || '',
        public_client: public_client,
        scope: (cfg && cfg.scope) || '',
        verify_url: (cfg && cfg.verify_url) || '',
    };
};

/**
 * Records the current form as the clean baseline (after load or successful Apply).
 */
const capture_settings_baseline = () => {
    settings_baseline = settings_snapshot(read_form_values());
    settings_unsaved_draft = false;
};

/**
 * @returns {boolean}
 */
const is_settings_dirty = () => {
    if (settings_unsaved_draft) {
        return true;
    }
    if (!settings_baseline) {
        return false;
    }
    return JSON.stringify(settings_snapshot(read_form_values())) !== JSON.stringify(settings_baseline);
};

/**
 * Confirm before discarding unsaved settings edits.
 * @returns {boolean} true if it is OK to proceed (discard or nothing to lose)
 */
const confirm_discard_settings = () => {
    if (!is_settings_dirty()) {
        return true;
    }
    return confirm('You have unsaved changes. Discard them?');
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
 * Shows a short-lived status message next to the dialog actions.
 * @param {string} message
 * @param {boolean} is_error
 */
const show_save_status = (message, is_error = false) => {
    if (!ui.form.save_status) {
        return;
    }

    ui.form.save_status.text(message).toggleClass('is-error', !!is_error).addClass('is-visible');

    if (ui.form.save_status_timer) {
        clearTimeout(ui.form.save_status_timer);
    }

    ui.form.save_status_timer = setTimeout(() => {
        clear_save_status();
    }, 2500);
};

/**
 * Clears the settings status message.
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
        verify_url: ui.form.verify_url.val(),
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
    ui.verify_button.hide();
};

/**
 * Shows the post-token action buttons. Verify appears only when a verify_url is configured.
 * @param {Object} [cfg]
 */
const show_token_action_buttons = (cfg = config) => {
    ui.refresh_token_button.show();
    ui.delete_token_button.show();
    if (cfg && cfg.verify_url) {
        ui.verify_button.show();
    } else {
        ui.verify_button.hide();
    }
};

/**
 * Formats a verify proxy response for the response area.
 * @param {{http_status: number, http_status_text?: string, body?: string}} data
 * @returns {string}
 */
const format_verify_response = (data) => {
    const status_text = (data.http_status_text || '').trim();
    const status_line = `HTTP ${data.http_status}${status_text ? ` ${status_text}` : ''}`;
    let body = data.body == null ? '' : String(data.body);

    if (body) {
        try {
            body = JSON.stringify(JSON.parse(body), null, 4);
        } catch (e) {
            // leave as plain text
        }
    }

    return `${status_line}\n\n${body}`;
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
                const authorize_url = data.authorize_url;
                if (!authorize_url) {
                    set_response_area("Couldn't begin the authorization flow! err = missing authorize_url");
                    return;
                }
                console.log(`DEBUG: redirect url: ${authorize_url}`);
                window.location.assign(authorize_url);
            } else {
                const error = data.message ? data.message : 'unknown error';
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
                if (data.config) {
                    config = data.config;
                    config.public_client = !config.client_secret;
                }
                show_token_action_buttons();
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
 * Handler for the verify button. Proxies a GET to the configured verify URL
 * with the stored access token as a Bearer token.
 * @param {Event} evt
 */
const handle_verify_button = (evt) => {
    console.log('INFO: in handle_verify_button');
    clear_response_area();
    hide_action_buttons();
    show_busy();

    const url = `${API_BASE_URL}/v1/verify`;

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
            console.log('INFO: verify success');
            show_token_action_buttons();
            if (data.status === 'ok') {
                set_response_area(format_verify_response(data));
            } else {
                set_response_area(data.message || 'Verify failed');
            }
        })
        .fail((jqXHR, textStatus, errorThrown) => {
            hide_busy();
            console.log('ERROR: verify failed');
            show_token_action_buttons();
            const message =
                jqXHR.responseJSON && jqXHR.responseJSON.message
                    ? jqXHR.responseJSON.message
                    : 'Failed to verify access token';
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

    const opts = {
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
                if (data.config) {
                    config = data.config;
                    config.public_client = !config.client_secret;
                }
                show_token_action_buttons();
            }
        })
        .fail((jqXHR, textStatus, errorThrown) => {
            hide_busy();
            const message = jqXHR.responseJSON && jqXHR.responseJSON.message ? jqXHR.responseJSON.message : errorThrown;
            set_response_area(message);
        });
};

/**
 * Persists the current form as the active configuration (Apply).
 * Leaves the settings dialog open.
 * @param {Event} [evt]
 * @returns {Promise<boolean>} resolves true on success
 */
const handle_settings_apply = (evt) => {
    if (evt) {
        evt.preventDefault();
    }
    return persist_settings_form({ close_on_success: false });
};

/**
 * Saves if dirty (when there is something to save), then closes. Enter submits here.
 * @param {Event} [evt]
 * @returns {Promise<boolean>}
 */
const handle_settings_ok = (evt) => {
    if (evt) {
        evt.preventDefault();
    }

    if (!is_settings_dirty()) {
        hide_setup_dialog();
        return Promise.resolve(true);
    }

    return persist_settings_form({ close_on_success: true });
};

/**
 * Closes without saving; confirms when the form is dirty.
 * @param {Event} [evt]
 */
const handle_settings_cancel = (evt) => {
    if (evt) {
        evt.preventDefault();
    }
    if (!confirm_discard_settings()) {
        return;
    }
    hide_setup_dialog();
};

/**
 * Validates and saves the settings form.
 * @param {{ close_on_success?: boolean }} [opts]
 * @returns {Promise<boolean>}
 */
const persist_settings_form = ({ close_on_success = false } = {}) => {
    const form_config = read_form_values();
    console.log('INFO persist_settings_form, config: ', form_config);

    if (!is_config_complete(form_config)) {
        show_save_status('Name, URLs, and Client ID are required (plus Client Secret unless Public client)', true);
        return Promise.resolve(false);
    }

    const next_config = Object.assign({}, form_config);
    if (config && config.id && !settings_unsaved_draft) {
        next_config.id = config.id;
    }
    config = next_config;

    return save_config(config).then((ok) => {
        if (ok) {
            ui.login_button.show();
            capture_settings_baseline();
            handle_config_item_changed();
            if (close_on_success) {
                hide_setup_dialog();
            }
        }
        return ok;
    });
};

/**
 * Sets up the config list in the setup dialog using global values.
 */
const load_config_list_values = () => {
    ui.form.config_list.empty();

    if (!config_list.length) {
        ui.form.config_list.append(
            $(
                `<div class='config-list-empty'>No configurations yet. Use New or fill in the form and Apply / OK.</div>`,
            ),
        );
        return;
    }

    $.each(config_list, (idx, val) => {
        const $text = $(`<div class='config-list-item-text'></div>`).text(val).attr('title', val);
        const $clone = $(
            `<div class='config-list-item-icon config-list-item-clone' title='Clone'><i class="copy icon"></i></div>`,
        );
        const $trash = $(
            `<div class='config-list-item-icon config-list-item-delete' title='Delete'><i class="trash alternate icon"></i></div>`,
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
        if (config_name === config.name && !settings_unsaved_draft && !is_settings_dirty()) {
            return;
        }
        if (!confirm_discard_settings()) {
            return;
        }
        set_current_config(config_name);
        get_startup_data(config_name).then((data) => {
            // Startup data has already been copied into global data.
            populate_setup_dialog();
            capture_settings_baseline();
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

    if (!confirm_discard_settings()) {
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
    if (!confirm_discard_settings()) {
        return;
    }
    config = Object.assign({}, EMPTY_CONFIG);
    clear_current_config();
    populate_setup_dialog();
    clear_response_area();
    clear_save_status();
    capture_settings_baseline();
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
        verify_url: source.verify_url || '',
    };

    clear_current_config();
    settings_unsaved_draft = true;
    populate_setup_dialog();
    clear_response_area();
    capture_settings_baseline();
    settings_unsaved_draft = true;
    handle_config_item_changed();
    show_save_status('Cloned — rename and Apply / OK');
    ui.form.config_name.focus().select();
};

/**
 * Saves the config on the server.
 * @param {Object} config
 * @returns {Promise<boolean>} true when the server reports success
 */
const save_config = (config) => {
    set_current_config(config.name);
    ui.form.apply_button.prop('disabled', true);

    const url = `${API_BASE_URL}/v1/save_config`;

    const data = {
        name: config.name,
        authorize_url: config.authorize_url,
        token_url: config.token_url,
        client_id: config.client_id,
        client_secret: config.client_secret || '',
        scope: config.scope,
        verify_url: config.verify_url || '',
    };

    if (config.id) {
        data.id = config.id;
    }

    const opts = {
        method: 'POST',
        data: data,
        dataType: 'json',
    };

    return $.ajax(url, opts).then(
        (data) => {
            console.log('INFO: save_config success');
            process_startup_data(data);
            if (data.status) {
                if (data.status === 'ok') {
                    console.log('Successfully saved the config on the server.');
                    show_save_status('Saved');
                    return true;
                }
                show_save_status('Failed to save', true);
                handle_config_item_changed();
                return false;
            }
            show_save_status('Invalid server response', true);
            handle_config_item_changed();
            return false;
        },
        () => {
            console.log('ERROR: save_config failed');
            handle_config_item_changed();
            show_save_status('Failed to save', true);
            return false;
        },
    );
};

/**
 * Calls the API to delete a configuration from the database.
 * @param {string} config_name
 * @returns
 */
const delete_config = (config_name) => {
    const p = new Promise((resolve, reject) => {
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
    capture_settings_baseline();
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
    ui.form.verify_url.val(config.verify_url || '');
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
    ui.form.verify_url.on('keyup change paste', handle_config_item_changed);

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

    const p = new Promise((resolve, reject) => {
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

        if (data.code) {
            set_response_area(data.code);
            ui.request_token_button.show();
        } else if (data.token) {
            set_response_area(data.token);
            show_token_action_buttons();
        } else if (data.message) {
            set_response_area(data.message);
            hide_action_buttons();
        }
    }
};

/**
 * Stores the current config name (in local storage)
 * @param {string} config_name
 */
const set_current_config = (config_name = '') => {
    localStorage.setItem(CONFIG_NAME_KEY_NAME, config_name);
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
 */
const clear_current_config = () => {
    localStorage.removeItem(CONFIG_NAME_KEY_NAME);
};
