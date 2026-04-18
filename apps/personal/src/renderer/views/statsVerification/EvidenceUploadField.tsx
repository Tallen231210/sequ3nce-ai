import React, { useRef, useState } from 'react';
import { compressImage } from '../../utils/compressImage';
import { generateEvidenceUploadUrl } from '../../convex';

export interface UploadedEvidence {
  storageId: string;
  previewUrl: string; // object URL for thumbnail display
}

interface EvidenceUploadFieldProps {
  userId: string;
  label: string;
  hint: string;
  minFiles: number;
  maxFiles: number;
  uploaded: UploadedEvidence[];
  onChange: (next: UploadedEvidence[]) => void;
  testId?: string;
}

export function EvidenceUploadField({
  userId,
  label,
  hint,
  minFiles,
  maxFiles,
  uploaded,
  onChange,
  testId,
}: EvidenceUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const remaining = maxFiles - uploaded.length;

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    const files = Array.from(fileList).slice(0, remaining);
    if (files.length === 0) {
      setError(`Maximum ${maxFiles} files reached`);
      return;
    }

    setUploading(true);
    const newItems: UploadedEvidence[] = [];
    try {
      for (const file of files) {
        if (!file.type.startsWith('image/')) {
          setError(`${file.name} is not an image`);
          continue;
        }
        // Compress client-side so user never hits size limits
        const compressed = await compressImage(file);
        // Get a signed upload URL
        const urlRes = await generateEvidenceUploadUrl(userId);
        if ('error' in urlRes) {
          setError(urlRes.error);
          continue;
        }
        const put = await fetch(urlRes.uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'image/jpeg' },
          body: compressed,
        });
        if (!put.ok) {
          setError(`Upload failed for ${file.name}`);
          continue;
        }
        const { storageId } = (await put.json()) as { storageId: string };
        const previewUrl = URL.createObjectURL(compressed);
        newItems.push({ storageId, previewUrl });
      }
      if (newItems.length > 0) {
        onChange([...uploaded, ...newItems]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function removeAt(index: number) {
    const item = uploaded[index];
    if (item) URL.revokeObjectURL(item.previewUrl);
    onChange(uploaded.filter((_, i) => i !== index));
  }

  const atCapacity = uploaded.length >= maxFiles;
  const belowMinimum = uploaded.length < minFiles;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          {label}
          {minFiles > 0 && belowMinimum && (
            <span className="ml-1 text-red-500 normal-case tracking-normal">*required</span>
          )}
        </label>
        <span className="text-[10px] text-gray-400 tabular-nums">
          {uploaded.length}/{maxFiles}
        </span>
      </div>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug -mt-1">{hint}</p>

      {uploaded.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {uploaded.map((item, i) => (
            <div key={item.storageId} className="relative group">
              <img
                src={item.previewUrl}
                alt={`Evidence ${i + 1}`}
                className="w-full h-20 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
              />
              <button
                onClick={() => removeAt(i)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                aria-label="Remove"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {!atCapacity && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            disabled={uploading}
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
            data-testid={testId}
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="w-full px-3 py-3 text-xs font-medium border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:border-gray-900 dark:hover:border-white hover:text-gray-900 dark:hover:text-white disabled:opacity-50 transition-colors"
          >
            {uploading ? 'Uploading…' : `+ Add ${uploaded.length === 0 ? '' : 'another '}screenshot`}
          </button>
        </>
      )}

      {error && <div className="text-[11px] text-red-600 dark:text-red-400">{error}</div>}
    </div>
  );
}
