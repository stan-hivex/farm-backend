import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class SafeInputValidationPipe implements PipeTransform {
  private readonly suspiciousPatterns = [
    /[\u0000-\u001f\u007f]/,
    /--/,
    /\/\*/,
    /\*\//,
    /;/,
    /\b(?:union|select|insert|update|delete|drop|alter|create|truncate|grant|revoke|exec|execute|waitfor|declare|benchmark|sleep)\b/i,
    /(?:\bor\b|\band\b)\s+\d+\s*=\s*\d+/i,
  ];

  transform(value: unknown, metadata: { type?: string; data?: string }) {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'string') {
      if (this.containsSuspiciousPayload(value)) {
        throw new BadRequestException(
          `Rejected suspicious input in ${metadata.type ?? 'request'}${metadata.data ? ` for ${metadata.data}` : ''}`,
        );
      }
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.transform(item, metadata));
    }

    if (value && typeof value === 'object') {
      const result = value as Record<string, unknown>;
      for (const [key, entryValue] of Object.entries(result)) {
        result[key] = this.transform(entryValue, { ...metadata, data: key });
      }
      return result;
    }

    return value;
  }

  private containsSuspiciousPayload(input: string): boolean {
    const trimmed = input.trim();
    if (!trimmed) {
      return false;
    }

    return this.suspiciousPatterns.some((pattern) => pattern.test(trimmed));
  }
}
