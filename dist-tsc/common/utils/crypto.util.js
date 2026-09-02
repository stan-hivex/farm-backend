"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hmacSign = hmacSign;
exports.hmacVerify = hmacVerify;
exports.encrypt = encrypt;
exports.decrypt = decrypt;
const crypto_1 = require("crypto");
const ALGORITHM = 'aes-256-cbc';
function hmacSign(data, secret) {
    return (0, crypto_1.createHmac)('sha256', secret).update(data).digest('hex');
}
function hmacVerify(data, sig, secret) {
    return hmacSign(data, secret) === sig;
}
function encrypt(text, key) {
    const iv = (0, crypto_1.randomBytes)(16);
    const keyBuf = Buffer.from(key.padEnd(32).substring(0, 32));
    const cipher = (0, crypto_1.createCipheriv)(ALGORITHM, keyBuf, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}
function decrypt(encryptedText, key) {
    const [ivHex, encHex] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const keyBuf = Buffer.from(key.padEnd(32).substring(0, 32));
    const decipher = (0, crypto_1.createDecipheriv)(ALGORITHM, keyBuf, iv);
    const decrypted = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]);
    return decrypted.toString('utf8');
}
//# sourceMappingURL=crypto.util.js.map