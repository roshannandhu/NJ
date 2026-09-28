// Run: node src/versionCompare.test.mjs
// Guards the update prompt. The regression this protects against: the banner
// compared versions with `!==`, so a server reporting an OLDER build offered a
// silent DOWNGRADE — seen live as "A new update (v1.0.0) is available!" on a
// 1.1.7 client whose backend was missing version.json.
import assert from 'node:assert';
import { isNewerVersion } from './versionCompare.js';

// The bug: older must never count as an update.
assert.equal(isNewerVersion('1.0.0', '1.1.7'), false);
assert.equal(isNewerVersion('1.1.6', '1.1.7'), false);

// Same build: nothing to offer.
assert.equal(isNewerVersion('1.1.7', '1.1.7'), false);

// Genuine updates.
assert.equal(isNewerVersion('1.1.8', '1.1.7'), true);
assert.equal(isNewerVersion('1.2.0', '1.1.7'), true);
assert.equal(isNewerVersion('2.0.0', '1.9.9'), true);

// Numeric, not lexical: '10' > '9'.
assert.equal(isNewerVersion('1.1.10', '1.1.9'), true);
assert.equal(isNewerVersion('1.1.9', '1.1.10'), false);

// Uneven depth: missing parts are 0.
assert.equal(isNewerVersion('1.2', '1.1.7'), true);
assert.equal(isNewerVersion('1.1', '1.1.0'), false);
assert.equal(isNewerVersion('1.1.0.1', '1.1.0'), true);

// Junk never triggers an install.
assert.equal(isNewerVersion('', '1.1.7'), false);
assert.equal(isNewerVersion(null, '1.1.7'), false);
assert.equal(isNewerVersion(undefined, '1.1.7'), false);
assert.equal(isNewerVersion('dev', '1.1.7'), false);
assert.equal(isNewerVersion('1.1.7-beta', '1.1.7'), false);
assert.equal(isNewerVersion('9.9.9', 'unknown'), false);

console.log('versionCompare: all assertions passed');
