import Papa from "papaparse";
import { DATA_URL } from "../config/dataSource";
import { Coordinates, LicenseStatus, Listing, RoomType } from "../types";

/**
 * Exact 5 sample rows provided in the specification, used ONLY as a fallback
 * when DATA_URL is still the placeholder or fails to load, and for unit tests.
 */
export const SAMPLE_CSV_FALLBACK = `id,name,neighbourhood,lat,lon,room_type,bedrooms,beds,bathrooms,accommodates,price,minimum_nights,availability_365,reviews_ltm,review_score,est_nights_ltm,license_status,is_superhost,host_listing_count,picture_url
16487475,Cozy Guest Basement Suite w/ Private Entrance,"Brightwood Park, Crestwood, Petworth",38.957,-77.0326,entire,0,1,1.0,2,99,2,338,39,4.8,234,hosted,0,1,https://a0.muscache.com/pictures/miso/Hosting-16487475/original/sample.jpg
804615687377958782,Luxurious Condo in the Heart of Washington DC,"Shaw, Logan Circle",38.9116,-77.0195,entire,2,2,1.0,6,320,1,356,16,4.55,96,hosted,0,3,https://a0.muscache.com/pictures/miso/Hosting-804615687377958782/original/sample.jpg
840874289101839772,Private Studio by Metro Station - Travel Nurs,"Capitol View, Marshall Heights, Benning Heights",38.8913,-76.9361,entire,0,1,1.0,2,147,3,348,15,4.88,90,hosted,1,1,https://a0.muscache.com/pictures/miso/Hosting-840874289101839772/original/sample.jpg
52953748,Vintage Home Washington DC Washer/Dryer | Kin,"Capitol View, Marshall Heights, Benning Heights",38.8837,-76.942,entire,4,4,2.0,8,200,1,357,48,4.67,255,hosted,0,6,https://a0.muscache.com/pictures/miso/Hosting-52953748/original/sample.jpg
617541021718007683,Spacious Woodley Park Flat,"Cleveland Park, Woodley Park, Massachusetts Avenue Heights, Woodland-Normanstone Terrace",38.9248,-77.0513,entire,1,3,1.0,4,150,5,189,23,4.94,230,hosted,1,1,https://a0.muscache.com/pictures/miso/Hosting-617541021718007683/original/sample.jpg`;

/**
 * Fallback reference centroids used ONLY when the 5-row sample fallback is active
 * and a neighbourhood without sample rows (such as "Capitol Hill, Lincoln Park") is selected.
 * When the full CSV is loaded, centroids are always computed directly from the neighbourhood's listings.
 */
const FALLBACK_NEIGHBOURHOOD_CENTROIDS: Record<string, Coordinates> = {
  "Capitol Hill, Lincoln Park": { lat: 38.8898, lon: -76.9947 },
};

function normalizeRoomType(raw: string | undefined): RoomType | null {
  if (!raw) return null;
  const cleaned = raw.trim().toLowerCase();
  if (cleaned === "entire" || cleaned.startsWith("entire")) return "entire";
  if (cleaned === "private" || cleaned.startsWith("private")) return "private";
  return null;
}

function normalizeLicenseStatus(raw: string | undefined): LicenseStatus {
  if (!raw) return "other";
  const cleaned = raw.trim().toLowerCase();
  if (cleaned === "hosted") return "hosted";
  if (cleaned === "unhosted") return "unhosted";
  if (cleaned === "exempt") return "exempt";
  return "other";
}

export function parsePictureUrl(val: string | undefined): string {
  if (!val) return "";
  const trimmed = String(val).trim();
  if (!trimmed.startsWith("https://")) return "";
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" && parsed.hostname.endsWith(".muscache.com")) {
      return trimmed;
    }
  } catch {
    return "";
  }
  return "";
}

function parseOptionalFloat(val: string | undefined): number | null {
  if (val === undefined || val === null) return null;
  const trimmed = String(val).trim();
  if (trimmed === "" || trimmed.toLowerCase() === "na" || trimmed.toLowerCase() === "null") {
    return null;
  }
  const num = Number.parseFloat(trimmed);
  return Number.isFinite(num) ? num : null;
}

function parseOptionalInt(val: string | undefined): number | null {
  if (val === undefined || val === null) return null;
  const trimmed = String(val).trim();
  if (trimmed === "" || trimmed.toLowerCase() === "na" || trimmed.toLowerCase() === "null") {
    return null;
  }
  const num = Number.parseInt(trimmed, 10);
  return Number.isFinite(num) ? num : null;
}

function parseRequiredFloat(val: string | undefined, fallback = 0): number {
  if (val === undefined || val === null) return fallback;
  const cleaned = String(val).replace(/[$,\s]/g, "");
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? num : fallback;
}

function parseRequiredInt(val: string | undefined, fallback = 0): number {
  if (val === undefined || val === null) return fallback;
  const cleaned = String(val).replace(/[\s,]/g, "");
  const num = Number.parseInt(cleaned, 10);
  return Number.isFinite(num) ? num : fallback;
}

/**
 * Parse raw CSV string using PapaParse with header: true, dynamicTyping: false,
 * converting numeric columns manually and keeping `id` strictly as a string.
 */
export function parseListingsCsv(csvText: string): Listing[] {
  const result = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    dynamicTyping: false,
    skipEmptyLines: true,
  });

  const listings: Listing[] = [];

  for (const row of result.data) {
    if (!row || !row.id) continue;
    const id = String(row.id).trim();
    if (!id) continue;

    const roomType = normalizeRoomType(row.room_type);
    if (!roomType) continue;

    const lat = parseRequiredFloat(row.lat, Number.NaN);
    const lon = parseRequiredFloat(row.lon, Number.NaN);
    const price = parseRequiredFloat(row.price, Number.NaN);

    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(price) || price <= 0) {
      continue;
    }

    const bedrooms = parseRequiredInt(row.bedrooms, 0);
    const beds = parseOptionalInt(row.beds);
    const bathrooms = parseOptionalFloat(row.bathrooms);
    const accommodates = parseRequiredInt(row.accommodates, 1);
    const minimum_nights = parseRequiredInt(row.minimum_nights, 1);
    const availability_365 = parseRequiredInt(row.availability_365, 0);
    const reviews_ltm = parseRequiredInt(row.reviews_ltm, 0);
    const review_score = parseOptionalFloat(row.review_score);
    const est_nights_ltm = parseRequiredFloat(row.est_nights_ltm, 0);
    const license_status = normalizeLicenseStatus(row.license_status);
    const superhostRaw = String(row.is_superhost ?? "0").trim().toLowerCase();
    const is_superhost: 0 | 1 =
      superhostRaw === "1" || superhostRaw === "true" || superhostRaw === "t" ? 1 : 0;
    const host_listing_count = Math.max(1, parseRequiredInt(row.host_listing_count, 1));
    const picture_url = parsePictureUrl(row.picture_url);

    listings.push({
      id,
      name: String(row.name ?? "Untitled DC Listing").trim(),
      neighbourhood: String(row.neighbourhood ?? "Unknown").trim(),
      lat,
      lon,
      room_type: roomType,
      bedrooms,
      beds,
      bathrooms,
      accommodates,
      price,
      minimum_nights,
      availability_365,
      reviews_ltm,
      review_score,
      est_nights_ltm,
      license_status,
      is_superhost,
      host_listing_count,
      picture_url,
    });
  }

  return listings;
}

/**
 * Parse an uploaded File object in the browser.
 */
export function parseListingsCsvFile(file: File): Promise<Listing[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = String(event.target?.result ?? "");
        const parsed = parseListingsCsv(text);
        if (parsed.length === 0) {
          reject(new Error("The uploaded CSV did not contain any valid listing rows."));
          return;
        }
        resolve(parsed);
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Failed to parse CSV file."));
      }
    };
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsText(file);
  });
}

export interface DataLoadOutcome {
  listings: Listing[];
  isFallbackSample: boolean;
  sourceLabel: string;
  warningMessage: string | null;
}

/**
 * On startup, fetch the CSV from DATA_URL in /config/dataSource.ts.
 * If DATA_URL is still the placeholder or the fetch fails, return a clear message
 * and fall back to the 5 sample rows so the app remains immediately testable.
 */
export async function loadInitialListings(customUrl?: string): Promise<DataLoadOutcome> {
  const targetUrl = (customUrl ?? DATA_URL).trim();

  if (!targetUrl || targetUrl === "PASTE_RAW_CSV_URL_HERE") {
    const sampleListings = parseListingsCsv(SAMPLE_CSV_FALLBACK);
    return {
      listings: sampleListings,
      isFallbackSample: true,
      sourceLabel: `Sample fallback (${sampleListings.length} listings)`,
      warningMessage:
        'DATA_URL in /config/dataSource.ts is currently set to the placeholder ("PASTE_RAW_CSV_URL_HERE"). Showing the 5 built-in sample rows so you can test the interface. Upload the 3,271-row Inside Airbnb CSV below to run full DC market numbers.',
    };
  }

  try {
    const response = await fetch(targetUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const csvText = await response.text();
    const parsed = parseListingsCsv(csvText);
    if (parsed.length === 0) {
      throw new Error("CSV fetched from URL contained 0 valid listings.");
    }
    return {
      listings: parsed,
      isFallbackSample: false,
      sourceLabel: `Inside Airbnb DC snapshot (${parsed.length.toLocaleString()} listings)`,
      warningMessage: null,
    };
  } catch (err) {
    const sampleListings = parseListingsCsv(SAMPLE_CSV_FALLBACK);
    const reason = err instanceof Error ? err.message : "Network or parse error";
    return {
      listings: sampleListings,
      isFallbackSample: true,
      sourceLabel: `Sample fallback (${sampleListings.length} listings)`,
      warningMessage: `Could not fetch market CSV from ${targetUrl} (${reason}). Using the 5 built-in fallback rows. Upload the listings CSV file below to analyze all 3,271 DC listings.`,
    };
  }
}

/**
 * Build sorted list of unique neighbourhoods from loaded listings.
 * Always includes "Capitol Hill, Lincoln Park" so the "Load sample case" button works
 * even when running on the 5 fallback rows before CSV upload.
 */
export function getNeighbourhoodList(listings: Listing[]): string[] {
  const set = new Set<string>();
  for (const item of listings) {
    if (item.neighbourhood) {
      set.add(item.neighbourhood);
    }
  }
  set.add("Capitol Hill, Lincoln Park");
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/**
 * Compute the centroid of the chosen neighbourhood's listings.
 * Falls back gracefully if the current dataset is the 5-row sample without that neighbourhood.
 */
export function getNeighbourhoodCentroid(
  listings: Listing[],
  neighbourhood: string
): Coordinates {
  const matching = listings.filter((l) => l.neighbourhood === neighbourhood);
  if (matching.length > 0) {
    const sumLat = matching.reduce((acc, l) => acc + l.lat, 0);
    const sumLon = matching.reduce((acc, l) => acc + l.lon, 0);
    return {
      lat: sumLat / matching.length,
      lon: sumLon / matching.length,
    };
  }

  if (FALLBACK_NEIGHBOURHOOD_CENTROIDS[neighbourhood]) {
    return FALLBACK_NEIGHBOURHOOD_CENTROIDS[neighbourhood];
  }

  if (listings.length > 0) {
    const sumLat = listings.reduce((acc, l) => acc + l.lat, 0);
    const sumLon = listings.reduce((acc, l) => acc + l.lon, 0);
    return {
      lat: sumLat / listings.length,
      lon: sumLon / listings.length,
    };
  }

  // Washington, DC center fallback
  return { lat: 38.8951, lon: -77.0364 };
}
