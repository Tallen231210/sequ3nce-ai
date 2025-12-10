// Mock data for dashboard development
// This will be replaced with real Convex queries later

export interface LiveCall {
  id: string;
  closerName: string;
  closerInitials: string;
  prospectName: string;
  status: "ON_CALL" | "WAITING";
  duration: number; // seconds
  startedAt: Date;
  lastAmmo?: string;
}

export interface ScheduledCall {
  id: string;
  closerName: string;
  closerInitials: string;
  prospectName: string;
  prospectEmail: string;
  scheduledAt: Date;
  meetingLink?: string;
}

export interface CompletedCall {
  id: string;
  closerName: string;
  closerInitials: string;
  prospectName: string;
  date: Date;
  duration: number; // seconds
  outcome: "CLOSED" | "NOT_CLOSED" | "NO_SHOW" | "RESCHEDULED";
  dealValue?: number;
}

// Helper to format duration
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Helper to format currency
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(amount);
}

// Helper to format relative time
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 60000);

  if (diffMins < 0) {
    return `${Math.abs(diffMins)} min ago`;
  } else if (diffMins === 0) {
    return "Now";
  } else if (diffMins < 60) {
    return `in ${diffMins} min`;
  } else {
    const hours = Math.floor(diffMins / 60);
    return `in ${hours}h`;
  }
}

// Mock Live Calls
export const mockLiveCalls: LiveCall[] = [
  {
    id: "live-1",
    closerName: "Marcus Johnson",
    closerInitials: "MJ",
    prospectName: "Sarah Mitchell",
    status: "ON_CALL",
    duration: 1847, // ~31 mins
    startedAt: new Date(Date.now() - 1847000),
    lastAmmo: "I've been thinking about this for months now",
  },
  {
    id: "live-2",
    closerName: "Jessica Chen",
    closerInitials: "JC",
    prospectName: "Tom Rodriguez",
    status: "WAITING",
    duration: 342, // ~6 mins
    startedAt: new Date(Date.now() - 342000),
  },
  {
    id: "live-3",
    closerName: "David Park",
    closerInitials: "DP",
    prospectName: "Amanda Foster",
    status: "ON_CALL",
    duration: 892, // ~15 mins
    startedAt: new Date(Date.now() - 892000),
    lastAmmo: "Money isn't really the issue here",
  },
];

// Mock Scheduled Calls
const today = new Date();
const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);

export const mockScheduledCalls: ScheduledCall[] = [
  {
    id: "sched-1",
    closerName: "Marcus Johnson",
    closerInitials: "MJ",
    prospectName: "Robert Kim",
    prospectEmail: "robert.kim@email.com",
    scheduledAt: new Date(today.setHours(14, 0, 0, 0)),
    meetingLink: "https://zoom.us/j/123456789",
  },
  {
    id: "sched-2",
    closerName: "Jessica Chen",
    closerInitials: "JC",
    prospectName: "Emily Watson",
    prospectEmail: "emily.w@company.com",
    scheduledAt: new Date(today.setHours(15, 30, 0, 0)),
    meetingLink: "https://zoom.us/j/987654321",
  },
  {
    id: "sched-3",
    closerName: "David Park",
    closerInitials: "DP",
    prospectName: "Michael Brown",
    prospectEmail: "mbrown@business.com",
    scheduledAt: new Date(today.setHours(16, 0, 0, 0)),
  },
  {
    id: "sched-4",
    closerName: "Marcus Johnson",
    closerInitials: "MJ",
    prospectName: "Lisa Anderson",
    prospectEmail: "lisa.a@startup.io",
    scheduledAt: new Date(tomorrow.setHours(10, 0, 0, 0)),
    meetingLink: "https://zoom.us/j/456789123",
  },
  {
    id: "sched-5",
    closerName: "Jessica Chen",
    closerInitials: "JC",
    prospectName: "James Wilson",
    prospectEmail: "jwilson@corp.com",
    scheduledAt: new Date(tomorrow.setHours(11, 30, 0, 0)),
  },
  {
    id: "sched-6",
    closerName: "David Park",
    closerInitials: "DP",
    prospectName: "Karen Martinez",
    prospectEmail: "karen.m@agency.com",
    scheduledAt: new Date(tomorrow.setHours(14, 0, 0, 0)),
    meetingLink: "https://zoom.us/j/321654987",
  },
];

// Mock Completed Calls
export const mockCompletedCalls: CompletedCall[] = [
  {
    id: "call-1",
    closerName: "Marcus Johnson",
    closerInitials: "MJ",
    prospectName: "Jennifer Lee",
    date: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    duration: 2847,
    outcome: "CLOSED",
    dealValue: 12000,
  },
  {
    id: "call-2",
    closerName: "Jessica Chen",
    closerInitials: "JC",
    prospectName: "Brian Thompson",
    date: new Date(Date.now() - 4 * 60 * 60 * 1000),
    duration: 1923,
    outcome: "NOT_CLOSED",
  },
  {
    id: "call-3",
    closerName: "David Park",
    closerInitials: "DP",
    prospectName: "Nancy White",
    date: new Date(Date.now() - 5 * 60 * 60 * 1000),
    duration: 0,
    outcome: "NO_SHOW",
  },
  {
    id: "call-4",
    closerName: "Marcus Johnson",
    closerInitials: "MJ",
    prospectName: "Chris Davis",
    date: new Date(Date.now() - 24 * 60 * 60 * 1000), // yesterday
    duration: 3102,
    outcome: "CLOSED",
    dealValue: 8500,
  },
  {
    id: "call-5",
    closerName: "Jessica Chen",
    closerInitials: "JC",
    prospectName: "Michelle Garcia",
    date: new Date(Date.now() - 25 * 60 * 60 * 1000),
    duration: 2156,
    outcome: "RESCHEDULED",
  },
  {
    id: "call-6",
    closerName: "David Park",
    closerInitials: "DP",
    prospectName: "Steven Taylor",
    date: new Date(Date.now() - 26 * 60 * 60 * 1000),
    duration: 2789,
    outcome: "CLOSED",
    dealValue: 15000,
  },
  {
    id: "call-7",
    closerName: "Marcus Johnson",
    closerInitials: "MJ",
    prospectName: "Rebecca Moore",
    date: new Date(Date.now() - 48 * 60 * 60 * 1000), // 2 days ago
    duration: 1654,
    outcome: "NOT_CLOSED",
  },
  {
    id: "call-8",
    closerName: "Jessica Chen",
    closerInitials: "JC",
    prospectName: "Andrew Clark",
    date: new Date(Date.now() - 49 * 60 * 60 * 1000),
    duration: 0,
    outcome: "NO_SHOW",
  },
  {
    id: "call-9",
    closerName: "David Park",
    closerInitials: "DP",
    prospectName: "Samantha Lewis",
    date: new Date(Date.now() - 72 * 60 * 60 * 1000), // 3 days ago
    duration: 2987,
    outcome: "CLOSED",
    dealValue: 9500,
  },
  {
    id: "call-10",
    closerName: "Marcus Johnson",
    closerInitials: "MJ",
    prospectName: "Daniel Walker",
    date: new Date(Date.now() - 73 * 60 * 60 * 1000),
    duration: 2345,
    outcome: "NOT_CLOSED",
  },
  {
    id: "call-11",
    closerName: "Jessica Chen",
    closerInitials: "JC",
    prospectName: "Laura Hall",
    date: new Date(Date.now() - 96 * 60 * 60 * 1000), // 4 days ago
    duration: 3456,
    outcome: "CLOSED",
    dealValue: 18000,
  },
  {
    id: "call-12",
    closerName: "David Park",
    closerInitials: "DP",
    prospectName: "Kevin Young",
    date: new Date(Date.now() - 120 * 60 * 60 * 1000), // 5 days ago
    duration: 1876,
    outcome: "RESCHEDULED",
  },
];

// Dashboard stats (computed from mock data)
export const mockStats = {
  callsToday: 8,
  liveNow: mockLiveCalls.length,
  closeRateWeek: 42, // percentage
  noShowsWeek: 3,
};
