import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  Play,
  Upload,
} from "lucide-react";
import {
  DEFAULT_CONDITION_RATE_PER_POINT,
  DEFAULT_COST_ASSUMPTIONS,
  INITIAL_HOME_PROFILE,
  SAMPLE_HOME_CASE,
} from "../config/assumptions";
import { DATA_SNAPSHOT_METADATA } from "../config/dataSource";
import { DC_RULES } from "../config/dcRules";
import {
  getNeighbourhoodList,
  loadInitialListings,
  parseListingsCsvFile,
} from "../data/listings";
import {
  createExclusionLogEntry,
  getPathTargetSpec,
  selectBothPathComps,
  selectCompsForTarget,
} from "../engine/compEngine";
import { summarizePropertyCondition } from "../engine/condition";
import { evaluateEligibility } from "../engine/eligibility";
import { compareHostingPaths } from "../engine/revenueModel";
import {
  AdjustmentLogEntry,
  AiConfidence,
  ConditionScoreValue,
  ConditionScoringMethod,
  CostAssumptions,
  HomeProfile,
  Listing,
  ParsedPdfListing,
  PropertyPhoto,
  PropertyRoomType,
  RangeValue,
} from "../types";
import { AuditDrawer } from "./components/AuditDrawer";
import { Step1MyHome } from "./components/Step1MyHome";
import { Step2Eligibility } from "./components/Step2Eligibility";
import { Step3Comps } from "./components/Step3Comps";
import { Step4Numbers } from "./components/Step4Numbers";

const ZERO_EFFECT: RangeValue = { low: 0, expected: 0, high: 0 };

export default function App() {
  // Dataset state
  const [listings, setListings] = useState<Listing[]>([]);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [isFallbackSample, setIsFallbackSample] = useState<boolean>(false);
  const [dataSourceLabel, setDataSourceLabel] = useState<string>("Loading...");
  const [dataWarning, setDataWarning] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [sampleLoadedToast, setSampleLoadedToast] = useState<boolean>(false);

  // User workflow state
  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4>(1);
  const [home, setHome] = useState<HomeProfile>(INITIAL_HOME_PROFILE);
  const [onlyHostsLikeMe, setOnlyHostsLikeMe] = useState<boolean>(false);
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [subjectListingId, setSubjectListingId] = useState<string | null>(null);

  // Revised 1-6 Condition state
  const [allPhotos, setAllPhotos] = useState<PropertyPhoto[]>([]);
  const [activeScoringMethod, setActiveScoringMethod] =
    useState<ConditionScoringMethod>("desk");
  const [ratePerPoint, setRatePerPoint] = useState<number>(
    DEFAULT_CONDITION_RATE_PER_POINT
  );
  const [useCoverScores, setUseCoverScores] = useState<boolean>(true);

  const [adjustmentsLog, setAdjustmentsLog] = useState<AdjustmentLogEntry[]>(
    []
  );
  const [assumptions, setAssumptions] = useState<CostAssumptions>(
    DEFAULT_COST_ASSUMPTIONS
  );
  const [isAuditDrawerOpen, setIsAuditDrawerOpen] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastLoggedPriceRef = useRef<Record<string, number>>({});

  // Startup CSV fetch from /config/dataSource.ts
  useEffect(() => {
    let cancelled = false;
    async function initData() {
      setIsLoadingData(true);
      const outcome = await loadInitialListings();
      if (cancelled) return;
      setListings(outcome.listings);
      setIsFallbackSample(outcome.isFallbackSample);
      setDataSourceLabel(outcome.sourceLabel);
      setDataWarning(outcome.warningMessage);
      setIsLoadingData(false);
    }
    initData();
    return () => {
      cancelled = true;
    };
  }, []);

  // Track scroll position to update the 4-step progress bar automatically
  useEffect(() => {
    const handleScroll = () => {
      const stepIds: Array<{ id: string; step: 1 | 2 | 3 | 4 }> = [
        { id: "step-1", step: 1 },
        { id: "step-2", step: 2 },
        { id: "step-3", step: 3 },
        { id: "step-4", step: 4 },
      ];
      let current: 1 | 2 | 3 | 4 = 1;
      for (const item of stepIds) {
        const el = document.getElementById(item.id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 220) {
            current = item.step;
          }
        }
      }
      setActiveStep(current);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Pure engine computations (zero math inside components)
  const neighbourhoods = useMemo(
    () => getNeighbourhoodList(listings),
    [listings]
  );

  const eligibility = useMemo(
    () => evaluateEligibility(home.isPrimaryResidence, home.hasRestriction),
    [home.isPrimaryResidence, home.hasRestriction]
  );

  const compSelections = useMemo(
    () =>
      selectBothPathComps(listings, home, {
        onlyHostsLikeMe,
        excludedIds,
        pinnedIds,
        photos: allPhotos,
        activeMethod: activeScoringMethod,
        ratePerPoint,
        useCoverScores,
      }),
    [
      listings,
      home,
      onlyHostsLikeMe,
      excludedIds,
      pinnedIds,
      allPhotos,
      activeScoringMethod,
      ratePerPoint,
      useCoverScores,
    ]
  );

  const financialComparison = useMemo(
    () =>
      compareHostingPaths({
        compSelectionA: compSelections.pathA,
        compSelectionB: compSelections.pathB,
        home,
        assumptions,
      }),
    [compSelections.pathA, compSelections.pathB, home, assumptions]
  );

  // Requirement 4: Single useEffect depending on compSelections that logs price adjustments
  // Tracks the last logged price per "pathId:listingId" in lastLoggedPriceRef to prevent duplicates.
  useEffect(() => {
    const newEntries: AdjustmentLogEntry[] = [];
    const timestamp = new Date().toISOString();

    const paths = [
      { pathId: "pathA" as const, selection: compSelections.pathA },
      { pathId: "pathB" as const, selection: compSelections.pathB },
    ];

    for (const { pathId, selection } of paths) {
      for (const comp of selection.comps) {
        const key = `${pathId}:${comp.id}`;
        const lastPrice = lastLoggedPriceRef.current[key];
        const currentPrice = comp.adjustedPrice;

        if (comp.isConditionAdjusted) {
          if (
            lastPrice === undefined ||
            Math.abs(lastPrice - currentPrice) >= 0.01
          ) {
            lastLoggedPriceRef.current[key] = currentPrice;
            const pctDiff = Math.round((comp.conditionMultiplier - 1) * 100);
            newEntries.push({
              timestamp,
              listingId: comp.id,
              listingName: comp.name,
              pathId,
              reason: `Price adjustment (${
                activeScoringMethod === "desk" ? "Desk review" : "AI analysis"
              }): Comp ${comp.compConditionScore?.toFixed(
                1
              )} vs Subject ${comp.subjectConditionScore?.toFixed(1)} (${
                pctDiff > 0 ? "+" : ""
              }${pctDiff}%, $${Math.round(comp.rawPrice)} → $${Math.round(
                currentPrice
              )})`,
              effect: {
                low: 0,
                expected: selection.conditionRateEffect.expected,
                high: 0,
              },
              previousMedianPrice: lastPrice,
              newMedianPrice: selection.conditionAdjustedNightlyRate.expected,
            });
          }
        } else {
          // If it was previously condition-adjusted and is now rolled back to raw price
          if (
            lastPrice !== undefined &&
            Math.abs(lastPrice - currentPrice) >= 0.01
          ) {
            lastLoggedPriceRef.current[key] = currentPrice;
            newEntries.push({
              timestamp,
              listingId: comp.id,
              listingName: comp.name,
              pathId,
              reason: `Price reset to raw $${Math.round(
                comp.rawPrice
              )} (condition adjustment rolled back or disabled)`,
              effect: {
                low: 0,
                expected: selection.conditionRateEffect.expected,
                high: 0,
              },
              previousMedianPrice: lastPrice,
              newMedianPrice: selection.conditionAdjustedNightlyRate.expected,
            });
          }
        }
      }
    }

    if (newEntries.length > 0) {
      setAdjustmentsLog((prev) => [...prev, ...newEntries]);
    }
  }, [compSelections, activeScoringMethod, ratePerPoint]);

  // Handlers: Only update their own state; do not call nested state updaters
  const handleUpdateHome = (updated: Partial<HomeProfile>) => {
    setHome((prev) => ({ ...prev, ...updated }));
  };

  const handleUpdateAssumptions = (updated: Partial<CostAssumptions>) => {
    setAssumptions((prev) => ({ ...prev, ...updated }));
  };

  const handleLoadSampleCase = () => {
    setHome({ ...SAMPLE_HOME_CASE });
    setOnlyHostsLikeMe(false);
    setExcludedIds([]);
    setAllPhotos([]);
    setActiveScoringMethod("desk");
    setRatePerPoint(DEFAULT_CONDITION_RATE_PER_POINT);
    setUseCoverScores(true);
    setAssumptions({ ...DEFAULT_COST_ASSUMPTIONS });
    lastLoggedPriceRef.current = {};
    setSampleLoadedToast(true);
    setTimeout(() => setSampleLoadedToast(false), 3000);
  };

  // Photo Intake Handlers
  const handleAddPhotos = (newPhotos: PropertyPhoto[]) => {
    setAllPhotos((prev) => [...prev, ...newPhotos]);
  };

  const handleUpdatePhotoRoom = (photoId: string, room: PropertyRoomType) => {
    setAllPhotos((prev) =>
      prev.map((p) => (p.photoId === photoId ? { ...p, room } : p))
    );
  };

  const handleRemovePhoto = (photoId: string) => {
    setAllPhotos((prev) => prev.filter((p) => p.photoId !== photoId));
  };

  const handleMarkPhotoUnavailable = (photoId: string) => {
    setAllPhotos((prev) =>
      prev.map((p) => (p.photoId === photoId ? { ...p, unavailable: true } : p))
    );
  };

  // Method 1: Apply AI Rating
  const handleApplyAiRating = (
    photoId: string,
    rating: {
      score: ConditionScoreValue;
      confidence: AiConfidence;
      observations: string[];
      ratedAt: string;
      room?: PropertyRoomType;
    }
  ) => {
    setAllPhotos((prev) =>
      prev.map((p) =>
        p.photoId === photoId
          ? {
              ...p,
              aiRating: rating,
              room: rating.room ?? p.room,
            }
          : p
      )
    );

    // If no desk scores exist yet, switch active method to AI
    const anyDeskRated = allPhotos.some((p) => p.deskRating !== undefined);
    if (!anyDeskRated && activeScoringMethod !== "ai") {
      setActiveScoringMethod("ai");
    }

    setAdjustmentsLog((prev) => [
      ...prev,
      {
        timestamp: rating.ratedAt,
        listingId: photoId,
        listingName: `Photo ${photoId}`,
        reason: `Photo rating: ${photoId} | Method: AI analysis | Score: ${rating.score}/6 | Time: ${rating.ratedAt}`,
        effect: ZERO_EFFECT,
      },
    ]);
  };

  // Method 2: Apply Desk Review Rating
  const handleApplyDeskRating = (
    photoId: string,
    score: ConditionScoreValue,
    ratedAt: string
  ) => {
    setAllPhotos((prev) =>
      prev.map((p) =>
        p.photoId === photoId ? { ...p, deskRating: { score, ratedAt } } : p
      )
    );

    setAdjustmentsLog((prev) => [
      ...prev,
      {
        timestamp: ratedAt,
        listingId: photoId,
        listingName: `Photo ${photoId}`,
        reason: `Photo rating: ${photoId} | Method: Desk review | Score: ${score}/6 | Time: ${ratedAt}`,
        effect: ZERO_EFFECT,
      },
    ]);
  };

  // Log Desk Review Shuffle Seed
  const handleLogDeskReviewStart = (seed: string) => {
    const timestamp = new Date().toISOString();
    setAdjustmentsLog((prev) => [
      ...prev,
      {
        timestamp,
        listingId: seed,
        listingName: "Desk Review Shuffle Seed",
        reason: `Desk review started with shuffle seed: ${seed}`,
        effect: ZERO_EFFECT,
      },
    ]);
  };

  // Default to Desk review when Desk review is complete
  const handleDeskReviewCompleted = () => {
    const timestamp = new Date().toISOString();
    setActiveScoringMethod("desk");
    setAdjustmentsLog((prev) => [
      ...prev,
      {
        timestamp,
        listingId: "method-desk",
        listingName: "Selected Scoring Method",
        reason:
          "Desk review completed; defaulted active scoring method to Desk review",
        effect: ZERO_EFFECT,
      },
    ]);
  };

  // Change Selected Method ("Use scores from: Desk review | AI analysis")
  const handleChangeActiveScoringMethod = (
    nextMethod: ConditionScoringMethod
  ) => {
    if (nextMethod === activeScoringMethod) return;
    const timestamp = new Date().toISOString();
    setActiveScoringMethod(nextMethod);
    setAdjustmentsLog((prev) => [
      ...prev,
      {
        timestamp,
        listingId: `method-${nextMethod}`,
        listingName: "Selected Scoring Method",
        reason: `Selected method: Use scores from ${
          nextMethod === "desk" ? "Desk review" : "AI analysis"
        }`,
        effect: ZERO_EFFECT,
      },
    ]);
  };

  // Change ratePerPoint assumption slider
  const handleChangeRatePerPoint = (nextRate: number) => {
    setRatePerPoint(nextRate);
  };

  // Toggle "Use cover-photo scores in price adjustments"
  const handleToggleUseCoverScores = (checked: boolean) => {
    setUseCoverScores(checked);
    const timestamp = new Date().toISOString();
    setAdjustmentsLog((prev) => [
      ...prev,
      {
        timestamp,
        listingId: "toggle-cover-scores",
        listingName: "Cover-Photo Adjustment Toggle",
        reason: `Use cover-photo scores in price adjustments: turned ${
          checked ? "ON" : "OFF"
        }`,
        effect: ZERO_EFFECT,
      },
    ]);
  };

  // Custom log callback from child components
  const handleLogCustomAdjustment = (entry: {
    listingId: string;
    listingName?: string;
    reason: string;
  }) => {
    const timestamp = new Date().toISOString();
    setAdjustmentsLog((prev) => [
      ...prev,
      {
        timestamp,
        listingId: entry.listingId,
        listingName: entry.listingName,
        reason: entry.reason,
        effect: ZERO_EFFECT,
      },
    ]);
  };

  const handleExcludeComp = (
    pathId: "pathA" | "pathB",
    listingId: string,
    reasonText: string
  ) => {
    const logEntry = createExclusionLogEntry({
      listings,
      home,
      pathId,
      onlyHostsLikeMe,
      currentExcludedIds: excludedIds,
      listingIdToExclude: listingId,
      reasonText,
      photos: allPhotos,
      activeMethod: activeScoringMethod,
      ratePerPoint,
    });
    setExcludedIds((prev) =>
      prev.includes(listingId) ? prev : [...prev, listingId]
    );
    setAdjustmentsLog((prev) => [...prev, logEntry]);
  };

  const handleResetExclusions = () => {
    setExcludedIds(subjectListingId ? [subjectListingId] : []);
  };

  const handleApplyPdfHome = (parsed: ParsedPdfListing) => {
    const timestamp = new Date().toISOString();

    const updatedHome: Partial<HomeProfile> = {
      bedrooms: parsed.bedrooms,
      bathrooms: parsed.bathrooms,
      guests: parsed.guests,
    };

    if (parsed.matchedListing) {
      updatedHome.neighbourhood = parsed.matchedListing.neighbourhood;
      updatedHome.customPin = {
        lat: parsed.matchedListing.lat,
        lon: parsed.matchedListing.lon,
      };
      setSubjectListingId(parsed.matchedListing.id);

      // Requirement 15: Exclude this listing from comps
      setExcludedIds((prev) =>
        prev.includes(parsed.matchedListing!.id)
          ? prev
          : [...prev, parsed.matchedListing!.id]
      );

      setAdjustmentsLog((prev) => [
        ...prev,
        {
          timestamp,
          listingId: parsed.matchedListing!.id,
          listingName: parsed.matchedListing!.name,
          reason: "Your own listing is excluded from comparisons",
          effect: ZERO_EFFECT,
        },
      ]);
    } else {
      setSubjectListingId(null);
    }

    setHome((prev) => ({ ...prev, ...updatedHome }));

    // Replace subject photos with imported photos
    const nonSubjectPhotos = allPhotos.filter((p) => p.propertyId !== "subject");
    const subjectPhotos: PropertyPhoto[] = parsed.photos.map((p) => ({
      ...p,
      propertyId: "subject",
    }));
    setAllPhotos([...nonSubjectPhotos, ...subjectPhotos]);

    setAdjustmentsLog((prev) => [
      ...prev,
      {
        timestamp,
        listingId: parsed.listingId || "imported-home",
        listingName: parsed.title,
        reason: `Imported home from saved listing PDF (${parsed.photos.length} photos)`,
        effect: ZERO_EFFECT,
      },
    ]);
  };

  const handleAddPinnedComp = (parsed: ParsedPdfListing) => {
    if (!parsed.matchedListing) return;
    const compId = parsed.matchedListing.id;
    const timestamp = new Date().toISOString();

    const pathId =
      parsed.matchedListing.room_type === "entire" ? "pathA" : "pathB";
    const beforeSelection =
      pathId === "pathA" ? compSelections.pathA : compSelections.pathB;
    const beforeMedian = beforeSelection.conditionAdjustedNightlyRate.expected;

    // 1. Add to pinnedIds
    const nextPinned = pinnedIds.includes(compId)
      ? pinnedIds
      : [...pinnedIds, compId];
    setPinnedIds(nextPinned);

    // 2. Remove from excludedIds if it was excluded
    setExcludedIds((prev) => prev.filter((id) => id !== compId));

    // 3. Attach imported photos to this comp
    const otherPhotos = allPhotos.filter((p) => p.propertyId !== compId);
    const compPhotos = parsed.photos.map((p) => ({
      ...p,
      propertyId: compId,
    }));
    const nextPhotos = [...otherPhotos, ...compPhotos];
    setAllPhotos(nextPhotos);

    // Compute median rate effect
    const targetSpec = getPathTargetSpec(home, listings, pathId);
    const afterSelection = selectCompsForTarget(listings, targetSpec, {
      onlyHostsLikeMe,
      excludedIds: excludedIds.filter((id) => id !== compId),
      pinnedIds: nextPinned,
      photos: nextPhotos,
      activeMethod: activeScoringMethod,
      ratePerPoint,
      useCoverScores,
    });
    const afterMedian = afterSelection.conditionAdjustedNightlyRate.expected;
    const diffMedian = afterMedian - beforeMedian;

    setAdjustmentsLog((prev) => [
      ...prev,
      {
        timestamp,
        listingId: compId,
        listingName: parsed.matchedListing!.name,
        pathId,
        reason: `Added comparison: ${parsed.matchedListing!.name}`,
        effect: {
          low: 0,
          expected: diffMedian,
          high: 0,
        },
        previousMedianPrice: beforeMedian,
        newMedianPrice: afterMedian,
      },
    ]);
  };

  const handleCsvFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setIsLoadingData(true);
    try {
      const parsed = await parseListingsCsvFile(file);
      setListings(parsed);
      setIsFallbackSample(false);
      setDataSourceLabel(
        `${file.name} (${parsed.length.toLocaleString()} active listings)`
      );
      setDataWarning(null);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Failed to parse uploaded CSV."
      );
    } finally {
      setIsLoadingData(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const scrollToStep = (step: 1 | 2 | 3 | 4) => {
    setActiveStep(step);
    const el = document.getElementById(`step-${step}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const subjectConditionSummary = summarizePropertyCondition(
    "subject",
    allPhotos,
    activeScoringMethod
  );

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#top"
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            HostMeasure DC
          </a>

          {/* Zone 2: 4 single-line navigation links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => scrollToStep(1)}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeStep === 1
                  ? "text-emerald-900 font-semibold underline underline-offset-4"
                  : ""
              }`}
            >
              01. My Home
            </button>
            <button
              type="button"
              onClick={() => scrollToStep(2)}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeStep === 2
                  ? "text-emerald-900 font-semibold underline underline-offset-4"
                  : ""
              }`}
            >
              02. Am I Allowed?
            </button>
            <button
              type="button"
              onClick={() => scrollToStep(3)}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeStep === 3
                  ? "text-emerald-900 font-semibold underline underline-offset-4"
                  : ""
              }`}
            >
              03. Homes Like Yours
            </button>
            <button
              type="button"
              onClick={() => scrollToStep(4)}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeStep === 4
                  ? "text-emerald-900 font-semibold underline underline-offset-4"
                  : ""
              }`}
            >
              04. My Numbers
            </button>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleLoadSampleCase}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Load sample case
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main
        id="top"
        className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8"
      >
        {/* First Screen Intro Banner: One-Sentence Purpose + Load Sample Case + CSV Upload */}
        <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-6 md:p-8 space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-3 max-w-3xl">
              <div className="text-xs font-semibold text-emerald-800">
                Washington, DC Homeowner Short-Term Rental Decision Tool
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight text-balance">
                Should you list your DC home on Airbnb? Find out in three minutes whether you are allowed, who you would compete with, and what you would really earn.
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 pt-1">
                <span>1. Am I allowed to host, and under which license?</span>
                <span aria-hidden="true">·</span>
                <span>2. Which listings would I really compete with?</span>
                <span aria-hidden="true">·</span>
                <span>3. What would I realistically earn, as a range?</span>
                <span aria-hidden="true">·</span>
                <span>
                  4. Is it worth it after costs, and which way pays more?
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={handleLoadSampleCase}
                className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-emerald-900 hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Play className="w-4 h-4 fill-current" />
                Load sample case
              </button>

              {(isFallbackSample || !!dataWarning) && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleCsvFileChange}
                    className="hidden"
                    id="csv-upload-input"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Upload className="w-4 h-4 text-emerald-800" />
                    Upload listings CSV
                  </button>
                </>
              )}
            </div>
          </div>

          {sampleLoadedToast && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-950 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-800 shrink-0" />
              <span>
                Loaded sample case: Capitol Hill, Lincoln Park · 2 bedrooms · 1.5 bathrooms · 4 guests · 150 nights available · Primary residence (Yes) · No condo/HOA restriction.
              </span>
            </div>
          )}

          {/* Data Loading / Fallback Status Bar */}
          {isLoadingData ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4 flex items-center gap-3 text-xs text-slate-700">
              <Database className="w-4 h-4 text-emerald-800 animate-spin shrink-0" />
              <span>
                Loading DC short-term rental market snapshot and parsing numeric columns...
              </span>
            </div>
          ) : isFallbackSample || dataWarning ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 text-amber-950 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-semibold">
                    Active Dataset: {dataSourceLabel}
                  </div>
                  {dataWarning && (
                    <p className="text-amber-900 leading-relaxed">
                      {dataWarning}
                    </p>
                  )}
                  {uploadError && (
                    <p className="text-red-700 font-semibold mt-1">
                      Upload error: {uploadError}
                    </p>
                  )}
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvFileChange}
                className="hidden"
                id="csv-upload-input"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-2 text-xs font-semibold bg-white text-slate-900 border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-center"
              >
                Upload listings CSV
              </button>
            </div>
          ) : (
            <div className="text-xs text-slate-500 pt-1">
              Based on 3,271 active short-term listings (Inside Airbnb, September 20, 2026).
            </div>
          )}
        </section>

        {/* Live 4-Step Progress Bar & Live Output Strip */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              {
                step: 1 as const,
                title: "Step 1: My Home",
                summary: `${
                  home.bedrooms === 0 ? "Studio" : `${home.bedrooms} BR`
                } · ${home.bathrooms} BA · Cond: ${
                  subjectConditionSummary.activeScore !== null
                    ? `${subjectConditionSummary.activeScore.toFixed(1)}/6`
                    : "Not rated"
                }`,
              },
              {
                step: 2 as const,
                title: "Step 2: Am I Allowed?",
                summary:
                  eligibility.status === "eligible"
                    ? "Eligible (2 paths)"
                    : eligibility.status === "restricted"
                    ? "Resolve HOA/lease first"
                    : "Not eligible (non-primary)",
              },
              {
                step: 3 as const,
                title: "Step 3: Homes Like Yours",
                summary: `Path A: ${compSelections.pathA.comps.length} (${compSelections.pathA.adjustedCompCount} adj) · Path B: ${compSelections.pathB.comps.length} (${compSelections.pathB.adjustedCompCount} adj)`,
              },
              {
                step: 4 as const,
                title: "Step 4: My Numbers",
                summary: `Better: ${
                  financialComparison.betterPathId === "pathB"
                    ? "Path B"
                    : "Path A"
                } ($${Math.round(
                  Math.max(
                    financialComparison.pathA.netIncome.expected,
                    financialComparison.pathB.netIncome.expected
                  )
                ).toLocaleString()}/yr net)`,
              },
            ].map((item) => {
              const isCurrent = activeStep === item.step;
              const isCompleted = activeStep >= item.step;
              return (
                <button
                  key={item.step}
                  type="button"
                  onClick={() => scrollToStep(item.step)}
                  className={`text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                    isCurrent
                      ? "border-emerald-800 bg-emerald-50/40"
                      : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-900">
                    <span>{item.title}</span>
                    <span
                      className={`font-mono text-[11px] ${
                        isCompleted ? "text-emerald-800" : "text-slate-400"
                      }`}
                    >
                      {item.step}/4
                    </span>
                  </div>
                  <div className="text-xs font-mono tabular-nums text-slate-600 truncate mt-1">
                    {item.summary}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Visual Progress Track */}
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-800 transition-transform duration-200 origin-left"
              style={{
                width: "100%",
                transform: `scaleX(${activeStep / 4})`,
              }}
            />
          </div>
        </div>

        {/* STEP 1 - MY HOME */}
        <Step1MyHome
          home={home}
          neighbourhoods={neighbourhoods}
          resolvedHomePoint={compSelections.homePoint}
          previewComps={compSelections.pathA.comps}
          onChangeHome={handleUpdateHome}
          allPhotos={allPhotos}
          activeScoringMethod={activeScoringMethod}
          onAddPhotos={handleAddPhotos}
          onUpdatePhotoRoom={handleUpdatePhotoRoom}
          onRemovePhoto={handleRemovePhoto}
          datasetListings={listings}
          onApplyPdfHome={handleApplyPdfHome}
        />

        {/* STEP 2 - AM I ALLOWED? */}
        <Step2Eligibility
          home={home}
          evaluation={eligibility}
          onChangeHome={handleUpdateHome}
        />

        {/* STEP 3 - HOMES LIKE YOURS (THE COMP ENGINE) */}
        <Step3Comps
          home={home}
          listings={listings}
          compSelectionA={compSelections.pathA}
          compSelectionB={compSelections.pathB}
          onlyHostsLikeMe={onlyHostsLikeMe}
          onToggleOnlyHostsLikeMe={setOnlyHostsLikeMe}
          onExcludeComp={handleExcludeComp}
          onAddPinnedComp={handleAddPinnedComp}
          adjustmentsLog={adjustmentsLog}
          excludedCount={excludedIds.length}
          onResetExclusions={handleResetExclusions}
          allPhotos={allPhotos}
          activeScoringMethod={activeScoringMethod}
          onChangeActiveScoringMethod={handleChangeActiveScoringMethod}
          ratePerPoint={ratePerPoint}
          onChangeRatePerPoint={handleChangeRatePerPoint}
          useCoverScores={useCoverScores}
          onToggleUseCoverScores={handleToggleUseCoverScores}
          onAddPhotos={handleAddPhotos}
          onUpdatePhotoRoom={handleUpdatePhotoRoom}
          onRemovePhoto={handleRemovePhoto}
          onMarkPhotoUnavailable={handleMarkPhotoUnavailable}
          onApplyAiRating={handleApplyAiRating}
          onApplyDeskRating={handleApplyDeskRating}
          onLogDeskReviewStart={handleLogDeskReviewStart}
          onDeskReviewCompleted={handleDeskReviewCompleted}
          onLogCustomAdjustment={handleLogCustomAdjustment}
        />

        {/* STEP 4 - MY NUMBERS */}
        <Step4Numbers
          home={home}
          eligibility={eligibility}
          comparison={financialComparison}
          assumptions={assumptions}
          onChangeAssumptions={handleUpdateAssumptions}
          onResetAssumptions={() =>
            setAssumptions({ ...DEFAULT_COST_ASSUMPTIONS })
          }
          onOpenAuditDrawer={() => setIsAuditDrawerOpen(true)}
        />
      </main>

      {/* "How we got this" Audit Drawer */}
      <AuditDrawer
        isOpen={isAuditDrawerOpen}
        onClose={() => setIsAuditDrawerOpen(false)}
        home={home}
        assumptions={assumptions}
        compSelectionA={compSelections.pathA}
        compSelectionB={compSelections.pathB}
        comparison={financialComparison}
        adjustmentsLog={adjustmentsLog}
        totalDatasetRows={listings.length}
        isFallbackSample={isFallbackSample}
      />

      {/* Footer with exact required Inside Airbnb citation */}
      <footer className="border-t border-slate-200 bg-slate-50 py-6 px-6 mt-12">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600">
          <div className="font-medium text-slate-800">
            {DATA_SNAPSHOT_METADATA.footerCitation}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-slate-500">
            <span>{DC_RULES.disclaimerText}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Rules last verified {DC_RULES.lastVerified}
            </span>
            <span aria-hidden="true">·</span>
            <span>Estimate only, not legal or tax advice.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
