/** Provider-agnostic travel types. Adapters map provider responses into these. */
export interface FlightSearch {
  origin: string;
  destination: string;
  departure_date: string;
  return_date?: string;
  adults: number;
  cabin_class?: 'economy' | 'premium_economy' | 'business' | 'first';
}
export interface FlightSegment {
  origin: string;
  destination: string;
  departing_at: string;
  arriving_at: string;
  carrier: string;
  operating_carrier: string;
  flight_number: string;
  duration?: string | null;
}
export interface FlightSlice {
  origin: string;
  destination: string;
  duration?: string | null;
  segments: FlightSegment[];
}
export interface FlightOffer {
  id: string;
  provider: string;
  total_amount: number;
  total_currency: string;
  expires_at?: string | null;
  owner: string;
  owner_logo?: string | null;
  slices: FlightSlice[];
  passengers: { id: string; type?: string | null }[];
  refundable?: boolean | null;
  changeable?: boolean | null;
  requires_instant_payment?: boolean | null;
  documents_required?: boolean | null;
  live_mode: boolean;
  /** Opaque provider data needed to book (never shown to users). */
  provider_data?: Record<string, unknown>;
}
export interface Passenger {
  id: string;
  title: 'mr' | 'ms' | 'mrs' | 'miss' | 'dr';
  given_name: string;
  family_name: string;
  gender: 'm' | 'f';
  born_on: string;
  email: string;
  phone_number: string;
  /** ISO-3166 alpha-2; some providers (PKFARE) require it. */
  nationality?: string;
}
export interface FlightOrder {
  id: string;
  booking_reference: string | null;
  total_amount: number;
  total_currency: string;
  live_mode: boolean;
}

/** Thrown when the provider definitely did not book (safe to refund). */
export class ProviderRejectedError extends Error {}
/** Thrown when the outcome is unknown (timeout / 5xx). Funds stay held for review. */
export class ProviderUnknownError extends Error {}

export const FLIGHT_PROVIDER = 'FLIGHT_PROVIDER';
export const HOTEL_PROVIDER = 'HOTEL_PROVIDER';

export interface FlightProvider {
  readonly name: string;
  isConfigured(): boolean;
  isSandbox(): boolean;
  searchFlights(q: FlightSearch): Promise<FlightOffer[]>;
  getOffer(id: string): Promise<FlightOffer>;
  createOrder(
    offer: FlightOffer,
    passengers: Passenger[],
    idempotencyKey: string,
  ): Promise<FlightOrder>;
}

/* ---------------- Hotels ---------------- */
export interface HotelSearch {
  city_name?: string;
  country_code?: string;
  iata_code?: string;
  checkin: string;
  checkout: string;
  adults: number;
}
export interface CancelPolicy {
  cancel_time: string;
  amount: number;
  currency: string;
}
export interface HotelOffer {
  id: string; // provider offer id (prebook input)
  provider: string;
  hotel_id: string;
  hotel_name: string;
  address?: string | null;
  photo?: string | null;
  stars?: number | null;
  room_name: string;
  board?: string | null;
  refundable: boolean | null;
  cancel_policies: CancelPolicy[];
  total_amount: number;
  total_currency: string;
  live_mode: boolean;
}
export interface HotelPrebook {
  prebook_id: string;
  hotel_id: string;
  checkin: string;
  checkout: string;
  total_amount: number;
  total_currency: string;
  refundable: boolean | null;
  cancel_policies: CancelPolicy[];
  live_mode: boolean;
}
export interface HotelGuest {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
}
export interface HotelOrder {
  id: string;
  confirmation_code: string | null;
  status: string;
  total_amount: number;
  total_currency: string;
}
export interface HotelCancel {
  status: string;
  refund_amount: number;
  cancellation_fee: number;
  currency: string;
}
export interface HotelProvider {
  readonly name: string;
  isConfigured(): boolean;
  isSandbox(): boolean;
  searchHotels(q: HotelSearch): Promise<HotelOffer[]>;
  prebook(offerId: string): Promise<HotelPrebook>;
  getPrebook(prebookId: string): Promise<HotelPrebook>;
  book(
    prebookId: string,
    guest: HotelGuest,
    clientReference: string,
  ): Promise<HotelOrder>;
  cancel(bookingId: string): Promise<HotelCancel>;
}
