export declare class ApiKeyHashService {
    private static readonly BCRYPT_ROUNDS;
    static generateAndHashKey(): {
        raw_key: string;
        key_hash: string;
    };
    static hashKey(key: string): string;
    static compareKeys(incomingKey: string, storedHash: string): Promise<boolean>;
}
