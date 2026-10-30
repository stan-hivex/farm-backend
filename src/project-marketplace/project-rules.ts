/** V2 Phase 4 investment rules: one place for sectors, statuses and gates. */
export const SECTORS = [
  'agriculture',
  'energy',
  'real_estate',
  'infrastructure',
  'technology',
  'manufacturing',
  'other',
] as const;
export type Sector = (typeof SECTORS)[number];

export const INSTRUMENT_TYPES = [
  'equity',
  'debt',
  'revenue_share',
  'asset_backed',
  'other',
] as const;

export const DOCUMENT_KINDS = [
  'business_plan',
  'financial_statements',
  'financial_projections',
  'licence_permit',
  'land_title_lease',
  'pitch_deck',
  'valuation_report',
  'legal_agreement',
  'environmental_assessment',
  'other',
] as const;
/** Documents a business must attach before a project can be submitted. */
export const REQUIRED_DOCUMENTS = [
  'business_plan',
  'financial_statements',
] as const;
export const DOCUMENT_VISIBILITY = ['public', 'investors', 'admin'] as const;

/** Project lifecycle. Every step after `submitted` is an explicit admin action. */
export const PROJECT_STATUSES = [
  'draft',
  'submitted', // = Under Review
  'more_info_required',
  'approved',
  'rejected',
  'listed',
  'funded',
  'closed',
  'cancelled',
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** Business-editable states. */
export const EDITABLE: string[] = ['draft', 'more_info_required'];
/** Legacy admin-created projects used `open`; treat as listed. */
export const INVESTABLE: string[] = ['listed', 'open'];
export const MARKET_VISIBLE: string[] = ['listed', 'open', 'funded', 'closed'];

/** Allowed admin transitions (never automatic). */
export const ADMIN_TRANSITIONS: Record<
  string,
  { from: string[]; to: ProjectStatus }
> = {
  start_review: { from: ['submitted'], to: 'submitted' },
  request_info: { from: ['submitted'], to: 'more_info_required' },
  approve: { from: ['submitted'], to: 'approved' },
  reject: {
    from: ['submitted', 'more_info_required', 'approved'],
    to: 'rejected',
  },
  list: { from: ['approved'], to: 'listed' },
  unlist: { from: ['listed'], to: 'approved' },
  close: { from: ['listed', 'funded', 'open'], to: 'closed' },
  cancel: { from: ['approved', 'listed', 'funded', 'open'], to: 'cancelled' },
};

/** Bump when the disclosure text changes; investors must accept the current version. */
export const RISK_DISCLOSURE_VERSION = '2026-10-v1';
export const RISK_DISCLOSURE_TEXT = [
  'Investing in projects is risky. You can lose some or all of the money you invest.',
  'Returns are not guaranteed. Any figures a business shares are its own estimates, not promises by FARM.',
  'Your investment may be hard or impossible to sell or withdraw before the project ends.',
  'FARM reviews projects before listing them, but this is not investment advice or an endorsement.',
  'Only invest money you can afford to lose, and spread your money across different investments.',
];

/**
 * Investor eligibility. `manual` (default): an admin must mark the investor
 * eligible. `kyc`: KYC-verified users are eligible unless an admin restricted them.
 * The user/business owner decides which rule applies (see open questions).
 */
export function eligibilityMode(): 'manual' | 'kyc' {
  return process.env.INVESTOR_ELIGIBILITY_MODE === 'kyc' ? 'kyc' : 'manual';
}
/** Optional per-project cap for non-sophisticated investors (0 = no cap). */
export function retailCapPerProject(): number {
  const n = Number(process.env.INVESTOR_RETAIL_CAP_PER_PROJECT ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Strip every guaranteed-return / ROI field before a project leaves the API. */
export const HIDDEN_RETURN_FIELDS = [
  'roi_percent',
  'roi_percentage',
  'expected_roi',
];
export function stripReturns<T extends Record<string, any>>(o: T): T {
  const c: any = { ...o };
  for (const k of HIDDEN_RETURN_FIELDS) delete c[k];
  return c;
}
