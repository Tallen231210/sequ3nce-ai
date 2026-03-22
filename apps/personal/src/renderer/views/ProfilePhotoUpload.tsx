import React, { useRef, useState } from 'react';
import { generateProfileUploadUrl, saveProfilePhoto, getMyProfile } from '../convex';
import { PhotoCropModal } from './PhotoCropModal';
import { getInitials } from './community/types';

interface ProfilePhotoUploadProps {
  userId: string;
  photoUrl: string | null;
  name: string;
  onPhotoUpdated: (url: string) => void;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function ProfilePhotoUpload({ userId, photoUrl, name, onPhotoUpdated }: ProfilePhotoUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset the input so the same file can be re-selected
    e.target.value = '';

    // Validate
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Please select a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('Image must be under 5MB.');
      return;
    }

    setError(null);
    setPendingFile(file);
  }

  async function handleCropComplete(croppedBlob: Blob) {
    setPendingFile(null);
    setIsUploading(true);
    setError(null);

    try {
      // Step 1: Get signed upload URL
      const urlResult = await generateProfileUploadUrl(userId);
      if (!urlResult) throw new Error('Failed to get upload URL');

      // Step 2: Upload cropped image to Convex storage
      const uploadResponse = await fetch(urlResult.uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'image/jpeg' },
        body: croppedBlob,
      });

      if (!uploadResponse.ok) throw new Error('Upload failed');
      const { storageId } = await uploadResponse.json();

      // Step 3: Save storage reference to profile
      const saveResult = await saveProfilePhoto(userId, storageId);
      if (!saveResult.success) throw new Error(saveResult.error || 'Failed to save photo');

      // Step 4: Re-fetch profile to get persistent server URL
      const profile = await getMyProfile(userId);
      if (profile?.photoUrl) {
        onPhotoUpdated(profile.photoUrl);
      } else {
        // Fallback: use blob URL if re-fetch fails (degraded but functional)
        const fallbackUrl = URL.createObjectURL(croppedBlob);
        onPhotoUpdated(fallbackUrl);
      }
    } catch (err: any) {
      setError(err.message || 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }

  function handleCropCancel() {
    setPendingFile(null);
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        className="relative group w-24 h-24 rounded-full overflow-hidden border-2 border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
      >
        {photoUrl ? (
          <img src={photoUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-600 dark:to-gray-700 flex items-center justify-center">
            <span className="text-2xl font-semibold text-gray-500 dark:text-gray-300">
              {getInitials(name)}
            </span>
          </div>
        )}

        {/* Overlay */}
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          {isUploading ? (
            <span className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          )}
        </div>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileSelect}
        className="hidden"
      />

      <span className="text-[11px] text-gray-400 dark:text-gray-500">
        Click to upload photo
      </span>

      {error && (
        <span className="text-[12px] text-red-500 dark:text-red-400">{error}</span>
      )}

      {pendingFile && (
        <PhotoCropModal
          imageFile={pendingFile}
          onCropComplete={handleCropComplete}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  );
}
