import React, { useState } from "react";
import {
  AlertCircle,
  Building,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  DollarSign,
  MapPin,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { getNeighbourhoodCentroid, getNeighbourhoodList } from "../../data/listings";
import { Listing, ParsedPdfListing, PropertyPhoto, RoomType } from "../../types";
import { InteractiveMap } from "./InteractiveMap";

interface PdfReviewCardProps {
  card: ParsedPdfListing;
  mode: "step1" | "step3";
  onApply: (card: ParsedPdfListing) => void;
  onApplyCustom?: (customListing: Listing, photos: PropertyPhoto[]) => void;
  onDismiss: () => void;
  onRemovePhoto: (photoId: string) => void;
  listings?: Listing[];
  subjectHomePoint?: { lat: number; lon: number };
}

export const PdfReviewCard: React.FC<PdfReviewCardProps> = ({
  card,
  mode,
  onApply,
  onApplyCustom,
  onDismiss,
  onRemovePhoto,
  listings = [],
  subjectHomePoint,
}) => {
  const isStep1 = mode === "step1";
  const matched = card.matchedListing;

  const neighbourhoods = React.useMemo(
    () => (listings.length > 0 ? getNeighbourhoodList(listings) : ["Capitol Hill, Lincoln Park"]),
    [listings]
  );

  const isOutsideDc = Boolean(
    (card.city &&
      !card.city.toLowerCase().includes("washington") &&
      !card.city.toLowerCase().includes("dc")) ||
      card.cityWarning
  );

  const initialRate = card.quotedPriceInfo?.perNight
    ? Math.round(card.quotedPriceInfo.perNight)
    : card.quotedPrice
    ? Math.round(card.quotedPrice)
    : "";

  // Custom comparison form state
  const [isCustomFormOpen, setIsCustomFormOpen] = useState(false);
  const [customRoomType, setCustomRoomType] = useState<RoomType>(card.roomType);
  const [customBedrooms, setCustomBedrooms] = useState<number>(card.bedrooms);
  const [customBathrooms, setCustomBathrooms] = useState<number>(card.bathrooms ?? 1);
  const [customGuests, setCustomGuests] = useState<number>(
    card.guests ?? (card.roomType === "entire" ? 4 : 2)
  );
  const [customRate, setCustomRate] = useState<number | string>(initialRate);
  const [customNeighbourhood, setCustomNeighbourhood] = useState<string>(
    neighbourhoods[0] ?? "Capitol Hill, Lincoln Park"
  );
  const [customCoords, setCustomCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const activeCentroid = React.useMemo(() => {
    if (listings.length > 0) {
      return getNeighbourhoodCentroid(listings, customNeighbourhood);
    }
    return { lat: 38.8898, lon: -76.9947 };
  }, [listings, customNeighbourhood]);

  const currentCoords = customCoords ?? activeCentroid;

  const handleNeighbourhoodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextHood = e.target.value;
    setCustomNeighbourhood(nextHood);
    if (listings.length > 0) {
      const centroid = getNeighbourhoodCentroid(listings, nextHood);
      setCustomCoords(centroid);
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const rateNum = Number(customRate);
    if (!Number.isFinite(rateNum) || rateNum <= 0) {
      setFormError("Nightly rate is required and must be greater than $0.");
      return;
    }

    setFormError(null);
    const compId = card.listingId
      ? `custom-${card.listingId}`
      : `custom-${Date.now().toString(36)}`;

    const cityWarning = isOutsideDc
      ? "Outside DC. Its price may not reflect your market."
      : undefined;

    const newCustomListing: Listing = {
      id: compId,
      name: card.title || `Custom comparison in ${customNeighbourhood}`,
      neighbourhood: customNeighbourhood,
      lat: currentCoords.lat,
      lon: currentCoords.lon,
      room_type: customRoomType,
      bedrooms: customBedrooms,
      beds: customBedrooms || 1,
      bathrooms: customBathrooms,
      accommodates: customGuests,
      price: rateNum,
      minimum_nights: 1,
      availability_365: 0,
      reviews_ltm: 0,
      review_score: null,
      est_nights_ltm: 0,
      license_status: "other",
      is_superhost: 0,
      host_listing_count: 1,
      picture_url: card.photos[0]?.dataUrl ?? "",
      amenities: [],
      isCustom: true,
      cityWarning,
    };

    onApplyCustom?.(newCustomListing, card.photos);
  };

  return (
    <div className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm space-y-4">
      {/* Header with Title and Match Badge */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${
                card.isInDataset
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-amber-50 text-amber-800 border border-amber-200"
              }`}
            >
              {card.isInDataset ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              )}
              {card.matchStatusMessage}
            </span>
            {card.fileNames.length > 1 && (
              <span className="text-[11px] text-slate-500 font-mono">
                Merged {card.fileNames.length} PDF pages
              </span>
            )}
          </div>
          <h4 className="text-base font-bold text-slate-900 leading-snug">
            {card.title}
          </h4>
          {card.listingId && (
            <p className="text-xs text-slate-500 font-mono">
              Listing ID: {card.listingId}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="self-start p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
          title="Dismiss this import"
          aria-label="Dismiss import card"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Warning if city may not be DC */}
      {isOutsideDc && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-center gap-2 text-xs text-amber-900">
          <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
          <span>Outside DC. Its price may not reflect your market.</span>
        </div>
      )}

      {/* Extracted / Matched Property Facts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2 border-y border-slate-100 text-xs">
        <div>
          <span className="text-slate-500 block">Room type</span>
          <span className="font-semibold text-slate-800 capitalize">
            {card.roomType === "entire" ? "Entire home/apt" : "Private room"}
          </span>
        </div>
        <div>
          <span className="text-slate-500 block">Bedrooms / Baths</span>
          <span className="font-semibold text-slate-800 font-mono tabular-nums">
            {card.bedrooms === 0 ? "Studio" : `${card.bedrooms} BR`} · {card.bathrooms} Bath
          </span>
        </div>
        <div>
          <span className="text-slate-500 block">Guests</span>
          <span className="font-semibold text-slate-800 font-mono tabular-nums">
            {card.guests !== null ? `Sleeps ${card.guests}` : "—"}
          </span>
        </div>
        <div>
          <span className="text-slate-500 block">Neighbourhood</span>
          <span className="font-semibold text-slate-800 truncate block">
            {matched ? matched.neighbourhood : "Not in dataset"}
          </span>
        </div>
      </div>

      {/* Pricing Comparison */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
        {card.quotedPriceInfo && (
          <span>
            {card.quotedPriceInfo.label}{" "}
            <strong className="font-mono tabular-nums text-slate-900">
              (${Math.round(card.quotedPriceInfo.perNight)}/night)
            </strong>
          </span>
        )}
        {matched && (
          <span>
            Dataset active price:{" "}
            <strong className="font-mono tabular-nums text-emerald-900">
              ${Math.round(matched.price)}/night
            </strong>
          </span>
        )}
      </div>

      {/* Photos Thumbnail Strip with [x] Remove Buttons */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-800">
            Imported Photos ({card.photos.length} of 12 max)
          </span>
          {card.photos.length > 0 && (
            <span className="text-slate-500">
              Tagged as &ldquo;Untagged&rdquo; · remove unwanted photos below
            </span>
          )}
        </div>

        {card.photos.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-2">
            No large residential photos found in the PDF.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2.5">
            {card.photos.map((p) => (
              <div
                key={p.photoId}
                className="relative w-20 h-16 rounded-md overflow-hidden bg-slate-100 border border-slate-200 group"
              >
                <img
                  src={p.dataUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => onRemovePhoto(p.photoId)}
                  className="absolute top-1 right-1 p-1 bg-red-600/90 text-white rounded hover:bg-red-700 opacity-90 group-hover:opacity-100 transition-opacity cursor-pointer shadow-sm"
                  title="Remove this photo"
                  aria-label="Remove photo"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action Section */}
      <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100">
        {isStep1 ? (
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => onApply(card)}
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-emerald-800 text-white text-sm font-semibold hover:bg-emerald-900 transition-colors shadow-sm cursor-pointer"
            >
              Use as my home
            </button>
            <span className="text-xs text-slate-500 hidden sm:inline">
              {card.isInDataset
                ? "Fills details, sets map pin, and excludes your home from comps."
                : "Fills details parsed from text; please select your DC neighbourhood."}
            </span>
          </div>
        ) : (
          <div className="w-full space-y-3">
            {card.isInDataset ? (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onApply(card)}
                  className="px-4 py-2 rounded-lg bg-emerald-800 text-white text-sm font-semibold hover:bg-emerald-900 transition-colors shadow-sm cursor-pointer"
                >
                  Add as a comparison
                </button>
                <span className="text-xs text-slate-500">
                  Pins this home in your comparisons with an &ldquo;Added by you&rdquo; tag and imported photos.
                </span>
              </div>
            ) : !isCustomFormOpen ? (
              <div className="rounded-xl bg-blue-50/70 border border-blue-200 p-4 space-y-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-blue-900">
                      Listing not in dataset
                    </div>
                    <p className="text-xs text-blue-700 mt-0.5">
                      This home can still be scored and pinned into your 15 matches as a custom comparison.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCustomFormOpen(true)}
                    className="w-full sm:w-auto px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 transition-colors shadow-sm cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Use anyway as a custom comparison
                  </button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={handleCustomSubmit}
                className="rounded-xl border border-blue-300 bg-blue-50/40 p-4 space-y-4"
              >
                <div className="flex items-center justify-between border-b border-blue-200 pb-2">
                  <h5 className="text-sm font-bold text-slate-900">
                    Custom Comparison Details
                  </h5>
                  <button
                    type="button"
                    onClick={() => setIsCustomFormOpen(false)}
                    className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>

                {isOutsideDc && (
                  <div className="rounded-lg bg-amber-100 border border-amber-300 p-2.5 text-xs text-amber-900 font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>Outside DC. Its price may not reflect your market.</span>
                  </div>
                )}

                {formError && (
                  <div className="rounded-lg bg-red-100 border border-red-300 p-2.5 text-xs text-red-900 font-medium">
                    {formError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  {/* Room Type */}
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700 block">
                      Room Type
                    </label>
                    <select
                      value={customRoomType}
                      onChange={(e) => setCustomRoomType(e.target.value as RoomType)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                    >
                      <option value="entire">Entire home/apt</option>
                      <option value="private">Private room</option>
                    </select>
                  </div>

                  {/* Bedrooms */}
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700 block">
                      Bedrooms
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      step={1}
                      value={customBedrooms}
                      onChange={(e) => setCustomBedrooms(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                    />
                  </div>

                  {/* Bathrooms */}
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700 block">
                      Bathrooms
                    </label>
                    <input
                      type="number"
                      min={0.5}
                      max={10}
                      step={0.5}
                      value={customBathrooms}
                      onChange={(e) => setCustomBathrooms(Math.max(0.5, parseFloat(e.target.value) || 1))}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                    />
                  </div>

                  {/* Guests */}
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700 block">
                      Guests (Accommodates)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      step={1}
                      value={customGuests}
                      onChange={(e) => setCustomGuests(Math.max(1, parseInt(e.target.value) || 2))}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                    />
                  </div>
                </div>

                {/* Nightly Rate (Required) */}
                <div className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-slate-700">
                      Nightly Rate (USD) <span className="text-red-600">*</span>
                    </label>
                    <span className="text-[11px] text-slate-500 font-mono">Required</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-400 font-bold">$</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      required
                      placeholder="e.g. 250"
                      value={customRate}
                      onChange={(e) => setCustomRate(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white pl-7 pr-3 py-1.5 text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 italic mt-0.5">
                    From the saved page. Quotes include fees and are for specific dates; edit if you know the base rate.
                  </p>
                </div>

                {/* Location: Neighbourhood & Map Picker */}
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-slate-700">
                      Location (Neighbourhood &amp; Coordinates)
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsMapPickerOpen(!isMapPickerOpen)}
                      className="text-xs text-blue-700 hover:text-blue-900 font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      {isMapPickerOpen ? "Hide map" : "Click map to set location"}
                      {isMapPickerOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                    <select
                      value={customNeighbourhood}
                      onChange={handleNeighbourhoodChange}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                    >
                      {neighbourhoods.map((hood) => (
                        <option key={hood} value={hood}>
                          {hood}
                        </option>
                      ))}
                    </select>

                    <div className="text-slate-600 flex items-center justify-between px-2 py-1.5 rounded-lg bg-white border border-slate-200">
                      <span className="font-mono text-[11px]">
                        Pin: {currentCoords.lat.toFixed(4)}, {currentCoords.lon.toFixed(4)}
                      </span>
                      {customCoords && (
                        <button
                          type="button"
                          onClick={() => setCustomCoords(null)}
                          className="text-[10px] text-blue-700 hover:underline cursor-pointer ml-2"
                        >
                          Reset to center
                        </button>
                      )}
                    </div>
                  </div>

                  {isMapPickerOpen && (
                    <div className="mt-2 space-y-1">
                      <div className="text-[11px] text-slate-500">
                        Click anywhere on the map to pin this home&apos;s location:
                      </div>
                      <InteractiveMap
                        homePoint={currentCoords}
                        isCustomPin={true}
                        comps={[]}
                        interactivePinDrop={true}
                        onSelectHomePoint={(coords) => setCustomCoords(coords)}
                        heightClass="h-56"
                      />
                    </div>
                  )}
                </div>

                {/* Form Submit */}
                <div className="flex items-center justify-end gap-3 pt-2 border-t border-blue-200">
                  <button
                    type="button"
                    onClick={() => setIsCustomFormOpen(false)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 transition-colors shadow-sm cursor-pointer"
                  >
                    Add custom comparison
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

