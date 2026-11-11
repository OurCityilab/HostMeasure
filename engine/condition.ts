import {
  CONDITION_ROOM_WEIGHTS,
   DEFAULT_CONDITION_RATE_PER_POINT,
  ORDERED_PROPERTY_ROOMS,
} from "../config/assumptions";
import {
  ConditionScoreValue,
  ConditionScoringMethod,
  PropertyConditionSummary,
  PropertyPhoto,
  PropertyRoomType,
} from "../types";

export const MAX_PHOTOS_PER_PROPERTY = 12;
export const MAX_CONDITION_ADJUSTMENT_PCT = 0.3; // +/-30% limit

export interface ConditionAnchor {
  score: ConditionScoreValue;
  fannieMaeCode: "C1" | "C2" | "C3" | "C4" | "C5" | "C6";
  description: string;
  fullLabel: string;
}

/**
 * The Fannie Mae condition scale (C1-C6) reversed so higher is better (1 to 6, where 6 is best).
 * Shown wherever a score is given or displayed.
 */
export const CONDITION_SCALE_ANCHORS: ReadonlyArray<ConditionAnchor> = [
  {
    score: 6,
    fannieMaeCode: "C1",
    description: "New or fully renovated; nothing to repair",
    fullLabel: "6 = New or fully renovated; nothing to repair (C1)",
  },
  {
    score: 5,
    fannieMaeCode: "C2",
    description: "Recently updated; no deferred maintenance",
    fullLabel: "5 = Recently updated; no deferred maintenance (C2)",
  },
  {
    score: 4,
    fannieMaeCode: "C3",
    description: "Well maintained; normal wear only",
    fullLabel: "4 = Well maintained; normal wear only (C3)",
  },
  {
    score: 3,
    fannieMaeCode: "C4",
    description: "Some minor repairs or dated finishes",
    fullLabel: "3 = Some minor repairs or dated finishes (C4)",
  },
  {
    score: 2,
    fannieMaeCode: "C5",
    description: "Obvious deferred maintenance; needs significant repair",
    fullLabel: "2 = Obvious deferred maintenance; needs significant repair (C5)",
  },
  {
    score: 1,
    fannieMaeCode: "C6",
    description: "Substantial damage; affects safety or livability",
    fullLabel: "1 = Substantial damage; affects safety or livability (C6)",
  },
];

const PHOTO_ID_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/**
 * Generate a random opaque photo ID such as "P-7K3Q" at upload.
 */
export function generateRandomPhotoId(existingIds: Set<string> = new Set()): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    let suffix = "";
    for (let i = 0; i < 4; i++) {
      const idx = Math.floor(Math.random() * PHOTO_ID_CHARS.length);
      suffix += PHOTO_ID_CHARS[idx];
    }
    const candidate = `P-${suffix}`;
    if (!existingIds.has(candidate)) {
      return candidate;
    }
  }
  return `P-${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

/**
 * Generate a new random seed string for Desk Review blind shuffle.
 */
export function generateDeskReviewSeed(): string {
  const num = Math.floor(100000 + Math.random() * 900000);
  return `DR-${num}`;
}

/**
 * Convert a string seed into a deterministic 32-bit integer hash.
 */
export function hashSeedString(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Mulberry32 deterministic PRNG from a 32-bit seed.
 */
export function createSeededRng(seedString: string): () => number {
  let a = hashSeedString(seedString);
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministically shuffle an array using the provided seed so the order can be replayed.
 */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const copy = [...items];
  const rng = createSeededRng(seed);
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }
  return copy;
}

/**
 * Build the blind Desk Review photo queue:
 * - Pools photos of the subject and all comps that have photos.
 * - Groups by room type (Kitchen, Bathroom, Living area, Bedroom, Exterior) so kitchens are rated against kitchens.
 * - Shuffles photos within each room type using a seeded deterministic order so the exact sequence can be replayed.
 */
export function buildDeskReviewQueue(
  allPhotos: readonly PropertyPhoto[],
  seed: string
): PropertyPhoto[] {
  // Exclude unavailable photos
  const available = allPhotos.filter((p) => !p.unavailable);
  // Sort first by photoId so input order is canonical before seeded shuffle
  const canonical = [...available].sort((a, b) =>
    a.photoId.localeCompare(b.photoId)
  );

  const queue: PropertyPhoto[] = [];
  for (const room of ORDERED_PROPERTY_ROOMS) {
    const roomPhotos = canonical.filter((p) => p.room === room);
    if (roomPhotos.length > 0) {
      const shuffledRoom = seededShuffle(roomPhotos, `${seed}::${room}`);
      queue.push(...shuffledRoom);
    }
  }

  // Pool untagged or other rooms (e.g. unclassified cover photos)
  const otherPhotos = canonical.filter(
    (p) => !ORDERED_PROPERTY_ROOMS.includes(p.room as PropertyRoomType)
  );
  if (otherPhotos.length > 0) {
    const shuffledOther = seededShuffle(otherPhotos, `${seed}::untagged`);
    queue.push(...shuffledOther);
  }

  return queue;
}

/**
 * Compute each room's average score for a single property under the specified method ('ai' | 'desk').
 * Room score = average of that room's photo scores.
 */
export function computeRoomScoresForProperty(
  propertyPhotos: readonly PropertyPhoto[],
  method: ConditionScoringMethod
): Partial<Record<PropertyRoomType, number>> {
  const sums: Partial<Record<PropertyRoomType, { total: number; count: number }>> =
    {};

  for (const photo of propertyPhotos) {
    if (photo.unavailable) continue;
    const rating =
      method === "ai" ? photo.aiRating?.score : photo.deskRating?.score;
    if (rating === undefined || rating === null) continue;

    const current = sums[photo.room] ?? { total: 0, count: 0 };
    current.total += rating;
    current.count += 1;
    sums[photo.room] = current;
  }

  const roomScores: Partial<Record<PropertyRoomType, number>> = {};
  for (const room of Object.keys(sums) as PropertyRoomType[]) {
    const entry = sums[room];
    if (entry && entry.count > 0) {
      roomScores[room] = entry.total / entry.count;
    }
  }
  return roomScores;
}

/**
 * Compute property condition score from room scores:
 * Weighted average of its room scores using weights in /config/assumptions.ts:
 * Kitchen 30, Bathroom 25, Living area 20, Bedroom 15, Exterior 10,
 * renormalized over the rooms that have photos. Rounded to one decimal.
 * Returns null ("Not rated") if no rooms have scored photos.
 */
export function computeWeightedPropertyConditionScore(
  roomScores: Partial<Record<PropertyRoomType, number>>,
  weights: Record<PropertyRoomType, number> = CONDITION_ROOM_WEIGHTS
): number | null {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [roomKey, score] of Object.entries(roomScores) as [
    PropertyRoomType,
    number
  ][]) {
    if (score !== undefined && Number.isFinite(score)) {
      const w = weights[roomKey] ?? 0;
      if (w > 0) {
        weightedSum += score * w;
        totalWeight += w;
      }
    }
  }

  if (totalWeight > 0) {
    const rawWeightedAverage = weightedSum / totalWeight;
    return Math.round(rawWeightedAverage * 10) / 10;
  }

  return null;
}

/**
 * Summarize condition scores for a property across both methods (AI analysis & Desk review),
 * flagging any property where both methods exist and differ by 1.0 or more.
 * Rules:
 * - Unavailable photos are excluded.
 * - Uploads beat cover photos: if property has uploaded photos, score ONLY from uploaded photos.
 *   If no uploaded photos, score from cover photo (basis = "cover").
 *   If neither, "Not rated" (basis = "none").
 */
export function summarizePropertyCondition(
  propertyId: "subject" | string,
  allPhotos: readonly PropertyPhoto[],
  activeMethod: ConditionScoringMethod
): PropertyConditionSummary {
  const availablePhotos = allPhotos.filter(
    (p) => p.propertyId === propertyId && !p.unavailable
  );

  const uploadPhotos = availablePhotos.filter(
    (p) => p.source === "upload" || !p.source
  );
  const coverPhotos = availablePhotos.filter((p) => p.source === "cover");

  let effectivePhotos: PropertyPhoto[] = [];
  let basis: "upload" | "cover" | "none" = "none";

  if (uploadPhotos.length > 0) {
    effectivePhotos = uploadPhotos;
    basis = "upload";
  } else if (coverPhotos.length > 0) {
    effectivePhotos = coverPhotos;
    basis = "cover";
  } else {
    effectivePhotos = [];
    basis = "none";
  }

  const roomScoresAi = computeRoomScoresForProperty(effectivePhotos, "ai");
  const roomScoresDesk = computeRoomScoresForProperty(effectivePhotos, "desk");

  const aiScore = computeWeightedPropertyConditionScore(roomScoresAi);
  const deskScore = computeWeightedPropertyConditionScore(roomScoresDesk);

  const activeScore = activeMethod === "desk" ? deskScore : aiScore;

  const methodDifference =
    aiScore !== null && deskScore !== null
      ? Math.round(Math.abs(deskScore - aiScore) * 10) / 10
      : null;

  const hasMethodDiscrepancy =
    methodDifference !== null && methodDifference >= 1.0;

  return {
    propertyId,
    photoCount: effectivePhotos.length,
    basis,
    aiScore,
    deskScore,
    activeScore,
    hasMethodDiscrepancy,
    methodDifference,
    roomScoresAi,
    roomScoresDesk,
  };
}

/**
 * Pure function computing adjustedCompPrice:
 * adjustedCompPrice = compPrice * (1 + ratePerPoint * (subjectScore - compScore)),
 * limited to +/-30%.
 * Only comps with a score (when subject also has a score) are adjusted.
 * A property with no photos/score is "Not rated" (null) and gets NO adjustment.
 * When useCoverScores is false, comps whose score rests on a cover photo still show their score,
 * but their price is NOT adjusted.
 */
export function calculateAdjustedCompPrice(
  compPrice: number,
  subjectScore: number | null,
  compScore: number | null,
  ratePerPoint: number = DEFAULT_CONDITION_RATE_PER_POINT,
  options?: {
    useCoverScores?: boolean;
    basis?: "upload" | "cover" | "none";
  }
): {
  adjustedPrice: number;
  conditionMultiplier: number;
  isConditionAdjusted: boolean;
} {
  const useCoverScores = options?.useCoverScores ?? true;
  const basis = options?.basis ?? "none";

  if (
    subjectScore === null ||
    compScore === null ||
    !Number.isFinite(subjectScore) ||
    !Number.isFinite(compScore)
  ) {
    return {
      adjustedPrice: compPrice,
      conditionMultiplier: 1.0,
      isConditionAdjusted: false,
    };
  }

  if (basis === "cover" && !useCoverScores) {
    return {
      adjustedPrice: compPrice,
      conditionMultiplier: 1.0,
      isConditionAdjusted: false,
    };
  }

  const rawDelta = ratePerPoint * (subjectScore - compScore);
  const clampedDelta = Math.max(
    -MAX_CONDITION_ADJUSTMENT_PCT,
    Math.min(MAX_CONDITION_ADJUSTMENT_PCT, rawDelta)
  );
  const conditionMultiplier = Number((1 + clampedDelta).toFixed(4));
  const adjustedPrice = Number((compPrice * conditionMultiplier).toFixed(2));

  return {
    adjustedPrice,
    conditionMultiplier,
    isConditionAdjusted: true,
  };
}
