# LiteAPI hotels
Flow: search (`/travel/hotels/search`) → rates → prebook (price lock) → book (FARM debited, refunded on provider failure) → booking detail/cancel (cancel hidden for non-refundable rates).
Env: `LITEAPI_API_KEY`, `LITEAPI_BASE_URL`, `LITEAPI_BOOK_BASE_URL`, `HOTEL_PROVIDER=liteapi`, `HOTELS_ENABLED`, `TRAVEL_ENABLED`, `TRAVEL_FX_MARKUP_BPS`, `TRAVEL_SERVICE_FEE_FARM`.
Sandbox caveats: sandbox key returns test hotels/rates only; prebook occasionally fails transiently (one automatic retry implemented); bookings are not real; prices in sandbox don't reflect live inventory. Use a sandbox key locally; never test with the production key.
Flights: Duffel (`DUFFEL_API_TOKEN`) — not configured; blocked.
