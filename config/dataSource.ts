/**
 * Data source configuration for HostMeasure DC.
 * Replace DATA_URL with a raw CSV URL to load the 3,271-row Inside Airbnb snapshot automatically on startup.
 */

export const DATA_URL = "/dc_listings_clean.csv";

export const DATA_SNAPSHOT_METADATA = {
  sourceName: "Inside Airbnb",
  city: "Washington, DC",
  snapshotDate: "2026-09-20",
  snapshotDisplayDate: "Sept 20 2026",
  expectedTotalRows: 3271,
  footerCitation:
    "Inside Airbnb, Sept 20 2026 snapshot, 3,271 active short-term listings",
} as const;
