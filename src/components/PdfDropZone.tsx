import React, { useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { extractPdfData, PdfProgressEvent } from "../../data/pdfImport";
import { Listing, ParsedPdfListing } from "../../types";

interface PdfDropZoneProps {
  label: string;
  subtext: string;
  datasetListings: Listing[];
  onParsed: (results: ParsedPdfListing[]) => void;
  multiple?: boolean;
}

export const PdfDropZone: React.FC<PdfDropZoneProps> = ({
  label,
  subtext,
  datasetListings,
  onParsed,
  multiple = true,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<PdfProgressEvent | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const processFiles = async (files: FileList | File[]) => {
    const pdfFiles = Array.from(files).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
    );

    if (pdfFiles.length === 0) {
      setErrorMsg("Please select or drop one or more valid PDF files.");
      return;
    }

    setErrorMsg(null);
    setIsProcessing(true);
    setProgress(null);

    try {
      const results = await extractPdfData(
        pdfFiles,
        datasetListings,
        (progressEvent) => {
          setProgress(progressEvent);
        }
      );

      if (results.length === 0) {
        setErrorMsg("Could not extract any listing data or photos from the selected PDF(s).");
      } else {
        onParsed(results);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while reading the PDF file(s)."
      );
    } finally {
      setIsProcessing(false);
      setProgress(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  return (
    <div className="w-full space-y-2">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isProcessing && inputRef.current?.click()}
        className={`relative rounded-xl border-2 border-dashed p-6 text-center transition-colors cursor-pointer select-none ${
          isDragging
            ? "border-emerald-600 bg-emerald-50/70"
            : isProcessing
            ? "border-slate-300 bg-slate-50 cursor-wait"
            : "border-slate-300 bg-slate-50/50 hover:border-emerald-700 hover:bg-emerald-50/30"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple={multiple}
          onChange={handleChange}
          className="hidden"
          disabled={isProcessing}
        />

        {isProcessing ? (
          <div className="space-y-3 py-2">
            <Loader2 className="w-7 h-7 mx-auto text-emerald-800 animate-spin" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-800">
                {progress
                  ? `Processing file ${progress.fileIndex} of ${progress.totalFiles}: ${progress.fileName}`
                  : "Reading PDF listing page..."}
              </p>
              <p className="text-xs text-slate-500">
                {progress?.phase ?? "Extracting text, links, and embedded photos..."}
              </p>
            </div>
            {progress && (
              <div className="w-48 mx-auto h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-800 transition-all duration-200 rounded-full"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-1.5 py-1">
            <FileUp className="w-6 h-6 mx-auto text-emerald-800" />
            <div className="text-sm font-semibold text-slate-900">{label}</div>
            <p className="text-xs text-slate-500 max-w-lg mx-auto">{subtext}</p>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-700">
          {errorMsg}
        </div>
      )}
    </div>
  );
};
