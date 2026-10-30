# LiteAPI hotels
Flow: search (`/travel/hotels/search`) → rates → prebook (price lock) → book (FARM debited, refunded on provider failure) → booking detail/cancel (cancel hidden for non-refundable rates).
Env: `LITEAPI_API_KEY`, `LITEAPI_BASE_URL`, `LITEAPI_BOOK_BASE_URL`, `HOTEL_PROVIDER=liteapi`, `HOTELS_ENABLED`, `TRAVEL_ENABLED`, `TRAVEL_FX_MARKUP_BPS`, `TRAVEL_SERVICE_FEE_FARM`.
Sandbox caveats: sandbox key returns test hotels/rates only; prebook occasionally fails transiently (one automatic retry implemented); bookings are not real; prices in sandbox don't reflect live inventory. Use a sandbox key locally; never test with the production key.
## Booking through Mkulima
`search_hotels` (city + country code, dates, adults) returns up to 5 priced offers, cheapest first. `propose_hotel_booking` prebooks (locks price) and creates a pending `book_hotel` action (10 min TTL), subject to the user's AI caps, allowed actions and the Hotels category. `POST /api/v1/ai/actions/:id/confirm` with the PIN calls the same `HotelsService.book` (PIN check, re-price, FARM hold, idempotency key `ai-<id>`), guest = profile name/email/phone. Provider refusals refund FARM and mark the action failed.

Flights: PKFARE by default (`PKFARE_*`); Duffel only if `TRAVEL_FLIGHT_PROVIDER=duffel`. Not configured → not available.
