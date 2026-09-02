export declare class FieldEncryption {
    private encryptionKey;
    private algorithm;
    constructor(encryptionKeyHex: string);
    encrypt(plaintext: string): string;
    decrypt(encrypted: string): string;
    static generateKey(): string;
}
export declare let fieldEncryption: FieldEncryption;
export declare function initializeFieldEncryption(encryptionKeyHex: string): void;
