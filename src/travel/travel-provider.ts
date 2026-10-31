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

export interface FlightProvider {
  readonly name: string;
  isConfigured(): boolean;
  searchFlights(q: FlightSearch): Promise<FlightOffer[]>;
  getOffer(id: string): Promise<FlightOffer>;
  createOrder(offer: FlightOffer, passengers: Passenger[], idempotencyKey: string): Promise<FlightOrder>;
}
