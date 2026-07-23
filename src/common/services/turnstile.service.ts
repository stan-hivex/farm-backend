import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface TurnstileVerifyResponse {
  success: boolean;
  challenge_ts: string;
  hostname: string;
  'error-codes': string[];
  score?: number;
  score_reason?: string[];
}

@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);
  private readonly TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

  constructor(private cfg: ConfigService) {}

  /**
   * Verify a Turnstile token with Cloudflare
   * @param token - The cf_turnstile_response token from client
   * @param remoteIp - Client IP for additional validation
   * @throws BadRequestException if token is missing or invalid
   */
  async verifyToken(token?: string, remoteIp?: string): Promise<TurnstileVerifyResponse> {
    if (!token) {
      throw new BadRequestException('Turnstile token required');
    }

    const secret = this.cfg.get<string>('TURNSTILE_SECRET_KEY');
    if (!secret) {
      this.logger.error('TURNSTILE_SECRET_KEY not configured');
      throw new Error('Turnstile verification not configured on server');
    }

    try {
      const response = await axios.post<TurnstileVerifyResponse>(
        this.TURNSTILE_VERIFY_URL,
        {
          secret,
          response: token,
          remoteip: remoteIp,
        },
        {
          timeout: 5000,
          headers: { 'Content-Type': 'application/json' },
        },
      );

      const data = response.data;

      if (!data.success) {
        const errors = data['error-codes']?.join(', ') || 'unknown error';
        this.logger.warn(`Turnstile verification failed: ${errors} for IP=${remoteIp}`);
        throw new BadRequestException(`Captcha validation failed: ${errors}`);
      }

      this.logger.debug(`Turnstile verified for hostname=${data.hostname} challenge_ts=${data.challenge_ts}`);
      return data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error(`Turnstile API error: ${error.message} status=${error.response?.status}`);
        throw new BadRequestException('Captcha verification service unavailable');
      }
      throw error;
    }
  }

  /**
   * Verify token and check for minimum score (for managed challenges)
   * @param token - The cf_turnstile_response token
   * @param minScore - Minimum score required (0.0 - 1.0), only used with managed challenges
   * @param remoteIp - Client IP
   */
  async verifyWithScore(
    token?: string,
    minScore = 0.5,
    remoteIp?: string,
  ): Promise<TurnstileVerifyResponse> {
    const result = await this.verifyToken(token, remoteIp);

    if (result.score !== undefined && result.score < minScore) {
      this.logger.warn(`Turnstile score too low: ${result.score} < ${minScore}`);
      throw new BadRequestException('Captcha score too low, possible bot activity');
    }

    return result;
  }
}
