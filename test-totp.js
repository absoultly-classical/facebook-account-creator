const assert = require('assert');
const { decodeBase32, generateTotp } = require('./totp');

const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
assert.strictEqual(decodeBase32(secret).toString('ascii'), '12345678901234567890');
assert.strictEqual(generateTotp(secret, 59000), '287082');

console.log('TOTP tests passed');
