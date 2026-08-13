const FALSY = new Set(['', '0', 'false', 'no', 'off']);

let verbose = false;

const env_enables = (env) => {
    if (!Object.hasOwn(env, 'VERBOSITY') || env.VERBOSITY == null) {
        return false;
    }
    const v = String(env.VERBOSITY).trim().toLowerCase();
    return !FALSY.has(v);
};

const argv_enables = (argv) => argv.includes('--verbose') || argv.includes('-v');

/**
 * Resolve verbose mode from env and argv. Call once at process startup.
 * @param {{ env?: NodeJS.ProcessEnv, argv?: string[] }} [opts]
 * @returns {boolean}
 */
const init_verbosity = ({ env = process.env, argv = process.argv } = {}) => {
    verbose = env_enables(env) || argv_enables(argv);
    return verbose;
};

const is_verbose = () => verbose;

module.exports = {
    init_verbosity,
    is_verbose,
};
