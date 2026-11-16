import React, { useState } from "react";
import { ChevronDown, ChevronRight, MapPin, RotateCcw } from "lucide-react";
import {
  ConditionScoringMethod,
  Coordinates,
  HomeProfile,
  Listing,
  ParsedPdfListing,
  PropertyPhoto,
  PropertyRoomType,
  ScoredComp,
} from "../../types";
import { AMENITIES_LIST, AmenityDefinition } from "../../config/amenities";
import { parsePastedAmenities } from "../../engine/amenities";
import { InteractiveMap } from "./InteractiveMap";
import { PdfDropZone } from "./PdfDropZone";
import { PdfReviewCard } from "./PdfReviewCard";
import { PropertyPhotoIntake } from "./PhotoConditionAnalyzer";

interface Step1MyHomeProps {
  home: HomeProfile;
  neighbourhoods: string[];
  resolvedHomePoint: Coordinates;
  previewComps: ScoredComp[];
  onChangeHome: (updated: Partial<HomeProfile>) => void;
  allPhotos: PropertyPhoto[];
  activeScoringMethod: ConditionScoringMethod;
  onAddPhotos: (newPhotos: PropertyPhoto[]) => void;
  onUpdatePhotoRoom: (photoId: string, room: PropertyRoomType) => void;
  onRemovePhoto: (photoId: string) => void;
  datasetListings: Listing[];
  onApplyPdfHome: (parsed: ParsedPdfListing) => void;
  ownerAmenities: string[];
  onChangeOwnerAmenities: (amenities: string[]) => void;
  amenitiesBanner?: string | null;
  onDismissAmenitiesBanner?: () => void;
}

export const Step1MyHome: React.FC<Step1MyHomeProps> = ({
  home,
  neighbourhoods,
  resolvedHomePoint,
  previewComps,
  onChangeHome,
  allPhotos,
  activeScoringMethod,
  onAddPhotos,
  onUpdatePhotoRoom,
  onRemovePhoto,
  datasetListings,
  onApplyPdfHome,
  ownerAmenities,
  onChangeOwnerAmenities,
  amenitiesBanner,
  onDismissAmenitiesBanner,
}) => {
  const [pendingCard, setPendingCard] = useState<ParsedPdfListing | null>(null);
  const [showManualPhotos, setShowManualPhotos] = useState<boolean>(false);
  const [pasteInput, setPasteInput] = useState<string>("");
  const [pasteFeedback, setPasteFeedback] = useState<string | null>(null);

  const handleProcessPastedText = (text: string) => {
    const foundCodes = parsePastedAmenities(text);
    if (foundCodes.length > 0) {
      const merged = Array.from(new Set([...ownerAmenities, ...foundCodes]));
      onChangeOwnerAmenities(merged);
      setPasteFeedback(`Found ${foundCodes.length} amenities`);
      setPasteInput("");
    } else {
      setPasteFeedback("No matching amenities found in pasted text");
    }
  };

  const handleToggleAmenity = (code: string) => {
    if (ownerAmenities.includes(code)) {
      onChangeOwnerAmenities(ownerAmenities.filter((c) => c !== code));
    } else {
      onChangeOwnerAmenities([...ownerAmenities, code]);
    }
  };
  return (
    <section
      id="step-1"
      className="scroll-mt-24 bg-white border border-slate-200 rounded-xl p-6 md:p-8"
    >
      <div className="flex flex-col md:flex-row md:items-baseline justify-between gap-2 pb-6 border-b border-slate-200">
        <div>
          <span className="text-xs font-semibold text-emerald-800 tracking-wide">
            01. Step One
          </span>
          <h2 className="text-2xl font-bold text-slate-900 mt-0.5">My Home</h2>
        </div>
        <p className="text-sm text-slate-600">
          Tell us where your home is, its size, how many nights you could host, and optionally upload room-tagged photos.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-6 items-stretch">
        {/* Left column: Form controls */}
        <div className="lg:col-span-6 space-y-6">
          {/* Neighbourhood selector */}
          <div>
            <label
              htmlFor="neighbourhood-select"
              className="block text-sm font-semibold text-slate-900 mb-2"
            >
              DC Neighbourhood Cluster
            </label>
            <select
              id="neighbourhood-select"
              value={home.neighbourhood}
              onChange={(e) =>
                onChangeHome({
                  neighbourhood: e.target.value,
                  customPin: null,
                })
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-800/20"
            >
              {neighbourhoods.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-500">
              {neighbourhoods.length} DC neighbourhood clusters from Inside Airbnb. Selecting a cluster sets your default reference point to the centroid of its listings.
            </p>
          </div>

          {/* Bedrooms, Bathrooms, Guests */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="bedrooms-select"
                className="block text-sm font-semibold text-slate-900 mb-2"
              >
                Bedrooms
              </label>
              <select
                id="bedrooms-select"
                value={home.bedrooms}
                onChange={(e) =>
                  onChangeHome({ bedrooms: Number(e.target.value) })
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-mono tabular-nums text-slate-900 focus:border-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-800/20"
              >
                <option value={0}>0 (Studio)</option>
                <option value={1}>1 Bedroom</option>
                <option value={2}>2 Bedrooms</option>
                <option value={3}>3 Bedrooms</option>
                <option value={4}>4 Bedrooms</option>
                <option value={5}>5 Bedrooms</option>
                <option value={6}>6+ Bedrooms</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="bathrooms-select"
                className="block text-sm font-semibold text-slate-900 mb-2"
              >
                Bathrooms
              </label>
              <select
                id="bathrooms-select"
                value={home.bathrooms}
                onChange={(e) =>
                  onChangeHome({ bathrooms: Number(e.target.value) })
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-mono tabular-nums text-slate-900 focus:border-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-800/20"
              >
                <option value={1}>1.0 Bath</option>
                <option value={1.5}>1.5 Baths</option>
                <option value={2}>2.0 Baths</option>
                <option value={2.5}>2.5 Baths</option>
                <option value={3}>3.0 Baths</option>
                <option value={3.5}>3.5 Baths</option>
                <option value={4}>4.0+ Baths</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="guests-select"
                className="block text-sm font-semibold text-slate-900 mb-2"
              >
                Max Guests
              </label>
              <select
                id="guests-select"
                value={home.guests}
                onChange={(e) =>
                  onChangeHome({ guests: Number(e.target.value) })
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-mono tabular-nums text-slate-900 focus:border-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-800/20"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12].map((g) => (
                  <option key={g} value={g}>
                    {g} {g === 1 ? "Guest" : "Guests"}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Nights available slider */}
          <div className="pt-2">
            <div className="flex items-center justify-between gap-4 mb-2">
              <label
                htmlFor="nights-available-slider"
                className="text-sm font-semibold text-slate-900"
              >
                How many nights a year could you host?
              </label>
              <span className="text-lg font-bold font-mono tabular-nums text-emerald-900">
                {home.nightsAvailable} nights / yr
              </span>
            </div>
            <input
              id="nights-available-slider"
              type="range"
              min={0}
              max={365}
              step={1}
              value={home.nightsAvailable}
              onChange={(e) =>
                onChangeHome({ nightsAvailable: Number(e.target.value) })
              }
              className="w-full h-2 bg-slate-200 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-xs font-mono tabular-nums text-slate-500 mt-1.5">
              <span>0 nights</span>
              <span>90 nights (DC unhosted cap)</span>
              <span>180 nights</span>
              <span>365 nights</span>
            </div>
          </div>
        </div>

        {/* Right column: Optional pin drop map */}
        <div className="lg:col-span-6 flex flex-col justify-between space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <MapPin className="w-3.5 h-3.5 text-emerald-800 shrink-0" />
              <span>
                {home.customPin
                  ? `Custom pin at ${resolvedHomePoint.lat.toFixed(4)}, ${resolvedHomePoint.lon.toFixed(4)}`
                  : `Using neighbourhood centroid (${resolvedHomePoint.lat.toFixed(4)}, ${resolvedHomePoint.lon.toFixed(4)})`}
              </span>
            </div>
            {home.customPin && (
              <button
                type="button"
                onClick={() => onChangeHome({ customPin: null })}
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 hover:text-emerald-950 underline cursor-pointer whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3 h-3" />
                Reset to neighbourhood centroid
              </button>
            )}
          </div>

          <InteractiveMap
            homePoint={resolvedHomePoint}
            isCustomPin={home.customPin !== null}
            onSelectHomePoint={(coords) => onChangeHome({ customPin: coords })}
            comps={previewComps}
            heightClass="h-64 lg:h-full min-h-[250px]"
            interactivePinDrop={true}
          />

          <p className="text-xs text-slate-500">
            Optional: Click anywhere on the map to drop a pin on your exact block. Dark green shows your home; smaller green markers show the 15 closest comparable homes.
          </p>
        </div>
      </div>

      {/* Card: What your home offers */}
      <div className="mt-8 pt-6 border-t border-slate-200 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              What your home offers
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Tick what your home provides. We compare these against your 15 matches in Step 3 to highlight gaps and advantages.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0 text-xs">
            <span className="font-mono text-slate-500 font-medium">
              {ownerAmenities.length} of {AMENITIES_LIST.length} selected
            </span>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              onClick={() => onChangeOwnerAmenities(AMENITIES_LIST.map((a: AmenityDefinition) => a.code))}
              className="text-emerald-800 hover:text-emerald-950 font-medium cursor-pointer"
            >
              Select all
            </button>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              onClick={() => onChangeOwnerAmenities([])}
              className="text-slate-600 hover:text-slate-900 font-medium cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Pre-fill Banner from matched PDF listing */}
        {amenitiesBanner && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3.5 flex items-center justify-between gap-3 text-xs text-emerald-900 font-medium">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />
              <span>{amenitiesBanner}</span>
            </div>
            {onDismissAmenitiesBanner && (
              <button
                type="button"
                onClick={onDismissAmenitiesBanner}
                className="text-emerald-700 hover:text-emerald-950 font-semibold cursor-pointer shrink-0"
              >
                Dismiss
              </button>
            )}
          </div>
        )}

        {/* 20-Amenity Checklist */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2.5">
          {AMENITIES_LIST.map((item: AmenityDefinition) => {
            const checked = ownerAmenities.includes(item.code);
            return (
              <label
                key={item.code}
                className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors select-none ${
                  checked
                    ? "border-emerald-800 bg-emerald-50/70 text-emerald-950 font-medium shadow-xs"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => handleToggleAmenity(item.code)}
                  className="rounded border-slate-300 text-emerald-800 focus:ring-emerald-800/30 h-4 w-4 shrink-0"
                />
                <span className="truncate">{item.label}</span>
              </label>
            );
          })}
        </div>

        {/* Paste Helper */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label
              htmlFor="amenity-paste-box"
              className="text-xs font-semibold text-slate-800"
            >
              Or paste the amenities list from the listing&apos;s &ldquo;What this place offers&rdquo; window.
            </label>
            {pasteFeedback && (
              <span className="text-xs font-semibold text-emerald-800 bg-emerald-100/70 px-2.5 py-0.5 rounded-full inline-block">
                {pasteFeedback}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <textarea
              id="amenity-paste-box"
              value={pasteInput}
              onChange={(e) => setPasteInput(e.target.value)}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                handleProcessPastedText(text);
              }}
              placeholder="Paste copied text here (e.g. from Airbnb modal). Any recognized amenities will be checked automatically..."
              rows={2}
              className="flex-1 rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-800/20"
            />
            {pasteInput.trim() && (
              <button
                type="button"
                onClick={() => handleProcessPastedText(pasteInput)}
                className="px-3 py-2 text-xs font-semibold text-white bg-emerald-900 hover:bg-emerald-800 rounded-lg cursor-pointer shrink-0 transition-colors"
              >
                Parse
              </button>
            )}
          </div>
          <p className="text-[11px] text-slate-500">
            Filters out lines starting with &ldquo;unavailable&rdquo; and ignores anything after &ldquo;not included&rdquo;.
          </p>
        </div>
      </div>

      {/* PDF Import Section */}
      <div className="mt-8 pt-6 border-t border-slate-200 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            Import from saved Airbnb listing (PDF)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Drop your saved Airbnb listing page and/or photo tour PDF here to import details, location, and photos automatically.
          </p>
        </div>

        <PdfDropZone
          label="Import my home from a saved listing page (PDF)"
          subtext="Drag & drop your saved Airbnb listing PDF here, or click to browse. Accepts one or more PDFs for your home."
          datasetListings={datasetListings}
          onParsed={(results) => {
            if (results.length > 0) {
              setPendingCard(results[0]);
            }
          }}
          multiple={true}
        />

        {pendingCard && (
          <PdfReviewCard
            card={pendingCard}
            mode="step1"
            onApply={(card) => {
              onApplyPdfHome(card);
              setPendingCard(null);
            }}
            onDismiss={() => setPendingCard(null)}
            onRemovePhoto={(photoId) => {
              setPendingCard((prev) =>
                prev
                  ? {
                      ...prev,
                      photos: prev.photos.filter((p) => p.photoId !== photoId),
                    }
                  : null
              );
            }}
          />
        )}

        {/* Secondary: Add photos manually */}
        <div className="pt-2">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowManualPhotos((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 hover:text-emerald-950 underline cursor-pointer"
            >
              {showManualPhotos ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
              <span>Add photos manually</span>
            </button>
            <span className="text-xs text-slate-400">
              Upload and tag photos room by room
            </span>
          </div>

          {showManualPhotos && (
            <div className="mt-4">
              <PropertyPhotoIntake
                propertyId="subject"
                propertyLabel={`Your Home (${home.neighbourhood})`}
                allPhotos={allPhotos}
                activeMethod={activeScoringMethod}
                onAddPhotos={onAddPhotos}
                onUpdatePhotoRoom={onUpdatePhotoRoom}
                onRemovePhoto={onRemovePhoto}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
