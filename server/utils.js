/**
 * Tries to determine the truthfullness of the input and return a bool representation of it.
 * @param {*} value
 * @param {boolean} defaultValue
 * @returns {boolean}
 */
const sanitize_TF = (value, defaultValue = false) => {
    let result = defaultValue;
    if (value !== null) {
        if (typeof value === 'string') {
            const lc_value = value.toLowerCase();
            if (lc_value === 'true' || lc_value === '1' || lc_value === 'yes' || lc_value === 'y') {
                result = true;
            } else if (lc_value === 'false' || lc_value === '0' || lc_value === 'no' || lc_value === 'n') {
                result = false;
            }
        } else if (typeof value === 'boolean') {
            result = value;
        } else if (typeof value === 'number') {
            result = value == 0 ? 0 : 1;
        }
    }
    return result;
};

/**
 * Try to force the input to an integer.
 * @param {*} value
 * @param {integer} defaultValue
 * @returns {integer}
 */
const force_int = (value, defaultValue = 0) => {
    try {
        value = Number(value) | 0;
    } catch (e) {
        value = defaultValue;
    }

    return value;
};

const ansi = {
    Reset: '\x1b[0m',
    Bright: '\x1b[1m',
    Dim: '\x1b[2m',
    Underscore: '\x1b[4m',
    Blink: '\x1b[5m',
    Reverse: '\x1b[7m',
    Hidden: '\x1b[8m',
    FgBlack: '\x1b[30m',
    FgRed: '\x1b[31m',
    FgGreen: '\x1b[32m',
    FgYellow: '\x1b[33m',
    FgBlue: '\x1b[34m',
    FgMagenta: '\x1b[35m',
    FgCyan: '\x1b[36m',
    FgWhite: '\x1b[37m',
    BgBlack: '\x1b[40m',
    BgRed: '\x1b[41m',
    BgGreen: '\x1b[42m',
    BgBlue: '\x1b[44m',
    BgMagenta: '\x1b[45m',
    BgCyan: '\x1b[46m',
    BgWhite: '\x1b[47m',
};

const infoMsg = (str) => {
    const { Reset, Bright, FgGreen } = ansi;
    console.log(`${Reset}${Bright}${FgGreen}${str}${Reset}`);
};

module.exports.sanitize_TF = sanitize_TF;
module.exports.force_int = force_int;
module.exports.infoMsg = infoMsg;
