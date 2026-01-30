"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useTeam } from "@/hooks/useTeam";
import { useRouter } from "next/navigation";
import { Header } from "@/components/dashboard/header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Building2,
  User,
  CreditCard,
  Globe,
  Tags,
  BookMarked,
  Link2,
  Trash2,
  Loader2,
  Check,
  Plus,
  X,
  AlertTriangle,
  ExternalLink,
  Calendar,
  MessageSquare,
  Zap,
  RefreshCw,
  CheckCircle2,
  Clock,
} from "lucide-react";
import Link from "next/link";

// Common timezones
const TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Phoenix", label: "Arizona (No DST)" },
  { value: "America/Anchorage", label: "Alaska Time" },
  { value: "Pacific/Honolulu", label: "Hawaii Time" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Paris", label: "Paris (CET)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Australia/Sydney", label: "Sydney (AEST)" },
];

// Default outcomes that come with the system
const DEFAULT_OUTCOMES = ["Closed", "Not Closed", "No Show", "Rescheduled"];

// Default playbook categories
const DEFAULT_PLAYBOOK_CATEGORIES = ["Objection Handling", "Pitch", "Close", "Pain Discovery"];

// Success message component
function SaveSuccess({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="inline-flex items-center gap-1 text-sm text-green-600">
      <Check className="h-4 w-4" />
      Saved
    </span>
  );
}

// Editable tag list component
interface TagListProps {
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  placeholder?: string;
  defaultTags?: string[];
}

function TagList({ tags, onAdd, onRemove, placeholder = "Add new...", defaultTags = [] }: TagListProps) {
  const [newTag, setNewTag] = useState("");

  const handleAdd = () => {
    const trimmed = newTag.trim();
    if (trimmed && !tags.includes(trimmed) && !defaultTags.includes(trimmed)) {
      onAdd(trimmed);
      setNewTag("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="space-y-3">
      {/* Default tags (non-removable) */}
      <div className="flex flex-wrap gap-2">
        {defaultTags.map((tag) => (
          <Badge key={tag} variant="secondary" className="text-sm">
            {tag}
          </Badge>
        ))}
        {tags.map((tag) => (
          <Badge key={tag} variant="outline" className="text-sm pr-1 gap-1">
            {tag}
            <button
              onClick={() => onRemove(tag)}
              className="ml-1 hover:bg-zinc-200 rounded-full p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>

      {/* Add new tag */}
      <div className="flex gap-2">
        <Input
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="max-w-[200px]"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={!newTag.trim()}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// Integration card component (for simple integrations)
interface IntegrationCardProps {
  name: string;
  description: string;
  icon: React.ReactNode;
  connected?: boolean;
  comingSoon?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

function IntegrationCard({
  name,
  description,
  icon,
  connected = false,
  comingSoon = false,
  onConnect,
  onDisconnect,
}: IntegrationCardProps) {
  return (
    <div className="flex items-center justify-between p-4 border rounded-lg">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-zinc-100 flex items-center justify-center">
          {icon}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium">{name}</p>
            {comingSoon && (
              <Badge variant="secondary" className="text-xs">
                Coming Soon
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {!comingSoon && (
        connected ? (
          <Button variant="outline" size="sm" onClick={onDisconnect}>
            Disconnect
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={onConnect}>
            Connect
          </Button>
        )
      )}
    </div>
  );
}

// Calendly integration card component
interface CalendlyIntegrationProps {
  connected: boolean;
  connectedEmail?: string;
  lastSyncAt?: number;
  onConnect: (token: string) => Promise<void>;
  onDisconnect: () => Promise<void>;
  onSync: () => Promise<void>;
  isConnecting: boolean;
  isSyncing: boolean;
  connectError?: string;
}

function CalendlyIntegration({
  connected,
  connectedEmail,
  lastSyncAt,
  onConnect,
  onDisconnect,
  onSync,
  isConnecting,
  isSyncing,
  connectError,
}: CalendlyIntegrationProps) {
  const [token, setToken] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);

  const handleConnect = async () => {
    if (token.trim()) {
      await onConnect(token.trim());
      setToken("");
    }
  };

  const formatLastSync = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - timestamp;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hours ago`;
    return date.toLocaleDateString();
  };

  if (connected) {
    return (
      <div className="p-4 border rounded-lg space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">Calendly</p>
                <Badge variant="default" className="bg-green-100 text-green-700 hover:bg-green-100">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Connected
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{connectedEmail}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            Last synced: {lastSyncAt ? formatLastSync(lastSyncAt) : "Never"}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onSync}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              Sync Now
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onDisconnect}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              Disconnect
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 border rounded-lg space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-zinc-100 flex items-center justify-center">
          <Calendar className="h-5 w-5 text-zinc-600" />
        </div>
        <div>
          <p className="font-medium">Calendly</p>
          <p className="text-sm text-muted-foreground">
            Sync scheduled calls from your Calendly account
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <button
          onClick={() => setShowInstructions(!showInstructions)}
          className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
        >
          {showInstructions ? "Hide" : "Show"} setup instructions
          <ExternalLink className="h-3 w-3" />
        </button>

        {showInstructions && (
          <div className="p-3 bg-zinc-50 rounded-lg text-sm space-y-3">
            <div className="p-2 bg-blue-50 rounded border border-blue-200 text-blue-700 text-xs">
              <strong>Nice to have, not essential:</strong> Calendly integration lets managers view scheduled calls in the Schedule tab without leaving Sequ3nce, and auto-fills prospect names in the desktop app (though these are now editable manually). Sequ3nce works great without it!
            </div>
            <p className="font-medium">To get your Personal Access Token:</p>
            <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
              <li>Log in to Calendly at calendly.com</li>
              <li>
                Go to <strong className="text-zinc-700">Integrations</strong> → <strong className="text-zinc-700">API & Webhooks</strong>
                <br />
                <a
                  href="https://calendly.com/integrations/api_webhooks"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline inline-flex items-center gap-1 ml-5 mt-1"
                >
                  calendly.com/integrations/api_webhooks
                  <ExternalLink className="h-3 w-3" />
                </a>
              </li>
              <li>Under "Personal Access Tokens", click <strong className="text-zinc-700">"Get a token now"</strong> (or "Generate new token" if you already have tokens)</li>
              <li>Name it "Sequ3nce Integration" and click <strong className="text-zinc-700">Create Token</strong></li>
              <li>Click <strong className="text-zinc-700">Copy token</strong> - you'll only see this once!</li>
              <li>Paste the token below and click Connect</li>
            </ol>
            <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
              Note: You need a paid Calendly plan to use webhooks for automatic syncing.
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <Input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste your Calendly Personal Access Token"
            type="password"
            className="flex-1"
          />
          <Button
            onClick={handleConnect}
            disabled={!token.trim() || isConnecting}
          >
            {isConnecting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Connect"
            )}
          </Button>
        </div>

        {connectError && (
          <p className="text-sm text-red-600">{connectError}</p>
        )}
      </div>
    </div>
  );
}

// Notification channel configuration component
interface NotificationChannelConfigProps {
  type: string;
  label: string;
  description: string;
  config?: { enabled: boolean; channelId?: string; channelName?: string };
  channels: { id: string; name: string }[];
  onUpdate: (enabled: boolean, channelId?: string, channelName?: string) => Promise<void>;
  saving: boolean;
  loadingChannels: boolean;
}

function NotificationChannelConfig({
  type,
  label,
  description,
  config,
  channels,
  onUpdate,
  saving,
  loadingChannels,
}: NotificationChannelConfigProps) {
  const isEnabled = config?.enabled ?? true; // Default to enabled if not configured
  const selectedChannelId = config?.channelId || "";
  const needsChannelSelection = isEnabled && !selectedChannelId && !loadingChannels && channels.length > 0;

  return (
    <div className={`p-3 rounded-lg space-y-2 ${needsChannelSelection ? "bg-amber-50 border border-amber-200" : "bg-zinc-50"}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="radio"
            name={`${type}-enabled`}
            checked={!isEnabled}
            onChange={() => onUpdate(false)}
            className="h-4 w-4"
          />
          Disabled
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="radio"
            name={`${type}-enabled`}
            checked={isEnabled}
            onChange={() => {
              // When enabling, try to keep the same channel or prompt to select
              if (selectedChannelId) {
                const channel = channels.find(c => c.id === selectedChannelId);
                onUpdate(true, selectedChannelId, channel?.name);
              } else {
                onUpdate(true);
              }
            }}
            className="h-4 w-4"
          />
          Enabled
        </label>
        {isEnabled && (
          <Select
            value={selectedChannelId}
            onValueChange={(value) => {
              const channel = channels.find(c => c.id === value);
              if (channel) {
                onUpdate(true, channel.id, channel.name);
              }
            }}
            disabled={loadingChannels}
          >
            <SelectTrigger className={`w-[180px] h-8 text-sm ${needsChannelSelection ? "border-amber-400" : ""}`}>
              {loadingChannels ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading...
                </span>
              ) : (
                <SelectValue placeholder="Select channel" />
              )}
            </SelectTrigger>
            <SelectContent>
              {channels.map((channel) => (
                <SelectItem key={channel.id} value={channel.id}>
                  #{channel.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {needsChannelSelection && (
        <p className="text-xs text-amber-700">
          Please select a channel to receive these notifications
        </p>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { clerkId, isLoading: isTeamLoading } = useTeam();
  const router = useRouter();

  const settings = useQuery(
    api.teams.getSettings,
    clerkId ? { clerkId } : "skip"
  );

  // Mutations
  const updateTeamName = useMutation(api.teams.updateTeamName);
  const updateUserName = useMutation(api.teams.updateUserName);
  const updateTimezone = useMutation(api.teams.updateTeamTimezone);
  const updateCustomOutcomes = useMutation(api.teams.updateCustomOutcomes);
  const updateCustomPlaybookCategories = useMutation(api.teams.updateCustomPlaybookCategories);
  const deleteTeam = useMutation(api.teams.deleteTeam);

  // Calendly mutations and actions
  const validateCalendlyToken = useAction(api.calendly.validateToken);
  const connectCalendly = useMutation(api.calendly.connectCalendly);
  const disconnectCalendly = useMutation(api.calendly.disconnectCalendly);
  const syncCalendlyEvents = useAction(api.calendly.syncEvents);

  // Slack OAuth
  const slackStatus = useQuery(
    api.slack.getSlackStatus,
    clerkId ? { clerkId } : "skip"
  );
  const disconnectSlack = useMutation(api.slack.disconnectSlack);
  const testSlackConnection = useAction(api.slack.testSlackConnection);
  const getSlackChannels = useAction(api.slack.getSlackChannels);
  const updateSlackNotificationChannel = useMutation(api.teams.updateSlackNotificationChannel);

  // Legacy Slack webhook (for migration period)
  const updateSlackWebhookUrl = useMutation(api.teams.updateSlackWebhookUrl);
  const testSlackWebhook = useAction(api.reinforcements.testSlackWebhook);

  // Form state
  const [teamName, setTeamName] = useState("");
  const [userName, setUserName] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");
  const [customOutcomes, setCustomOutcomes] = useState<string[]>([]);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  // Loading/success states
  const [savingTeamName, setSavingTeamName] = useState(false);
  const [savedTeamName, setSavedTeamName] = useState(false);
  const [savingUserName, setSavingUserName] = useState(false);
  const [savedUserName, setSavedUserName] = useState(false);
  const [savingTimezone, setSavingTimezone] = useState(false);
  const [savedTimezone, setSavedTimezone] = useState(false);
  const [savingOutcomes, setSavingOutcomes] = useState(false);
  const [savedOutcomes, setSavedOutcomes] = useState(false);
  const [savingCategories, setSavingCategories] = useState(false);
  const [savedCategories, setSavedCategories] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Calendly states
  const [isConnectingCalendly, setIsConnectingCalendly] = useState(false);
  const [isSyncingCalendly, setIsSyncingCalendly] = useState(false);
  const [calendlyConnectError, setCalendlyConnectError] = useState<string | undefined>();

  // Slack states
  const [slackWebhookUrl, setSlackWebhookUrl] = useState("");
  const [savingSlackWebhook, setSavingSlackWebhook] = useState(false);
  const [savedSlackWebhook, setSavedSlackWebhook] = useState(false);
  const [testingSlackWebhook, setTestingSlackWebhook] = useState(false);
  const [slackWebhookTestResult, setSlackWebhookTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [disconnectingSlack, setDisconnectingSlack] = useState(false);
  const [testingSlackOAuth, setTestingSlackOAuth] = useState(false);
  const [slackOAuthTestResult, setSlackOAuthTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [slackOAuthSuccess, setSlackOAuthSuccess] = useState(false);
  const [slackOAuthError, setSlackOAuthError] = useState<string | undefined>();
  const [slackChannels, setSlackChannels] = useState<{ id: string; name: string }[]>([]);
  const [loadingSlackChannels, setLoadingSlackChannels] = useState(false);
  const [savingNotificationChannel, setSavingNotificationChannel] = useState<string | null>(null);

  // Handle Slack OAuth callback params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("slack_success");
    const error = params.get("slack_error");

    if (success === "true") {
      setSlackOAuthSuccess(true);
      // Clear the URL params
      window.history.replaceState({}, "", "/dashboard/settings");
      setTimeout(() => setSlackOAuthSuccess(false), 5000);
    }

    if (error) {
      setSlackOAuthError(error);
      window.history.replaceState({}, "", "/dashboard/settings");
      setTimeout(() => setSlackOAuthError(undefined), 5000);
    }
  }, []);

  // Load Slack channels when connected via OAuth
  useEffect(() => {
    const fetchChannels = async () => {
      console.log("[Slack Debug] Checking conditions:", {
        connected: slackStatus?.connected,
        method: slackStatus?.method,
        clerkId: clerkId ? "present" : "missing",
      });

      if (slackStatus?.connected && slackStatus.method === "oauth" && clerkId) {
        console.log("[Slack Debug] Fetching channels...");
        setLoadingSlackChannels(true);
        try {
          const result = await getSlackChannels({ clerkId });
          console.log("[Slack Debug] API result:", result);
          if ("channels" in result) {
            console.log("[Slack Debug] Setting channels:", result.channels);
            setSlackChannels(result.channels);
          } else if ("error" in result) {
            console.error("[Slack Debug] API returned error:", result.error);
          }
        } catch (error) {
          console.error("[Slack Debug] Failed to fetch Slack channels:", error);
        } finally {
          setLoadingSlackChannels(false);
        }
      } else {
        console.log("[Slack Debug] Conditions not met, skipping fetch");
      }
    };
    fetchChannels();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slackStatus?.connected, slackStatus?.method, clerkId]);

  // Initialize form values when settings load
  useEffect(() => {
    if (settings) {
      setTeamName(settings.team?.name || "");
      setUserName(settings.user?.name || "");
      setTimezone(settings.team?.timezone || "America/New_York");
      setCustomOutcomes(settings.team?.customOutcomes || []);
      setCustomCategories(settings.team?.customPlaybookCategories || []);
      setSlackWebhookUrl(settings.team?.slackWebhookUrl || "");
    }
  }, [settings]);

  // Handlers
  const handleSaveTeamName = async () => {
    if (!clerkId || !teamName.trim()) return;
    setSavingTeamName(true);
    try {
      await updateTeamName({ clerkId, name: teamName.trim() });
      setSavedTeamName(true);
      setTimeout(() => setSavedTeamName(false), 2000);
    } catch (error) {
      console.error("Failed to save team name:", error);
    } finally {
      setSavingTeamName(false);
    }
  };

  const handleSaveUserName = async () => {
    if (!clerkId || !userName.trim()) return;
    setSavingUserName(true);
    try {
      await updateUserName({ clerkId, name: userName.trim() });
      setSavedUserName(true);
      setTimeout(() => setSavedUserName(false), 2000);
    } catch (error) {
      console.error("Failed to save user name:", error);
    } finally {
      setSavingUserName(false);
    }
  };

  const handleSaveTimezone = async (newTimezone: string) => {
    if (!clerkId) return;
    setTimezone(newTimezone);
    setSavingTimezone(true);
    try {
      await updateTimezone({ clerkId, timezone: newTimezone });
      setSavedTimezone(true);
      setTimeout(() => setSavedTimezone(false), 2000);
    } catch (error) {
      console.error("Failed to save timezone:", error);
    } finally {
      setSavingTimezone(false);
    }
  };

  const handleAddOutcome = async (outcome: string) => {
    if (!clerkId) return;
    const newOutcomes = [...customOutcomes, outcome];
    setCustomOutcomes(newOutcomes);
    setSavingOutcomes(true);
    try {
      await updateCustomOutcomes({ clerkId, customOutcomes: newOutcomes });
      setSavedOutcomes(true);
      setTimeout(() => setSavedOutcomes(false), 2000);
    } catch (error) {
      console.error("Failed to save outcomes:", error);
    } finally {
      setSavingOutcomes(false);
    }
  };

  const handleRemoveOutcome = async (outcome: string) => {
    if (!clerkId) return;
    const newOutcomes = customOutcomes.filter((o) => o !== outcome);
    setCustomOutcomes(newOutcomes);
    setSavingOutcomes(true);
    try {
      await updateCustomOutcomes({ clerkId, customOutcomes: newOutcomes });
      setSavedOutcomes(true);
      setTimeout(() => setSavedOutcomes(false), 2000);
    } catch (error) {
      console.error("Failed to save outcomes:", error);
    } finally {
      setSavingOutcomes(false);
    }
  };

  const handleAddCategory = async (category: string) => {
    if (!clerkId) return;
    const newCategories = [...customCategories, category];
    setCustomCategories(newCategories);
    setSavingCategories(true);
    try {
      await updateCustomPlaybookCategories({ clerkId, customPlaybookCategories: newCategories });
      setSavedCategories(true);
      setTimeout(() => setSavedCategories(false), 2000);
    } catch (error) {
      console.error("Failed to save categories:", error);
    } finally {
      setSavingCategories(false);
    }
  };

  const handleRemoveCategory = async (category: string) => {
    if (!clerkId) return;
    const newCategories = customCategories.filter((c) => c !== category);
    setCustomCategories(newCategories);
    setSavingCategories(true);
    try {
      await updateCustomPlaybookCategories({ clerkId, customPlaybookCategories: newCategories });
      setSavedCategories(true);
      setTimeout(() => setSavedCategories(false), 2000);
    } catch (error) {
      console.error("Failed to save categories:", error);
    } finally {
      setSavingCategories(false);
    }
  };

  const handleDeleteTeam = async () => {
    if (!clerkId || deleteConfirmName !== settings?.team?.name) return;
    setIsDeleting(true);
    try {
      await deleteTeam({ clerkId, confirmTeamName: deleteConfirmName });
      // Redirect to home after deletion
      router.push("/");
    } catch (error) {
      console.error("Failed to delete team:", error);
      setIsDeleting(false);
    }
  };

  // Calendly handlers
  const handleConnectCalendly = async (token: string) => {
    if (!clerkId) return;
    setIsConnectingCalendly(true);
    setCalendlyConnectError(undefined);

    try {
      // First validate the token
      const validation = await validateCalendlyToken({ accessToken: token });

      if (!validation.valid) {
        setCalendlyConnectError(validation.error || "Invalid token");
        return;
      }

      // Save the connection
      await connectCalendly({
        clerkId,
        accessToken: token,
        userUri: validation.userUri!,
        organizationUri: validation.organizationUri!,
        email: validation.email!,
      });

      // Do initial sync
      setIsSyncingCalendly(true);
      try {
        await syncCalendlyEvents({ clerkId });
      } catch (syncError) {
        console.error("Initial sync failed:", syncError);
        // Don't fail the connection if sync fails
      } finally {
        setIsSyncingCalendly(false);
      }
    } catch (error) {
      console.error("Failed to connect Calendly:", error);
      setCalendlyConnectError("Failed to connect. Please try again.");
    } finally {
      setIsConnectingCalendly(false);
    }
  };

  const handleDisconnectCalendly = async () => {
    if (!clerkId) return;
    try {
      await disconnectCalendly({ clerkId });
    } catch (error) {
      console.error("Failed to disconnect Calendly:", error);
    }
  };

  const handleSyncCalendly = async () => {
    if (!clerkId) return;
    setIsSyncingCalendly(true);
    try {
      await syncCalendlyEvents({ clerkId });
    } catch (error) {
      console.error("Failed to sync Calendly:", error);
    } finally {
      setIsSyncingCalendly(false);
    }
  };

  // Slack webhook handlers
  const handleSaveSlackWebhook = async () => {
    if (!clerkId) return;
    setSavingSlackWebhook(true);
    setSlackWebhookTestResult(null);
    try {
      await updateSlackWebhookUrl({
        clerkId,
        slackWebhookUrl: slackWebhookUrl.trim() || undefined,
      });
      setSavedSlackWebhook(true);
      setTimeout(() => setSavedSlackWebhook(false), 2000);
    } catch (error) {
      console.error("Failed to save Slack webhook:", error);
    } finally {
      setSavingSlackWebhook(false);
    }
  };

  const handleTestSlackWebhook = async () => {
    if (!slackWebhookUrl.trim()) return;
    setTestingSlackWebhook(true);
    setSlackWebhookTestResult(null);
    try {
      const result = await testSlackWebhook({ webhookUrl: slackWebhookUrl.trim() });
      setSlackWebhookTestResult(result);
    } catch (error) {
      setSlackWebhookTestResult({ success: false, error: "Failed to test webhook" });
    } finally {
      setTestingSlackWebhook(false);
    }
  };

  const handleDisconnectSlack = async () => {
    if (!clerkId) return;
    setSavingSlackWebhook(true);
    try {
      await updateSlackWebhookUrl({ clerkId, slackWebhookUrl: undefined });
      setSlackWebhookUrl("");
      setSavedSlackWebhook(true);
      setTimeout(() => setSavedSlackWebhook(false), 2000);
    } catch (error) {
      console.error("Failed to disconnect Slack:", error);
    } finally {
      setSavingSlackWebhook(false);
    }
  };

  // Slack OAuth handlers
  const handleConnectSlackOAuth = () => {
    if (!settings?.team?._id) return;

    const clientId = process.env.NEXT_PUBLIC_SLACK_CLIENT_ID || "10226679921735.10416292908673";
    // Always use sequ3nce.ai for the redirect URI (must match Slack app config)
    const redirectUri = "https://sequ3nce.ai/api/slack/callback";
    const state = settings.team._id; // Pass teamId as state

    // Slack OAuth URL
    const slackAuthUrl = new URL("https://slack.com/oauth/v2/authorize");
    slackAuthUrl.searchParams.set("client_id", clientId);
    slackAuthUrl.searchParams.set("scope", "chat:write,channels:read");
    slackAuthUrl.searchParams.set("redirect_uri", redirectUri);
    slackAuthUrl.searchParams.set("state", state);

    window.location.href = slackAuthUrl.toString();
  };

  const handleDisconnectSlackOAuth = async () => {
    if (!clerkId) return;
    setDisconnectingSlack(true);
    try {
      await disconnectSlack({ clerkId });
    } catch (error) {
      console.error("Failed to disconnect Slack:", error);
    } finally {
      setDisconnectingSlack(false);
    }
  };

  const handleTestSlackOAuth = async () => {
    if (!clerkId) return;
    setTestingSlackOAuth(true);
    setSlackOAuthTestResult(null);
    try {
      const result = await testSlackConnection({ clerkId });
      setSlackOAuthTestResult(result);
    } catch (error) {
      setSlackOAuthTestResult({ success: false, error: "Failed to test connection" });
    } finally {
      setTestingSlackOAuth(false);
    }
  };

  // Handle notification channel updates
  const handleUpdateNotificationChannel = async (
    notificationType: string,
    enabled: boolean,
    channelId?: string,
    channelName?: string
  ) => {
    if (!clerkId) return;
    setSavingNotificationChannel(notificationType);
    try {
      await updateSlackNotificationChannel({
        clerkId,
        notificationType,
        enabled,
        channelId,
        channelName,
      });
    } catch (error) {
      console.error("Failed to update notification channel:", error);
    } finally {
      setSavingNotificationChannel(null);
    }
  };

  // Loading state
  if (isTeamLoading || settings === undefined) {
    return (
      <>
        <Header title="Settings" description="Manage your account and preferences" />
        <div className="p-6 flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  const getPlanDisplay = () => {
    const status = settings?.team?.subscriptionStatus;
    const seats = settings?.team?.seatCount || 0;
    if (status === "active" || status === "trialing") {
      return `Pro Plan - ${seats} seat${seats !== 1 ? "s" : ""}`;
    }
    return "No active subscription";
  };

  return (
    <>
      <Header title="Settings" description="Manage your account and preferences" />

      <div className="p-6 max-w-4xl space-y-8">
        {/* Account Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Account Settings
            </CardTitle>
            <CardDescription>
              Manage your team and personal account information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Team Name */}
            <div className="space-y-2">
              <Label htmlFor="teamName">Company/Team Name</Label>
              <div className="flex gap-2">
                <Input
                  id="teamName"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="Your company name"
                  className="max-w-md"
                />
                <Button
                  onClick={handleSaveTeamName}
                  disabled={savingTeamName || !teamName.trim() || teamName === settings?.team?.name}
                >
                  {savingTeamName ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Save"
                  )}
                </Button>
                <SaveSuccess show={savedTeamName} />
              </div>
            </div>

            <Separator />

            {/* Admin Name */}
            <div className="space-y-2">
              <Label htmlFor="userName">Your Name</Label>
              <div className="flex gap-2">
                <Input
                  id="userName"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Your name"
                  className="max-w-md"
                />
                <Button
                  onClick={handleSaveUserName}
                  disabled={savingUserName || !userName.trim() || userName === settings?.user?.name}
                >
                  {savingUserName ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Save"
                  )}
                </Button>
                <SaveSuccess show={savedUserName} />
              </div>
            </div>

            <Separator />

            {/* Admin Email (read-only) */}
            <div className="space-y-2">
              <Label>Email Address</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={settings?.user?.email || ""}
                  disabled
                  className="max-w-md bg-zinc-50"
                />
                <span className="text-xs text-muted-foreground">
                  Managed through Clerk
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Billing Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Billing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{getPlanDisplay()}</p>
                <p className="text-sm text-muted-foreground">
                  Manage your subscription and payment methods
                </p>
              </div>
              <Button variant="outline" asChild>
                <Link href="/dashboard/billing">
                  Manage Billing
                  <ExternalLink className="h-4 w-4 ml-2" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Team Preferences */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tags className="h-5 w-5" />
              Team Preferences
            </CardTitle>
            <CardDescription>
              Customize options and defaults for your team
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Timezone */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Team Timezone</Label>
                {savingTimezone && <Loader2 className="h-3 w-3 animate-spin" />}
                <SaveSuccess show={savedTimezone} />
              </div>
              <Select value={timezone} onValueChange={handleSaveTimezone}>
                <SelectTrigger className="max-w-md">
                  <Globe className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Affects how call times are displayed across the dashboard
              </p>
            </div>

            <Separator />

            {/* Call Outcomes */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Call Outcome Options</Label>
                {savingOutcomes && <Loader2 className="h-3 w-3 animate-spin" />}
                <SaveSuccess show={savedOutcomes} />
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                Default outcomes are always available. Add custom ones for your workflow.
              </p>
              <TagList
                tags={customOutcomes}
                defaultTags={DEFAULT_OUTCOMES}
                onAdd={handleAddOutcome}
                onRemove={handleRemoveOutcome}
                placeholder="Add custom outcome..."
              />
            </div>

            <Separator />

            {/* Playbook Categories */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="flex items-center gap-2">
                  <BookMarked className="h-4 w-4" />
                  Playbook Categories
                </Label>
                {savingCategories && <Loader2 className="h-3 w-3 animate-spin" />}
                <SaveSuccess show={savedCategories} />
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                Categories for organizing training highlights. Add custom ones for your team.
              </p>
              <TagList
                tags={customCategories}
                defaultTags={DEFAULT_PLAYBOOK_CATEGORIES}
                onAdd={handleAddCategory}
                onRemove={handleRemoveCategory}
                placeholder="Add custom category..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Integrations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Integrations
            </CardTitle>
            <CardDescription>
              Connect third-party services to enhance your workflow
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* ARCHIVED: Calendly integration - Re-enable when properly tested
            <CalendlyIntegration
              connected={settings?.team?.calendlyConnected || false}
              connectedEmail={settings?.team?.calendlyConnectedEmail}
              lastSyncAt={settings?.team?.calendlyLastSyncAt}
              onConnect={handleConnectCalendly}
              onDisconnect={handleDisconnectCalendly}
              onSync={handleSyncCalendly}
              isConnecting={isConnectingCalendly}
              isSyncing={isSyncingCalendly}
              connectError={calendlyConnectError}
            />
            */}

            <IntegrationCard
              name="Google Calendar"
              description="Sync scheduled calls from Google Calendar"
              icon={<Calendar className="h-5 w-5 text-zinc-600" />}
              comingSoon
            />

            <IntegrationCard
              name="Calendly"
              description="Sync scheduled calls from Calendly"
              icon={<Calendar className="h-5 w-5 text-zinc-600" />}
              comingSoon
            />

            {/* Slack OAuth Integration */}
            <div className="p-4 border rounded-lg space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${slackStatus?.connected ? "bg-green-50" : "bg-zinc-100"}`}>
                    <MessageSquare className={`h-5 w-5 ${slackStatus?.connected ? "text-green-600" : "text-zinc-600"}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">Slack</p>
                      {slackStatus?.connected && (
                        <Badge variant="default" className="bg-green-100 text-green-700 hover:bg-green-100">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Connected
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Get notified about calls, reinforcement requests, and more
                    </p>
                  </div>
                </div>
              </div>

              {/* OAuth Success/Error Messages */}
              {slackOAuthSuccess && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                  <CheckCircle2 className="h-4 w-4 inline mr-2" />
                  Slack connected successfully! You&apos;ll now receive notifications.
                </div>
              )}
              {slackOAuthError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertTriangle className="h-4 w-4 inline mr-2" />
                  Failed to connect Slack: {slackOAuthError}
                </div>
              )}

              {slackStatus?.connected && slackStatus.method === "oauth" ? (
                /* Connected via OAuth */
                <div className="space-y-4">
                  <div className="p-3 bg-zinc-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          {slackStatus.slackTeamName || "Workspace"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Connected {slackStatus.connectedAt ? new Date(slackStatus.connectedAt).toLocaleDateString() : ""}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDisconnectSlackOAuth}
                        disabled={disconnectingSlack}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        {disconnectingSlack ? <Loader2 className="h-4 w-4 animate-spin" /> : "Disconnect"}
                      </Button>
                    </div>
                  </div>

                  {/* Per-notification channel configuration */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Configure Notifications</p>
                      {loadingSlackChannels && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Loading channels...
                        </span>
                      )}
                    </div>

                    <NotificationChannelConfig
                      type="reinforcement"
                      label="Reinforcement Requests"
                      description="When closers need urgent help during calls"
                      config={slackStatus.notificationChannels?.reinforcement}
                      channels={slackChannels}
                      onUpdate={(enabled, channelId, channelName) =>
                        handleUpdateNotificationChannel("reinforcement", enabled, channelId, channelName)
                      }
                      saving={savingNotificationChannel === "reinforcement"}
                      loadingChannels={loadingSlackChannels}
                    />

                    <NotificationChannelConfig
                      type="callStarted"
                      label="Call Started"
                      description="When a prospect joins and the call begins"
                      config={slackStatus.notificationChannels?.callStarted}
                      channels={slackChannels}
                      onUpdate={(enabled, channelId, channelName) =>
                        handleUpdateNotificationChannel("callStarted", enabled, channelId, channelName)
                      }
                      saving={savingNotificationChannel === "callStarted"}
                      loadingChannels={loadingSlackChannels}
                    />

                    <NotificationChannelConfig
                      type="callSummary"
                      label="Call Summaries (30 & 60 min)"
                      description="AI-generated summaries for long-running calls"
                      config={slackStatus.notificationChannels?.callSummary}
                      channels={slackChannels}
                      onUpdate={(enabled, channelId, channelName) =>
                        handleUpdateNotificationChannel("callSummary", enabled, channelId, channelName)
                      }
                      saving={savingNotificationChannel === "callSummary"}
                      loadingChannels={loadingSlackChannels}
                    />

                    <NotificationChannelConfig
                      type="callGoingLong"
                      label="Call Going Long"
                      description="When closers signal their call is running over"
                      config={slackStatus.notificationChannels?.callGoingLong}
                      channels={slackChannels}
                      onUpdate={(enabled, channelId, channelName) =>
                        handleUpdateNotificationChannel("callGoingLong", enabled, channelId, channelName)
                      }
                      saving={savingNotificationChannel === "callGoingLong"}
                      loadingChannels={loadingSlackChannels}
                    />

                    {!loadingSlackChannels && (
                      <div className={`text-xs p-3 rounded border ${
                        slackChannels.length === 0
                          ? "bg-amber-50 border-amber-200"
                          : "bg-blue-50 border-blue-200"
                      }`}>
                        <p className={`font-medium mb-2 ${
                          slackChannels.length === 0 ? "text-amber-700" : "text-blue-700"
                        }`}>
                          {slackChannels.length === 0
                            ? "No channels available yet"
                            : `${slackChannels.length} channel${slackChannels.length === 1 ? "" : "s"} available`}
                        </p>
                        <div className={slackChannels.length === 0 ? "text-amber-600" : "text-blue-600"}>
                          <p className="mb-2">
                            The Sequ3nce bot can only send notifications to channels it has been invited to.
                            To add a channel:
                          </p>
                          <ol className="list-decimal list-inside space-y-1 ml-1">
                            <li>Open Slack and go to the channel you want notifications in</li>
                            <li>Type <code className={`px-1 rounded ${
                              slackChannels.length === 0 ? "bg-amber-100" : "bg-blue-100"
                            }`}>/invite @Sequ3nce</code> and press Enter</li>
                            <li>Refresh this page to see the channel in the dropdowns above</li>
                          </ol>
                          {slackChannels.length > 0 && (
                            <p className="mt-2 text-blue-500">
                              Tip: Add the bot to more channels to route different notification types to different places.
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <Separator />

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={handleTestSlackOAuth}
                      disabled={testingSlackOAuth}
                    >
                      {testingSlackOAuth ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Send Test Message
                    </Button>
                  </div>

                  {slackOAuthTestResult && (
                    <p className={`text-sm ${slackOAuthTestResult.success ? "text-green-600" : "text-red-600"}`}>
                      {slackOAuthTestResult.success
                        ? "Test message sent! Check your Slack channel."
                        : slackOAuthTestResult.error || "Test failed"}
                    </p>
                  )}
                </div>
              ) : slackStatus?.connected && slackStatus.method === "webhook" ? (
                /* Connected via legacy webhook - show migration prompt */
                <div className="space-y-3">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-800">
                      <AlertTriangle className="h-4 w-4 inline mr-2" />
                      You&apos;re using the legacy webhook method. Upgrade to OAuth for more notification types.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleConnectSlackOAuth}>
                      Upgrade to OAuth
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleDisconnectSlack}
                      disabled={savingSlackWebhook}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      {savingSlackWebhook ? <Loader2 className="h-4 w-4 animate-spin" /> : "Disconnect Webhook"}
                    </Button>
                  </div>
                </div>
              ) : (
                /* Not connected */
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Click the button below to connect your Slack workspace and select a channel for notifications.
                  </p>

                  <Button onClick={handleConnectSlackOAuth} className="w-full sm:w-auto">
                    <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.522 2.521 2.528 2.528 0 0 1-2.521-2.521V2.522A2.528 2.528 0 0 1 15.165 0a2.528 2.528 0 0 1 2.521 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.521 2.522A2.528 2.528 0 0 1 15.165 24a2.528 2.528 0 0 1-2.521-2.522v-2.522h2.521zm0-1.27a2.528 2.528 0 0 1-2.521-2.522 2.528 2.528 0 0 1 2.521-2.521h6.313A2.528 2.528 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.521h-6.313z"/>
                    </svg>
                    Add to Slack
                  </Button>

                  <div className="text-xs text-muted-foreground pt-2 border-t">
                    <p className="font-medium mb-1">What you&apos;ll receive:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li>Reinforcement requests from closers</li>
                      <li>Call started alerts</li>
                      <li>30 &amp; 60 minute call summaries</li>
                      <li>Call going long alerts</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>

            <IntegrationCard
              name="GoHighLevel"
              description="Sync contacts and deal information"
              icon={<Zap className="h-5 w-5 text-zinc-600" />}
              comingSoon
            />

            <IntegrationCard
              name="Close CRM"
              description="Log calls and update leads automatically"
              icon={<User className="h-5 w-5 text-zinc-600" />}
              comingSoon
            />
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Danger Zone
            </CardTitle>
            <CardDescription>
              Irreversible actions that affect your entire team
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 border border-red-200 rounded-lg bg-red-50/50">
              <div>
                <p className="font-medium text-red-900">Delete Team</p>
                <p className="text-sm text-red-700">
                  Permanently delete your team and all associated data including closers, calls, recordings, and playbook highlights.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Team
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-red-600">
                      <AlertTriangle className="h-5 w-5" />
                      Delete Team Permanently
                    </AlertDialogTitle>
                    <AlertDialogDescription className="space-y-3">
                      <p>
                        This action cannot be undone. This will permanently delete:
                      </p>
                      <ul className="list-disc list-inside text-sm space-y-1">
                        <li>Your team account and all settings</li>
                        <li>All closers and their accounts</li>
                        <li>All call recordings and transcripts</li>
                        <li>All playbook highlights</li>
                        <li>All extracted ammo and analytics data</li>
                      </ul>
                      <p className="font-medium pt-2">
                        Type <span className="font-mono bg-zinc-100 px-1 rounded">{settings?.team?.name}</span> to confirm:
                      </p>
                      <Input
                        value={deleteConfirmName}
                        onChange={(e) => setDeleteConfirmName(e.target.value)}
                        placeholder="Enter team name"
                        className="mt-2"
                      />
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setDeleteConfirmName("")}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteTeam}
                      disabled={deleteConfirmName !== settings?.team?.name || isDeleting}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      {isDeleting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        "Delete Team"
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
