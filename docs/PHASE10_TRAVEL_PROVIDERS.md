# Phase 10: Travel providers (PKFARE flights, LiteAPI hotels)

Everything here is **off by default**. The code holds no inventory and no sample data.

## Flights: choosing a provider
`TRAVEL_FLIGHT_PROVIDER=duffel|pkfare` (default `duffel`). Both run through the same `FlightProvider` interface (`FLIGHT_PROVIDER` token), so
pricing, PIN, idempotency, the FARM hold, refunds, `needs_review` and admin resolve all work the same way. Flights are only enabled when
`TRAVEL_ENABLED=true` and the selected provider is configured.

### PKFARE (`src/travel/pkfare.provider.ts`)
- Docs: https://apifox.pkfare.com/apidoc/docs-site/345083 (Shopping_V4, PrecisePricing, PreciseBooking_V5, Ticketing).
- Transport: request JSON with `authentication {partnerId, sign = md5(partnerId + partnerKey)}` → base64 → `GET {base}/{api}?param=…`. Gzip responses are decompressed.
- Flow: `shoppingV4` (search) → `precisePricing` (when an offer is opened and again at booking; if B020/B021 is returned, it retries without booking codes) → `preciseBooking_V5` (within 30 min of pricing; `buyerOrder` = our booking id) → `ticketing`.
- Offer ids are stateless: `pk_` + base64url(itinerary). Nothing is stored before booking, and every booking is re-priced live.
- Passenger nationality: optional `nationality` per passenger; otherwise `PKFARE_DEFAULT_NATIONALITY` (KE).
- Error mapping: a network failure, timeout or S001/B012/B024/B025/B028/B035 means the outcome is **unknown**, so the funds stay held (`needs_review`). Any other code is a **rejection** and the FARM is refunded in full.
- Sandbox host: `https://api.pkfare.com`. PKFARE issues a separate production host after UAT certification. Any other host counts as live and is refused unless `TRAVEL_ALLOW_LIVE=true`.

### Pre-funded deposit (PKFARE payment model)
- PKFARE tickets are paid from the platform's **prepaid deposit** with PKFARE. The `Ticketing` call deducts the balance. There is no card, and no merchant fee on Prepaid.
- Users pay FARM to the platform (held, then completed on confirmation). Ops tops up the PKFARE deposit in USD from treasury, off-platform.
- If the deposit is too low, ticketing returns **B022**. The booking is then refunded in FARM and the unpaid PNR lapses on PKFARE's side.
- Ops checklist: keep the deposit at least equal to the expected 3–5 days of bookings, and set a low-balance alert in the PKFARE buyer portal. Reconcile daily: FARM `escrow_lock` completed (kind `travel_flight`, provider `pkfare`) against the PKFARE financial statement.
- Go-live steps (PKFARE UAT guide): review the docs, kick-off, development, sandbox UAT file, production co-test (top-up plus one round-trip ticket), go-live.

## Hotels: LiteAPI (`src/travel/liteapi.provider.ts`, `hotels.service.ts`)
- Enabled only with `HOTELS_ENABLED=true` and `LITEAPI_API_KEY`. `sand_…` keys are sandbox. Any other key is live and needs `TRAVEL_ALLOW_LIVE=true`.
- Endpoints (header `X-API-Key`):
  - `POST api.liteapi.travel/v3.0/hotels/rates` (search by city+country or IATA, cheapest rate per hotel)
  - `POST book.liteapi.travel/v3.0/rates/prebook`
  - `GET /prebooks/{id}` (re-read at booking for the authoritative price)
  - `POST /rates/book`
  - `PUT /bookings/{id}` (cancel)
- **Payment model: card on account (`payment.method = ACC_CREDIT_CARD`).** The customer pays FARM to the platform, and LiteAPI charges the card attached to the platform's LiteAPI account. Sandbox keys use LiteAPI's hidden test card. Production needs a real card on the account; wallet bookings are no longer supported by LiteAPI.
- App routes (JWT):
  - `POST /v1/travel/hotels/search`
  - `POST /v1/travel/hotels/prebook`
  - `POST /v1/travel/hotels/book` (KYC, PIN, `idempotency_key`, `expected_total_farm`)
  - `POST /v1/travel/hotels/bookings/:id/cancel`
- `GET /v1/travel/status` now includes `hotels {enabled, provider, sandbox}`.
- Storage: reuses `travel_bookings` with `kind='hotel'`, `provider_offer_id` = prebookId, and `clientReference` = booking id. **No migration.**
- Booking failures follow the same rules as flights: a rejection triggers a full FARM refund, and an unknown outcome goes to `needs_review` (admin resolve).
- Cancel: `confirmed → cancelling` (claimed atomically), then the provider call. FARM back = `total_farm × refund_amount / offer_amount`, rounded down to 0.01. Non-refundable rates return 0. If the provider refuses, the booking stays `confirmed`. If the outcome is unknown or the status is unexpected, it goes to `needs_review`.
- Pricing uses `TravelService.priceFarm` (KES 1:1; USD at the USDC/KES mid × (1 + `TRAVEL_FX_MARKUP_BPS`) + `TRAVEL_SERVICE_FEE_FARM`).

## Env
| Var | Default | Notes |
|---|---|---|
| TRAVEL_FLIGHT_PROVIDER | duffel | `duffel` or `pkfare` |
| PKFARE_PARTNER_ID | — | from the PKFARE business manager (secret) |
| PKFARE_PARTNER_KEY | — | secret; used only for the MD5 sign |
| PKFARE_BASE_URL | https://api.pkfare.com | sandbox; prod host issued after certification (needs TRAVEL_ALLOW_LIVE) |
| PKFARE_DEFAULT_NATIONALITY | KE | used when a passenger's nationality is not given |
| HOTELS_ENABLED | false | master switch for hotels |
| LITEAPI_API_KEY | — | secret; `sand_…` = sandbox |
| LITEAPI_BASE_URL | https://api.liteapi.travel/v3.0 | search |
| LITEAPI_BOOK_BASE_URL | https://book.liteapi.travel/v3.0 | prebook/book/cancel |
| LITEAPI_CURRENCY | USD | rate currency (USD or KES are FARM-priceable) |
| LITEAPI_GUEST_NATIONALITY | KE | |

## Partner contacts (public; not contacted)
- PKFARE: partners@pkfare.com, or the form at https://www.pkfare.com/cooperate (contact page https://www.pkfare.com/contact). The Partner ID/Key are issued by a PKFARE business manager after buyer-portal signup.
- TBO Air: apisupport@tboair.com (API integration, per https://searchapi.tboair.com/) and partners@tboholidays.com (commercial, per https://www.tboholidays.com/tboair.aspx). Registration: https://www.tboholidays.com/registration.aspx
