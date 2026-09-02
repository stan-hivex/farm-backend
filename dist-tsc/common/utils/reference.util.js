"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTxReference = generateTxReference;
exports.generateEscrowReference = generateEscrowReference;
exports.generateWalletAddress = generateWalletAddress;
exports.generateOtp = generateOtp;
exports.generateReferralCode = generateReferralCode;
function generateTxReference() {
    return `tx_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}
function generateEscrowReference() {
    return `escrow_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}
function generateWalletAddress(prefix = 'WAL', secret) {
    const secretPart = secret ? `_${secret.slice(0, 6).toUpperCase()}` : '';
    return `${prefix}_${Math.random().toString(36).slice(2, 10).toUpperCase()}${secretPart}_${Date.now().toString(36)}`;
}
function generateOtp(length = 6) {
    return Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
}
function generateReferralCode() {
    return `REF_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}
//# sourceMappingURL=reference.util.js.map