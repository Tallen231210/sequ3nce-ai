# Archived Features - Closer AI Coaching System

**Archived Date:** December 30, 2024

**Reason for Archive:** Strategic shift from closer-focused AI coaching to manager-focused analytics and visibility. Real-time AI coaching for closers has a high quality bar and uncertain ROI. Manager-focused features (reviewing calls, understanding performance, team training) are more tractable and valuable.

These features are preserved for potential future use. They are NOT deleted - just set aside.

---

## Directory Structure

```
archived-features/
├── audio-processor/          # AI processing for calls
│   ├── claude-heavy-hitter.ts    # Heavy hitter scoring ammo extraction
│   ├── nudges.ts                  # Real-time coaching nudge system
│   ├── manifesto.ts               # Sales call framework/manifesto
│   └── detection.ts               # AI detection for objections/indicators
├── web-admin/                # Admin configuration panel
│   ├── admin.ts                   # Convex functions for ammo config
│   ├── ammo-setup-page.tsx        # Admin UI for per-business config
│   └── admin-layout.tsx           # Admin auth layout
└── desktop-app/              # Desktop app components
    └── desktop-advanced-ammo.tsx  # Nudges tab, reveal button, heavy hitter UI
```

---

## Feature Descriptions

### 1. Heavy Hitter Ammo Extraction (`audio-processor/claude-heavy-hitter.ts`)

**What it does:**
- Uses Claude AI to extract prospect quotes from call transcripts
- Scores each quote 0-100 based on emotional intensity, specifics, and relevance
- Categorizes into Financial, Emotional, Situational
- Provides "suggested use" for each quote (how to use it in the close)
- Filters to only show items scoring 50+ (heavy hitters)
- Supports layering custom business config on top of defaults

**Why it was built:**
To help closers identify the most powerful moments from the call to reference when handling objections or closing.

---

### 2. Smart Nudges System (`audio-processor/nudges.ts`)

**What it does:**
- Real-time keyword-triggered coaching suggestions during live calls
- 4 types of nudges:
  - `objection_warning` - Spouse, price, timing objections detected
  - `dig_deeper` - Pain point detected, prompt to get specifics
  - `missing_info` - Required info not yet uncovered after 5 minutes
  - `script_reminder` - Current stage of the call based on timing
- Cooldown system to prevent overwhelming the closer
- Works with or without custom configuration

**Why it was built:**
To provide real-time coaching tips to closers during calls.

---

### 3. Call Manifesto (`audio-processor/manifesto.ts`)

**What it does:**
- Defines a structured sales call framework with stages
- Each stage has: goal, good behaviors, bad behaviors, key moments
- Includes objection rebuttals for common objections
- Used by the playbook and nudge systems

**Why it was built:**
To structure call review and coaching around a consistent framework.

---

### 4. AI Detection (`audio-processor/detection.ts`)

**What it does:**
- Analyzes full call transcript for key indicators
- Detects: budget discussion, timeline/urgency, decision maker status, spouse mentions
- Identifies objections raised during the call
- Stores results on the call record for analytics

**Why it matters:**
This is still used for analytics - NOT archived from active use. Copy included here for reference only.

---

### 5. Admin Ammo Config (`web-admin/`)

**What it does:**
- Admin-only panel to configure custom ammo settings per business
- Configure: required info, script stages, objections, ammo categories
- Set business-specific offer description and problem solved
- Edit call manifesto (stages, behaviors, rebuttals)

**Why it was built:**
To allow customization of the AI coaching system per business.

---

### 6. Desktop Advanced Ammo UI (`desktop-app/desktop-advanced-ammo.tsx`)

**What it does:**
- "Reveal Ammo" button - hides ammo during gathering, reveals when ready
- Ammo strength indicator (Strong/Moderate/Light)
- Heavy hitter badges on ammo cards
- Suggested use text on revealed ammo
- Nudges tab with save/dismiss functionality
- Score display on ammo items

**Why it was built:**
To make ammo a coaching tool, not just a passive reference.

---

## How to Restore

If you want to bring back any of these features:

1. **Simple restore:** Copy the archived files back to their original locations
2. **Update imports:** Some file paths and exports may need adjustment
3. **Re-enable in Convex:** The schema fields still exist, just dormant
4. **Desktop app:** Replace the simplified AmmoTab with the advanced version

**Original file locations:**
- `audio-processor/nudges.ts` → `/services/audio-processor/src/nudges.ts`
- `audio-processor/claude-heavy-hitter.ts` → `/services/audio-processor/src/claude.ts`
- `audio-processor/manifesto.ts` → `/services/audio-processor/src/manifesto.ts`
- `web-admin/admin.ts` → `/apps/web/convex/admin.ts`
- `web-admin/ammo-setup-page.tsx` → `/apps/web/src/app/admin/ammo-setup/page.tsx`

---

## Data Preserved

The following Convex schema elements are preserved but dormant:
- `ammoConfigs` table - Per-team custom configurations
- `nudges` table - Nudge history for calls
- Ammo scoring fields: `score`, `isHeavyHitter`, `suggestedUse`, `categoryId`
- Call detection fields: `budgetDiscussion`, `timelineUrgency`, etc.

No data is deleted. These fields just won't be populated for new calls.
