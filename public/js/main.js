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
    ui.form.username = $('#username_input');
    ui.form.client_id = $('#client_id_input');
    ui.form.client_secret = $('#client_secret_input');
    // ui.form.cancel = $("#form_cancel_button");
    // ui.form.submit = $('#form_submit_button');

    ui.login_button.click(handle_login_button);
    ui.refresh_token_button.click(handle_refresh_button);
    ui.request_token_button.click(handle_request_token);
    ui.delete_token_button.click(handle_delete_token);

    // ui.form.cancel.click(handle_form_cancel);
    // ui.form.submit.click(handle_form_submit);

    $('form#oauth_config_form').on('submit', evt => {
        evt.stopPropagation();
        evt.preventDefault();
        handle_form_submit(evt);
    });

    ui.setup_button.click(handle_setup);

    load_config();

    if (config.username && config.client_id && config.client_secret) {
        ui.login_button.show();
        do_startup_actions();
    } else {
        show_setup_dialog();
    }
});

function show_busy() {
    ui.overlay.show();
    ui.busy_overlay.show();
}

function hide_busy() {
    ui.overlay.hide();
    ui.busy_overlay.hide();
}

function hide_action_buttons(hide_all = false) {
    if (hide_all) {
        ui.login_button.hide();
    }
    ui.refresh_token_button.hide();
    ui.request_token_button.hide();
    ui.delete_token_button.hide();
}

function set_response_area(s) {
    if (typeof s === 'object') {
        s = JSON.stringify(s, null, 4);
    }
    ui.response_area.text(s);
}

function clear_response_area() {
    set_response_area('');
}

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

function handle_login_button(evt) {
    console.log('INFO => in handle_login_button');
    hide_action_buttons();
    clear_response_area();
    show_busy();

    const state = util.get_state();

    const url = `${api_base_url}/v1/save_state_data`;

    const opts = {
        method: 'POST',
        data: {
            client_id: config.client_id,
            client_secret: config.client_secret,
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
            debugger;
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
            api_server: config.api_server,
            client_id: config.client_id,
            client_secret: config.client_secret,
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

function handle_delete_token(evt) {
    hide_action_buttons();
    set_response_area('');
    show_busy();

    const url = `${api_base_url}/v1/delete_token`;

    const opts = {
        method: 'POST',
        data: {
            client_id: config.client_id,
            client_secret: config.client_secret,
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
            api_server: config.api_server,
            client_id: config.client_id,
            client_secret: config.client_secret,
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
            debugger;
            hide_busy();
            set_response_area(errorThrown);
        });
}

function handle_form_cancel(evt) {
    ui.dialog.hide();
    ui.overlay.hide();
}

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
        do_startup_actions();
    } else {
        alert('All fields are required!');
    }
}

// Reads configuration data from cookies into the global config object, and sets the values into the form.
function load_config() {
    config.username = localStorage.getItem(username_cookie_name);
    config.client_id = localStorage.getItem(client_id_cookie_name);
    config.client_secret = localStorage.getItem(client_secret_cookie_name);
    config.api_server = localStorage.getItem(api_server_cookie_name);

    if (!config.api_server) {
        // Set a default.
        config.api_server = 'lntxweb1';
    }

    ui.form.username.val(config.username);
    ui.form.client_id.val(config.client_id);
    ui.form.client_secret.val(config.client_secret);

    $(`input[value=${config.api_server}]`).prop('checked', true);
}

function save_config(config) {
    localStorage.setItem(username_cookie_name, config.username);
    localStorage.setItem(client_id_cookie_name, config.client_id);
    localStorage.setItem(client_secret_cookie_name, config.client_secret);
    localStorage.setItem(api_server_cookie_name, config.api_server);
}

function handle_setup(evt) {
    show_setup_dialog();
}

function show_setup_dialog() {
    ui.overlay.show();
    ui.dialog.show();
}

function do_startup_actions() {
    console.log('INFO => in handle_refresh_button');
    clear_response_area();

    const url = `${api_base_url}/v1/get_startup_data`;

    const opts = {
        method: 'POST',
        data: {
            client_id: config.client_id,
            client_secret: config.client_secret,
            username: config.username
        },
        dataType: 'json'
    };

    $.ajax(url, opts)
        .then((data, textStatus, jqXHR) => {
            console.log('INFO => get_startup_data success');
            if ('public_ip' in data) {
                public_ip = data.public_ip;
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
        .fail((jqXHR, textStatus, errorThrown) => {
            console.log('ERROR => get_startup_data failed');
        });
}
