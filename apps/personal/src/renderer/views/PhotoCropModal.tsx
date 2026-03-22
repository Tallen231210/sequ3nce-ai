import React, { useState, useCallback, useEffect } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';

interface PhotoCropModalProps {
  imageFile: File;
  onCropComplete: (blob: Blob) => void;
  onCancel: () => void;
}

const MAX_OUTPUT_SIZE = 500;
const JPEG_QUALITY = 0.92;

export function PhotoCropModal({ imageFile, onCropComplete, onCancel }: PhotoCropModalProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create object URL for the image and clean up on unmount
  useEffect(() => {
    const url = URL.createObjectURL(imageFile);
    setImageSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const handleCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  async function handleConfirm() {
    if (!croppedAreaPixels || !imageSrc) return;

    setIsProcessing(true);
    setError(null);

    try {
      const blob = await cropImage(imageSrc, croppedAreaPixels);
      onCropComplete(blob);
    } catch {
      setError('Failed to crop image. Please try again.');
      setIsProcessing(false);
    }
  }

  if (!imageSrc) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div
        className="w-[480px] bg-white dark:bg-gray-900 rounded-xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Crop Photo</h2>
          <button
            onClick={onCancel}
            disabled={isProcessing}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Crop area */}
        <div className="relative w-full" style={{ height: 350 }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
          />
        </div>

        {/* Zoom slider */}
        <div className="flex items-center gap-3 px-5 py-3">
          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
          </svg>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer accent-blue-600"
          />
          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
          </svg>
        </div>

        {/* Error */}
        {error && (
          <p className="px-5 text-[12px] text-red-500 text-center">{error}</p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onCancel}
            disabled={isProcessing}
            className="px-4 py-2 text-[13px] font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isProcessing || !croppedAreaPixels}
            className="px-4 py-2 text-[13px] font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isProcessing ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Processing...
              </span>
            ) : (
              'Crop & Upload'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Render the cropped region to a canvas and export as JPEG blob. */
async function cropImage(imageSrc: string, crop: Area): Promise<Blob> {
  const image = await loadImage(imageSrc);

  const size = Math.min(crop.width, crop.height, MAX_OUTPUT_SIZE);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');

  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, size, size);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create image blob'));
      },
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
