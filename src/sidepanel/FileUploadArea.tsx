import { useState, useRef } from "preact/hooks";
import type { JSX } from "preact";
import type { FileConfig } from "@/shared/types";
import { formatFileSize } from "./utils";

/** File upload area with drag & drop and file input. */
export function FileUploadArea({
  config,
  file,
  error,
  onFileSelect,
  onClear,
}: {
  config: FileConfig;
  file: File | null;
  error: string | null;
  onFileSelect: (f: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer?.files?.[0];
    if (droppedFile) {
      onFileSelect(droppedFile);
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function handleInputChange(e: JSX.TargetedEvent<HTMLInputElement>) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) {
      onFileSelect(f);
    }
  }

  if (file) {
    return (
      <div>
        <div class="flex items-center justify-between">
          <div class="text-sm truncate flex-1">
            <span class="font-medium">{file.name}</span>
            <span class="text-gray-400 ml-2">{formatFileSize(file.size)}</span>
          </div>
          <button
            onClick={onClear}
            class="text-xs text-gray-400 hover:text-red-500 ml-2"
          >
            Remove
          </button>
        </div>
        {error && (
          <div class="text-xs text-red-600 mt-1">{error}</div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        class={`text-center py-4 cursor-pointer rounded transition ${
          dragOver
            ? "bg-blue-50 border-blue-300"
            : "hover:bg-gray-100"
        }`}
      >
        <div class="text-sm text-gray-500">{config.label}</div>
        <div class="text-xs text-gray-400 mt-1">
          Drop file here or click to select
        </div>
        <div class="text-xs text-gray-300 mt-1">
          {config.accept} &middot; max {config.max_size_mb} MB
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={config.accept}
        onChange={handleInputChange}
        class="hidden"
      />
      {error && (
        <div class="text-xs text-red-600 mt-1">{error}</div>
      )}
    </div>
  );
}
