import React, { useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Eye,
  Play,
  Shuffle,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import {
  CONDITION_ROOM_WEIGHTS,
  ORDERED_PROPERTY_ROOMS,
} from "../../config/assumptions";
import {
  buildDeskReviewQueue,
  CONDITION_SCALE_ANCHORS,
  generateDeskReviewSeed,
  generateRandomPhotoId,
  MAX_PHOTOS_PER_PROPERTY,
  summarizePropertyCondition,
} from "../../engine/condition";
import {
  AiConfidence,
  ConditionScoreValue,
  ConditionScoringMethod,
  Listing,
  PropertyPhoto,
  PropertyRoomType,
  ScoredComp,
} from "../../types";

/**
 * Reusable card showing the 1-to-6 Fannie Mae (C1-C6 reversed) condition anchors.
 */
export const ConditionScaleAnchorsCard: React.FC<{ compact?: boolean }> = ({
  compact = false,
}) => {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-slate-50/70 ${
        compact ? "p-3.5" : "p-4"
      } space-y-2`}
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-slate-900">
          Condition Scale (1 to 6, where 6 is best · Fannie Mae C1–C6 Reversed)
        </span>
        <span className="text-[11px] text-slate-500">
          Fixed elements only · Ignore furniture, staging &amp; lighting
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-700 font-mono">
        {CONDITION_SCALE_ANCHORS.map((anchor) => (
          <div key={anchor.score} className="leading-relaxed font-sans">
            <strong className="font-mono text-emerald-950">
              {anchor.score}
            </strong>{" "}
            = {anchor.description} ({anchor.fannieMaeCode})
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Resize an uploaded File into a clean JPEG dataUrl + base64 string (no brightness heuristics).
 */
async function readAndResizePhoto(file: File): Promise<{
  dataUrl: string;
  mimeType: string;
  base64Data: string;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const srcUrl = String(e.target?.result ?? "");
      const img = new Image();
      img.onload = () => {
        const maxDim = 1000;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas context unavailable."));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.84);
        const base64Data = dataUrl.split(",")[1] ?? "";
        resolve({
          dataUrl,
          mimeType: "image/jpeg",
          base64Data,
        });
      };
      img.onerror = () => reject(new Error(`Could not decode ${file.name}`));
      img.src = srcUrl;
    };
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export interface PropertyPhotoIntakeProps {
  propertyId: "subject" | string;
  propertyLabel: string;
  allPhotos: PropertyPhoto[];
  activeMethod: ConditionScoringMethod;
  onAddPhotos: (newPhotos: PropertyPhoto[]) => void;
  onUpdatePhotoRoom: (photoId: string, room: PropertyRoomType) => void;
  onRemovePhoto: (photoId: string) => void;
  compact?: boolean;
}

/**
 * Photo Intake component for a single property (either Subject Home or a Comparable Listing).
 * - Assigns random opaque ID (e.g. "P-7K3Q") at upload
 * - Tags each photo with a room: Kitchen, Bathroom, Living area, Bedroom, Exterior
 * - Up to 6 photos per property
 * - Shows property's weighted score (1.0-6.0) or "Not rated"
 */
export const PropertyPhotoIntake: React.FC<PropertyPhotoIntakeProps> = ({
  propertyId,
  propertyLabel,
  allPhotos,
  activeMethod,
  onAddPhotos,
  onUpdatePhotoRoom,
  onRemovePhoto,
  compact = false,
}) => {
  const [defaultUploadRoom, setDefaultUploadRoom] =
    useState<PropertyRoomType>("Kitchen");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const propertyPhotos = allPhotos.filter((p) => p.propertyId === propertyId);
  const summary = summarizePropertyCondition(
    propertyId,
    allPhotos,
    activeMethod
  );
  const remainingSlots = Math.max(
    0,
    MAX_PHOTOS_PER_PROPERTY - propertyPhotos.length
  );

  const handleFilesSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    setUploadError(null);

    if (remainingSlots <= 0) {
      setUploadError("Maximum of 6 photos per property reached.");
      return;
    }

    try {
      const files = Array.from(fileList).slice(0, remainingSlots);
      const existingIds = new Set(allPhotos.map((p) => p.photoId));
      const created: PropertyPhoto[] = [];

      for (const file of files) {
        const processed = await readAndResizePhoto(file);
        const photoId = generateRandomPhotoId(existingIds);
        existingIds.add(photoId);

        created.push({
          photoId,
          propertyId,
          room: defaultUploadRoom,
          dataUrl: processed.dataUrl,
          mimeType: processed.mimeType,
          base64Data: processed.base64Data,
          uploadedAt: new Date().toISOString(),
        });
      }

      onAddPhotos(created);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Failed to read uploaded photo."
      );
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div
      className={`rounded-xl border border-slate-200 ${
        compact ? "p-4 bg-white" : "p-5 bg-slate-50/50"
      } space-y-4`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-900">
            <Camera className="w-3.5 h-3.5" />
            <span>Photo Intake: {propertyLabel}</span>
            <span className="text-slate-400">·</span>
            <span className="font-mono tabular-nums text-slate-600">
              {propertyPhotos.length} / {MAX_PHOTOS_PER_PROPERTY} photos
            </span>
          </div>
          <p className="text-xs text-slate-600">
            Upload up to 6 photos and tag each with its room (Kitchen, Bathroom, Living area, Bedroom, Exterior). Every photo receives a blind ID (such as P-7K3Q) at upload.
          </p>
        </div>

        {/* Score Readout Box */}
        <div className="flex flex-wrap items-center gap-3 text-xs bg-white border border-slate-200 rounded-lg px-3.5 py-2 shrink-0">
          <div>
            <span className="text-slate-500">Active Score ({activeMethod === "desk" ? "Desk review" : "AI analysis"}): </span>
            <strong className="font-mono tabular-nums text-sm text-emerald-950">
              {summary.activeScore !== null
                ? `${summary.activeScore.toFixed(1)} / 6.0`
                : "Not rated"}
            </strong>
          </div>
          {summary.aiScore !== null && summary.deskScore !== null && (
            <>
              <span className="text-slate-300">|</span>
              <div className="font-mono tabular-nums text-slate-700">
                Desk: <strong>{summary.deskScore.toFixed(1)}</strong> · AI:{" "}
                <strong>{summary.aiScore.toFixed(1)}</strong>
              </div>
            </>
          )}
          {summary.hasMethodDiscrepancy && (
            <span className="inline-flex items-center gap-1 text-amber-800 font-semibold">
              <AlertTriangle className="w-3.5 h-3.5" />
              Differs by {summary.methodDifference?.toFixed(1)} pts
            </span>
          )}
        </div>
      </div>

      {/* Upload Controls */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <div className="flex items-center gap-2 text-xs">
          <label
            htmlFor={`room-tag-${propertyId}`}
            className="font-semibold text-slate-800"
          >
            Tag new upload as:
          </label>
          <select
            id={`room-tag-${propertyId}`}
            value={defaultUploadRoom}
            onChange={(e) =>
              setDefaultUploadRoom(e.target.value as PropertyRoomType)
            }
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-emerald-800 focus:outline-none"
          >
            {ORDERED_PROPERTY_ROOMS.map((room) => (
              <option key={room} value={room}>
                {room} (weight {CONDITION_ROOM_WEIGHTS[room]})
              </option>
            ))}
          </select>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFilesSelected}
          className="hidden"
        />
        <button
          type="button"
          disabled={remainingSlots <= 0}
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-900 hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
        >
          <Upload className="w-3.5 h-3.5" />
          Upload Photo{remainingSlots > 1 ? "s" : ""} ({remainingSlots} left)
        </button>
      </div>

      {uploadError && (
        <p className="text-xs font-semibold text-red-700">{uploadError}</p>
      )}

      {/* Uploaded Photos Grid with Room Selector & Random ID */}
      {propertyPhotos.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2">
          {propertyPhotos.map((photo) => (
            <div
              key={photo.photoId}
              className="rounded-lg border border-slate-200 bg-white overflow-hidden flex flex-col justify-between"
            >
              <div className="relative aspect-4/3 bg-slate-100">
                <img
                  src={photo.dataUrl}
                  alt={`${photo.photoId} (${photo.room})`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 left-2 bg-slate-900/80 text-white text-[11px] font-mono px-2 py-0.5 rounded">
                  {photo.photoId}
                </div>
                <button
                  type="button"
                  onClick={() => onRemovePhoto(photo.photoId)}
                  className="absolute top-2 right-2 p-1 rounded bg-slate-900/75 text-white hover:bg-red-700 transition-colors cursor-pointer"
                  title="Remove photo"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="p-2.5 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Room:</span>
                  <select
                    value={photo.room}
                    onChange={(e) =>
                      onUpdatePhotoRoom(
                        photo.photoId,
                        e.target.value as PropertyRoomType
                      )
                    }
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-900 focus:border-emerald-800 focus:outline-none"
                  >
                    {photo.room === "Untagged" && (
                      <option value="Untagged">Untagged</option>
                    )}
                    {ORDERED_PROPERTY_ROOMS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                    {photo.room === "Listing photo (room not tagged)" && (
                      <option value="Listing photo (room not tagged)">
                        Listing photo (room not tagged)
                      </option>
                    )}
                    {photo.room === "Other" && (
                      <option value="Other">Other</option>
                    )}
                  </select>
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-600 pt-1 border-t border-slate-100">
                  <span>
                    Desk:{" "}
                    <strong>
                      {photo.deskRating ? `${photo.deskRating.score}/6` : "—"}
                    </strong>
                  </span>
                  <span>
                    AI:{" "}
                    <strong>
                      {photo.aiRating
                        ? `${photo.aiRating.score}/6 (${photo.aiRating.confidence})`
                        : "—"}
                    </strong>
                  </span>
                </div>

                {photo.aiRating && photo.aiRating.observations.length > 0 && (
                  <div className="text-[11px] text-slate-500 leading-snug">
                    {photo.aiRating.observations.join(" · ")}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConditionScaleAnchorsCard compact={true} />
    </div>
  );
};

/**
 * Test whether an image URL can be loaded successfully in the browser within a timeout (default 8s).
 */
export function checkImageLoadsInBrowser(
  url: string,
  timeoutMs = 8000
): Promise<boolean> {
  return new Promise((resolve) => {
    if (!url || !url.startsWith("https://")) {
      resolve(false);
      return;
    }
    const img = new Image();
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
    }, timeoutMs);

    img.onload = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(true);
      }
    };
    img.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(false);
      }
    };
    img.src = url;
  });
}

export interface ConditionEvaluationWorkspaceProps {
  allPhotos: PropertyPhoto[];
  listings: Listing[];
  currentComps?: ScoredComp[];
  useCoverScores?: boolean;
  onToggleUseCoverScores?: (checked: boolean) => void;
  activeScoringMethod: ConditionScoringMethod;
  onChangeActiveScoringMethod: (method: ConditionScoringMethod) => void;
  ratePerPoint: number;
  onChangeRatePerPoint: (rate: number) => void;
  onAddPhotos: (newPhotos: PropertyPhoto[]) => void;
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

/**
 * Two-Way Condition Analysis Workspace:
 * Tab 1: "AI analysis" (per-photo blind Gemini fixed-element evaluation, temp 0)
 * Tab 2: "Desk review" (blind seeded photo shuffle grouped by room type, 1 photo at a time, reveal table at end)
 */
export const ConditionEvaluationWorkspace: React.FC<
  ConditionEvaluationWorkspaceProps
> = ({
  allPhotos,
  listings,
  currentComps = [],
  useCoverScores = true,
  onToggleUseCoverScores,
  activeScoringMethod,
  onChangeActiveScoringMethod,
  ratePerPoint,
  onChangeRatePerPoint,
  onAddPhotos,
  onMarkPhotoUnavailable,
  onApplyAiRating,
  onApplyDeskRating,
  onLogDeskReviewStart,
  onDeskReviewCompleted,
  onLogCustomAdjustment,
}) => {
  const [selectedTab, setSelectedTab] = useState<"ai" | "desk">("ai");

  // Cover photos panel state
  const [isAddingCovers, setIsAddingCovers] = useState<boolean>(false);
  const [coverAddProgress, setCoverAddProgress] = useState<string>("");

  // AI analysis state
  const [isRunningAi, setIsRunningAi] = useState<boolean>(false);
  const [aiErrorBanner, setAiErrorBanner] = useState<string | null>(null);
  const [aiProgressCount, setAiProgressCount] = useState<number>(0);
  const [aiTotalToRate, setAiTotalToRate] = useState<number>(0);

  // Desk review state
  const [shuffleSeed, setShuffleSeed] = useState<string>(() =>
    generateDeskReviewSeed()
  );
  const [deskStage, setDeskStage] = useState<"intro" | "rating" | "reveal">(
    "intro"
  );
  const [deskQueueIds, setDeskQueueIds] = useState<string[]>([]);
  const [deskIndex, setDeskIndex] = useState<number>(0);
  const [deskImageLoadError, setDeskImageLoadError] = useState<boolean>(false);

  const getPropertyDisplayName = (propertyId: string): string => {
    if (propertyId === "subject") return "Your Subject Home";
    const found = listings.find((l) => l.id === propertyId);
    return found ? `${found.name} (#${found.id})` : `Listing #${propertyId}`;
  };

  // Available photos (excluding unavailable)
  const availablePhotos = allPhotos.filter((p) => !p.unavailable);
  const coverPhotosCount = availablePhotos.filter(
    (p) => p.source === "cover"
  ).length;

  // Add cover photos of matches
  const handleAddMatchesCoverPhotos = async () => {
    if (!currentComps || currentComps.length === 0) return;
    setIsAddingCovers(true);

    const existingCoverPropIds = new Set(
      allPhotos
        .filter((p) => p.source === "cover")
        .map((p) => p.propertyId)
    );
    const existingIds = new Set(allPhotos.map((p) => p.photoId));

    const compsToAdd = currentComps.filter(
      (c) => c.picture_url && !existingCoverPropIds.has(c.id)
    );

    if (compsToAdd.length === 0) {
      setIsAddingCovers(false);
      return;
    }

    const newPhotos: PropertyPhoto[] = [];

    for (let i = 0; i < compsToAdd.length; i++) {
      const comp = compsToAdd[i];
      setCoverAddProgress(`${i + 1} of ${compsToAdd.length}`);

      const photoId = generateRandomPhotoId(existingIds);
      existingIds.add(photoId);

      // Check each image can be loaded in the browser with an 8s timeout
      const loaded = await checkImageLoadsInBrowser(comp.picture_url, 8000);

      if (loaded) {
        newPhotos.push({
          photoId,
          propertyId: comp.id,
          room: "Listing photo (room not tagged)",
          dataUrl: comp.picture_url,
          mimeType: "image/jpeg",
          base64Data: "",
          source: "cover",
          unavailable: false,
          uploadedAt: new Date().toISOString(),
        });
      } else {
        newPhotos.push({
          photoId,
          propertyId: comp.id,
          room: "Listing photo (room not tagged)",
          dataUrl: comp.picture_url,
          mimeType: "image/jpeg",
          base64Data: "",
          source: "cover",
          unavailable: true,
          uploadedAt: new Date().toISOString(),
        });

        onLogCustomAdjustment?.({
          listingId: comp.id,
          listingName: comp.name,
          reason: `Cover photo load failed for "${comp.name}" (timeout or invalid CDN image)`,
        });
      }
    }

    if (newPhotos.length > 0) {
      onAddPhotos(newPhotos);
    }
    setIsAddingCovers(false);
    setCoverAddProgress("");
  };

  // Method 1: Run AI analysis with max 3 concurrent requests
  const handleRunAiAnalysis = async () => {
    const candidates = allPhotos.filter(
      (p) => !p.unavailable && p.aiRating === undefined
    );
    if (candidates.length === 0) return;

    setAiErrorBanner(null);
    setIsRunningAi(true);
    setAiProgressCount(0);
    setAiTotalToRate(candidates.length);

    let completedCount = 0;
    const CONCURRENCY = 3;
    let nextIdx = 0;

    try {
      const worker = async () => {
        while (nextIdx < candidates.length) {
          const idx = nextIdx++;
          const photo = candidates[idx];

          try {
            if (photo.source === "cover") {
              const res = await fetch("/api/rate-cover-photo", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  photoId: photo.photoId,
                  url: photo.dataUrl,
                }),
              });

              if (res.status === 503) {
                throw new Error("AI analysis unavailable. Use Desk review.");
              }

              if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                const errReason = errData.error || `HTTP ${res.status}`;
                const comp = listings.find((l) => l.id === photo.propertyId);
                onLogCustomAdjustment?.({
                  listingId: photo.propertyId,
                  listingName: comp?.name ?? photo.propertyId,
                  reason: `Cover photo rating failed for "${
                    comp?.name ?? photo.propertyId
                  }": ${errReason}`,
                });
              } else {
                const data = await res.json();
                const intScore = Math.round(
                  Number(data.score)
                ) as ConditionScoreValue;
                if (
                  Number.isFinite(intScore) &&
                  intScore >= 1 &&
                  intScore <= 6
                ) {
                  onApplyAiRating(photo.photoId, {
                    score: intScore,
                    confidence: data.confidence ?? "low",
                    observations: Array.isArray(data.observations)
                      ? data.observations
                      : [],
                    ratedAt: new Date().toISOString(),
                    room: data.room,
                  });
                  const comp = listings.find((l) => l.id === photo.propertyId);
                  onLogCustomAdjustment?.({
                    listingId: photo.propertyId,
                    listingName: comp?.name ?? photo.propertyId,
                    reason: `Cover photo rated by AI: ${intScore}/6 (${data.room})`,
                  });
                }
              }
            } else {
              // Uploaded photo
              const res = await fetch("/api/analyze-single-photo", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  photoId: photo.photoId,
                  room: photo.room,
                  mimeType: photo.mimeType,
                  data: photo.base64Data,
                }),
              });

              if (!res.ok) {
                throw new Error("AI analysis unavailable. Use Desk review.");
              }

              const data = await res.json();
              const intScore = Math.round(
                Number(data.score)
              ) as ConditionScoreValue;
              if (!Number.isFinite(intScore) || intScore < 1 || intScore > 6) {
                throw new Error("AI analysis unavailable. Use Desk review.");
              }

              onApplyAiRating(photo.photoId, {
                score: intScore,
                confidence: data.confidence ?? "medium",
                observations: Array.isArray(data.observations)
                  ? data.observations
                  : [],
                ratedAt: new Date().toISOString(),
              });
            }
          } catch (err) {
            if (photo.source === "cover") {
              if (
                err instanceof Error &&
                err.message.includes("AI analysis unavailable")
              ) {
                throw err;
              }
              const comp = listings.find((l) => l.id === photo.propertyId);
              onLogCustomAdjustment?.({
                listingId: photo.propertyId,
                listingName: comp?.name ?? photo.propertyId,
                reason: `Cover photo evaluation error: ${
                  err instanceof Error ? err.message : "Network error"
                }`,
              });
            } else {
              throw err;
            }
          } finally {
            completedCount++;
            setAiProgressCount(completedCount);
          }
        }
      };

      await Promise.all(
        Array.from(
          { length: Math.min(CONCURRENCY, candidates.length) },
          () => worker()
        )
      );
    } catch {
      setAiErrorBanner("AI analysis unavailable. Use Desk review.");
    } finally {
      setIsRunningAi(false);
    }
  };

  // Method 2: Start blind Desk Review
  const handleStartDeskReview = () => {
    if (availablePhotos.length === 0) return;
    const cleanSeed = shuffleSeed.trim() || generateDeskReviewSeed();
    setShuffleSeed(cleanSeed);
    const orderedPhotos = buildDeskReviewQueue(availablePhotos, cleanSeed);
    setDeskQueueIds(orderedPhotos.map((p) => p.photoId));
    setDeskIndex(0);
    setDeskImageLoadError(false);
    setDeskStage("rating");
    onLogDeskReviewStart(cleanSeed);
  };

  const currentDeskPhotoId = deskQueueIds[deskIndex];
  const currentDeskPhoto = allPhotos.find(
    (p) => p.photoId === currentDeskPhotoId
  );

  const handleSelectDeskScore = (score: ConditionScoreValue) => {
    if (!currentDeskPhoto) return;
    onApplyDeskRating(
      currentDeskPhoto.photoId,
      score,
      new Date().toISOString()
    );

    if (deskIndex + 1 < deskQueueIds.length) {
      setDeskIndex(deskIndex + 1);
      setDeskImageLoadError(false);
    } else {
      setDeskStage("reveal");
      onDeskReviewCompleted();
    }
  };

  // Compute property summaries for comparison table
  const uniquePropertyIds = Array.from(
    new Set(["subject", ...availablePhotos.map((p) => p.propertyId)])
  );
  const propertySummaries = uniquePropertyIds.map((pid) =>
    summarizePropertyCondition(pid, allPhotos, activeScoringMethod)
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-6">
      {/* Top Bar: Method Selector + Rate Per Point Assumption Slider */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-5 border-b border-slate-200">
        <div className="space-y-1">
          <span className="text-xs font-semibold text-emerald-800">
            Condition Evaluation &amp; Price Adjustment Engine
          </span>
          <h3 className="text-lg font-bold text-slate-900">
            Analyze Property Photos (1 to 6 Scale)
          </h3>
          <p className="text-xs text-slate-600">
            Room weights: Kitchen 30 · Bathroom 25 · Living area 20 · Bedroom 15 · Exterior 10 (renormalized over rooms with photos). Properties with no photos are &ldquo;Not rated&rdquo; and receive no adjustment.
          </p>
        </div>

        {/* Selector: "Use scores from: Desk review | AI analysis" */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <span className="text-xs font-semibold text-slate-700">
            Use scores from:
          </span>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => onChangeActiveScoringMethod("desk")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeScoringMethod === "desk"
                  ? "bg-emerald-900 text-white shadow-xs"
                  : "text-slate-700 hover:text-slate-900"
              }`}
            >
              Desk review
            </button>
            <button
              type="button"
              onClick={() => onChangeActiveScoringMethod("ai")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeScoringMethod === "ai"
                  ? "bg-emerald-900 text-white shadow-xs"
                  : "text-slate-700 hover:text-slate-900"
              }`}
            >
              AI analysis
            </button>
          </div>
        </div>
      </div>

      {/* PANEL: Listing Cover Photos */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-900">
                Listing Cover Photos
              </span>
              <span className="text-slate-400">·</span>
              <span className="text-xs text-slate-600 font-mono">
                {coverPhotosCount} loaded
              </span>
            </div>
            <p className="text-xs text-slate-600 max-w-xl">
              Cover photos give a rough sense of finishes. They cannot show bathrooms or systems. Scores from cover photos carry low confidence.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              disabled={isAddingCovers || currentComps.length === 0}
              onClick={handleAddMatchesCoverPhotos}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-900 hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              <Camera className="w-3.5 h-3.5" />
              {isAddingCovers
                ? `Checking photos (${coverAddProgress})...`
                : `Add cover photos of my ${currentComps.length} matches`}
            </button>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-200/80 flex items-center gap-2.5">
          <input
            id="use-cover-scores-checkbox"
            type="checkbox"
            checked={useCoverScores}
            onChange={(e) => onToggleUseCoverScores?.(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-emerald-800 focus:ring-emerald-800 cursor-pointer"
          />
          <label
            htmlFor="use-cover-scores-checkbox"
            className="text-xs font-medium text-slate-800 cursor-pointer"
          >
            Use cover-photo scores in price adjustments
          </label>
        </div>
      </div>

      {/* Editable Slider: ratePerPoint (defaults to 6%) */}
      <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <label
            htmlFor="rate-per-point-slider"
            className="font-semibold text-slate-900"
          >
            Your assumption: price change per condition point. Not derived from data.
          </label>
          <span className="font-mono tabular-nums text-sm font-bold text-emerald-900">
            {Math.round(ratePerPoint * 100)}% per condition point (capped at ±30%)
          </span>
        </div>
        <input
          id="rate-per-point-slider"
          type="range"
          min={0}
          max={0.15}
          step={0.01}
          value={ratePerPoint}
          onChange={(e) => onChangeRatePerPoint(Number(e.target.value))}
          className="w-full h-2 bg-slate-200 rounded-lg cursor-pointer"
        />
        <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-500">
          <span>0% / pt</span>
          <span>6% / pt (Default)</span>
          <span>10% / pt</span>
          <span>15% / pt</span>
        </div>
      </div>

      {/* Six Anchors Reference */}
      <ConditionScaleAnchorsCard />

      {/* Clear Two-Tab Switch: "AI analysis" | "Desk review" */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setSelectedTab("ai")}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              selectedTab === "ai"
                ? "border-emerald-900 text-emerald-900"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            AI analysis
          </button>
          <button
            type="button"
            onClick={() => setSelectedTab("desk")}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              selectedTab === "desk"
                ? "border-emerald-900 text-emerald-900"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            Desk review ({availablePhotos.length} photos in pool)
          </button>
        </div>

        {/* TAB 1: AI ANALYSIS */}
        {selectedTab === "ai" && (
          <div className="space-y-4 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-xs text-slate-600 max-w-2xl">
                Sends each photo separately to Gemini at temperature 0 with the six anchors above. Scores only fixed elements (cabinets, counters, floors, fixtures, walls, windows, roof, siding) and never sends address, price, or whether a photo belongs to your home or a comp.
              </p>
              <button
                type="button"
                disabled={isRunningAi || availablePhotos.length === 0}
                onClick={handleRunAiAnalysis}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-900 hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                {isRunningAi
                  ? `Scoring photo ${aiProgressCount} of ${aiTotalToRate}...`
                  : `Run AI analysis (${availablePhotos.length} photo${
                      availablePhotos.length === 1 ? "" : "s"
                    })`}
              </button>
            </div>

            {aiErrorBanner && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-3 text-xs font-semibold text-red-900">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
                  <span>{aiErrorBanner}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTab("desk")}
                  className="px-3 py-1.5 bg-white text-slate-900 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
                >
                  Switch to Desk review
                </button>
              </div>
            )}

            {availablePhotos.length === 0 ? (
              <div className="p-6 rounded-xl border border-slate-200 bg-slate-50 text-center text-xs text-slate-500">
                No photos available yet. Upload photos for your home in Step 1, click &ldquo;Photos&rdquo; on any comp, or click &ldquo;Add cover photos of my matches&rdquo; above.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                      <th className="py-2.5 px-3">Photo ID</th>
                      <th className="py-2.5 px-3">Source</th>
                      <th className="py-2.5 px-3">Room</th>
                      <th className="py-2.5 px-3 text-right">AI Score (1–6)</th>
                      <th className="py-2.5 px-3">Confidence</th>
                      <th className="py-2.5 px-3">Fixed-Element Observations</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {availablePhotos.map((p) => (
                      <tr key={p.photoId}>
                        <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                          {p.photoId}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              p.source === "cover"
                                ? "bg-slate-100 text-slate-700"
                                : "bg-emerald-50 text-emerald-800"
                            }`}
                          >
                            {p.source === "cover" ? "Cover photo" : "Upload"}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">{p.room}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-emerald-900">
                          {p.aiRating ? p.aiRating.score : "Not rated"}
                        </td>
                        <td className="py-2.5 px-3 capitalize text-slate-600">
                          {p.aiRating ? p.aiRating.confidence : "—"}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {p.aiRating
                            ? p.aiRating.observations.join(" · ")
                            : "Click 'Run AI analysis' to evaluate"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: DESK REVIEW (BLIND PHOTO SHUFFLE) */}
        {selectedTab === "desk" && (
          <div className="space-y-4 pt-2">
            {availablePhotos.length === 0 ? (
              <div className="p-6 rounded-xl border border-slate-200 bg-slate-50 text-center text-xs text-slate-500">
                Upload photos for your home or add cover photos of your matches first to pool them for a blind Desk review.
              </div>
            ) : deskStage === "intro" ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-6 space-y-5">
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-emerald-800">
                    Blind Photo Shuffle · Grouped by Room Type
                  </div>
                  <h4 className="text-lg font-bold text-slate-900">
                    Best done by someone who has not seen these homes. Hand the screen to your reviewer.
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
                    All {availablePhotos.length} available photos across your home and comparable properties will be pooled, grouped by room type (so kitchens are rated against kitchens), and shuffled using the seed below. Only the photo, its random ID, the room type, and the 1–6 scale anchors are shown during rating.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 text-xs">
                    <label
                      htmlFor="desk-shuffle-seed"
                      className="font-semibold text-slate-700"
                    >
                      Shuffle Seed:
                    </label>
                    <input
                      id="desk-shuffle-seed"
                      type="text"
                      value={shuffleSeed}
                      onChange={(e) => setShuffleSeed(e.target.value)}
                      className="w-36 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs text-slate-900 focus:border-emerald-800 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShuffleSeed(generateDeskReviewSeed())}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 cursor-pointer"
                    >
                      <Shuffle className="w-3.5 h-3.5" />
                      New seed
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleStartDeskReview}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-emerald-900 hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Start desk review ({availablePhotos.length} photos)
                  </button>
                </div>
              </div>
            ) : deskStage === "rating" && currentDeskPhoto ? (
              <div className="rounded-xl border border-emerald-800 bg-white p-6 space-y-6">
                {/* Blind Header: Progress + Photo ID + Room Type ONLY */}
                <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
                  <div className="flex items-center gap-3">
                    <span className="px-2.5 py-1 rounded bg-slate-900 text-white font-mono text-xs font-semibold">
                      {currentDeskPhoto.photoId}
                    </span>
                    <span className="text-base font-bold text-slate-900">
                      Room:{" "}
                      {currentDeskPhoto.room === "Untagged"
                        ? "Room not tagged"
                        : currentDeskPhoto.source === "cover" &&
                          (!currentDeskPhoto.room ||
                            currentDeskPhoto.room ===
                              "Listing photo (room not tagged)")
                        ? "Listing photo (room not tagged)"
                        : currentDeskPhoto.room}
                    </span>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="text-xs font-mono tabular-nums font-semibold text-slate-700">
                      {deskIndex + 1} of {deskQueueIds.length}
                    </span>
                    <button
                      type="button"
                      disabled={deskIndex === 0}
                      onClick={() => {
                        setDeskIndex(Math.max(0, deskIndex - 1));
                        setDeskImageLoadError(false);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer disabled:opacity-40"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Back
                    </button>
                  </div>
                </div>

                {/* Blind Photo Viewport + 1-6 Anchor Buttons */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  <div className="lg:col-span-7 rounded-xl overflow-hidden border border-slate-200 bg-slate-950 flex items-center justify-center min-h-[300px] max-h-[420px] p-2">
                    {deskImageLoadError ? (
                      <div className="p-8 rounded-xl border border-amber-300 bg-amber-50 text-center space-y-3 max-w-sm">
                        <div className="text-amber-950 font-semibold text-sm">
                          This photo could not be loaded
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (onMarkPhotoUnavailable) {
                              onMarkPhotoUnavailable(currentDeskPhoto.photoId);
                            }
                            if (deskIndex + 1 < deskQueueIds.length) {
                              setDeskIndex(deskIndex + 1);
                              setDeskImageLoadError(false);
                            } else {
                              setDeskStage("reveal");
                              onDeskReviewCompleted();
                            }
                          }}
                          className="px-4 py-2 bg-amber-900 text-white rounded-lg text-xs font-semibold hover:bg-amber-800 cursor-pointer"
                        >
                          Skip to the next photo
                        </button>
                      </div>
                    ) : (
                      <img
                        src={currentDeskPhoto.dataUrl}
                        alt={`Blind review ${currentDeskPhoto.photoId}`}
                        referrerPolicy="no-referrer"
                        onError={() => setDeskImageLoadError(true)}
                        className="max-h-[420px] w-auto object-contain"
                      />
                    )}
                  </div>

                  <div className="lg:col-span-5 space-y-2.5">
                    <div className="text-xs font-semibold text-slate-800 mb-1">
                      Click a condition score (1–6) for fixed elements in this{" "}
                      {currentDeskPhoto.room === "Untagged"
                        ? "room (room not tagged)"
                        : currentDeskPhoto.room.toLowerCase()}
                      :
                    </div>
                    {CONDITION_SCALE_ANCHORS.map((anchor) => {
                      const isSelected =
                        currentDeskPhoto.deskRating?.score === anchor.score;
                      return (
                        <button
                          key={anchor.score}
                          type="button"
                          onClick={() => handleSelectDeskScore(anchor.score)}
                          className={`w-full text-left p-3 rounded-lg border text-xs transition-colors cursor-pointer flex items-start gap-2.5 ${
                            isSelected
                              ? "border-emerald-800 bg-emerald-900 text-white font-semibold"
                              : "border-slate-200 bg-slate-50/70 hover:bg-emerald-50/60 hover:border-emerald-700 text-slate-800"
                          }`}
                        >
                          <span className="font-mono font-bold text-sm shrink-0">
                            {anchor.score}
                          </span>
                          <span className="leading-snug">
                            = {anchor.description} ({anchor.fannieMaeCode})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              /* REVEAL TABLE AFTER LAST PHOTO */
              <div className="space-y-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 flex flex-wrap items-center justify-between gap-3 text-xs text-emerald-950">
                  <div className="flex items-center gap-2 font-semibold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-800 shrink-0" />
                    <span>
                      Desk review complete (Seed: <strong className="font-mono">{shuffleSeed}</strong>). Reveal table below shows which property each photo belongs to.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeskStage("intro")}
                    className="px-3 py-1.5 text-xs font-semibold bg-white text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                  >
                    Restart or replay seed
                  </button>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                        <th className="py-2.5 px-3.5">Photo ID</th>
                        <th className="py-2.5 px-3.5">Property</th>
                        <th className="py-2.5 px-3.5">Room</th>
                        <th className="py-2.5 px-3.5 text-right">
                          Desk Score (1–6)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {deskQueueIds.map((pid) => {
                        const photo = allPhotos.find((p) => p.photoId === pid);
                        if (!photo) return null;
                        return (
                          <tr key={photo.photoId}>
                            <td className="py-2.5 px-3.5 font-mono font-semibold text-slate-900">
                              {photo.photoId}
                            </td>
                            <td className="py-2.5 px-3.5 font-medium text-slate-900">
                              {getPropertyDisplayName(photo.propertyId)}
                            </td>
                            <td className="py-2.5 px-3.5 text-slate-700">
                              {photo.room}
                            </td>
                            <td className="py-2.5 px-3.5 text-right font-mono tabular-nums font-bold text-emerald-900">
                              {photo.deskRating ? photo.deskRating.score : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Side-by-Side Property Condition Summary & Discrepancy Flags (>= 1.0 diff) */}
      {propertySummaries.length > 0 && (
        <div className="pt-4 border-t border-slate-200 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <h4 className="font-semibold text-slate-900 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-emerald-800" />
              Weighted Property Condition Scores (Desk Review vs. AI Analysis)
            </h4>
            <span className="text-slate-500">
              Flags properties where Desk review and AI analysis differ by 1.0 or more
            </span>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <th className="py-2.5 px-3.5">Property</th>
                  <th className="py-2.5 px-3 text-right">Photos</th>
                  <th className="py-2.5 px-3 text-right">Basis</th>
                  <th className="py-2.5 px-3 text-right">Desk Review Score</th>
                  <th className="py-2.5 px-3 text-right">AI Analysis Score</th>
                  <th className="py-2.5 px-3 text-right">Active Score Used</th>
                  <th className="py-2.5 px-3.5">Method Comparison Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {propertySummaries.map((s) => (
                  <tr key={s.propertyId}>
                    <td className="py-2.5 px-3.5 font-medium text-slate-900">
                      {getPropertyDisplayName(s.propertyId)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                      {s.photoCount}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          s.basis === "upload"
                            ? "bg-emerald-50 text-emerald-800"
                            : s.basis === "cover"
                            ? "bg-slate-100 text-slate-700"
                            : "text-slate-400"
                        }`}
                      >
                        {s.basis === "upload"
                          ? "Uploads"
                          : s.basis === "cover"
                          ? "Cover photo"
                          : "None"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800">
                      {s.deskScore !== null
                        ? s.deskScore.toFixed(1)
                        : "Not rated"}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800">
                      {s.aiScore !== null ? s.aiScore.toFixed(1) : "Not rated"}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-emerald-900">
                      {s.activeScore !== null
                        ? s.activeScore.toFixed(1)
                        : "Not rated"}
                    </td>
                    <td className="py-2.5 px-3.5">
                      {s.hasMethodDiscrepancy ? (
                        <span className="inline-flex items-center gap-1 text-amber-800 font-semibold">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          Flagged: methods differ by{" "}
                          {s.methodDifference?.toFixed(1)} pts
                        </span>
                      ) : s.aiScore !== null && s.deskScore !== null ? (
                        <span className="text-emerald-800">
                          Within 1.0 pt ({s.methodDifference?.toFixed(1)} pt diff)
                        </span>
                      ) : (
                        <span className="text-slate-400">
                          Single or no method scored
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
