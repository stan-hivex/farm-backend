import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { ToolSpec } from './ai-provider';

const n = (v: unknown) => (v == null ? null : Number(v));
const limitArg = (a: Record<string, unknown>, d = 10) =>
  Math.min(Math.max(Number(a.limit ?? d) || d, 1), 25);

/** Read-only tools. Every query is scoped to the authenticated userId; the model never chooses whose data is read. */
@Injectable()
export class AiToolsService {
  constructor(private readonly prisma: PrismaService) {}

  specs(): ToolSpec[] {
    const noArgs = {
      type: 'object',
      properties: {},
      additionalProperties: false,
    };
    const lim = {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: 25 } },
      additionalProperties: false,
    };
    return [
      {
        type: 'function',
        function: {
          name: 'get_wallet',
          description: "The user's FARM wallet balance (1 FARM = 1 KSh).",
          parameters: noArgs,
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_transactions',
          description: "The user's most recent wallet transactions.",
          parameters: lim,
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_investments',
          description: "The user's investments in listed projects.",
          parameters: lim,
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_invoices',
          description:
            'Invoices of businesses the user is an active member of.',
          parameters: lim,
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_projects',
          description: 'Projects the user holds tokens in.',
          parameters: lim,
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_spend_permissions',
          description:
            "The user's AI spending caps and whether AI payments are allowed.",
          parameters: noArgs,
        },
      },
      {
        type: 'function',
        function: {
          name: 'search_flights',
          description:
            'Search real flight offers (prices in FARM). Airports are 3-letter IATA codes, e.g. NBO, MBA, KIS.',
          parameters: {
            type: 'object',
            properties: {
              origin: { type: 'string' },
              destination: { type: 'string' },
              departure_date: { type: 'string', description: 'YYYY-MM-DD' },
              return_date: { type: 'string' },
              adults: { type: 'integer', minimum: 1, maximum: 9 },
            },
            required: ['origin', 'destination', 'departure_date', 'adults'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'propose_flight_booking',
          description:
            'Propose booking a flight offer from search_flights. Only creates a pending request; the user adds passenger details and confirms with their PIN in the app. Never claim it is booked.',
          parameters: {
            type: 'object',
            properties: { offer_id: { type: 'string' } },
            required: ['offer_id'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'propose_intent_payment',
          description:
            'Propose paying a business payment request (payment_intent_id shared by the business). Only creates a pending request; the user confirms with their PIN. The amount is set by the business.',
          parameters: {
            type: 'object',
            properties: { payment_intent_id: { type: 'string' } },
            required: ['payment_intent_id'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_agent_payment_requests',
          description:
            'Pending payment requests from businesses the user has authorized (agent payments). Read-only.',
          parameters: noArgs,
        },
      },
      {
        type: 'function',
        function: {
          name: 'propose_payment',
          description:
            'Propose sending FARM to a recipient (username, phone or wallet address). This only creates a pending request; the user must confirm it in the app with their PIN. Never claim a payment was sent.',
          parameters: {
            type: 'object',
            properties: {
              recipient_identifier: { type: 'string' },
              amount: { type: 'number', exclusiveMinimum: 0 },
              description: { type: 'string', maxLength: 140 },
            },
            required: ['recipient_identifier', 'amount'],
            additionalProperties: false,
          },
        },
      },
    ];
  }

  async run(
    userId: string,
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    switch (name) {
      case 'get_wallet': {
        const w = await this.prisma.wallets.findFirst({
          where: { user_id: userId, is_active: true },
        });
        if (!w) return { wallet: null };
        return {
          currency: w.currency,
          balance: n(w.balance),
          locked: n(w.locked_balance),
          available: Number(w.balance ?? 0) - Number(w.locked_balance ?? 0),
          frozen: w.is_frozen,
        };
      }
      case 'get_transactions': {
        const w = await this.prisma.wallets.findMany({
          where: { user_id: userId },
          select: { id: true },
        });
        const ids = w.map((x) => x.id);
        if (!ids.length) return { transactions: [] };
        const rows = await this.prisma.transactions.findMany({
          where: {
            OR: [
              { sender_wallet_id: { in: ids } },
              { receiver_wallet_id: { in: ids } },
            ],
          },
          orderBy: { created_at: 'desc' },
          take: limitArg(args),
        });
        return {
          transactions: rows.map((t) => ({
            reference: t.transaction_reference,
            type: t.transaction_type,
            direction:
              t.sender_wallet_id && ids.includes(t.sender_wallet_id)
                ? 'out'
                : 'in',
            amount: n(t.amount),
            fee: n(t.fee),
            status: t.status,
            description: t.description,
            date: t.created_at,
          })),
        };
      }
      case 'get_investments': {
        const rows = await this.prisma.user_investments.findMany({
          where: { user_id: userId },
          include: {
            investment_projects: {
              select: { project_name: true, roi_percent: true, status: true },
            },
          },
          orderBy: { invested_at: 'desc' },
          take: limitArg(args),
        });
        return {
          investments: rows.map((r) => ({
            project: r.investment_projects?.project_name ?? null,
            amount: n(r.amount),
            expected_roi: n(r.expected_roi),
            status: r.status,
            invested_at: r.invested_at,
            maturity_date: r.maturity_date,
          })),
        };
      }
      case 'get_invoices': {
        const m = await this.prisma.business_members.findMany({
          where: { user_id: userId, is_active: true },
          select: { business_id: true },
        });
        if (!m.length) return { invoices: [] };
        const rows = await this.prisma.business_invoices.findMany({
          where: { business_id: { in: m.map((x) => x.business_id) } },
          orderBy: { created_at: 'desc' },
          take: limitArg(args),
        });
        return {
          invoices: rows.map((i) => ({
            number: i.invoice_number,
            status: i.status,
            currency: i.currency,
            total: n(i.total),
            due_date: i.due_date,
            paid_at: i.paid_at,
          })),
        };
      }
      case 'get_projects': {
        const rows = await this.prisma.project_investments.findMany({
          where: { user_id: userId },
          include: {
            project: {
              select: { title: true, status: true, roi_percentage: true },
            },
          },
          orderBy: { created_at: 'desc' },
          take: limitArg(args),
        });
        return {
          holdings: rows.map((r) => ({
            project: r.project?.title ?? null,
            tokens: n(r.tokens_bought),
            paid: n(r.amount_paid),
            status: r.status,
          })),
        };
      }
      default:
        return { error: 'unknown tool' };
    }
  }
}
