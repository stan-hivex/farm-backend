export declare function hmacSign(data: string, secret: string): string;
export declare function hmacVerify(data: string, sig: string, secret: string): boolean;
export declare function encrypt(text: string, key: string): string;
export declare function decrypt(encryptedText: string, key: string): string;
