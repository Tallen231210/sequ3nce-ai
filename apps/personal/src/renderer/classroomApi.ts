import { convexFetch, CONVEX_SITE_URL } from "./convex";

// ============================================================================
// Coach Classrooms API — thin typed wrappers over the /b2c/classroom/*
// HTTP routes. All permission logic is server-side; these just carry the
// viewer's b2cUserId and surface { error } messages for the UI.
// ============================================================================

export interface ClassroomCoach {
  coachId: string;
  slug: string;
  displayName: string;
  headline: string | null;
  bio: string | null;
  avatarUrl: string | null;
  coachUserId: string;
  coachUserName: string;
}

export interface ClassroomHome {
  coach: ClassroomCoach;
  membership: { tier: "free" | "premium"; joinedAt: number } | null;
  memberCount: number;
  viewerIsCoach: boolean;
}

export interface ClassroomReplay {
  callId: string;
  title: string;
  description: string | null;
  scheduledStartTime: number;
  recordingUrl: string;
  featuredInTraining: boolean;
  tier: "free" | "premium";
}

export interface ClassroomModule {
  _id: string;
  title: string;
  description?: string;
  order: number;
  lessonCount: number;
  isPublished: boolean;
  tier?: "free" | "premium";
  thumbnailUrl: string | null;
}

async function classroomPost<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<{ data?: T; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/classroom/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Request failed" };
    return { data: data as T };
  } catch (error) {
    console.error(`[Classroom] ${path} failed:`, error);
    return { error: "Network error. Please check your connection." };
  }
}

export async function getClassroomHome(userId: string): Promise<ClassroomHome | null> {
  const r = await classroomPost<ClassroomHome | null>("home", { userId });
  return r.data ?? null;
}

export function joinClassroom(userId: string, coachId: string) {
  return classroomPost<{ joined: boolean; already: boolean }>("join", { userId, coachId });
}

export async function getClassroomReplays(userId: string, coachId: string): Promise<ClassroomReplay[]> {
  const r = await classroomPost<ClassroomReplay[]>("replays", { userId, coachId });
  return r.data ?? [];
}

export async function getClassroomModules(userId: string, coachId: string): Promise<ClassroomModule[]> {
  const r = await classroomPost<ClassroomModule[]>("modules", { userId, coachId });
  return r.data ?? [];
}

export function createClassroomModule(userId: string, coachId: string, title: string, description?: string) {
  return classroomPost<{ moduleId: string }>("manage/create-module", { userId, coachId, title, description });
}

export function updateClassroomModule(
  userId: string,
  moduleId: string,
  patch: { title?: string; description?: string; isPublished?: boolean },
) {
  return classroomPost<{ updated: boolean }>("manage/update-module", { userId, moduleId, ...patch });
}

export function deleteClassroomModule(userId: string, moduleId: string) {
  return classroomPost<{ deleted: boolean }>("manage/delete-module", { userId, moduleId });
}

export function addClassroomLesson(
  userId: string,
  moduleId: string,
  title: string,
  videoUrl: string,
  description?: string,
) {
  return classroomPost<{ lessonId: string }>("manage/add-lesson", { userId, moduleId, title, videoUrl, description });
}

export function deleteClassroomLesson(userId: string, lessonId: string) {
  return classroomPost<{ deleted: boolean }>("manage/delete-lesson", { userId, lessonId });
}

export function pushReplayToTraining(userId: string, callId: string) {
  return classroomPost<{ featured: boolean }>("manage/push-replay", { userId, callId });
}

export function promoteReplayToLesson(userId: string, callId: string, moduleId: string, title?: string) {
  return classroomPost<{ lessonId: string }>("manage/promote-replay", { userId, callId, moduleId, title });
}

export function updateCoachProfile(
  userId: string,
  patch: { displayName?: string; headline?: string; bio?: string },
) {
  return classroomPost<{ updated: boolean }>("manage/profile", { userId, ...patch });
}

// ==================== The Placement Line ====================

export interface PlacementLineStatus {
  isVip: boolean;
  checks: {
    photo: boolean;
    headline: boolean;
    bio: boolean;
    publicProfile: boolean;
    verifiedStats: boolean;
  };
  eligible: boolean;
  joinedAt: number | null;
}

export async function getPlacementLineStatus(userId: string): Promise<PlacementLineStatus | null> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/placement-line/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = await response.json();
    if (!response.ok || data.error) return null;
    return data as PlacementLineStatus;
  } catch {
    return null;
  }
}

export async function joinPlacementLine(userId: string): Promise<{ joined?: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/placement-line/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    return await response.json();
  } catch {
    return { error: "Network error. Please check your connection." };
  }
}

export interface PlacementLineMember {
  userId: string;
  name: string;
  email: string;
  joinedAt: number;
  headline: string | null;
  verified: boolean;
  profileSlug: string | null;
  photoUrl: string | null;
  location: string | null;
  whatsappNumber: string | null;
  socialLinks: {
    instagram?: string; linkedin?: string; twitter?: string;
    website?: string; calendly?: string;
  } | null;
}

/** Founder-only: everyone on The Placement Line with their contact channels. */
export async function getPlacementLineRoster(founderId: string): Promise<PlacementLineMember[] | null> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/placement-line/roster`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ founderId }),
    });
    const data = await response.json();
    if (!response.ok || data.error) return null;
    return data as PlacementLineMember[];
  } catch {
    return null;
  }
}
