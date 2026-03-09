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
  reactionCounts: Record<string, number>;
  myReactions: string[];
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
  parentCommentId?: string;
  likeCount: number;
  isLikedByMe: boolean;
  reactionCounts: Record<string, number>;
  myReactions: string[];
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

// Utility: format relative time with Discord-style formatting
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;

  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  if (date.toDateString() === today.toDateString()) return `Today at ${timeStr}`;
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday at ${timeStr}`;

  // This week (within 7 days)
  const daysDiff = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (daysDiff < 7) {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    return `${dayName} at ${timeStr}`;
  }

  // Older
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${dateStr} at ${timeStr}`;
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
