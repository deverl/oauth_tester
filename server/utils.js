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

module.exports.sanitize_TF = sanitize_TF;
module.exports.force_int = force_int;
