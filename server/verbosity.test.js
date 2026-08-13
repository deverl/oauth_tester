const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { init_verbosity, is_verbose } = require('./verbosity');

describe('verbosity', () => {
    beforeEach(() => {
        init_verbosity({ env: {}, argv: ['node', 'bin/www'] });
    });

    it('is off by default', () => {
        assert.equal(is_verbose(), false);
    });

    it('turns on for VERBOSITY=1', () => {
        assert.equal(init_verbosity({ env: { VERBOSITY: '1' }, argv: ['node'] }), true);
        assert.equal(is_verbose(), true);
    });

    it('turns on for VERBOSITY=true (case-insensitive)', () => {
        assert.equal(init_verbosity({ env: { VERBOSITY: 'TRUE' }, argv: ['node'] }), true);
    });

    it('stays off for VERBOSITY=false / 0 / no / off', () => {
        for (const v of ['false', '0', 'no', 'off', 'FALSE', '  off  ']) {
            assert.equal(init_verbosity({ env: { VERBOSITY: v }, argv: ['node'] }), false, v);
        }
    });

    it('turns on for --verbose', () => {
        assert.equal(init_verbosity({ env: {}, argv: ['node', '--verbose'] }), true);
    });

    it('turns on for -v', () => {
        assert.equal(init_verbosity({ env: {}, argv: ['node', '-v'] }), true);
    });

    it('turns on when flag set even if VERBOSITY=false', () => {
        assert.equal(init_verbosity({ env: { VERBOSITY: 'false' }, argv: ['node', '--verbose'] }), true);
    });
});
