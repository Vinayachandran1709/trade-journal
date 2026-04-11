"use client";

import { useRef, useState, DragEvent, ChangeEvent } from "react";

interface FileUploadProps {
  accept: string;
  onChange: (file: File) => void;
  maxSize?: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileUpload({ accept, onChange, maxSize }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState("");

  function validateAndSet(file: File) {
    setError("");

    const ext = file.name.split(".").pop()?.toLowerCase();
    const acceptedExts = accept
      .split(",")
      .map((a) => a.trim().replace(".", "").toLowerCase());

    if (!acceptedExts.includes(ext || "")) {
      setError(`Only ${accept} files are accepted.`);
      return;
    }

    if (maxSize && file.size > maxSize) {
      setError(`File must be smaller than ${formatBytes(maxSize)}.`);
      return;
    }

    setSelectedFile(file);
    onChange(file);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave() {
    setDragging(false);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) validateAndSet(file);
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) validateAndSet(file);
  }

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 transition-colors ${
          dragging
            ? "border-indigo-500 bg-indigo-50"
            : "border-gray-300 bg-gray-50 hover:border-indigo-400 hover:bg-gray-100"
        }`}
      >
        <svg
          className={`h-10 w-10 ${dragging ? "text-indigo-500" : "text-gray-400"}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
          />
        </svg>

        {selectedFile ? (
          <div className="mt-3 text-center">
            <p className="text-sm font-semibold text-gray-800">
              {selectedFile.name}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              {formatBytes(selectedFile.size)}
            </p>
            <p className="mt-1 text-xs text-indigo-600">Click to change file</p>
          </div>
        ) : (
          <div className="mt-3 text-center">
            <p className="text-sm font-semibold text-gray-700">
              Drag & drop your file here
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              or{" "}
              <span className="font-medium text-indigo-600">browse to upload</span>
            </p>
            <p className="mt-1 text-xs text-gray-400">Accepted: {accept}</p>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
      />
    </div>
  );
}
