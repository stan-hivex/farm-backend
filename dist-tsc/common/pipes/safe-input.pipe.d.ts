import { PipeTransform } from '@nestjs/common';
export declare class SafeInputValidationPipe implements PipeTransform {
    private readonly suspiciousPatterns;
    private readonly allowRawStringFields;
    transform(value: unknown, metadata: {
        type?: string;
        data?: string;
    }): any;
    private containsSuspiciousPayload;
}
