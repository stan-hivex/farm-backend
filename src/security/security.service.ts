import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);

  getSettings() {
    this.logger.log('Returning security settings');
    return {
      two_factor: {
        enabled: false,
        provider: 'otp',
        enforce_for_withdrawals: true,
      },
      require_pin_for_transactions: true,
      session: {
        timeout_minutes: 60,
        refresh_grace_minutes: 5,
      },
      password_policy: {
        min_length: 8,
        require_numbers: true,
        require_symbols: false,
        require_mixed_case: false,
        expire_days: 0,
      },
      rate_limits: {
        login_attempts: { window_minutes: 15, max_attempts: 5 },
      },
      kyc: {
        require_verification_for_withdrawals: true,
        min_level_for_high_value: 2,
      },
      maintenance_mode: false,
      allowed_ip_ranges: [],
    };
  }
}
