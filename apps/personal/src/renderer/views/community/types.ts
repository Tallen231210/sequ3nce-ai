// Shared types for community components
// These mirror the API interfaces from convex.ts but are used locally by view components

export interface CommunityChannel {
  _id: string;
  slug: string;
  name: string;
  description: string;
  icon?: string;
  order: number;
  postCount: number;
  lastActivityAt?: number;
}

export interface CommunityPost {
  _id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  authorPhotoUrl: string | null;
  body: string;
  visibility?: string; // "everyone" (default) | "friends"
  likeCount: number;
  commentCount: number;
  isPinned: boolean;
  isLikedByMe: boolean;
  channelName?: string;
  channelSlug?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CommunityComment {
  _id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorPhotoUrl: string | null;
  body: string;
  likeCount: number;
  isLikedByMe: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CommunityMember {
  userId: string;
  name: string;
  profileSlug: string | null;
  headline: string | null;
  location: string | null;
  industries: string[];
  photoUrl: string | null;
  createdAt: number;
}

export interface TrainingModule {
  _id: string;
  title: string;
  description?: string;
  thumbnailUrl: string | null;
  order: number;
  lessonCount: number;
  isPublished: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface TrainingLesson {
  _id: string;
  moduleId: string;
  title: string;
  description?: string;
  videoUrl: string;
  durationSeconds?: number;
  order: number;
  isPublished: boolean;
  createdAt: number;
  updatedAt: number;
}

// Utility: format relative time
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

// Utility: get initials from name
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// Utility: deterministic gradient from name
const GRADIENTS = [
  'from-blue-500 to-purple-600',
  'from-green-500 to-teal-600',
  'from-orange-500 to-red-600',
  'from-pink-500 to-rose-600',
  'from-indigo-500 to-blue-600',
  'from-yellow-500 to-orange-600',
  'from-teal-500 to-cyan-600',
  'from-purple-500 to-pink-600',
];

export function getAvatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}
