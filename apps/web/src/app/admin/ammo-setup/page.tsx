"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Loader2,
  Plus,
  X,
  GripVertical,
  Save,
  CheckCircle2,
  AlertCircle,
  Building2,
  User,
  Settings,
} from "lucide-react";

// Types for our form data
interface RequiredInfoItem {
  id: string;
  label: string;
  description?: string;
}

interface ScriptStage {
  id: string;
  name: string;
  description?: string;
  order: number;
}

interface CommonObjection {
  id: string;
  label: string;
  keywords: string[];
}

interface AmmoCategory {
  id: string;
  name: string;
  color: string;
  keywords: string[];
}

// Default colors for categories
const CATEGORY_COLORS = [
  "purple", "green", "blue", "orange", "red", "yellow", "pink", "cyan"
];

// Generate a unique ID
const generateId = () => Math.random().toString(36).substring(2, 9);

export default function AmmoSetupPage() {
  // Search state
  const [searchEmail, setSearchEmail] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<Id<"teams"> | null>(null);

  // Form state
  const [requiredInfo, setRequiredInfo] = useState<RequiredInfoItem[]>([]);
  const [scriptFramework, setScriptFramework] = useState<ScriptStage[]>([]);
  const [commonObjections, setCommonObjections] = useState<CommonObjection[]>([]);
  const [ammoCategories, setAmmoCategories] = useState<AmmoCategory[]>([]);
  const [offerDescription, setOfferDescription] = useState("");
  const [problemSolved, setProblemSolved] = useState("");

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");

  // Convex queries and mutations
  const teamData = useQuery(
    api.admin.findTeamByOwnerEmail,
    searchEmail && isSearching ? { email: searchEmail } : "skip"
  );

  const saveAmmoConfig = useMutation(api.admin.saveAmmoConfig);

  // Handle search
  const handleSearch = () => {
    if (searchEmail.trim()) {
      setIsSearching(true);
      setSelectedTeamId(null);
    }
  };

  // Select a team and load its config
  const handleSelectTeam = () => {
    if (teamData?.team) {
      setSelectedTeamId(teamData.team._id);

      // Load existing config or set defaults
      if (teamData.ammoConfig) {
        setRequiredInfo(teamData.ammoConfig.requiredInfo);
        setScriptFramework(teamData.ammoConfig.scriptFramework);
        setCommonObjections(teamData.ammoConfig.commonObjections);
        setAmmoCategories(teamData.ammoConfig.ammoCategories);
        setOfferDescription(teamData.ammoConfig.offerDescription);
        setProblemSolved(teamData.ammoConfig.problemSolved);
      } else {
        // Set defaults for new config
        setRequiredInfo([
          { id: generateId(), label: "Budget", description: "What's their budget or investment capacity?" },
          { id: generateId(), label: "Decision Maker", description: "Are they the sole decision maker?" },
          { id: generateId(), label: "Timeline", description: "When do they need to make a decision?" },
        ]);
        setScriptFramework([
          { id: generateId(), name: "Rapport", description: "Build connection and trust", order: 0 },
          { id: generateId(), name: "Pain Discovery", description: "Uncover their problems and frustrations", order: 1 },
          { id: generateId(), name: "Solution", description: "Present how you solve their problem", order: 2 },
          { id: generateId(), name: "Objections", description: "Handle concerns and hesitations", order: 3 },
          { id: generateId(), name: "Close", description: "Ask for the commitment", order: 4 },
        ]);
        setCommonObjections([
          { id: generateId(), label: "Spouse/Partner", keywords: ["wife", "husband", "partner", "spouse", "talk to my"] },
          { id: generateId(), label: "Price/Money", keywords: ["expensive", "afford", "cost", "money", "budget"] },
          { id: generateId(), label: "Timing", keywords: ["not right now", "later", "busy", "next month", "not ready"] },
          { id: generateId(), label: "Need to think", keywords: ["think about it", "consider", "sleep on it", "let me think"] },
        ]);
        setAmmoCategories([
          { id: generateId(), name: "Financial", color: "green", keywords: ["money", "cost", "losing", "spending", "revenue", "profit"] },
          { id: generateId(), name: "Emotional", color: "purple", keywords: ["frustrated", "stressed", "worried", "excited", "fed up", "desperate"] },
          { id: generateId(), name: "Situational", color: "blue", keywords: ["deadline", "before", "by", "need to", "have to", "must"] },
        ]);
        setOfferDescription("");
        setProblemSolved("");
      }
    }
  };

  // Handle save
  const handleSave = async () => {
    if (!selectedTeamId) return;

    setIsSaving(true);
    setSaveStatus("idle");

    try {
      await saveAmmoConfig({
        teamId: selectedTeamId,
        requiredInfo,
        scriptFramework,
        commonObjections,
        ammoCategories,
        offerDescription,
        problemSolved,
      });
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (error) {
      console.error("Failed to save config:", error);
      setSaveStatus("error");
    } finally {
      setIsSaving(false);
    }
  };

  // Clear search and start over
  const handleClearSearch = () => {
    setSearchEmail("");
    setIsSearching(false);
    setSelectedTeamId(null);
    setRequiredInfo([]);
    setScriptFramework([]);
    setCommonObjections([]);
    setAmmoCategories([]);
    setOfferDescription("");
    setProblemSolved("");
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Ammo Configuration</h1>
        <p className="text-zinc-600 mt-1">
          Configure custom ammo settings for a business account
        </p>
      </div>

      {/* Search Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Find Account
          </CardTitle>
          <CardDescription>
            Search for a business by the team owner&apos;s email address
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              type="email"
              placeholder="owner@company.com"
              value={searchEmail}
              onChange={(e) => {
                setSearchEmail(e.target.value);
                setIsSearching(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="max-w-md"
            />
            <Button onClick={handleSearch} disabled={!searchEmail.trim()}>
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
            {(isSearching || selectedTeamId) && (
              <Button variant="outline" onClick={handleClearSearch}>
                Clear
              </Button>
            )}
          </div>

          {/* Search Results */}
          {isSearching && teamData === undefined && (
            <div className="mt-4 flex items-center gap-2 text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching...
            </div>
          )}

          {isSearching && teamData === null && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <AlertCircle className="h-5 w-5" />
              No account found for this email
            </div>
          )}

          {isSearching && teamData && !selectedTeamId && (
            <div className="mt-4 p-4 bg-zinc-50 border border-zinc-200 rounded-lg">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-zinc-500" />
                    <span className="font-medium text-zinc-900">{teamData.team.name}</span>
                    <Badge variant={teamData.team.plan === "active" ? "default" : "secondary"}>
                      {teamData.team.plan}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-zinc-600">
                    <User className="h-4 w-4" />
                    {teamData.user.name || teamData.user.email}
                    <span className="text-zinc-400">•</span>
                    <span>{teamData.user.email}</span>
                    <span className="text-zinc-400">•</span>
                    <span className="capitalize">{teamData.user.role}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Settings className="h-4 w-4 text-zinc-500" />
                    {teamData.hasAmmoConfig ? (
                      <span className="text-green-600">Has ammo config</span>
                    ) : (
                      <span className="text-zinc-500">No ammo config yet</span>
                    )}
                  </div>
                </div>
                <Button onClick={handleSelectTeam}>
                  {teamData.hasAmmoConfig ? "Edit Config" : "Create Config"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configuration Form - Only show when team is selected */}
      {selectedTeamId && (
        <>
          {/* Required Information */}
          <Card>
            <CardHeader>
              <CardTitle>Required Information</CardTitle>
              <CardDescription>
                What info must closers uncover on every call?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {requiredInfo.map((item, index) => (
                <div key={item.id} className="flex items-start gap-3 p-3 bg-zinc-50 rounded-lg">
                  <GripVertical className="h-5 w-5 text-zinc-400 mt-2 cursor-grab" />
                  <div className="flex-1 space-y-2">
                    <Input
                      value={item.label}
                      onChange={(e) => {
                        const updated = [...requiredInfo];
                        updated[index].label = e.target.value;
                        setRequiredInfo(updated);
                      }}
                      placeholder="e.g., Budget"
                    />
                    <Input
                      value={item.description || ""}
                      onChange={(e) => {
                        const updated = [...requiredInfo];
                        updated[index].description = e.target.value;
                        setRequiredInfo(updated);
                      }}
                      placeholder="Description (optional)"
                      className="text-sm"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRequiredInfo(requiredInfo.filter((_, i) => i !== index))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                onClick={() => setRequiredInfo([...requiredInfo, { id: generateId(), label: "" }])}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </CardContent>
          </Card>

          {/* Script Framework */}
          <Card>
            <CardHeader>
              <CardTitle>Script Framework</CardTitle>
              <CardDescription>
                Their call stages in order
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {scriptFramework
                .sort((a, b) => a.order - b.order)
                .map((stage, index) => (
                  <div key={stage.id} className="flex items-start gap-3 p-3 bg-zinc-50 rounded-lg">
                    <div className="flex flex-col items-center gap-1">
                      <GripVertical className="h-5 w-5 text-zinc-400 cursor-grab" />
                      <span className="text-xs text-zinc-500">{index + 1}</span>
                    </div>
                    <div className="flex-1 space-y-2">
                      <Input
                        value={stage.name}
                        onChange={(e) => {
                          const updated = [...scriptFramework];
                          const idx = updated.findIndex((s) => s.id === stage.id);
                          updated[idx].name = e.target.value;
                          setScriptFramework(updated);
                        }}
                        placeholder="e.g., Rapport"
                      />
                      <Input
                        value={stage.description || ""}
                        onChange={(e) => {
                          const updated = [...scriptFramework];
                          const idx = updated.findIndex((s) => s.id === stage.id);
                          updated[idx].description = e.target.value;
                          setScriptFramework(updated);
                        }}
                        placeholder="Description (optional)"
                        className="text-sm"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setScriptFramework(scriptFramework.filter((s) => s.id !== stage.id))}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              <Button
                variant="outline"
                onClick={() =>
                  setScriptFramework([
                    ...scriptFramework,
                    { id: generateId(), name: "", order: scriptFramework.length },
                  ])
                }
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Stage
              </Button>
            </CardContent>
          </Card>

          {/* Common Objections */}
          <Card>
            <CardHeader>
              <CardTitle>Common Objections</CardTitle>
              <CardDescription>
                What objections do prospects typically raise? Include keywords to detect them.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {commonObjections.map((objection, index) => (
                <div key={objection.id} className="flex items-start gap-3 p-3 bg-zinc-50 rounded-lg">
                  <div className="flex-1 space-y-2">
                    <Input
                      value={objection.label}
                      onChange={(e) => {
                        const updated = [...commonObjections];
                        updated[index].label = e.target.value;
                        setCommonObjections(updated);
                      }}
                      placeholder="e.g., Spouse/Partner"
                    />
                    <Input
                      value={objection.keywords.join(", ")}
                      onChange={(e) => {
                        const updated = [...commonObjections];
                        updated[index].keywords = e.target.value.split(",").map((k) => k.trim()).filter(Boolean);
                        setCommonObjections(updated);
                      }}
                      placeholder="Keywords (comma-separated): wife, husband, partner"
                      className="text-sm"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCommonObjections(commonObjections.filter((_, i) => i !== index))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                onClick={() =>
                  setCommonObjections([...commonObjections, { id: generateId(), label: "", keywords: [] }])
                }
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Objection
              </Button>
            </CardContent>
          </Card>

          {/* Ammo Categories */}
          <Card>
            <CardHeader>
              <CardTitle>Ammo Categories</CardTitle>
              <CardDescription>
                Custom categories for organizing ammo. Include keywords to listen for.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {ammoCategories.map((category, index) => (
                <div key={category.id} className="flex items-start gap-3 p-3 bg-zinc-50 rounded-lg">
                  <div
                    className="w-4 h-4 rounded-full mt-3"
                    style={{ backgroundColor: getCategoryColor(category.color) }}
                  />
                  <div className="flex-1 space-y-2">
                    <div className="flex gap-2">
                      <Input
                        value={category.name}
                        onChange={(e) => {
                          const updated = [...ammoCategories];
                          updated[index].name = e.target.value;
                          setAmmoCategories(updated);
                        }}
                        placeholder="e.g., Financial"
                        className="flex-1"
                      />
                      <select
                        value={category.color}
                        onChange={(e) => {
                          const updated = [...ammoCategories];
                          updated[index].color = e.target.value;
                          setAmmoCategories(updated);
                        }}
                        className="px-3 py-2 border border-zinc-200 rounded-md text-sm"
                      >
                        {CATEGORY_COLORS.map((color) => (
                          <option key={color} value={color}>
                            {color.charAt(0).toUpperCase() + color.slice(1)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Input
                      value={category.keywords.join(", ")}
                      onChange={(e) => {
                        const updated = [...ammoCategories];
                        updated[index].keywords = e.target.value.split(",").map((k) => k.trim()).filter(Boolean);
                        setAmmoCategories(updated);
                      }}
                      placeholder="Keywords (comma-separated): money, cost, losing, spending"
                      className="text-sm"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAmmoCategories(ammoCategories.filter((_, i) => i !== index))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                onClick={() =>
                  setAmmoCategories([
                    ...ammoCategories,
                    {
                      id: generateId(),
                      name: "",
                      color: CATEGORY_COLORS[ammoCategories.length % CATEGORY_COLORS.length],
                      keywords: [],
                    },
                  ])
                }
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Category
              </Button>
            </CardContent>
          </Card>

          {/* Offer Details */}
          <Card>
            <CardHeader>
              <CardTitle>Offer Details</CardTitle>
              <CardDescription>
                Information about what the business sells
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="offerDescription">What do they sell?</Label>
                <Textarea
                  id="offerDescription"
                  value={offerDescription}
                  onChange={(e) => setOfferDescription(e.target.value)}
                  placeholder="e.g., A 12-week business coaching program for entrepreneurs..."
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="problemSolved">What problem does it solve?</Label>
                <Textarea
                  id="problemSolved"
                  value={problemSolved}
                  onChange={(e) => setProblemSolved(e.target.value)}
                  placeholder="e.g., Helps entrepreneurs scale from 6 to 7 figures by implementing..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex items-center justify-end gap-4 pb-8">
            {saveStatus === "success" && (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                Saved successfully
              </div>
            )}
            {saveStatus === "error" && (
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle className="h-5 w-5" />
                Failed to save
              </div>
            )}
            <Button
              size="lg"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Configuration
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// Helper to convert color name to actual color
function getCategoryColor(color: string): string {
  const colors: Record<string, string> = {
    purple: "#8B5CF6",
    green: "#22C55E",
    blue: "#3B82F6",
    orange: "#F97316",
    red: "#EF4444",
    yellow: "#EAB308",
    pink: "#EC4899",
    cyan: "#06B6D4",
  };
  return colors[color] || "#6B7280";
}
