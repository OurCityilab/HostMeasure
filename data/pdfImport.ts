import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import { generateRandomPhotoId } from "../engine/condition";
import { Listing, ParsedPdfListing, PropertyPhoto, RoomType } from "../types";

// Configure PDF.js worker in browser environment
if (typeof window !== "undefined" && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
}

export interface PdfProgressEvent {
  fileIndex: number;
  totalFiles: number;
  fileName: string;
  phase: string;
  percent: number;
}

export type PdfProgressCallback = (event: PdfProgressEvent) => void;

interface RawExtractedImage {
  canvas: HTMLCanvasElement;
  origWidth: number;
  origHeight: number;
  aHash: Uint8Array;
}

/**
 * Normalize string for title matching: lowercase, alphanumeric characters only.
 */
export function normalizeString(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Calculate sRGB luminance for a pixel: L = 0.2126*R + 0.7152*G + 0.0722*B
 */
function calculateLuminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculate mean and standard deviation of luminance across pixels.
 * Used to reject masks, monochrome fills, and dark/shadow overlays.
 */
function evaluateImageLuminance(ctx: CanvasRenderingContext2D, width: number, height: number): {
  mean: number;
  stdDev: number;
} {
  const imgData = ctx.getImageData(0, 0, width, height).data;
  const totalPixels = width * height;
  if (totalPixels === 0) return { mean: 0, stdDev: 0 };

  // Sample up to 10,000 evenly distributed pixels for fast calculation
  const step = Math.max(1, Math.floor(totalPixels / 10000));
  let count = 0;
  let sumL = 0;

  for (let i = 0; i < totalPixels; i += step) {
    const idx = i * 4;
    const l = calculateLuminance(imgData[idx], imgData[idx + 1], imgData[idx + 2]);
    sumL += l;
    count++;
  }

  const mean = sumL / count;
  let sumSqDiff = 0;

  for (let i = 0; i < totalPixels; i += step) {
    const idx = i * 4;
    const l = calculateLuminance(imgData[idx], imgData[idx + 1], imgData[idx + 2]);
    const diff = l - mean;
    sumSqDiff += diff * diff;
  }

  const stdDev = Math.sqrt(sumSqDiff / count);
  return { mean, stdDev };
}

/**
 * Compute 16x16 grayscale average hash (aHash):
 * 1. Draw image onto 16x16 canvas
 * 2. Calculate average luminance across 256 pixels
 * 3. Each bit is 1 if pixel >= mean, 0 otherwise (256 bits = 32 bytes)
 */
function compute16x16AHash(sourceCanvas: HTMLCanvasElement): Uint8Array {
  const hashCanvas = document.createElement("canvas");
  hashCanvas.width = 16;
  hashCanvas.height = 16;
  const ctx = hashCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return new Uint8Array(32);

  ctx.drawImage(sourceCanvas, 0, 0, 16, 16);
  const data = ctx.getImageData(0, 0, 16, 16).data;

  let sumL = 0;
  const lums = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const idx = i * 4;
    const l = calculateLuminance(data[idx], data[idx + 1], data[idx + 2]);
    lums[i] = l;
    sumL += l;
  }

  const meanL = sumL / 256;
  const hash = new Uint8Array(32);

  for (let i = 0; i < 256; i++) {
    if (lums[i] >= meanL) {
      const byteIdx = Math.floor(i / 8);
      const bitIdx = i % 8;
      hash[byteIdx] |= 1 << bitIdx;
    }
  }

  return hash;
}

/**
 * Compute Hamming distance (differing bit count) between two 32-byte hashes.
 */
function computeHammingDistance(h1: Uint8Array, h2: Uint8Array): number {
  let diff = 0;
  for (let i = 0; i < 32; i++) {
    let xor = h1[i] ^ h2[i];
    while (xor > 0) {
      diff += xor & 1;
      xor >>= 1;
    }
  }
  return diff;
}

/**
 * Extract an image object into an HTMLCanvasElement scaled to max dimension 1200 px.
 */
function renderImageToCanvas(imgObj: any): {
  canvas: HTMLCanvasElement;
  origWidth: number;
  origHeight: number;
} | null {
  try {
    let origWidth = 0;
    let origHeight = 0;
    let bitmap: ImageBitmap | null = null;
    let rawData: Uint8Array | Uint8ClampedArray | null = null;

    if (imgObj instanceof ImageBitmap) {
      bitmap = imgObj;
      origWidth = imgObj.width;
      origHeight = imgObj.height;
    } else if (imgObj?.bitmap instanceof ImageBitmap) {
      bitmap = imgObj.bitmap;
      origWidth = imgObj.width || imgObj.bitmap.width;
      origHeight = imgObj.height || imgObj.bitmap.height;
    } else if (imgObj?.data && imgObj.width && imgObj.height) {
      rawData = imgObj.data;
      origWidth = imgObj.width;
      origHeight = imgObj.height;
    }

    if (!origWidth || !origHeight) return null;

    // Filter out icons and UI chrome: width >= 300 and height >= 200 (in either orientation)
    const isLandscape = origWidth >= 300 && origHeight >= 200;
    const isPortrait = origWidth >= 200 && origHeight >= 300;
    if (!isLandscape && !isPortrait) {
      return null;
    }

    // Scale down to a maximum dimension of 1200 px
    const maxDim = Math.max(origWidth, origHeight);
    let targetWidth = origWidth;
    let targetHeight = origHeight;
    if (maxDim > 1200) {
      const scale = 1200 / maxDim;
      targetWidth = Math.max(1, Math.round(origWidth * scale));
      targetHeight = Math.max(1, Math.round(origHeight * scale));
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    if (bitmap) {
      ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    } else if (rawData) {
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = origWidth;
      tempCanvas.height = origHeight;
      const tempCtx = tempCanvas.getContext("2d");
      if (!tempCtx) return null;

      // Convert raw data to ImageData RGBA
      let rgba: Uint8ClampedArray;
      const pixelCount = origWidth * origHeight;

      if (rawData.length === pixelCount * 4) {
        rgba = new Uint8ClampedArray(rawData);
      } else if (rawData.length === pixelCount * 3) {
        rgba = new Uint8ClampedArray(pixelCount * 4);
        for (let i = 0, j = 0; i < rawData.length; i += 3, j += 4) {
          rgba[j] = rawData[i];
          rgba[j + 1] = rawData[i + 1];
          rgba[j + 2] = rawData[i + 2];
          rgba[j + 3] = 255;
        }
      } else if (rawData.length === pixelCount) {
        // Grayscale
        rgba = new Uint8ClampedArray(pixelCount * 4);
        for (let i = 0, j = 0; i < rawData.length; i++, j += 4) {
          const val = rawData[i];
          rgba[j] = val;
          rgba[j + 1] = val;
          rgba[j + 2] = val;
          rgba[j + 3] = 255;
        }
      } else {
        return null;
      }

      tempCtx.putImageData(new ImageData(rgba as any, origWidth, origHeight), 0, 0);
      ctx.drawImage(tempCanvas, 0, 0, targetWidth, targetHeight);
    } else {
      return null;
    }

    // Check luminance: reject if mean < 12 or stdDev < 8
    const { mean, stdDev } = evaluateImageLuminance(ctx, targetWidth, targetHeight);
    if (mean < 12 || stdDev < 8) {
      return null;
    }

    return { canvas, origWidth, origHeight };
  } catch {
    return null;
  }
}

/**
 * Retrieve a PDF image object from page.objs or page.commonObjs
 */
function resolvePdfImageObject(page: any, objId: string): Promise<any> {
  return new Promise((resolve) => {
    try {
      const objs = objId.startsWith("g_") ? page.commonObjs : page.objs;
      if (!objs) {
        resolve(null);
        return;
      }
      objs.get(
        objId,
        (data: any) => resolve(data),
        () => resolve(null)
      );
    } catch {
      resolve(null);
    }
  });
}

interface ParsedSinglePdf {
  fileName: string;
  listingId: string | null;
  titleFromFile: string;
  rawText: string;
  images: RawExtractedImage[];
}

/**
 * Parse an individual PDF file completely in the browser using pdfjs-dist.
 */
async function parseSinglePdf(
  file: File,
  fileIndex: number,
  totalFiles: number,
  onProgress?: PdfProgressCallback
): Promise<ParsedSinglePdf> {
  const fileName = file.name;
  const titlePart = fileName.replace(/\.pdf$/i, "").split(" - ")[0].trim();

  onProgress?.({
    fileIndex,
    totalFiles,
    fileName,
    phase: "Loading PDF",
    percent: 10,
  });

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    useWorkerFetch: false,
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;

  let collectedText = "";
  let detectedListingId: string | null = null;
  const extractedImages: RawExtractedImage[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const pagePercent = Math.round(10 + (pageNum / numPages) * 80);
    onProgress?.({
      fileIndex,
      totalFiles,
      fileName,
      phase: `Reading page ${pageNum} of ${numPages}`,
      percent: pagePercent,
    });

    const page = await pdf.getPage(pageNum);

    // 1. Text extraction
    try {
      const textContent = await page.getTextContent();
      const pageStrings = textContent.items
        .map((item: any) => item.str || "")
        .filter(Boolean);
      collectedText += " " + pageStrings.join(" ");
    } catch {
      // Continue if text extraction fails on this page
    }

    // 2. Link URLs extraction
    try {
      const annotations = await page.getAnnotations();
      for (const annot of annotations) {
        const url = annot.url || annot.unsafeUrl || annot.action?.uri;
        if (url && typeof url === "string") {
          const match = url.match(/airbnb\.com\/rooms\/(\d+)/);
          if (match && !detectedListingId) {
            detectedListingId = match[1];
          }
        }
      }
    } catch {
      // Continue if annotation extraction fails
    }

    // 3. Embedded images extraction
    try {
      const operatorList = await page.getOperatorList();
      const fnArray = operatorList.fnArray;
      const argsArray = operatorList.argsArray;

      for (let i = 0; i < fnArray.length; i++) {
        const fn = fnArray[i];
        let imgObj: any = null;

        if (fn === pdfjsLib.OPS.paintImageXObject || fn === (pdfjsLib.OPS as any).paintImageXObjectRepeat) {
          const objId = argsArray[i][0];
          if (typeof objId === "string") {
            imgObj = await resolvePdfImageObject(page, objId);
          }
        } else if (fn === pdfjsLib.OPS.paintInlineImageXObject) {
          imgObj = argsArray[i][0];
        }

        if (imgObj) {
          const processed = renderImageToCanvas(imgObj);
          if (processed) {
            const aHash = compute16x16AHash(processed.canvas);
            extractedImages.push({
              canvas: processed.canvas,
              origWidth: processed.origWidth,
              origHeight: processed.origHeight,
              aHash,
            });
          }
        }
      }
    } catch {
      // Continue if operator list extraction fails
    }
  }

  onProgress?.({
    fileIndex,
    totalFiles,
    fileName,
    phase: "Finished reading file",
    percent: 100,
  });

  return {
    fileName,
    listingId: detectedListingId,
    titleFromFile: titlePart,
    rawText: collectedText.trim(),
    images: extractedImages,
  };
}

/**
 * Parse property facts from extracted text (fallback for unmatched listings).
 */
export function parseFactsFromText(text: string): {
  roomType: RoomType;
  bedrooms: number;
  bathrooms: number;
  guests: number;
  city: string;
  isDc: boolean;
  quotedPrice: number | null;
} {
  // Room type
  let roomType: RoomType = "entire";
  if (/private\s+room/i.test(text)) {
    roomType = "private";
  } else if (
    /entire\s+(?:home|rental\s+unit|condo|townhouse|guest\s+suite|place|apartment|flat)/i.test(
      text
    )
  ) {
    roomType = "entire";
  }

  // Bedrooms: Studio = 0, otherwise regex
  let bedrooms = 1;
  if (/\bstudio\b/i.test(text)) {
    bedrooms = 0;
  } else {
    const bedMatch = text.match(/(\d+)\s*(?:bed|bedroom)s?/i);
    if (bedMatch) {
      bedrooms = parseInt(bedMatch[1], 10);
    }
  }

  // Bathrooms
  let bathrooms = 1;
  const bathMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:bath|bathroom)s?/i);
  if (bathMatch) {
    bathrooms = parseFloat(bathMatch[1]);
  }

  // Guests
  let guests = 2;
  const guestMatch = text.match(/(\d+)\s*guest/i);
  if (guestMatch) {
    guests = parseInt(guestMatch[1], 10);
  }

  // City check: confirm Washington, DC or District of Columbia
  const isDc = /(?:washington|district\s+of\s+columbia|\bdc\b)/i.test(text);
  const city = isDc ? "Washington, DC" : "Unknown Location";

  // Quoted price
  let quotedPrice: number | null = null;
  const priceMatch = text.match(/\$(\d{1,4})\s*(?:night|\/night)/i);
  if (priceMatch) {
    quotedPrice = parseInt(priceMatch[1], 10);
  }

  return {
    roomType,
    bedrooms,
    bathrooms,
    guests,
    city,
    isDc,
    quotedPrice,
  };
}

/**
 * Deduplicate images within a listing using 16x16 aHash (Hamming distance <= 12 bits).
 * Keeps the larger original resolution image when duplicate is found.
 * Caps at max 12 photos.
 */
function deduplicateAndFinalizePhotos(
  rawImages: RawExtractedImage[],
  propertyId: "subject" | string
): PropertyPhoto[] {
  const keptImages: RawExtractedImage[] = [];

  for (const candidate of rawImages) {
    let duplicateIndex = -1;
    for (let j = 0; j < keptImages.length; j++) {
      const dist = computeHammingDistance(candidate.aHash, keptImages[j].aHash);
      if (dist <= 12) {
        duplicateIndex = j;
        break;
      }
    }

    if (duplicateIndex >= 0) {
      const existing = keptImages[duplicateIndex];
      const candidateArea = candidate.origWidth * candidate.origHeight;
      const existingArea = existing.origWidth * existing.origHeight;
      if (candidateArea > existingArea) {
        keptImages[duplicateIndex] = candidate;
      }
    } else {
      keptImages.push(candidate);
      if (keptImages.length >= 12) {
        break;
      }
    }
  }

  // Convert to PropertyPhoto objects
  const photos: PropertyPhoto[] = keptImages.slice(0, 12).map((img) => {
    const dataUrl = img.canvas.toDataURL("image/jpeg", 0.85);
    const base64Data = dataUrl.split(",")[1] || "";
    return {
      photoId: generateRandomPhotoId(),
      propertyId,
      room: "Untagged",
      dataUrl,
      base64Data,
      mimeType: "image/jpeg",
      source: "upload",
      uploadedAt: new Date().toISOString(),
    };
  });

  return photos;
}

/**
 * Primary entry point: Extracts listings and photos from one or more dropped Airbnb listing PDFs.
 * Merges multiple PDFs for the same listing (e.g. listing page + photo tour page).
 */
export async function extractPdfData(
  files: File[],
  datasetListings: Listing[],
  onProgress?: PdfProgressCallback
): Promise<ParsedPdfListing[]> {
  const singlePdfs: ParsedSinglePdf[] = [];

  for (let i = 0; i < files.length; i++) {
    const parsed = await parseSinglePdf(files[i], i + 1, files.length, onProgress);
    singlePdfs.push(parsed);
  }

  // Group PDFs by matched listing ID or normalized title
  const groups: Array<{
    listingId: string | null;
    title: string;
    combinedText: string;
    images: RawExtractedImage[];
    fileNames: string[];
    matchedListing: Listing | null;
    matchType: "id" | "title" | "none";
  }> = [];

  for (const pdfItem of singlePdfs) {
    let matchedListing: Listing | null = null;
    let matchType: "id" | "title" | "none" = "none";

    // 1. Try matching by listing ID
    if (pdfItem.listingId) {
      const found = datasetListings.find((l) => l.id === pdfItem.listingId);
      if (found) {
        matchedListing = found;
        matchType = "id";
      }
    }

    // 2. If no ID match, try matching by title
    if (!matchedListing && pdfItem.titleFromFile) {
      const normFile = normalizeString(pdfItem.titleFromFile);
      if (normFile.length >= 6) {
        const matches = datasetListings.filter((l) => {
          const normData = normalizeString(l.name);
          return normData.startsWith(normFile) || (normFile.length >= 10 && normFile.startsWith(normData));
        });
        if (matches.length === 1) {
          matchedListing = matches[0];
          matchType = "title";
        }
      }
    }

    const resolvedId = matchedListing ? matchedListing.id : pdfItem.listingId;
    const resolvedTitle = matchedListing ? matchedListing.name : pdfItem.titleFromFile;
    const groupKey = resolvedId || normalizeString(resolvedTitle);

    const existingGroup = groups.find((g) => {
      const gKey = g.matchedListing?.id || g.listingId || normalizeString(g.title);
      return gKey === groupKey;
    });

    if (existingGroup) {
      existingGroup.combinedText += " " + pdfItem.rawText;
      existingGroup.images.push(...pdfItem.images);
      existingGroup.fileNames.push(pdfItem.fileName);
      if (!existingGroup.matchedListing && matchedListing) {
        existingGroup.matchedListing = matchedListing;
        existingGroup.matchType = matchType;
        existingGroup.listingId = resolvedId;
        existingGroup.title = resolvedTitle;
      }
    } else {
      groups.push({
        listingId: resolvedId,
        title: resolvedTitle,
        combinedText: pdfItem.rawText,
        images: [...pdfItem.images],
        fileNames: [pdfItem.fileName],
        matchedListing,
        matchType,
      });
    }
  }

  // Build ParsedPdfListing results
  const results: ParsedPdfListing[] = [];

  for (const group of groups) {
    const facts = parseFactsFromText(group.combinedText);
    const matched = group.matchedListing;

    const propertyIdForPhotos = matched ? matched.id : "subject";
    const deduplicatedPhotos = deduplicateAndFinalizePhotos(group.images, propertyIdForPhotos);

    const title = matched ? matched.name : group.title;
    const roomType = matched ? matched.room_type : facts.roomType;
    const bedrooms = matched ? matched.bedrooms : facts.bedrooms;
    const bathrooms = matched && matched.bathrooms !== null ? matched.bathrooms : facts.bathrooms;
    const guests = matched ? matched.accommodates : facts.guests;
    const city = matched ? "Washington, DC" : facts.city;

    const cityWarning = !matched && !facts.isDc ? "This listing may not be in Washington, DC" : undefined;

    results.push({
      listingId: matched ? matched.id : group.listingId,
      title,
      roomType,
      bedrooms,
      bathrooms,
      guests,
      city,
      quotedPrice: facts.quotedPrice,
      photos: deduplicatedPhotos,
      isInDataset: matched !== null,
      matchedListing: matched,
      matchType: group.matchType,
      fileNames: group.fileNames,
      cityWarning,
    });
  }

  return results;
}
