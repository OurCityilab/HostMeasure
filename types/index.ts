/**
 * Core types for HostMeasure DC
 * Deterministic, pure-function architecture.
 * Every quantitative output range is represented as a { low, expected, high } RangeValue.
 */

export interface RangeValue {
  low: number;
  expected: number;
  high: number;
}

export type RoomType = "entire" | "private";

export type LicenseStatus = "hosted" | "unhosted" | "exempt" | "other";

export interface Listing {
  /** KEEP AS A STRING. 18-19 digit Airbnb room IDs lose precision as JS numbers. */
  id: string;
  name: string;
  neighbourhood: string;
  lat: number;
  lon: number;
  room_type: RoomType;
  bedrooms: number;
  beds: number | null;
  bathrooms: number | null;
  accommodates: number;
  price: number;
  minimum_nights: number;
  availability_365: number;
  reviews_ltm: number;
  review_score: number | null;
  /** Inside Airbnb's ESTIMATE of nights booked in the last 12 months (capped at 255). Always label "estimated". */
  est_nights_ltm: number;
  license_status: LicenseStatus;
  is_superhost: 0 | 1;
  host_listing_count: number;
  picture_url: string;
}

export interface Coordinates {
  lat: number;
  lon: number;
}

export interface HomeProfile {
  neighbourhood: string;
  bedrooms: number;
  bathrooms: number;
  guests: number;
  nightsAvailable: number;
  customPin: Coordinates | null;
  isPrimaryResidence: boolean;
  hasRestriction: boolean;
}

export type ExclusionReasonCode =
  | "renovated_luxury"
  | "wrong_location"
  | "different_property_type"
  | "other";

export type PropertyRoomType =
  | "Kitchen"
  | "Bathroom"
  | "Living area"
  | "Bedroom"
  | "Exterior"
  | "Other"
  | "Untagged"
  | "Listing photo (room not tagged)";

export type ConditionScoreValue = 1 | 2 | 3 | 4 | 5 | 6;

export type ConditionScoringMethod = "ai" | "desk";

export type AiConfidence = "low" | "medium" | "high";

export interface AiPhotoRating {
  photoId: string;
  room: PropertyRoomType;
  score: ConditionScoreValue;
  confidence: AiConfidence;
  observations: string[];
  ratedAt: string;
}

export interface DeskPhotoRating {
  photoId: string;
  room: PropertyRoomType;
  score: ConditionScoreValue;
  ratedAt: string;
}

export interface PropertyPhoto {
  /** Random opaque ID such as "P-7K3Q" assigned at upload */
  photoId: string;
  /** Stored internally ("subject" or listing.id), never shown during rating */
  propertyId: "subject" | string;
  room: PropertyRoomType;
  dataUrl: string;
  mimeType: string;
  base64Data: string;
  uploadedAt: string;
  source?: "upload" | "cover";
  unavailable?: boolean;
  aiRating?: {
    score: ConditionScoreValue;
    confidence: AiConfidence;
    observations: string[];
    ratedAt: string;
  };
  deskRating?: {
    score: ConditionScoreValue;
    ratedAt: string;
  };
}

export interface PropertyConditionSummary {
  propertyId: "subject" | string;
  photoCount: number;
  basis: "upload" | "cover" | "none";
  aiScore: number | null;
  deskScore: number | null;
  activeScore: number | null;
  /** True when both aiScore and deskScore exist and |aiScore - deskScore| >= 1.0 */
  hasMethodDiscrepancy: boolean;
  methodDifference: number | null;
  roomScoresAi: Partial<Record<PropertyRoomType, number>>;
  roomScoresDesk: Partial<Record<PropertyRoomType, number>>;
}

export interface AdjustmentLogEntry {
  timestamp: string;
  listingId: string;
  reason: string;
  /** Effect on price range (low=P25 delta, expected=median delta, high=P75 delta) */
  effect: RangeValue;
  listingName?: string;
  pathId?: "pathA" | "pathB";
  previousMedianPrice?: number;
  newMedianPrice?: number;
}

export interface ScoredComp extends Listing {
  miles: number;
  score: number;
  bedroomsDiff: number;
  guestsDiff: number;
  bathroomsDiff: number;
  whyChosen: string;
  /** Original unadjusted nightly price from dataset */
  rawPrice: number;
  /** Adjusted nightly price (equals rawPrice if either subject or comp is Not rated) */
  adjustedPrice: number;
  /** Condition score (1.0-6.0, 1 decimal) or null if Not rated */
  compConditionScore: number | null;
  /** Subject condition score (1.0-6.0, 1 decimal) or null if Not rated */
  subjectConditionScore: number | null;
  /** AI condition score (1.0-6.0) if rated by AI */
  compAiScore: number | null;
  /** Desk review condition score (1.0-6.0) if rated by Desk review */
  compDeskScore: number | null;
  /** True if AI and Desk review scores differ by >= 1.0 */
  hasMethodDiscrepancy: boolean;
  /** Price multiplier applied to comp price (1.0 if unadjusted, clamped to [0.70, 1.30]) */
  conditionMultiplier: number;
  /** True only when both subjectScore and compScore are rated */
  isConditionAdjusted: boolean;
  /** Basis for condition scoring: upload, cover, or none */
  conditionBasis: "upload" | "cover" | "none";
  /** Whether listing has a valid cover photo */
  hasCoverPhoto: boolean;
  /** True if this comparison home was added and pinned by the user from a saved listing PDF */
  isPinned?: boolean;
}

export interface ParsedPdfListing {
  listingId: string | null;
  title: string;
  roomType: RoomType;
  bedrooms: number;
  bathrooms: number;
  guests: number;
  city: string;
  quotedPrice: number | null;
  photos: PropertyPhoto[];
  isInDataset: boolean;
  matchedListing: Listing | null;
  matchType: "id" | "title" | "none";
  fileNames: string[];
  cityWarning?: string;
}

export interface LicenseBreakdown {
  hosted: number;
  unhosted: number;
  exempt: number;
  other: number;
  total: number;
}

export interface CompSelectionResult {
  comps: ScoredComp[];
  totalPoolCount: number;
  highConfidenceCount: number;
  isThinMarket: boolean;
  licenseBreakdown: LicenseBreakdown;
  homePoint: Coordinates;
  /** How many of the top 15 comps were adjusted for condition */
  adjustedCompCount: number;
  /** How many comps were adjusted based solely on a cover photo */
  coverOnlyAdjustedCount: number;
  /** Unadjusted nightly price range before relative condition adjustment */
  unadjustedNightlyRate: RangeValue;
  /** Nightly price range after relative condition adjustment */
  conditionAdjustedNightlyRate: RangeValue;
  /** Price range delta from relative condition adjustments */
  conditionRateEffect: RangeValue;
}

export interface CostAssumptions {
  /** Airbnb host service fee percentage (default 3%) */
  hostFeePercent: number;
  /** Average stay length in nights (default 3) */
  averageStayNights: number;
  /** Cleaning cost per stay in USD for whole home (default $120) */
  cleaningPerStay: number;
  /** Cleaning cost per stay in USD for private room (default $50) */
  cleaningPerStayRoom: number;
  /** Guest supplies per stay in USD (default $15) */
  suppliesPerStay: number;
  /** Extra short-term rental insurance per year in USD (default $600) */
  extraInsurancePerYear: number;
  /** Extra utilities per booked night in USD (default $5) */
  extraUtilitiesPerNight: number;
  /** Owner time spent per stay in hours (default 2) */
  ownerHoursPerStay: number;
  /** Value of owner's time per hour in USD (default $30) */
  ownerHourlyRate: number;
  /** One-time furnishing/setup cost in USD (default $2,500 spread over 3 years) */
  oneTimeSetupCost: number;
  /** Amortization period for setup cost in years (default 3) */
  setupAmortizationYears: number;
  /** DC two-year license fee in USD (default $99 for 2 years) */
  licenseFeeTwoYear: number;
}

export type BindingLimitType = "legal_cap" | "owner_nights" | "market_demand";

export interface CostBreakdown {
  airbnbFee: RangeValue;
  cleaning: RangeValue;
  supplies: RangeValue;
  utilities: RangeValue;
  ownerTimeCost: RangeValue;
  insuranceAnnual: RangeValue;
  setupAnnualized: RangeValue;
  licenseAnnualized: RangeValue;
  cashCosts: RangeValue;
  totalCosts: RangeValue;
}

export interface PathFinancials {
  pathId: "pathA" | "pathB";
  pathTitle: string;
  pathSubtitle: string;
  licenseTypeLabel: string;
  roomType: RoomType;
  legalCapNights: number | null;
  effectiveLegalCapForMath: number;
  compCount: number;
  adjustedCompCount: number;
  coverOnlyAdjustedCount: number;
  isThinMarket: boolean;
  nightlyRate: RangeValue;
  unadjustedNightlyRate: RangeValue;
  conditionRateEffect: RangeValue;
  conditionNetEffect: RangeValue;
  demandNights: RangeValue;
  ownerAvailableNights: RangeValue;
  legalCapRange: RangeValue;
  bookableNights: RangeValue;
  bindingLimit: BindingLimitType;
  bindingLimitLabel: string;
  staysPerYear: RangeValue;
  ownerHoursPerYear: RangeValue;
  grossIncome: RangeValue;
  costs: CostBreakdown;
  cashNetIncome: RangeValue;
  netIncome: RangeValue;
  netPerHour: RangeValue;
  cashNetPerHour: RangeValue;
  breakEvenNights: RangeValue;
}

export interface SensitivityItem {
  id: string;
  label: string;
  baseValueLabel: string;
  lowInputLabel: string;
  highInputLabel: string;
  /** Net income when input is changed by -20%, base, and +20% */
  netOutcome: RangeValue;
  /** Effect relative to expected net income */
  deltaFromBase: RangeValue;
  /** Absolute swing |high - low| for ranking */
  swing: number;
}

export interface DualPathComparison {
  pathA: PathFinancials;
  pathB: PathFinancials;
  betterPathId: "pathA" | "pathB" | "tie";
  betterPathTitle: string;
  netAdvantage: RangeValue;
  cashAdvantage: RangeValue;
  verdictSummary: string;
  sensitivityPathA: SensitivityItem[];
  sensitivityPathB: SensitivityItem[];
}

export type EligibilityStatus = "eligible" | "restricted" | "ineligible";

export interface LegalPathRuleSummary {
  id: "pathA" | "pathB";
  name: string;
  licenseName: string;
  roomType: RoomType;
  hostPresence: string;
  annualNightCap: number | null;
  annualNightCapLabel: string;
  licenseFeeLabel: string;
  summary: string;
}

export interface EligibilityEvaluation {
  status: EligibilityStatus;
  badgeColor: "green" | "amber" | "red";
  headline: string;
  explanation: string;
  informationalOnlyBanner: string | null;
  paths: LegalPathRuleSummary[];
  disclaimer: string;
  lastVerified: string;
}
