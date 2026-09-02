"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveDepositCreditAmount = resolveDepositCreditAmount;
function resolveDepositCreditAmount(transaction, deposit) {
    const normalizeAmount = (amount) => {
        const n = Number(amount ?? 0);
        if (!Number.isFinite(n))
            return 0;
        return Math.round(n * 100) / 100;
    };
    const metadata = transaction?.metadata ?? {};
    const depositMetadata = deposit?.metadata ?? {};
    if (deposit?.amount !== undefined && deposit?.amount !== null) {
        const depositAmount = normalizeAmount(deposit.amount);
        if (depositAmount > 0)
            return depositAmount;
    }
    if (metadata?.amount_fiat !== undefined && metadata?.amount_fiat !== null) {
        const fiatAmount = normalizeAmount(metadata.amount_fiat);
        if (fiatAmount > 0)
            return fiatAmount;
    }
    if (depositMetadata?.amount_fiat !== undefined && depositMetadata?.amount_fiat !== null) {
        const depositFiatAmount = normalizeAmount(depositMetadata.amount_fiat);
        if (depositFiatAmount > 0)
            return depositFiatAmount;
    }
    if (metadata?.amount_farm !== undefined && metadata?.amount_farm !== null) {
        const farmAmount = normalizeAmount(metadata.amount_farm);
        if (farmAmount > 0)
            return farmAmount;
    }
    if (transaction?.amount !== undefined && transaction?.amount !== null) {
        const transactionAmount = normalizeAmount(transaction.amount);
        if (transactionAmount > 0)
            return transactionAmount;
    }
    return 0;
}
//# sourceMappingURL=deposit.utils.js.map