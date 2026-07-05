import { SetMetadata } from '@nestjs/common';

export interface OwnershipConfig {
  param?: string;
  source?: 'params' | 'body' | 'query';
  userProperty?: string;
  allowAdmin?: boolean;
}

export const OWNERSHIP_KEY = 'ownership';
export const RequireOwnership = (config: OwnershipConfig | string) => {
  const normalized: OwnershipConfig = typeof config === 'string'
    ? { param: config, source: 'params', userProperty: 'id', allowAdmin: true }
    : {
        param: config.param ?? 'id',
        source: config.source ?? 'params',
        userProperty: config.userProperty ?? 'id',
        allowAdmin: config.allowAdmin ?? true,
      };

  return SetMetadata(OWNERSHIP_KEY, normalized);
};
