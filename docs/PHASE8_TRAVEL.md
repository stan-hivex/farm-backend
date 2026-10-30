# Phase 8: Travel (flights first)

Travel is off by default. It turns on only when `TRAVEL_ENABLED=true` and a flight provider is configured. Until then, `GET /v1/travel/status` returns `enabled:false` and the app shows a "not available yet" state. The code contains no built-in or sample inventory.

## Design
- **Provider-agnostic.** `FlightProvider` (`src/travel/travel-provider.ts`) has three methods: `searchFlights`, `getOffer` and `createOrder`. Adapters map provider data into common types. `stays` is reserved for a future hotel adapter.
- **One real adapter: Duffel** (`duffel.provider.ts`, API v2).
  - Payment uses **Duffel Balance**, a prepaid platform balance.
  - Test tokens (`duffel_test_…`) hit Duffel's sandbox ("Duffel Airways").
  - Live tokens (`duffel_live_…`) are refused unless `TRAVEL_ALLOW_LIVE=true`.
- **FARM pricing (server-side only).**
  - KES offers are priced 1:1.
  - USD offers are priced at the USDC/KES **mid** rate (the existing `USDC_KES_RATE_*` sources) × (1 + `TRAVEL_FX_MARKUP_BPS`), plus `TRAVEL_SERVICE_FEE_FARM`, rounded up.
  - Offers in any other currency are shown as not bookable.
  - Duffel prices in your Duffel account currency, so use a USD balance.

## Booking flow (`POST /v1/travel/flights/book`, JWT + KYC)
1. **Idempotency.** `(user_id, idempotency_key)` is unique. Repeating a request returns the same booking and never charges twice.
2. The **PIN** is verified.
3. The offer is re-fetched from the provider and priced again. If the new price is higher than `expected_total_farm`, the call returns 409 with the new price.
4. **Hold.** In one DB transaction the wallet is debited (guarded by balance ≥ total). An `escrow_lock` transaction is created with status `processing`, a ledger debit is written, and the booking is set to `payment_held`.
5. The order is created with the provider.
   - **Success:** the hold transaction becomes `completed` and the booking becomes `confirmed`, with the PNR/booking reference.
   - **Provider rejected:** the user gets a **full refund**. The hold transaction becomes `reversed`, an `escrow_refund` credit transaction and ledger entry are written, and the booking becomes `failed_refunded`.
   - **Unknown outcome (timeout/5xx):** the booking becomes `needs_review` and the funds stay held. Nothing is refunded or rebooked automatically (this avoids double booking). An operator checks Duffel and then refunds or confirms.

## Mkulima hooks
- `search_flights` is read-only.
- `propose_flight_booking` creates a **pending** `book_flight` AI request (payload `offer_id`). It needs `book_flight` in the user's AI allowlist, and the price must be within the per-payment and daily caps.
- The user then opens the request in Travel, enters passenger details and confirms with their PIN. That booking passes `ai_action_id`, and caps are checked again.
- `POST /ai/actions/:id/confirm` refuses `book_flight` requests.

## Endpoints (`/v1/travel`)
`GET status`, `POST flights/search`, `GET flights/offers/:id`, `POST flights/book`, `GET bookings`, `GET bookings/:id`.

## Env
| Var | Default | Notes |
|---|---|---|
| TRAVEL_ENABLED | false | master switch |
| DUFFEL_API_TOKEN | (secret) | `duffel_test_…` for sandbox |
| DUFFEL_BASE_URL | https://api.duffel.com | |
| TRAVEL_ALLOW_LIVE | false | required for `duffel_live_` tokens |
| TRAVEL_FX_MARKUP_BPS | 200 | 2% over mid, max 1000 |
| TRAVEL_SERVICE_FEE_FARM | 0 | flat FARM fee per booking |

## Migration
`20261102090000_v2_phase8_travel` is additive: it adds the new `travel_bookings` table and a nullable `ai_action_requests.payload` column.

## Pricing and providers
- **Duffel flights** (https://duffel.com/pricing): $3 per order + 1% managed content, $2 per paid ancillary, 2% FX fee, and an excess search fee of $0.005 per search over a 1500:1 search-to-book ratio. There are no upfront fees, and Duffel's IATA accreditation is used.
- **Hotels (next adapter):**
  - **LiteAPI / Nuitee Connect.** The core Rates → Prebook → Book flow is free (reasonable look-to-book ratio). You earn by adding a margin (e.g. 15%), with weekly payouts. Pricing: https://docs.liteapi.travel/reference/api-pricing-usage-costs
  - **Duffel Stays.** Same account, with profit share on completed stays.
  - **Hotelbeds.** Needs a contract.
  - Amadeus Self-Service was decommissioned on July 17, 2026; only Amadeus Enterprise (with a contract) remains.
