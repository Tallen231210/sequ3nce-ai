"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { Header } from "@/components/dashboard/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Loader2,
  List,
  CalendarDays,
  CalendarRange,
  LayoutGrid,
  Filter,
  MapPin,
  Clock,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { Id } from "../../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { UpcomingMeetingBriefing } from "./components/UpcomingMeetingBriefing";

// Closer colors for calendar visualization
const CLOSER_COLORS = [
  "#4F46E5", // indigo
  "#059669", // emerald
  "#DC2626", // red
  "#D97706", // amber
  "#7C3AED", // violet
  "#2563EB", // blue
  "#DB2777", // pink
  "#65A30D", // lime
];

type ViewType = "list" | "day" | "week" | "month";

interface CalendarEvent {
  _id: Id<"calendarEvents">;
  closerId: Id<"closers">;
  teamId: Id<"teams">;
  uid: string;
  title: string;
  description?: string;
  startTime: number;
  endTime: number;
  location?: string;
  isAllDay?: boolean;
  fetchedAt: number;
  closerName?: string;
  closerInitials?: string;
}

interface CalendarStatus {
  closerId: Id<"closers">;
  name: string;
  email: string;
  connected: boolean;
  lastSynced?: number;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatShortDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatDuration(startTime: number, endTime: number): string {
  const durationMinutes = Math.round((endTime - startTime) / (1000 * 60));
  if (durationMinutes < 60) {
    return `${durationMinutes}min`;
  }
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
}

function getCloserColor(index: number): string {
  return CLOSER_COLORS[index % CLOSER_COLORS.length];
}

function getDayLabel(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);

  if (checkDate.getTime() === today.getTime()) return "Today";
  if (checkDate.getTime() === tomorrow.getTime()) return "Tomorrow";
  if (checkDate.getTime() === yesterday.getTime()) return "Yesterday";
  return formatDate(date.getTime());
}

// Group events by day
function groupEventsByDay(events: CalendarEvent[]) {
  const groups: Map<string, CalendarEvent[]> = new Map();

  events.forEach((event) => {
    const date = new Date(event.startTime);
    date.setHours(0, 0, 0, 0);
    const key = date.toISOString();

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(event);
  });

  // Sort events within each day by start time
  groups.forEach((dayEvents) => {
    dayEvents.sort((a, b) => a.startTime - b.startTime);
  });

  // Convert to sorted array of groups
  return Array.from(groups.entries())
    .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
    .map(([dateKey, events]) => ({
      date: new Date(dateKey),
      events,
    }));
}

// Get week dates
function getWeekDates(date: Date): Date[] {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay()); // Start on Sunday
  start.setHours(0, 0, 0, 0);

  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dates.push(d);
  }
  return dates;
}

// Get month dates (6 weeks grid)
function getMonthDates(date: Date): Date[] {
  const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = new Date(firstOfMonth);
  start.setDate(start.getDate() - start.getDay()); // Start on Sunday of first week
  start.setHours(0, 0, 0, 0);

  const dates: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dates.push(d);
  }
  return dates;
}

// ----------------------------------------------------------------------------
// Overlap layout: split same-time events into side-by-side columns so they
// don't visually stack on top of each other in Day/Week views.
//
// Algorithm: group events into clusters of transitively-overlapping windows,
// then greedily assign each event to the leftmost column where it fits.
// Each cluster's events share the same columnCount so a single overlap
// group lays out cleanly.
// ----------------------------------------------------------------------------
interface PositionedEvent {
  event: CalendarEvent;
  columnIndex: number;
  columnCount: number;
}

function layoutEventsInColumns(events: CalendarEvent[]): PositionedEvent[] {
  if (events.length === 0) return [];
  const sorted = [...events].sort((a, b) => {
    if (a.startTime !== b.startTime) return a.startTime - b.startTime;
    return b.endTime - a.endTime;
  });

  // Build clusters of transitively overlapping events.
  const clusters: CalendarEvent[][] = [];
  let currentCluster: CalendarEvent[] = [];
  let clusterMaxEnd = -Infinity;
  for (const event of sorted) {
    if (currentCluster.length === 0 || event.startTime < clusterMaxEnd) {
      currentCluster.push(event);
      clusterMaxEnd = Math.max(clusterMaxEnd, event.endTime);
    } else {
      clusters.push(currentCluster);
      currentCluster = [event];
      clusterMaxEnd = event.endTime;
    }
  }
  if (currentCluster.length > 0) clusters.push(currentCluster);

  const out: PositionedEvent[] = [];
  for (const cluster of clusters) {
    const columnEnds: number[] = [];
    const placed: Array<{ event: CalendarEvent; columnIndex: number }> = [];
    for (const event of cluster) {
      let col = columnEnds.findIndex((end) => end <= event.startTime);
      if (col === -1) {
        col = columnEnds.length;
        columnEnds.push(event.endTime);
      } else {
        columnEnds[col] = event.endTime;
      }
      placed.push({ event, columnIndex: col });
    }
    const columnCount = columnEnds.length;
    for (const p of placed) {
      out.push({ ...p, columnCount });
    }
  }
  return out;
}

// ListView component
function ListView({
  events,
  closerColorMap,
}: {
  events: CalendarEvent[];
  closerColorMap: Map<string, number>;
}) {
  const groupedEvents = groupEventsByDay(events);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  function toggle(eventId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }

  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <Calendar
            className="h-8 w-8 text-muted-foreground mx-auto mb-3"
            strokeWidth={1.5}
          />
          <p className="text-muted-foreground">No events in this range</p>
          <p className="text-sm text-muted-foreground mt-1">
            Team members can connect their calendars from the desktop app
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {groupedEvents.map(({ date, events: dayEvents }) => (
        <Card key={date.toISOString()}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {getDayLabel(date)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {dayEvents.map((event) => {
              const closerIndex = closerColorMap.get(event.closerId) ?? 0;
              const color = getCloserColor(closerIndex);
              const eventId = String(event._id);
              const isExpanded = expanded.has(eventId);
              return (
                <div
                  key={eventId}
                  className="border-b border-border last:border-0"
                >
                  <button
                    type="button"
                    onClick={() => toggle(eventId)}
                    className="flex w-full items-start gap-4 py-3 text-left transition-colors hover:bg-muted/30 px-1 -mx-1 rounded"
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 mt-1 shrink-0 text-muted-foreground transition-transform",
                        isExpanded ? "" : "-rotate-90",
                      )}
                    />
                    {/* Time */}
                    <div className="w-24 flex-shrink-0">
                      <p className="text-sm font-medium">
                        {event.isAllDay
                          ? "All day"
                          : formatTime(event.startTime)}
                      </p>
                      {!event.isAllDay && (
                        <p className="text-xs text-muted-foreground">
                          {formatDuration(event.startTime, event.endTime)}
                        </p>
                      )}
                    </div>

                    {/* Closer indicator */}
                    <div className="flex items-center gap-2 w-32 flex-shrink-0">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <Avatar className="h-6 w-6">
                        <AvatarFallback
                          className="text-xs"
                          style={{ backgroundColor: `${color}20`, color }}
                        >
                          {event.closerInitials || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-muted-foreground truncate">
                        {event.closerName || "Unknown"}
                      </span>
                    </div>

                    {/* Event details */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {event.title}
                      </p>
                      {event.description && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {event.description}
                        </p>
                      )}
                      {event.location && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                          <MapPin className="h-3 w-3" />
                          {event.location}
                        </p>
                      )}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="pb-3 pl-8 pr-1">
                      <UpcomingMeetingBriefing
                        calendarEventId={event._id as Id<"calendarEvents">}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// DayView component
function DayView({
  events,
  date,
  closerColorMap,
}: {
  events: CalendarEvent[];
  date: Date;
  closerColorMap: Map<string, number>;
}) {
  // Full 24-hour grid (0am-11pm). The container is scrollable + clipped so
  // early-morning and late-night events don't bleed into the page header.
  // We auto-scroll to ~7am on mount so the typical workday is visible.
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const HOUR_PX = 60;
  const DEFAULT_SCROLL_HOUR = 7;
  const VISIBLE_HEIGHT_PX = 14 * HOUR_PX; // show 14 hours at a time

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);
  const dayEvents = events.filter(
    (e) => e.startTime >= dayStart.getTime() && e.startTime <= dayEnd.getTime()
  );

  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = DEFAULT_SCROLL_HOUR * HOUR_PX;
    }
  }, []);

  return (
    <Card>
      <CardContent className="p-0">
        <div
          ref={scrollRef}
          className="overflow-y-auto"
          style={{ maxHeight: `${VISIBLE_HEIGHT_PX}px` }}
        >
          <div
            className="relative"
            style={{ height: `${hours.length * HOUR_PX}px` }}
          >
            {/* Hour lines */}
            {hours.map((hour) => (
              <div
                key={hour}
                className="absolute left-0 right-0 border-t border-border flex"
                style={{ top: `${hour * HOUR_PX}px` }}
              >
                <div className="w-16 pr-2 text-xs text-muted-foreground text-right py-1 flex-shrink-0">
                  {hourLabel(hour)}
                </div>
                <div className="flex-1" />
              </div>
            ))}

            {/* Events — laid out in side-by-side columns when they overlap */}
            {layoutEventsInColumns(dayEvents).map(
              ({ event, columnIndex, columnCount }) => {
                const startDate = new Date(event.startTime);
                const startHour =
                  startDate.getHours() + startDate.getMinutes() / 60;
                const endDate = new Date(event.endTime);
                const endHour =
                  endDate.getHours() + endDate.getMinutes() / 60;
                const duration = endHour - startHour;

                const top = startHour * HOUR_PX;
                const height = Math.max(duration * HOUR_PX, 24);

                const closerIndex = closerColorMap.get(event.closerId) ?? 0;
                const color = getCloserColor(closerIndex);

                const left = `calc(4rem + (100% - 4rem - 1rem) * ${columnIndex / columnCount})`;
                const width = `calc((100% - 4rem - 1rem) / ${columnCount} - 2px)`;

                return (
                  <div
                    key={event._id}
                    className="absolute rounded-md px-2 py-1 overflow-hidden"
                    style={{
                      top: `${top}px`,
                      height: `${height}px`,
                      left,
                      width,
                      backgroundColor: `${color}20`,
                      borderLeft: `3px solid ${color}`,
                    }}
                  >
                    <p className="text-xs font-medium truncate">
                      {event.title}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {formatTime(event.startTime)} - {formatTime(event.endTime)}
                    </p>
                    {event.closerName && (
                      <p className="text-xs text-muted-foreground truncate">
                        {event.closerName}
                      </p>
                    )}
                  </div>
                );
              },
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Format a 24-hour hour-of-day as a US 12-hour label. Used by Day/Week views.
function hourLabel(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

// WeekView component
function WeekView({
  events,
  date,
  closerColorMap,
}: {
  events: CalendarEvent[];
  date: Date;
  closerColorMap: Map<string, number>;
}) {
  const weekDates = getWeekDates(date);
  // Same 24-hour grid as the Day view with overflow clip + auto-scroll to 7am.
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const HOUR_PX = 60;
  const DEFAULT_SCROLL_HOUR = 7;
  const VISIBLE_HEIGHT_PX = 14 * HOUR_PX;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = DEFAULT_SCROLL_HOUR * HOUR_PX;
    }
  }, []);

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Day headers */}
          <div className="flex border-b border-border">
            <div className="w-16 flex-shrink-0" />
            {weekDates.map((d) => {
              const isToday =
                d.toDateString() === new Date().toDateString();
              return (
                <div
                  key={d.toISOString()}
                  className={cn(
                    "flex-1 text-center py-2 text-sm",
                    isToday && "bg-primary/5"
                  )}
                >
                  <p
                    className={cn(
                      "text-muted-foreground",
                      isToday && "text-primary font-medium"
                    )}
                  >
                    {d.toLocaleDateString("en-US", { weekday: "short" })}
                  </p>
                  <p
                    className={cn(
                      "text-lg font-medium",
                      isToday && "text-primary"
                    )}
                  >
                    {d.getDate()}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Time grid (scrollable, full 24h) */}
          <div
            ref={scrollRef}
            className="overflow-y-auto"
            style={{ maxHeight: `${VISIBLE_HEIGHT_PX}px` }}
          >
            <div
              className="relative"
              style={{ height: `${hours.length * HOUR_PX}px` }}
            >
              {/* Hour lines */}
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="absolute left-0 right-0 border-t border-border flex"
                  style={{ top: `${hour * HOUR_PX}px` }}
                >
                  <div className="w-16 pr-2 text-xs text-muted-foreground text-right py-1 flex-shrink-0">
                    {hourLabel(hour)}
                  </div>
                  <div className="flex-1 flex">
                    {weekDates.map((d) => (
                      <div
                        key={d.toISOString()}
                        className="flex-1 border-l border-border"
                      />
                    ))}
                  </div>
                </div>
              ))}

              {/* Events — lay out per-day with overlap columns. Each day's
                 *  events get their own column layout so an overlap in Monday
                 *  doesn't squeeze Tuesday. */}
              {weekDates.flatMap((d, dayIndex) => {
                const dayEvents = events.filter(
                  (e) =>
                    new Date(e.startTime).toDateString() === d.toDateString(),
                );
                return layoutEventsInColumns(dayEvents).map(
                  ({ event, columnIndex, columnCount }) => {
                    const startDate = new Date(event.startTime);
                    const startHour =
                      startDate.getHours() + startDate.getMinutes() / 60;
                    const endDate = new Date(event.endTime);
                    const endHour =
                      endDate.getHours() + endDate.getMinutes() / 60;
                    const duration = endHour - startHour;

                    const top = startHour * HOUR_PX;
                    const height = Math.max(duration * HOUR_PX, 24);
                  // Each day gets 1/7 of the area right of the hour gutter.
                  // Inside the day, split into columnCount equal sub-slots.
                  const dayWidthExpr = "((100% - 4rem) / 7)";
                  const left = `calc(4rem + ${dayWidthExpr} * ${dayIndex} + ${dayWidthExpr} * ${columnIndex / columnCount} + 1px)`;
                  const width = `calc(${dayWidthExpr} / ${columnCount} - 2px)`;

                  const closerIndex =
                    closerColorMap.get(event.closerId) ?? 0;
                  const color = getCloserColor(closerIndex);

                  return (
                    <div
                      key={event._id}
                      className="absolute rounded-md px-1 py-0.5 overflow-hidden text-xs"
                      style={{
                        top: `${top}px`,
                        height: `${height}px`,
                        left,
                        width,
                        backgroundColor: `${color}20`,
                        borderLeft: `2px solid ${color}`,
                      }}
                    >
                      <p className="font-medium truncate">{event.title}</p>
                      {event.closerName && (
                        <p className="text-muted-foreground truncate">
                          {event.closerName}
                        </p>
                      )}
                    </div>
                  );
                },
              );
            })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// MonthView component
function MonthView({
  events,
  date,
  closerColorMap,
}: {
  events: CalendarEvent[];
  date: Date;
  closerColorMap: Map<string, number>;
}) {
  const monthDates = getMonthDates(date);
  const currentMonth = date.getMonth();

  // Group events by date string
  const eventsByDate = new Map<string, CalendarEvent[]>();
  events.forEach((event) => {
    const dateStr = new Date(event.startTime).toDateString();
    if (!eventsByDate.has(dateStr)) {
      eventsByDate.set(dateStr, []);
    }
    eventsByDate.get(dateStr)!.push(event);
  });

  return (
    <Card>
      <CardContent className="p-0">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-border">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div
              key={day}
              className="text-center py-2 text-sm font-medium text-muted-foreground"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7">
          {monthDates.map((d) => {
            const isCurrentMonth = d.getMonth() === currentMonth;
            const isToday = d.toDateString() === new Date().toDateString();
            const dayEvents = eventsByDate.get(d.toDateString()) || [];
            const maxVisible = 3;
            const moreCount = dayEvents.length - maxVisible;

            return (
              <div
                key={d.toISOString()}
                className={cn(
                  "min-h-[100px] border-b border-r border-border p-1",
                  !isCurrentMonth && "bg-muted/30"
                )}
              >
                <p
                  className={cn(
                    "text-sm text-right",
                    !isCurrentMonth && "text-muted-foreground",
                    isToday &&
                      "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center ml-auto"
                  )}
                >
                  {d.getDate()}
                </p>
                <div className="space-y-0.5 mt-1">
                  {dayEvents.slice(0, maxVisible).map((event) => {
                    const closerIndex = closerColorMap.get(event.closerId) ?? 0;
                    const color = getCloserColor(closerIndex);

                    return (
                      <div
                        key={event._id}
                        className="text-xs px-1 py-0.5 rounded truncate"
                        style={{
                          backgroundColor: `${color}20`,
                          color: color,
                        }}
                      >
                        {event.title}
                      </div>
                    );
                  })}
                  {moreCount > 0 && (
                    <p className="text-xs text-muted-foreground px-1">
                      +{moreCount} more
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// Connection status panel
function ConnectionStatusPanel({ status }: { status: CalendarStatus[] }) {
  const connected = status.filter((s) => s.connected);
  const disconnected = status.filter((s) => !s.connected);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Calendar Connections</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {connected.map((s, i) => (
          <div key={s.closerId} className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: getCloserColor(i) }}
            />
            <span>{s.name}</span>
            {s.lastSynced && (
              <span className="text-xs text-muted-foreground ml-auto">
                Synced {formatShortDate(s.lastSynced)}
              </span>
            )}
          </div>
        ))}
        {disconnected.map((s) => (
          <div key={s.closerId} className="flex items-center gap-2 text-sm">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <span className="text-muted-foreground">{s.name}</span>
            <span className="text-xs text-amber-500 ml-auto">Not connected</span>
          </div>
        ))}
        {status.length === 0 && (
          <p className="text-sm text-muted-foreground">No team members yet</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function SchedulePage() {
  const { team, clerkId, isLoading: isTeamLoading } = useTeam();
  const teamId = team?._id;
  const [view, setView] = useState<ViewType>("list");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedClosers, setSelectedClosers] = useState<string[]>([]);

  // Calculate date range based on view
  const { startDate, endDate } = useMemo(() => {
    const start = new Date(currentDate);
    const end = new Date(currentDate);

    switch (view) {
      case "day":
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case "week":
        start.setDate(start.getDate() - start.getDay());
        start.setHours(0, 0, 0, 0);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        break;
      case "month":
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        end.setMonth(end.getMonth() + 1);
        end.setDate(0);
        end.setHours(23, 59, 59, 999);
        break;
      case "list":
      default:
        // Show 2 weeks for list view
        start.setHours(0, 0, 0, 0);
        end.setDate(end.getDate() + 14);
        end.setHours(23, 59, 59, 999);
        break;
    }

    return { startDate: start.getTime(), endDate: end.getTime() };
  }, [currentDate, view]);

  // Fetch events and status
  const events = useQuery(
    api.calendar.getTeamEvents,
    clerkId
      ? {
          clerkId,
          startDate,
          endDate,
          closerIds: selectedClosers.length > 0 ? selectedClosers as Id<"closers">[] : undefined,
        }
      : "skip"
  );

  const calendarStatus = useQuery(
    api.calendar.getTeamCalendarStatus,
    clerkId ? { clerkId } : "skip"
  );

  const closers = useQuery(
    api.closers.getClosers,
    clerkId ? { clerkId } : "skip"
  );

  // Create closer color map
  const closerColorMap = useMemo(() => {
    const map = new Map<string, number>();
    closers?.forEach((closer, index) => {
      map.set(closer._id, index);
    });
    return map;
  }, [closers]);

  // Navigation functions
  const goToToday = () => setCurrentDate(new Date());

  const goPrevious = () => {
    const newDate = new Date(currentDate);
    switch (view) {
      case "day":
        newDate.setDate(newDate.getDate() - 1);
        break;
      case "week":
        newDate.setDate(newDate.getDate() - 7);
        break;
      case "month":
        newDate.setMonth(newDate.getMonth() - 1);
        break;
      case "list":
        newDate.setDate(newDate.getDate() - 14);
        break;
    }
    setCurrentDate(newDate);
  };

  const goNext = () => {
    const newDate = new Date(currentDate);
    switch (view) {
      case "day":
        newDate.setDate(newDate.getDate() + 1);
        break;
      case "week":
        newDate.setDate(newDate.getDate() + 7);
        break;
      case "month":
        newDate.setMonth(newDate.getMonth() + 1);
        break;
      case "list":
        newDate.setDate(newDate.getDate() + 14);
        break;
    }
    setCurrentDate(newDate);
  };

  // Format date display
  const dateDisplay = useMemo(() => {
    switch (view) {
      case "day":
        return currentDate.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        });
      case "week": {
        const weekDates = getWeekDates(currentDate);
        const start = weekDates[0];
        const end = weekDates[6];
        if (start.getMonth() === end.getMonth()) {
          return `${start.toLocaleDateString("en-US", { month: "long" })} ${start.getDate()} - ${end.getDate()}, ${start.getFullYear()}`;
        }
        return `${formatShortDate(start.getTime())} - ${formatShortDate(end.getTime())}, ${end.getFullYear()}`;
      }
      case "month":
        return currentDate.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        });
      case "list":
      default:
        return `${formatShortDate(startDate)} - ${formatShortDate(endDate)}`;
    }
  }, [currentDate, view, startDate, endDate]);

  // Toggle closer selection
  const toggleCloser = (closerId: string) => {
    setSelectedClosers((prev) =>
      prev.includes(closerId)
        ? prev.filter((id) => id !== closerId)
        : [...prev, closerId]
    );
  };

  // Loading state
  if (isTeamLoading || events === undefined) {
    return (
      <>
        <Header
          title="Schedule"
          description="Team calendar from connected ICS feeds"
        />
        <div className="p-6 flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Schedule"
        description="Team calendar from connected ICS feeds"
      />
      <div className="p-6 space-y-4">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4">
          {/* View selector */}
          <div className="flex items-center bg-muted rounded-lg p-1">
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setView("list")}
              className="h-8"
            >
              <List className="h-4 w-4 mr-1" />
              List
            </Button>
            <Button
              variant={view === "day" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setView("day")}
              className="h-8"
            >
              <CalendarDays className="h-4 w-4 mr-1" />
              Day
            </Button>
            <Button
              variant={view === "week" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setView("week")}
              className="h-8"
            >
              <CalendarRange className="h-4 w-4 mr-1" />
              Week
            </Button>
            <Button
              variant={view === "month" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setView("month")}
              className="h-8"
            >
              <LayoutGrid className="h-4 w-4 mr-1" />
              Month
            </Button>
          </div>

          {/* Date navigation */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goPrevious}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToToday}>
              Today
            </Button>
            <Button variant="outline" size="sm" onClick={goNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <span className="text-sm font-medium">{dateDisplay}</span>

          {/* Closer filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="ml-auto">
                <Filter className="h-4 w-4 mr-1" />
                Filter
                {selectedClosers.length > 0 && (
                  <span className="ml-1 bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 text-xs">
                    {selectedClosers.length}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end">
              <div className="space-y-2 p-2">
                <p className="text-sm font-medium">Filter by closer</p>
                {closers?.map((closer, index) => (
                  <div
                    key={closer._id}
                    className="flex items-center gap-2"
                  >
                    <Checkbox
                      id={closer._id}
                      checked={
                        selectedClosers.length === 0 ||
                        selectedClosers.includes(closer._id)
                      }
                      onCheckedChange={() => toggleCloser(closer._id)}
                    />
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: getCloserColor(index) }}
                    />
                    <label
                      htmlFor={closer._id}
                      className="text-sm cursor-pointer"
                    >
                      {closer.name}
                    </label>
                  </div>
                ))}
                {selectedClosers.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full mt-2"
                    onClick={() => setSelectedClosers([])}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Main content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3">
            {view === "list" && (
              <ListView events={events} closerColorMap={closerColorMap} />
            )}
            {view === "day" && (
              <DayView
                events={events}
                date={currentDate}
                closerColorMap={closerColorMap}
              />
            )}
            {view === "week" && (
              <WeekView
                events={events}
                date={currentDate}
                closerColorMap={closerColorMap}
              />
            )}
            {view === "month" && (
              <MonthView
                events={events}
                date={currentDate}
                closerColorMap={closerColorMap}
              />
            )}
          </div>
          <div className="lg:col-span-1">
            <ConnectionStatusPanel status={calendarStatus || []} />
          </div>
        </div>
      </div>
    </>
  );
}
