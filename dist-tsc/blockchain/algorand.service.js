"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var AlgorandService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlgorandService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const algosdk_1 = __importDefault(require("algosdk"));
let AlgorandService = AlgorandService_1 = class AlgorandService {
    constructor(cfg) {
        this.cfg = cfg;
        this.logger = new common_1.Logger(AlgorandService_1.name);
        this.algodClient = new algosdk_1.default.Algodv2(cfg.get('ALGORAND_TOKEN', ''), cfg.get('ALGORAND_NODE_URL', 'https://testnet-api.algonode.cloud'), '');
        this.indexerClient = new algosdk_1.default.Indexer('', cfg.get('ALGORAND_INDEXER_URL', 'https://testnet-idx.algonode.cloud'), '');
        this.farmAsaId = Number(cfg.get('FARM_ASA_ID', '0'));
    }
    async getFarmBalance(address) {
        try {
            const info = await this.algodClient.accountInformation(address).do();
            const asset = (info.assets ?? []).find((a) => a['asset-id'] === this.farmAsaId);
            return asset ? Number(asset.amount) / Math.pow(10, 6) : 0;
        }
        catch {
            return 0;
        }
    }
    async transferFarm(fromMnemonic, toAddress, amount) {
        const fromAccount = algosdk_1.default.mnemonicToSecretKey(fromMnemonic);
        const suggestedParams = await this.algodClient.getTransactionParams().do();
        const amountMicroFarm = Math.round(amount * Math.pow(10, 6));
        const txn = algosdk_1.default.makeAssetTransferTxnWithSuggestedParamsFromObject({
            sender: fromAccount.addr,
            receiver: toAddress,
            amount: amountMicroFarm,
            assetIndex: this.farmAsaId,
            suggestedParams,
        });
        const signed = txn.signTxn(fromAccount.sk);
        const response = await this.algodClient.sendRawTransaction(signed).do();
        await algosdk_1.default.waitForConfirmation(this.algodClient, response.txid, 4);
        this.logger.log(`Algorand transfer: ${response.txid} | ${amount} FARM → ${toAddress}`);
        return response.txid;
    }
    generateWallet() {
        const account = algosdk_1.default.generateAccount();
        return {
            address: account.addr.toString(),
            mnemonic: algosdk_1.default.secretKeyToMnemonic(account.sk),
        };
    }
    isValidAddress(address) {
        return algosdk_1.default.isValidAddress(address);
    }
};
exports.AlgorandService = AlgorandService;
exports.AlgorandService = AlgorandService = AlgorandService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], AlgorandService);
//# sourceMappingURL=algorand.service.js.map