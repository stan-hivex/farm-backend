import { Injectable } from '@nestjs/common';
import { MarketplaceService } from '../project-marketplace/marketplace.service';

/**
 * Legacy /v1/investments routes, now backed by the unified V2 marketplace.
 * No ROI / guaranteed return is ever returned; investing goes through the
 * same eligibility, risk-disclosure and atomic capacity checks.
 */
@Injectable()
export class InvestmentsService {
  constructor(private readonly market: MarketplaceService) {}

  listProjects(query: any) {
    return this.market.list(query ?? {});
  }

  getProject(id: string, userId?: string) {
    return this.market.detail(id, userId);
  }

  invest(
    userId: string,
    projectId: string,
    dto: {
      amount: number;
      pin: string;
      accept_risk?: boolean;
      disclosure_version?: string;
    },
    ip?: string,
  ) {
    return this.market.invest(userId, projectId, dto, ip);
  }

  getMyInvestments(userId: string, query: any) {
    return this.market.history(userId, query ?? {});
  }
}
