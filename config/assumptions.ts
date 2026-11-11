import { CostAssumptions, HomeProfile, PropertyRoomType } from "../types";
import { DC_RULES } from "./dcRules";

/**
 * Editable default cost assumptions for Step 4.
 * Tagged as "your assumption" in the UI, distinct from market data.
 */
export const DEFAULT_COST_ASSUMPTIONS: CostAssumptions = {
  hostFeePercent: 3,
  averageStayNights: 3,
  cleaningPerStay: 120,
  cleaningPerStayRoom: 50,
  suppliesPerStay: 15,
  extraInsurancePerYear: 600,
  extraUtilitiesPerNight: 5,
  ownerHoursPerStay: 2,
  ownerHourlyRate: 30,
  oneTimeSetupCost: 2500,
  setupAmortizationYears: 3,
  licenseFeeTwoYear: DC_RULES.licenseFee.amountUsd,
};

/**
 * Room weights for property condition score calculation (renormalized over rooms that have photos):
 * Kitchen 30, Bathroom 25, Living area 20, Bedroom 15, Exterior 10.
 */
export const CONDITION_ROOM_WEIGHTS: Record<PropertyRoomType, number> = {
  Kitchen: 30,
  Bathroom: 25,
  "Living area": 20,
  Bedroom: 15,
  Exterior: 10,
  Untagged: 20,
  "Listing photo (room not tagged)": 20,
  Other: 0,
};

export const ORDERED_PROPERTY_ROOMS: PropertyRoomType[] = [
  "Kitchen",
  "Bathroom",
  "Living area",
  "Bedroom",
  "Exterior",
];

/**
 * Default price change per condition point (6% per point on the 1-6 scale, capped at +/-30%).
 * Editable slider in UI labelled: "Your assumption: price change per condition point. Not derived from data."
 */
export const DEFAULT_CONDITION_RATE_PER_POINT = 0.06;

/**
 * Sample case required by specification:
 * Neighbourhood: "Capitol Hill, Lincoln Park", 2 bedrooms, 1.5 bathrooms,
 * 4 guests, 150 nights available, primary residence yes, no condo/HOA restriction.
 */
export const SAMPLE_HOME_CASE: HomeProfile = {
  neighbourhood: "Capitol Hill, Lincoln Park",
  bedrooms: 2,
  bathrooms: 1.5,
  guests: 4,
  nightsAvailable: 150,
  customPin: null,
  isPrimaryResidence: true,
  hasRestriction: false,
};

/**
 * Default initial state before clicking "Load sample case"
 */
export const INITIAL_HOME_PROFILE: HomeProfile = {
  ...SAMPLE_HOME_CASE,
};
