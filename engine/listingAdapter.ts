import { Listing, RoomType } from "../types";
import { Comparable, ModelSpec, Subject } from "./valuation";

/** The attributes this app compares on. An appraisal engine would list its own here. */
export const LISTING_ATTRIBUTES = ["bedrooms", "guests", "bathrooms"] as const;

export const ATTRIBUTE_LABELS: Record<string, string> = {
  bedrooms: "Bedrooms",
  guests: "Guests",
  bathrooms: "Bathrooms",
};

/** A listing as the valuation kernel sees it: location, nightly rate, three attributes. */
export function listingToComparable(listing: Listing, value: number = listing.price): Comparable {
  return {
    id: listing.id,
    lat: listing.lat,
    lon: listing.lon,
    value,
    attrs: {
      bedrooms: listing.bedrooms,
      guests: listing.accommodates,
      bathrooms: listing.bathrooms,
    },
  };
}

export function targetToSubject(target: {
  homePoint: { lat: number; lon: number };
  bedrooms: number;
  bathrooms: number;
  guests: number;
}): Subject {
  return {
    lat: target.homePoint.lat,
    lon: target.homePoint.lon,
    attrs: { bedrooms: target.bedrooms, guests: target.guests, bathrooms: target.bathrooms },
  };
}

/** The hand-set rule from the first build: 25 / 8 / 10 points and 12 per mile, no adjustments. */
export const HANDSET_SPEC: ModelSpec = {
  attributes: [...LISTING_ATTRIBUTES],
  weights: { bedrooms: 25, guests: 8, bathrooms: 10 },
  milesWeight: 12,
  adjustments: null,
  compCount: 15,
  intervalScale: 1,
};

export type SpecByRoomType = Record<RoomType, ModelSpec>;
