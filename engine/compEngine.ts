import { DEFAULT_CONDITION_RATE_PER_POINT } from "../config/assumptions";
import { ACTIVE_MODEL } from "../config/model";
import { getNeighbourhoodCentroid } from "../data/listings";
import {
  AdjustmentLogEntry,
  CompSelectionResult,
  ConditionScoringMethod,
  Coordinates,
  HomeProfile,
  LicenseBreakdown,
  Listing,
  PropertyPhoto,
  RangeValue,
  RoomType,
  ScoredComp,
} from "../types";
import {
  calculateAdjustedCompPrice,
  summarizePropertyCondition,
} from "./condition";
import { listingToComparable, targetToSubject } from "./listingAdapter";
import {
  adjustComparable,
  distanceMiles,
  estimateRange,
  ModelSpec,
  percentile,
  similarity,
} from "./valuation";

export const TOP_COMP_COUNT = 15;
export const THIN_MARKET_MIN_SCORE = 50;
export const THIN_MARKET_MIN_COUNT = 8;

/**
 * Compute straight-line distance in miles between two coordinates using the Haversine formula from valuation kernel.
 */
export function calculateDistanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  return distanceMiles(lat1, lon1, lat2, lon2);
}

export interface CompTargetSpec {
  roomType: RoomType;
  bedrooms: number;
  bathrooms: number;
  guests: number;
  homePoint: Coordinates;
}

/**
 * Determine the target comparison attributes for a given path:
 * - Path A ("Whole home while I'm away"): room_type "entire", uses home's bedrooms, bathrooms, and guests.
 * - Path B ("A private room while I'm home"): room_type "private", bedrooms = 1, bathrooms = 1, guests = 2.
 */
export function getPathTargetSpec(
  home: HomeProfile,
  listings: Listing[],
  pathId: "pathA" | "pathB"
): CompTargetSpec {
  const homePoint =
    home.customPin ?? getNeighbourhoodCentroid(listings, home.neighbourhood);

  if (pathId === "pathA") {
    return {
      roomType: "entire",
      bedrooms: home.bedrooms,
      bathrooms: home.bathrooms,
      guests: home.guests,
      homePoint,
    };
  }

  return {
    roomType: "private",
    bedrooms: 1,
    bathrooms: 1,
    guests: 2,
    homePoint,
  };
}

/**
 * Generate a clear one-line explanation of why a listing scored well.
 */
export function buildWhyChosenLine(
  listing: Listing,
  target: CompTargetSpec,
  miles: number
): string {
  const parts: string[] = [];

  parts.push(`${miles.toFixed(2)} mi away`);

  if (listing.bedrooms === target.bedrooms) {
    parts.push(
      listing.bedrooms === 0
        ? "exact studio match"
        : `exact ${listing.bedrooms} BR match`
    );
  } else {
    parts.push(`${listing.bedrooms} BR (vs ${target.bedrooms})`);
  }

  if (listing.accommodates === target.guests) {
    parts.push(`sleeps ${listing.accommodates}`);
  } else {
    parts.push(`sleeps ${listing.accommodates} (vs ${target.guests})`);
  }

  if (listing.bathrooms === null || Number.isNaN(listing.bathrooms)) {
    parts.push("baths unlisted (no penalty)");
  } else if (Math.abs(listing.bathrooms - target.bathrooms) < 0.01) {
    parts.push(`${listing.bathrooms} bath match`);
  } else {
    parts.push(`${listing.bathrooms} bath`);
  }

  return parts.join(" · ");
}

export interface ConditionEvaluationContext {
  photos?: readonly PropertyPhoto[];
  activeMethod?: ConditionScoringMethod;
  ratePerPoint?: number;
  useCoverScores?: boolean;
  spec?: ModelSpec;
}

/**
 * Score a single listing against the target spec using valuation kernel similarity and adjustComparable:
 * score = 100 - weighted differences, floored at 0.
 * Also computes condition score and adjustedCompPrice applied to sizeAdjustedPrice.
 */
export function scoreListing(
  listing: Listing,
  target: CompTargetSpec,
  conditionContext?: ConditionEvaluationContext
): ScoredComp {
  const spec = conditionContext?.spec ?? ACTIVE_MODEL[target.roomType].spec;
  const subject = targetToSubject(target);
  const comp = listingToComparable(listing);

  const { score, miles, diffs } = similarity(subject, comp, spec);
  const { adjustedValue: sizeAdjustedPrice, lines: adjustmentLines } =
    adjustComparable(subject, comp, spec);

  const bedroomsDiff =
    diffs.bedrooms ?? Math.abs(listing.bedrooms - target.bedrooms);
  const guestsDiff =
    diffs.guests ?? Math.abs(listing.accommodates - target.guests);
  const bathroomsDiff =
    diffs.bathrooms ??
    (listing.bathrooms === null || Number.isNaN(listing.bathrooms)
      ? 0
      : Math.abs(listing.bathrooms - target.bathrooms));

  const photos = conditionContext?.photos ?? [];
  const activeMethod = conditionContext?.activeMethod ?? "desk";
  const ratePerPoint =
    conditionContext?.ratePerPoint ?? DEFAULT_CONDITION_RATE_PER_POINT;
  const useCoverScores = conditionContext?.useCoverScores ?? true;

  const subjectSummary = summarizePropertyCondition(
    "subject",
    photos,
    activeMethod
  );
  const compSummary = summarizePropertyCondition(
    listing.id,
    photos,
    activeMethod
  );

  const rawPrice = listing.price;
  const { adjustedPrice, conditionMultiplier, isConditionAdjusted } =
    calculateAdjustedCompPrice(
      sizeAdjustedPrice,
      subjectSummary.activeScore,
      compSummary.activeScore,
      ratePerPoint,
      {
        useCoverScores,
        basis: compSummary.basis,
      }
    );

  return {
    ...listing,
    price: adjustedPrice,
    rawPrice,
    sizeAdjustedPrice,
    adjustmentLines,
    adjustedPrice,
    miles,
    score,
    bedroomsDiff,
    guestsDiff,
    bathroomsDiff,
    whyChosen: buildWhyChosenLine(listing, target, miles),
    compConditionScore: compSummary.activeScore,
    subjectConditionScore: subjectSummary.activeScore,
    compAiScore: compSummary.aiScore,
    compDeskScore: compSummary.deskScore,
    hasMethodDiscrepancy: compSummary.hasMethodDiscrepancy,
    conditionMultiplier,
    isConditionAdjusted,
    conditionBasis: compSummary.basis,
    hasCoverPhoto: Boolean(
      listing.picture_url && listing.picture_url.trim().length > 0
    ),
  };
}

/**
 * Compute percentile (0..1) using linear interpolation on a sorted array (delegates to valuation.ts).
 */
export function computePercentile(values: number[], p: number): number {
  return percentile(values, p);
}

/**
 * Compute a { low, expected, high } RangeValue from an array of numbers using estimateRange.
 */
export function computeRangeFromValues(values: number[], intervalScale = 1): RangeValue {
  return estimateRange(values, intervalScale);
}

/**
 * Select the top 15 comparable listings for a given target spec.
 * - Filters by target.roomType
 * - Optionally filters to casual hosts with 1-2 listings ("Only compare me to hosts like me")
 * - Removes user-excluded listing IDs
 * - Sorts descending by score, breaking ties deterministically by string `id`
 * - Applies relative property condition adjustments ONLY to comps that have a condition score (and when subject has a score)
 */
export function selectCompsForTarget(
  listings: Listing[],
  target: CompTargetSpec,
  options: {
    onlyHostsLikeMe?: boolean;
    excludedIds?: Set<string> | string[];
    pinnedIds?: Set<string> | string[];
    limit?: number;
    photos?: readonly PropertyPhoto[];
    activeMethod?: ConditionScoringMethod;
    ratePerPoint?: number;
    useCoverScores?: boolean;
  } = {}
): CompSelectionResult {
  const {
    onlyHostsLikeMe = false,
    excludedIds = [],
    pinnedIds = [],
    limit = TOP_COMP_COUNT,
    photos = [],
    activeMethod = "desk",
    ratePerPoint = DEFAULT_CONDITION_RATE_PER_POINT,
    useCoverScores = true,
  } = options;

  const excludedSet =
    excludedIds instanceof Set ? excludedIds : new Set(excludedIds);
  const pinnedSet =
    pinnedIds instanceof Set ? pinnedIds : new Set(pinnedIds);

  // 1. Pinned listings matching target room type that are not excluded
  const pinnedListings = listings.filter((item) => {
    if (item.room_type !== target.roomType) return false;
    if (excludedSet.has(item.id)) return false;
    return pinnedSet.has(item.id);
  });

  const scoredPinned = pinnedListings.map((item) => ({
    ...scoreListing(item, target, {
      photos,
      activeMethod,
      ratePerPoint,
      useCoverScores,
    }),
    isPinned: true,
  }));

  // 2. Regular unpinned candidate pool
  const pool = listings.filter((item) => {
    if (item.room_type !== target.roomType) return false;
    if (excludedSet.has(item.id)) return false;
    if (pinnedSet.has(item.id)) return false;
    if (
      onlyHostsLikeMe &&
      (item.host_listing_count < 1 || item.host_listing_count > 2)
    ) {
      return false;
    }
    return true;
  });

  const scoredPool = pool.map((item) =>
    scoreListing(item, target, {
      photos,
      activeMethod,
      ratePerPoint,
      useCoverScores,
    })
  );

  scoredPool.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const remainingSlots = Math.max(0, limit - scoredPinned.length);
  const combined = [...scoredPinned, ...scoredPool.slice(0, remainingSlots)];

  // Sort comps by score descending with tie-breaker
  combined.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const comps = combined;
  const highConfidenceCount = comps.filter(
    (c) => c.score >= THIN_MARKET_MIN_SCORE
  ).length;
  const isThinMarket = highConfidenceCount < THIN_MARKET_MIN_COUNT;

  const licenseBreakdown: LicenseBreakdown = {
    hosted: 0,
    unhosted: 0,
    exempt: 0,
    other: 0,
    total: comps.length,
  };

  for (const comp of comps) {
    if (comp.license_status === "hosted") licenseBreakdown.hosted += 1;
    else if (comp.license_status === "unhosted") licenseBreakdown.unhosted += 1;
    else if (comp.license_status === "exempt") licenseBreakdown.exempt += 1;
    else licenseBreakdown.other += 1;
  }

  const adjustedCompCount = comps.filter((c) => c.isConditionAdjusted).length;
  const coverOnlyAdjustedCount = comps.filter(
    (c) => c.isConditionAdjusted && c.conditionBasis === "cover"
  ).length;

  const spec = ACTIVE_MODEL[target.roomType].spec;
  const unadjustedNightlyRate = estimateRange(
    comps.map((c) => c.sizeAdjustedPrice),
    spec.intervalScale
  );
  const conditionAdjustedNightlyRate = estimateRange(
    comps.map((c) => c.adjustedPrice),
    spec.intervalScale
  );
  const conditionRateEffect: RangeValue = {
    low: conditionAdjustedNightlyRate.low - unadjustedNightlyRate.low,
    expected:
      conditionAdjustedNightlyRate.expected - unadjustedNightlyRate.expected,
    high: conditionAdjustedNightlyRate.high - unadjustedNightlyRate.high,
  };

  return {
    comps,
    totalPoolCount: pool.length + pinnedListings.length,
    highConfidenceCount,
    isThinMarket,
    licenseBreakdown,
    homePoint: target.homePoint,
    adjustedCompCount,
    coverOnlyAdjustedCount,
    unadjustedNightlyRate,
    conditionAdjustedNightlyRate,
    conditionRateEffect,
  };
}

/**
 * Helper to select comps for both Path A and Path B at once.
 */
export function selectBothPathComps(
  listings: Listing[],
  home: HomeProfile,
  options: {
    onlyHostsLikeMe: boolean;
    excludedIds: string[];
    pinnedIds?: string[] | Set<string>;
    photos?: readonly PropertyPhoto[];
    activeMethod?: ConditionScoringMethod;
    ratePerPoint?: number;
    useCoverScores?: boolean;
  }
): {
  pathA: CompSelectionResult;
  pathB: CompSelectionResult;
  homePoint: Coordinates;
} {
  const targetA = getPathTargetSpec(home, listings, "pathA");
  const targetB = getPathTargetSpec(home, listings, "pathB");

  const pathA = selectCompsForTarget(listings, targetA, options);
  const pathB = selectCompsForTarget(listings, targetB, options);

  return {
    pathA,
    pathB,
    homePoint: targetA.homePoint,
  };
}

/**
 * Create an append-only AdjustmentLogEntry measuring the exact effect of excluding a listing
 * on the P25, median (expected), and P75 nightly price of that path's comps.
 */
export function createExclusionLogEntry(params: {
  listings: Listing[];
  home: HomeProfile;
  pathId: "pathA" | "pathB";
  onlyHostsLikeMe: boolean;
  currentExcludedIds: string[];
  listingIdToExclude: string;
  reasonText: string;
  photos?: readonly PropertyPhoto[];
  activeMethod?: ConditionScoringMethod;
  ratePerPoint?: number;
  useCoverScores?: boolean;
  timestamp?: string;
}): AdjustmentLogEntry {
  const {
    listings,
    home,
    pathId,
    onlyHostsLikeMe,
    currentExcludedIds,
    listingIdToExclude,
    reasonText,
    photos = [],
    activeMethod = "desk",
    ratePerPoint = DEFAULT_CONDITION_RATE_PER_POINT,
    useCoverScores = true,
    timestamp = new Date().toISOString(),
  } = params;

  const target = getPathTargetSpec(home, listings, pathId);

  const beforeComps = selectCompsForTarget(listings, target, {
    onlyHostsLikeMe,
    excludedIds: currentExcludedIds,
    photos,
    activeMethod,
    ratePerPoint,
    useCoverScores,
  }).comps;

  const nextExcludedIds = currentExcludedIds.includes(listingIdToExclude)
    ? currentExcludedIds
    : [...currentExcludedIds, listingIdToExclude];

  const afterComps = selectCompsForTarget(listings, target, {
    onlyHostsLikeMe,
    excludedIds: nextExcludedIds,
    photos,
    activeMethod,
    ratePerPoint,
    useCoverScores,
  }).comps;

  const spec = ACTIVE_MODEL[target.roomType].spec;
  const beforePriceRange = estimateRange(
    beforeComps.map((c) => c.price),
    spec.intervalScale
  );
  const afterPriceRange = estimateRange(
    afterComps.map((c) => c.price),
    spec.intervalScale
  );

  const excludedListing = listings.find((l) => l.id === listingIdToExclude);

  return {
    timestamp,
    listingId: listingIdToExclude,
    reason: reasonText,
    effect: {
      low: afterPriceRange.low - beforePriceRange.low,
      expected: afterPriceRange.expected - beforePriceRange.expected,
      high: afterPriceRange.high - beforePriceRange.high,
    },
    listingName: excludedListing?.name ?? `Listing #${listingIdToExclude}`,
    pathId,
    previousMedianPrice: beforePriceRange.expected,
    newMedianPrice: afterPriceRange.expected,
  };
}
