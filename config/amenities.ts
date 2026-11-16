/**
 * Pre-defined list of 20 tracked amenities for HostMeasure DC.
 * Order is strictly preserved.
 * Patterns are used solely to read pasted text from Airbnb's "What this place offers" window.
 */

export interface AmenityDefinition {
  code: string;
  label: string;
  pattern: RegExp;
}

export const AMENITIES_LIST: AmenityDefinition[] = [
  { code: "wifi", label: "Wifi", pattern: /^(fast )?wifi/i },
  { code: "kitchen", label: "Kitchen", pattern: /^kitchen$/i },
  { code: "ac", label: "Air conditioning", pattern: /air conditioning|^ac |^window ac/i },
  { code: "washer", label: "Washer", pattern: /^(free |paid )?washer/i },
  { code: "dryer", label: "Dryer", pattern: /^(free |paid )?dryer/i },
  { code: "dishwasher", label: "Dishwasher", pattern: /^dishwasher$/i },
  { code: "parking", label: "Parking on the property", pattern: /(parking|garage|carport).*on premises/i },
  { code: "workspace", label: "Dedicated workspace", pattern: /^dedicated workspace/i },
  { code: "tv", label: "TV", pattern: /^(\d+ inch )?(hd)?tv\b/i },
  { code: "patio", label: "Patio or balcony", pattern: /patio or balcony/i },
  { code: "backyard", label: "Backyard", pattern: /backyard/i },
  { code: "hot_tub", label: "Hot tub", pattern: /hot tub/i },
  { code: "pool", label: "Pool", pattern: /^(?!.*(pool table|whirlpool)).*pool/i },
  { code: "gym", label: "Gym", pattern: /^(?!.*nearby).*gym/i },
  { code: "elevator", label: "Elevator", pattern: /^elevator$/i },
  { code: "fireplace", label: "Indoor fireplace", pattern: /^indoor fireplace/i },
  { code: "self_checkin", label: "Self check-in", pattern: /^self check-in/i },
  { code: "pets", label: "Pets allowed", pattern: /^pets allowed/i },
  { code: "bbq", label: "BBQ grill", pattern: /bbq grill/i },
  { code: "crib", label: "Crib", pattern: /crib/i },
];

export const AMENITY_LABEL_MAP: Record<string, string> = Object.fromEntries(
  AMENITIES_LIST.map((a) => [a.code, a.label])
);

/**
 * Default sample case amenities checked when "Load sample case" is clicked
 */
export const SAMPLE_OWNER_AMENITIES: string[] = [
  "wifi",
  "kitchen",
  "ac",
  "washer",
  "dryer",
  "tv",
];
