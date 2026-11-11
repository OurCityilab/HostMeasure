import React, { useState } from "react";
import {
  AlertTriangle,
  Camera,
  ExternalLink,
  Filter,
  Maximize2,
  RotateCcw,
  X,
} from "lucide-react";
import { DC_RULES } from "../../config/dcRules";
import { summarizePropertyCondition } from "../../engine/condition";
import {
  AdjustmentLogEntry,
  AiConfidence,
  CompSelectionResult,
  ConditionScoreValue,
  ConditionScoringMethod,
  ExclusionReasonCode,
  HomeProfile,
  Listing,
  ParsedPdfListing,
  PropertyPhoto,
  PropertyRoomType,
  ScoredComp,
} from "../../types";
import { InteractiveMap } from "./InteractiveMap";
import { PdfDropZone } from "./PdfDropZone";
import { PdfReviewCard } from "./PdfReviewCard";
import {
  ConditionEvaluationWorkspace,
  PropertyPhotoIntake,
} from "./PhotoConditionAnalyzer";

interface Step3CompsProps {
  home: HomeProfile;
  listings: Listing[];
  compSelectionA: CompSelectionResult;
  compSelectionB: CompSelectionResult;
  onlyHostsLikeMe: boolean;
  onToggleOnlyHostsLikeMe: (next: boolean) => void;
  onExcludeComp: (
    pathId: "pathA" | "pathB",
    listingId: string,
    reasonText: string
  ) => void;
  onAddPinnedComp: (card: ParsedPdfListing) => void;
  adjustmentsLog: AdjustmentLogEntry[];
  excludedCount: number;
  onResetExclusions: () => void;
  allPhotos: PropertyPhoto[];
  activeScoringMethod: ConditionScoringMethod;
  onChangeActiveScoringMethod: (method: ConditionScoringMethod) => void;
  ratePerPoint: number;
  onChangeRatePerPoint: (rate: number) => void;
  useCoverScores: boolean;
  onToggleUseCoverScores: (checked: boolean) => void;
  onAddPhotos: (newPhotos: PropertyPhoto[]) => void;
  onUpdatePhotoRoom: (photoId: string, room: PropertyRoomType) => void;
  onRemovePhoto: (photoId: string) => void;
  onMarkPhotoUnavailable?: (photoId: string) => void;
  onApplyAiRating: (
    photoId: string,
    rating: {
      score: ConditionScoreValue;
      confidence: AiConfidence;
      observations: string[];
      ratedAt: string;
      room?: PropertyRoomType;
    }
  ) => void;
  onApplyDeskRating: (
    photoId: string,
    score: ConditionScoreValue,
    ratedAt: string
  ) => void;
  onLogDeskReviewStart: (seed: string) => void;
  onDeskReviewCompleted: () => void;
  onLogCustomAdjustment?: (entry: {
    listingId: string;
    listingName?: string;
    reason: string;
  }) => void;
}

const EXCLUSION_REASON_LABELS: Record<ExclusionReasonCode, string> = {
  renovated_luxury: "Renovated luxury",
  wrong_location: "Wrong location",
  different_property_type: "Different property type",
  other: "Other",
};

export const Step3Comps: React.FC<Step3CompsProps> = ({
  home,
  listings,
  compSelectionA,
  compSelectionB,
  onlyHostsLikeMe,
  onToggleOnlyHostsLikeMe,
  onExcludeComp,
  onAddPinnedComp,
  adjustmentsLog,
  excludedCount,
  onResetExclusions,
  allPhotos,
  activeScoringMethod,
  onChangeActiveScoringMethod,
  ratePerPoint,
  onChangeRatePerPoint,
  useCoverScores,
  onToggleUseCoverScores,
  onAddPhotos,
  onUpdatePhotoRoom,
  onRemovePhoto,
  onMarkPhotoUnavailable,
  onApplyAiRating,
  onApplyDeskRating,
  onLogDeskReviewStart,
  onDeskReviewCompleted,
  onLogCustomAdjustment,
}) => {
  const [activePath, setActivePath] = useState<"pathA" | "pathB">("pathA");
  const [excludingComp, setExcludingComp] = useState<ScoredComp | null>(null);
  const [inspectingPhotoComp, setInspectingPhotoComp] =
    useState<ScoredComp | null>(null);
  const [selectedReasonCode, setSelectedReasonCode] =
    useState<ExclusionReasonCode>("renovated_luxury");
  const [otherReasonText, setOtherReasonText] = useState<string>("");
  const [pdfReviewCards, setPdfReviewCards] = useState<ParsedPdfListing[]>([]);
  const [lightboxPhoto, setLightboxPhoto] = useState<{
    url: string;
    title: string;
    roomId: string;
  } | null>(null);
  const [failedImageUrls, setFailedImageUrls] = useState<Set<string>>(
    () => new Set()
  );

  const handleImageError = (url: string) => {
    setFailedImageUrls((prev) => {
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  };

  const activeSelection =
    activePath === "pathA" ? compSelectionA : compSelectionB;

  const subjectSummary = summarizePropertyCondition(
    "subject",
    allPhotos,
    activeScoringMethod
  );

  const handleConfirmExclude = (e: React.FormEvent) => {
    e.preventDefault();
    if (!excludingComp) return;

    const reasonLabel =
      selectedReasonCode === "other"
        ? `Other: ${otherReasonText.trim() || "Not comparable"}`
        : EXCLUSION_REASON_LABELS[selectedReasonCode];

    onExcludeComp(activePath, excludingComp.id, reasonLabel);
    setExcludingComp(null);
    setOtherReasonText("");
  };

  const formatSignedDollar = (val: number) => {
    const rounded = Math.round(val);
    if (rounded === 0) return "$0/night";
    return `${rounded > 0 ? "+" : "-"}$${Math.abs(rounded)}/night`;
  };

  return (
    <section
      id="step-3"
      className="scroll-mt-24 bg-white border border-slate-200 rounded-xl p-6 md:p-8 space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-baseline justify-between gap-3 pb-6 border-b border-slate-200">
        <div>
          <span className="text-xs font-semibold text-emerald-800 tracking-wide">
            03. Step Three
          </span>
          <h2 className="text-2xl font-bold text-slate-900 mt-0.5">
            Homes Like Yours
          </h2>
        </div>
        <p className="text-sm text-slate-600">
          The 15 closest matching active DC listings for each hosting path, with 1–6 condition scoring via AI analysis or blind Desk review.
        </p>
      </div>

      {/* Controls Bar: Path Switcher + Casual Host Filter + License Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-4">
          {/* Interactive Path Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-lg w-fit">
            <button
              type="button"
              onClick={() => {
                setActivePath("pathA");
                setExcludingComp(null);
                setInspectingPhotoComp(null);
              }}
              className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activePath === "pathA"
                  ? "bg-emerald-900 text-white shadow-xs"
                  : "text-slate-700 hover:text-slate-900"
              }`}
            >
              Path A: Whole home (
              {home.bedrooms === 0 ? "Studio" : `${home.bedrooms} BR`} /{" "}
              {home.bathrooms} BA · {compSelectionA.comps.length} homes)
            </button>
            <button
              type="button"
              onClick={() => {
                setActivePath("pathB");
                setExcludingComp(null);
                setInspectingPhotoComp(null);
              }}
              className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activePath === "pathB"
                  ? "bg-emerald-900 text-white shadow-xs"
                  : "text-slate-700 hover:text-slate-900"
              }`}
            >
              Path B: Private room (1 BR / 1 BA / 2 guests ·{" "}
              {compSelectionB.comps.length} homes)
            </button>
          </div>

          {/* Toggle: Only compare me to hosts like me (1-2 listings) */}
          <div className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50/60">
            <input
              id="hosts-like-me-toggle"
              type="checkbox"
              checked={onlyHostsLikeMe}
              onChange={(e) => onToggleOnlyHostsLikeMe(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-800 focus:ring-emerald-800 cursor-pointer"
            />
            <div className="text-xs space-y-1">
              <label
                htmlFor="hosts-like-me-toggle"
                className="font-semibold text-slate-900 cursor-pointer flex items-center gap-1.5"
              >
                <Filter className="w-3.5 h-3.5 text-emerald-800" />
                Only compare me to hosts like me (1–2 listings)
              </label>
              <p className="text-slate-600 leading-relaxed">
                Professional multi-listing operators price and fill differently from a single homeowner. Turning this on filters out hosts managing 3 or more DC properties.
              </p>
            </div>
          </div>
        </div>

        {/* Small Panel: License Breakdown of the 15 Comps */}
        <div className="lg:col-span-5 rounded-xl border border-slate-200 p-4 bg-slate-50/40 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-slate-900">
              License Breakdown ({activeSelection.comps.length} homes in{" "}
              {activePath === "pathA" ? "Path A" : "Path B"})
            </h3>
            <span className="text-[11px] font-mono tabular-nums text-slate-500">
              Pool: {activeSelection.totalPoolCount.toLocaleString()} listings
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="p-2.5 rounded-lg bg-white border border-slate-200">
              <div className="text-lg font-bold font-mono tabular-nums text-emerald-900">
                {activeSelection.licenseBreakdown.hosted}
              </div>
              <div className="text-[11px] text-slate-600">Hosted</div>
            </div>
            <div className="p-2.5 rounded-lg bg-white border border-slate-200">
              <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
                {activeSelection.licenseBreakdown.unhosted}
              </div>
              <div className="text-[11px] text-slate-600">Unhosted</div>
            </div>
            <div className="p-2.5 rounded-lg bg-white border border-slate-200">
              <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
                {activeSelection.licenseBreakdown.exempt}
              </div>
              <div className="text-[11px] text-slate-600">Exempt</div>
            </div>
            <div className="p-2.5 rounded-lg bg-white border border-slate-200">
              <div className="text-lg font-bold font-mono tabular-nums text-slate-500">
                {activeSelection.licenseBreakdown.other}
              </div>
              <div className="text-[11px] text-slate-500">Other</div>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1">
            <span>{DC_RULES.disclaimerText}</span>
            <span className="font-mono tabular-nums">
              Last verified {DC_RULES.lastVerified}
            </span>
          </div>
        </div>
      </div>

      {/* PDF Import Section for Comparable Homes */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            Import comparison homes from saved Airbnb listing pages (PDF)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Drop saved Airbnb listing PDFs to pin specific comparison homes, attach their photos, and evaluate them in your comparison set.
          </p>
        </div>

        <PdfDropZone
          label="Add homes to compare from saved listing pages (PDF)"
          subtext="Drop saved Airbnb listing PDFs here, or click to browse. Accepts multiple PDFs at once for several listings."
          datasetListings={listings}
          onParsed={(results) => {
            setPdfReviewCards((prev) => [...prev, ...results]);
          }}
          multiple={true}
        />

        {pdfReviewCards.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span className="font-semibold text-slate-800">
                Review Imported Comparison Listings ({pdfReviewCards.length})
              </span>
              <button
                type="button"
                onClick={() => setPdfReviewCards([])}
                className="text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer"
              >
                Dismiss all
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {pdfReviewCards.map((card, idx) => (
                <PdfReviewCard
                  key={`${card.listingId || card.title}-${idx}`}
                  card={card}
                  mode="step3"
                  onApply={(cardToApply) => {
                    onAddPinnedComp(cardToApply);
                    setPdfReviewCards((prev) => prev.filter((_, i) => i !== idx));
                  }}
                  onDismiss={() => {
                    setPdfReviewCards((prev) => prev.filter((_, i) => i !== idx));
                  }}
                  onRemovePhoto={(photoId) => {
                    setPdfReviewCards((prev) =>
                      prev.map((c, i) =>
                        i === idx
                          ? {
                              ...c,
                              photos: c.photos.filter((p) => p.photoId !== photoId),
                            }
                          : c
                      )
                    );
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Condition Evaluation Workspace (Two-Tab Switch: AI analysis | Desk review) */}
      <ConditionEvaluationWorkspace
        allPhotos={allPhotos}
        listings={listings}
        currentComps={activeSelection.comps}
        useCoverScores={useCoverScores}
        onToggleUseCoverScores={onToggleUseCoverScores}
        activeScoringMethod={activeScoringMethod}
        onChangeActiveScoringMethod={onChangeActiveScoringMethod}
        ratePerPoint={ratePerPoint}
        onChangeRatePerPoint={onChangeRatePerPoint}
        onAddPhotos={onAddPhotos}
        onMarkPhotoUnavailable={onMarkPhotoUnavailable}
        onApplyAiRating={onApplyAiRating}
        onApplyDeskRating={onApplyDeskRating}
        onLogDeskReviewStart={onLogDeskReviewStart}
        onDeskReviewCompleted={onDeskReviewCompleted}
        onLogCustomAdjustment={onLogCustomAdjustment}
      />

      {/* Relative Condition Status Bar */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-700">
          <span className="font-semibold text-slate-900 flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5 text-emerald-800" />
            Condition Adjustment Summary ({activeScoringMethod === "desk" ? "Desk review" : "AI analysis"}):
          </span>
          <span>
            Your Home:{" "}
            <strong className="font-mono tabular-nums text-emerald-900">
              {subjectSummary.activeScore !== null
                ? `${subjectSummary.activeScore.toFixed(1)} / 6.0`
                : "Not rated"}
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Adjusted Comps:{" "}
            <strong className="font-mono tabular-nums text-slate-900">
              {activeSelection.adjustedCompCount} of {activeSelection.comps.length}
            </strong>{" "}
            matches were adjusted for condition
            {activeSelection.coverOnlyAdjustedCount > 0 && (
              <span className="text-slate-600">
                ;{" "}
                <strong className="font-mono tabular-nums text-slate-800">
                  {activeSelection.coverOnlyAdjustedCount}
                </strong>{" "}
                of those rest on a single cover photo (low confidence)
              </span>
            )}
          </span>
        </div>
        <div className="font-mono tabular-nums text-xs">
          <span className="text-slate-500">Median rate effect: </span>
          <strong className="text-emerald-900">
            {formatSignedDollar(activeSelection.conditionRateEffect.expected)}
          </strong>{" "}
          <span className="text-slate-500">
            (${Math.round(activeSelection.unadjustedNightlyRate.expected)} raw → $
            {Math.round(activeSelection.conditionAdjustedNightlyRate.expected)}{" "}
            adjusted)
          </span>
        </div>
      </div>

      {/* Thin Market Warning Banner */}
      {activeSelection.isThinMarket && (
        <div className="rounded-xl border border-amber-300 bg-amber-50/80 p-4 flex items-start gap-3 text-amber-950">
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-sm">
            <span className="font-bold">
              Thin market: wider range, treat with caution.
            </span>{" "}
            Only {activeSelection.highConfidenceCount} of{" "}
            {activeSelection.comps.length} comparable homes scored 50 or higher
            (fewer than 8 high-similarity matches near this point).
          </div>
        </div>
      )}

      {/* Map of the 15 Comps */}
      <div>
        <InteractiveMap
          homePoint={activeSelection.homePoint}
          isCustomPin={home.customPin !== null}
          comps={activeSelection.comps}
          onExcludeCompClick={(comp) => {
            setInspectingPhotoComp(null);
            setExcludingComp(comp);
            setSelectedReasonCode("renovated_luxury");
          }}
          heightClass="h-80"
          interactivePinDrop={false}
        />
      </div>

      {/* Inline Comparable Photo Intake Panel */}
      {inspectingPhotoComp && (
        <div className="rounded-xl border border-emerald-800 bg-emerald-50/30 p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-xs font-semibold text-emerald-900">
                Comparable Listing Photo Intake
              </span>
              <h4 className="text-base font-bold text-slate-900 mt-0.5">
                {inspectingPhotoComp.name} (Raw Price: $
                {Math.round(inspectingPhotoComp.rawPrice)}/night · Adjusted Price: $
                {Math.round(inspectingPhotoComp.adjustedPrice)}/night)
              </h4>
            </div>
            <button
              type="button"
              onClick={() => setInspectingPhotoComp(null)}
              className="p-1 text-slate-500 hover:text-slate-800 cursor-pointer"
              aria-label="Close photo intake"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <PropertyPhotoIntake
            propertyId={inspectingPhotoComp.id}
            propertyLabel={inspectingPhotoComp.name}
            allPhotos={allPhotos}
            activeMethod={activeScoringMethod}
            onAddPhotos={onAddPhotos}
            onUpdatePhotoRoom={onUpdatePhotoRoom}
            onRemovePhoto={onRemovePhoto}
            compact={true}
          />
        </div>
      )}

      {/* Inline Exclusion Modal / Banner when excluding a comp */}
      {excludingComp && (
        <form
          onSubmit={handleConfirmExclude}
          className="rounded-xl border border-emerald-800 bg-emerald-50/50 p-5 space-y-4"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-xs font-semibold text-emerald-900">
                Exclude Listing &amp; Replace with Next-Best Match
              </span>
              <h4 className="text-base font-bold text-slate-900 mt-0.5">
                Why isn&apos;t &ldquo;{excludingComp.name}&rdquo; ($
                {Math.round(excludingComp.adjustedPrice)}/night) comparable to
                your home?
              </h4>
            </div>
            <button
              type="button"
              onClick={() => setExcludingComp(null)}
              className="p-1 text-slate-500 hover:text-slate-800 cursor-pointer"
              aria-label="Cancel exclusion"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {(
              Object.keys(EXCLUSION_REASON_LABELS) as ExclusionReasonCode[]
            ).map((code) => (
              <label
                key={code}
                className={`flex items-center gap-2 p-3 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                  selectedReasonCode === code
                    ? "border-emerald-800 bg-white text-emerald-950 font-semibold"
                    : "border-slate-200 bg-white/70 text-slate-700 hover:border-slate-300"
                }`}
              >
                <input
                  type="radio"
                  name="exclusion-reason"
                  value={code}
                  checked={selectedReasonCode === code}
                  onChange={() => setSelectedReasonCode(code)}
                  className="text-emerald-800 focus:ring-emerald-800"
                />
                <span>{EXCLUSION_REASON_LABELS[code]}</span>
              </label>
            ))}
          </div>

          {selectedReasonCode === "other" && (
            <div>
              <label
                htmlFor="other-exclusion-note"
                className="block text-xs font-semibold text-slate-800 mb-1"
              >
                Specify reason
              </label>
              <input
                id="other-exclusion-note"
                type="text"
                required
                placeholder="e.g., Has a private pool and carriage house"
                value={otherReasonText}
                onChange={(e) => setOtherReasonText(e.target.value)}
                className="w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-800 focus:outline-none"
              />
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-900 hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Confirm Exclusion &amp; Replace
            </button>
            <button
              type="button"
              onClick={() => setExcludingComp(null)}
              className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer whitespace-nowrap shrink-0"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Comps Table */}
      <div className="overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
              <th className="py-3 px-3">#</th>
              <th className="py-3 px-3">Listing Name</th>
              <th className="py-3 px-2.5 text-right">Score</th>
              <th className="py-3 px-2.5 text-right">Condition Score</th>
              <th className="py-3 px-2.5 text-right">Raw Price</th>
              <th className="py-3 px-2.5 text-right">Adjusted Price</th>
              <th className="py-3 px-2.5 text-right">Est. Nights/Yr</th>
              <th className="py-3 px-2.5 text-right">BR / Guests</th>
              <th className="py-3 px-2.5 text-right">Miles</th>
              <th className="py-3 px-2.5">License</th>
              <th className="py-3 px-3">Why Chosen</th>
              <th className="py-3 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-xs">
            {activeSelection.comps.length === 0 ? (
              <tr>
                <td
                  colSpan={12}
                  className="py-8 px-4 text-center text-slate-500"
                >
                  No matching homes left in the current filter pool. Try turning
                  off the 1–2 listing filter or resetting exclusions.
                </td>
              </tr>
            ) : (
              activeSelection.comps.map((comp, index) => {
                const compPhotosCount = allPhotos.filter(
                  (p) => p.propertyId === comp.id
                ).length;
                const pctDiff = Math.round(
                  (comp.conditionMultiplier - 1) * 100
                );
                const isPhotoOpen = inspectingPhotoComp?.id === comp.id;

                return (
                  <tr
                    key={comp.id}
                    className={`hover:bg-slate-50/90 transition-colors ${
                      isPhotoOpen ? "bg-emerald-50/40" : ""
                    }`}
                  >
                    <td className="py-2.5 px-3 font-mono tabular-nums text-slate-400">
                      {index + 1}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-3">
                        {/* Cover Thumbnail / Neutral "No photo" placeholder */}
                        {comp.picture_url && !failedImageUrls.has(comp.picture_url) ? (
                          <div className="relative w-16 h-12 shrink-0 rounded-md overflow-hidden bg-slate-100 group border border-slate-200">
                            <a
                              href={`https://www.airbnb.com/rooms/${comp.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block w-full h-full cursor-pointer"
                              title={`Open ${comp.name} on Airbnb`}
                            >
                              <img
                                src={comp.picture_url}
                                alt=""
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                onError={() => handleImageError(comp.picture_url)}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-150"
                              />
                            </a>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setLightboxPhoto({
                                  url: comp.picture_url,
                                  title: comp.name,
                                  roomId: comp.id,
                                });
                              }}
                              className="absolute bottom-0.5 right-0.5 p-1 rounded bg-slate-900/80 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-900 cursor-pointer"
                              title="Expand cover photo in lightbox"
                              aria-label="Expand photo"
                            >
                              <Maximize2 className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="w-16 h-12 shrink-0 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] text-slate-400 font-medium select-none text-center px-1">
                            No photo
                          </div>
                        )}

                        <div className="min-w-0 max-w-[210px] space-y-0.5">
                          <a
                            href={`https://www.airbnb.com/rooms/${comp.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-slate-900 hover:text-emerald-800 hover:underline inline-flex items-center gap-1 truncate max-w-full"
                            title={`${comp.name} (Airbnb ID: ${comp.id})`}
                          >
                            <span className="truncate">{comp.name}</span>
                            <ExternalLink className="w-3 h-3 shrink-0 text-slate-400" />
                          </a>
                          {comp.isPinned && (
                            <div>
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                Added by you
                              </span>
                            </div>
                          )}
                          <div className="text-[11px] text-slate-500 truncate">
                            {comp.neighbourhood} · Host runs{" "}
                            {comp.host_listing_count}{" "}
                            {comp.host_listing_count === 1 ? "listing" : "listings"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {comp.score.toFixed(1)}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
                      {comp.compConditionScore !== null ? (
                        <div>
                          <span className="font-bold text-emerald-900">
                            {comp.compConditionScore.toFixed(1)}
                          </span>
                          {comp.compDeskScore !== null &&
                            comp.compAiScore !== null && (
                              <div className="text-[10px] text-slate-500">
                                D:{comp.compDeskScore.toFixed(1)} · AI:
                                {comp.compAiScore.toFixed(1)}
                              </div>
                            )}
                          {comp.conditionBasis === "cover" && (
                            <div className="text-[10px] text-amber-850 font-sans leading-tight mt-0.5">
                              Cover photo only · low confidence
                              {!useCoverScores ? " · not used" : ""}
                            </div>
                          )}
                          {comp.hasMethodDiscrepancy && (
                            <div className="text-[10px] text-amber-800 font-semibold font-sans">
                              ≥1.0 diff
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 font-sans">
                          Not rated
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-700">
                      ${Math.round(comp.rawPrice)}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
                      <div className="font-semibold text-emerald-900">
                        ${Math.round(comp.adjustedPrice)}
                      </div>
                      {comp.isConditionAdjusted && (
                        <div className="text-[10px] text-slate-500">
                          {pctDiff > 0 ? `+${pctDiff}%` : `${pctDiff}%`}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-700">
                      {Math.round(comp.est_nights_ltm)}{" "}
                      <span className="text-[10px] font-sans text-slate-400">
                        est.
                      </span>
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {comp.bedrooms === 0 ? "Studio" : `${comp.bedrooms} BR`} /{" "}
                      {comp.accommodates}g
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-700">
                      {comp.miles.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-2.5 text-slate-700 capitalize">
                      {comp.license_status}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                      {comp.whyChosen}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setExcludingComp(null);
                            setInspectingPhotoComp(isPhotoOpen ? null : comp);
                          }}
                          className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                            compPhotosCount > 0 || isPhotoOpen
                              ? "border-emerald-800 bg-emerald-50 text-emerald-900"
                              : "border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                          }`}
                          title="Upload room-tagged photos for this comparable listing"
                        >
                          <Camera className="w-3 h-3" />
                          Photos{compPhotosCount > 0 ? ` (${compPhotosCount})` : ""}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setInspectingPhotoComp(null);
                            setExcludingComp(comp);
                            setSelectedReasonCode("renovated_luxury");
                          }}
                          className="px-2 py-1 text-xs font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 rounded border border-slate-200 hover:border-red-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                        >
                          Exclude
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Caption under the table */}
      <div className="text-[11px] text-slate-500 pt-1 px-1">
        Photos: listing cover images via Inside Airbnb. Hosts own their photos. Images are linked, not stored.
      </div>

      {/* Lightbox Modal */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-xs p-4 sm:p-6"
          onClick={() => setLightboxPhoto(null)}
        >
          <div
            className="relative max-w-3xl w-full bg-white rounded-xl overflow-hidden shadow-2xl border border-slate-200 space-y-3 p-4 sm:p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 pb-2 border-b border-slate-100">
              <div>
                <span className="text-xs font-semibold text-emerald-900">
                  Listing Cover Photo
                </span>
                <h4 className="text-base font-bold text-slate-900 mt-0.5 truncate max-w-xl">
                  {lightboxPhoto.title}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setLightboxPhoto(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                aria-label="Close photo preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative aspect-4/3 max-h-[70vh] bg-slate-950 rounded-lg overflow-hidden flex items-center justify-center">
              <img
                src={lightboxPhoto.url}
                alt={lightboxPhoto.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain"
              />
            </div>

            <div className="flex items-center justify-between pt-1 text-xs text-slate-600">
              <a
                href={`https://www.airbnb.com/rooms/${lightboxPhoto.roomId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-emerald-900 hover:underline"
              >
                <span>View original listing on Airbnb</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <span className="text-[11px] text-slate-500">
                Cover image via Inside Airbnb CDN. Linked, not stored.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Adjustments Log */}
      <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/50">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-slate-900">
              Adjustments Log (Append-Only)
            </span>
            <span className="text-slate-400">·</span>
            <span className="font-mono tabular-nums text-slate-600">
              {adjustmentsLog.length}{" "}
              {adjustmentsLog.length === 1 ? "entry" : "entries"}
            </span>
          </div>
          {excludedCount > 0 && (
            <button
              type="button"
              onClick={onResetExclusions}
              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 hover:text-emerald-950 underline cursor-pointer whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3 h-3" />
              Restore {excludedCount} excluded{" "}
              {excludedCount === 1 ? "listing" : "listings"}
            </button>
          )}
        </div>

        {adjustmentsLog.length === 0 ? (
          <p className="text-xs text-slate-500">
            No exclusions, photo ratings, shuffle seeds, or price adjustments recorded yet.
          </p>
        ) : (
          <div className="space-y-2 pt-1 max-h-72 overflow-y-auto">
            {adjustmentsLog.map((entry, idx) => (
              <div
                key={`${entry.timestamp}-${entry.listingId}-${idx}`}
                className="flex flex-wrap items-center justify-between gap-2 text-xs py-2 px-3 rounded-lg bg-white border border-slate-200"
              >
                <div className="flex flex-wrap items-center gap-2 text-slate-700">
                  <span className="font-mono tabular-nums text-slate-400">
                    {new Date(entry.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                  <span>·</span>
                  <span className="font-semibold text-slate-900">
                    {entry.listingName ?? entry.listingId}
                  </span>
                  <span>·</span>
                  <span>{entry.reason}</span>
                </div>
                <div className="font-mono tabular-nums text-xs font-semibold text-emerald-900">
                  Median price effect: {formatSignedDollar(entry.effect.expected)}
                  {entry.previousMedianPrice !== undefined &&
                    entry.newMedianPrice !== undefined && (
                      <span className="text-slate-500 font-normal ml-1">
                        (${Math.round(entry.previousMedianPrice)} → $
                        {Math.round(entry.newMedianPrice)})
                      </span>
                    )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
