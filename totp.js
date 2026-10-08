const crypto = require('crypto');

function decodeBase32(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret.replace(/\s+/g, '').toUpperCase()) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw new Error(`Invalid Base32 character: ${char}`);
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTotp(secret, timestamp = Date.now()) {
  const counter = BigInt(Math.floor(timestamp / 30000));
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(counter);
  const digest = crypto.createHmac('sha1', decodeBase32(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1000000;
  return String(value).padStart(6, '0');
}

if (require.main === module) {
  const secret = process.env.TOTP_SECRET;
  if (!secret) {
    console.error('Set TOTP_SECRET in the environment');
    process.exitCode = 1;
  } else {
    console.log(generateTotp(secret));
  }
}

module.exports = { decodeBase32, generateTotp };
