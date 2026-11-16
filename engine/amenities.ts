import { AMENITIES_LIST, AmenityDefinition } from "../config/amenities";
import { Listing } from "../types";

export interface AmenityGapItem {
  code: string;
  label: string;
  compCount: number;
  compTotal: number;
  ownerHas: boolean;
}

/**
 * Pure function computing amenity gap statistics across comparison listings.
 * Evaluates all 20 tracked amenities in their standard defined order.
 * Excluded matches should not be in `comps`; pinned matches should be.
 */
export function amenityGaps(
  ownerCodes: string[],
  comps: Listing[]
): AmenityGapItem[] {
  const ownerSet = new Set(ownerCodes.map((c) => c.toLowerCase()));
  const compTotal = comps.length;

  return AMENITIES_LIST.map((item: AmenityDefinition) => {
    const compCount = comps.filter((comp) => {
      const list = comp.amenities;
      return Array.isArray(list) && list.some((c) => c.toLowerCase() === item.code);
    }).length;

    return {
      code: item.code,
      label: item.label,
      compCount,
      compTotal,
      ownerHas: ownerSet.has(item.code),
    };
  });
}

/**
 * Categorize amenity gap items into three display groups:
 * 1. Missing standard: most matches offer (>= 60%), owner does not
 * 2. Competitive advantage: owner offers, most matches do not (<= 40%)
 * 3. Standard matches: owner offers and most matches offer (>= 60%)
 */
export function categorizeAmenityGaps(items: AmenityGapItem[]) {
  const missingFromHome = items
    .filter(
      (item) =>
        !item.ownerHas &&
        (item.compTotal > 0 ? item.compCount / item.compTotal >= 0.6 : false)
    )
    .sort((a, b) => b.compCount - a.compCount);

  const uniqueToHome = items
    .filter(
      (item) =>
        item.ownerHas &&
        (item.compTotal > 0 ? item.compCount / item.compTotal <= 0.4 : false)
    )
    .sort((a, b) => a.compCount - b.compCount);

  const standardForComps = items
    .filter(
      (item) =>
        item.ownerHas &&
        (item.compTotal > 0 ? item.compCount / item.compTotal >= 0.6 : false)
    )
    .sort((a, b) => b.compCount - a.compCount);

  return {
    missingFromHome,
    uniqueToHome,
    standardForComps,
  };
}

/**
 * Parse pasted text from Airbnb's "What this place offers" modal:
 * - split into lines; lowercase; trim; replace non-breaking spaces (\u00A0) and en dashes (\u2013) with a space and a hyphen
 * - stop reading at a line that says "not included" (or starts with "not included")
 * - skip any line starting with "unavailable"
 * - a code is checked if any remaining line matches its pattern
 */
export function parsePastedAmenities(text: string): string[] {
  if (!text) return [];

  const rawLines = text.split(/\r?\n/);
  const matched = new Set<string>();

  for (const rawLine of rawLines) {
    const line = rawLine
      .replace(/\u00A0/g, " ")
      .replace(/\u2013/g, "-")
      .toLowerCase()
      .trim();

    if (!line) continue;

    // stop reading at a line that says "not included"
    if (line === "not included" || line.startsWith("not included")) {
      break;
    }

    // skip any line starting with "unavailable"
    if (line.startsWith("unavailable")) {
      continue;
    }

    // test against all amenity regex patterns
    for (const item of AMENITIES_LIST) {
      if (item.pattern.test(line)) {
        matched.add(item.code);
      }
    }
  }

  return Array.from(matched);
}
