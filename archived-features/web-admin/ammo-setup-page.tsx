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
  ChevronDown,
  ChevronRight,
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

interface ManifestoStage {
  id: string;
  name: string;
  goal?: string;
  goodBehaviors: string[];
  badBehaviors: string[];
  keyMoments: string[];
  order: number;
}

interface ManifestoObjection {
  id: string;
  name: string;
  rebuttals: string[];
}

interface CallManifesto {
  stages: ManifestoStage[];
  objections: ManifestoObjection[];
}

// Default colors for categories
const CATEGORY_COLORS = [
  "purple", "green", "blue", "orange", "red", "yellow", "pink", "cyan"
];

// Generate a unique ID
const generateId = () => Math.random().toString(36).substring(2, 9);

// Default manifesto (universal sales framework)
const DEFAULT_MANIFESTO: CallManifesto = {
  stages: [
    {
      id: "stage_intro",
      name: "Introduction / Rapport / Framing",
      goal: "Show up powerful, take control, frame the call",
      goodBehaviors: [
        "High energy, fully present",
        "Limited small talk, get to business quickly",
        "Take control of the conversation early",
        "Frame the call with time awareness",
        "Set clear expectations for the call"
      ],
      badBehaviors: [
        "Using casual language like 'mate', 'bro', 'buddy', 'man'",
        "Too much small talk before getting to business",
        "Low energy or seeming distracted",
        "Not taking control of the conversation",
        "Letting the prospect lead the call structure"
      ],
      keyMoments: [
        "Opening question: 'In your opinion, what is the biggest challenge you are having in your [AREA] right now?'"
      ],
      order: 1
    },
    {
      id: "stage_discovery",
      name: "Discovery",
      goal: "Understand severity, get specifics, create ownership",
      goodBehaviors: [
        "Get prospect to explicitly name pain points with specifics and numbers",
        "Use Doctor/Detective/Challenging frame",
        "Ask open-ended questions",
        "Summarize and reframe their info back to them",
        "Get commitment to change",
        "Dig deeper on emotional responses"
      ],
      badBehaviors: [
        "Using minimizing words: 'just', 'little bit', 'kind of'",
        "Buddy-buddy sympathizing frame instead of challenging",
        "Asking binary yes/no questions",
        "Asking double questions back-to-back",
        "Letting prospect play victim without challenging",
        "Forcing opinions instead of leading them to conclusions"
      ],
      keyMoments: [
        "Closing discovery: 'Is there anything else that you feel like we haven't discussed that I need to know?'"
      ],
      order: 2
    },
    {
      id: "stage_transition",
      name: "Transition / Summary",
      goal: "Summarize where they are and where they want to go, get permission to pitch",
      goodBehaviors: [
        "Accurate summary delivered with certainty",
        "Include emotional reasons in the summary",
        "Get verbal confirmation before moving on",
        "Bridge pain to solution naturally"
      ],
      badBehaviors: [
        "Skipping the summary entirely",
        "Weak or uncertain summary delivery",
        "Not getting confirmation before pitching",
        "Missing emotional elements in recap"
      ],
      keyMoments: [
        "Permission to pitch: 'If you'd like I can walk you through the process of exactly how...'"
      ],
      order: 3
    },
    {
      id: "stage_pitch",
      name: "Pitch",
      goal: "Present the solution naturally and check for understanding",
      goodBehaviors: [
        "Read full pitch completely",
        "Natural flow, practiced delivery",
        "Customize to the prospect's specific situation",
        "Check-ins throughout: 'Everything make sense?'",
        "Temperature check before close"
      ],
      badBehaviors: [
        "Rushing through the pitch",
        "Not customizing to prospect's specific pain",
        "No check-ins during presentation",
        "Monotone or robotic delivery"
      ],
      keyMoments: [
        "Temperature check: 'In terms of the process, how do you feel?'",
        "Belief check: 'Do you FEEL like this CAN take you from where you're at now to where you want to be?'"
      ],
      order: 4
    },
    {
      id: "stage_close",
      name: "Close / Objections",
      goal: "Handle objections and close the deal",
      goodBehaviors: [
        "Ask for the sale directly",
        "Handle objections with empathy then redirect",
        "Use tie-downs and assumptive language",
        "Stay confident through objections",
        "Create urgency without pressure"
      ],
      badBehaviors: [
        "Not asking for the sale",
        "Accepting objections at face value",
        "Getting defensive or argumentative",
        "Dropping price too quickly",
        "Showing desperation"
      ],
      keyMoments: [
        "Closing question: 'Based on everything we discussed, are you ready to get started?'"
      ],
      order: 5
    }
  ],
  objections: [
    {
      id: "obj_spouse",
      name: "Spouse/Partner",
      rebuttals: [
        "I completely understand. When you spoke with them before this call, what did they say about you solving this problem?",
        "That makes sense. If they were here right now, what do you think their biggest concern would be?",
        "I hear you. In your experience, does your partner usually support decisions you feel strongly about?"
      ]
    },
    {
      id: "obj_price",
      name: "Price/Money",
      rebuttals: [
        "I understand price is a consideration. Let me ask - if the investment wasn't a factor, would you want to move forward?",
        "That's fair. What would this solution need to do for you to make it worth that investment?",
        "I hear you. Compared to the cost of staying where you are, how does this investment look?"
      ]
    },
    {
      id: "obj_timing",
      name: "Timing",
      rebuttals: [
        "I understand timing is important. What would need to happen for the timing to be right?",
        "That makes sense. If we started now, where would you be in 90 days versus if you wait?",
        "I hear you. What's the cost of waiting another 3-6 months on this?"
      ]
    },
    {
      id: "obj_think",
      name: "Need to think about it",
      rebuttals: [
        "Absolutely, this is a big decision. What specifically do you need to think about?",
        "I understand. What questions do you still have that I can help answer right now?",
        "That's fair. On a scale of 1-10, where are you at in terms of moving forward?"
      ]
    }
  ]
};

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
  const [callManifesto, setCallManifesto] = useState<CallManifesto | null>(null);

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [manifestoExpanded, setManifestoExpanded] = useState(false);
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());

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
        // Load manifesto or use default
        setCallManifesto(teamData.ammoConfig.callManifesto || DEFAULT_MANIFESTO);
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
        // Set default manifesto
        setCallManifesto(DEFAULT_MANIFESTO);
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
        callManifesto: callManifesto || undefined,
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
    setCallManifesto(null);
    setManifestoExpanded(false);
    setExpandedStages(new Set());
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

          {/* Call Framework (Manifesto) - Collapsible */}
          <Card>
            <CardHeader
              className="cursor-pointer hover:bg-zinc-50 transition-colors"
              onClick={() => setManifestoExpanded(!manifestoExpanded)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {manifestoExpanded ? (
                      <ChevronDown className="h-5 w-5" />
                    ) : (
                      <ChevronRight className="h-5 w-5" />
                    )}
                    Call Framework (Manifesto)
                  </CardTitle>
                  <CardDescription className="mt-1 ml-7">
                    Define sales stages, expected behaviors, key moments, and objection rebuttals
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs">
                  {callManifesto?.stages?.length || 0} stages
                </Badge>
              </div>
            </CardHeader>

            {manifestoExpanded && callManifesto && (
              <CardContent className="space-y-6">
                {/* Stages */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-zinc-900">Call Stages</h3>
                  {callManifesto.stages
                    .sort((a, b) => a.order - b.order)
                    .map((stage, stageIndex) => {
                      const isExpanded = expandedStages.has(stage.id);
                      return (
                        <div
                          key={stage.id}
                          className="border border-zinc-200 rounded-lg overflow-hidden"
                        >
                          {/* Stage Header */}
                          <div
                            className="flex items-center justify-between p-3 bg-zinc-50 cursor-pointer hover:bg-zinc-100"
                            onClick={() => {
                              const newExpanded = new Set(expandedStages);
                              if (isExpanded) {
                                newExpanded.delete(stage.id);
                              } else {
                                newExpanded.add(stage.id);
                              }
                              setExpandedStages(newExpanded);
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <span className="w-6 h-6 flex items-center justify-center bg-zinc-200 rounded-full text-sm font-medium">
                                {stageIndex + 1}
                              </span>
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-zinc-500" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-zinc-500" />
                              )}
                              <span className="font-medium">{stage.name}</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCallManifesto({
                                  ...callManifesto,
                                  stages: callManifesto.stages.filter((s) => s.id !== stage.id),
                                });
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>

                          {/* Stage Content */}
                          {isExpanded && (
                            <div className="p-4 space-y-4 border-t border-zinc-200">
                              {/* Stage Name */}
                              <div className="space-y-1">
                                <Label className="text-sm">Stage Name</Label>
                                <Input
                                  value={stage.name}
                                  onChange={(e) => {
                                    const updated = [...callManifesto.stages];
                                    updated[stageIndex].name = e.target.value;
                                    setCallManifesto({ ...callManifesto, stages: updated });
                                  }}
                                  placeholder="e.g., Introduction / Rapport"
                                />
                              </div>

                              {/* Goal */}
                              <div className="space-y-1">
                                <Label className="text-sm">Goal</Label>
                                <Input
                                  value={stage.goal || ""}
                                  onChange={(e) => {
                                    const updated = [...callManifesto.stages];
                                    updated[stageIndex].goal = e.target.value;
                                    setCallManifesto({ ...callManifesto, stages: updated });
                                  }}
                                  placeholder="What's the goal of this stage?"
                                />
                              </div>

                              {/* Good Behaviors */}
                              <div className="space-y-2">
                                <Label className="text-sm text-green-700">Good Behaviors</Label>
                                {stage.goodBehaviors.map((behavior, behaviorIndex) => (
                                  <div key={behaviorIndex} className="flex items-center gap-2">
                                    <Input
                                      value={behavior}
                                      onChange={(e) => {
                                        const updated = [...callManifesto.stages];
                                        updated[stageIndex].goodBehaviors[behaviorIndex] = e.target.value;
                                        setCallManifesto({ ...callManifesto, stages: updated });
                                      }}
                                      className="flex-1 text-sm border-green-200 focus:border-green-500"
                                    />
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        const updated = [...callManifesto.stages];
                                        updated[stageIndex].goodBehaviors = updated[stageIndex].goodBehaviors.filter(
                                          (_, i) => i !== behaviorIndex
                                        );
                                        setCallManifesto({ ...callManifesto, stages: updated });
                                      }}
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ))}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-green-700"
                                  onClick={() => {
                                    const updated = [...callManifesto.stages];
                                    updated[stageIndex].goodBehaviors.push("");
                                    setCallManifesto({ ...callManifesto, stages: updated });
                                  }}
                                >
                                  <Plus className="h-3 w-3 mr-1" />
                                  Add behavior
                                </Button>
                              </div>

                              {/* Bad Behaviors */}
                              <div className="space-y-2">
                                <Label className="text-sm text-red-700">Bad Behaviors</Label>
                                {stage.badBehaviors.map((behavior, behaviorIndex) => (
                                  <div key={behaviorIndex} className="flex items-center gap-2">
                                    <Input
                                      value={behavior}
                                      onChange={(e) => {
                                        const updated = [...callManifesto.stages];
                                        updated[stageIndex].badBehaviors[behaviorIndex] = e.target.value;
                                        setCallManifesto({ ...callManifesto, stages: updated });
                                      }}
                                      className="flex-1 text-sm border-red-200 focus:border-red-500"
                                    />
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        const updated = [...callManifesto.stages];
                                        updated[stageIndex].badBehaviors = updated[stageIndex].badBehaviors.filter(
                                          (_, i) => i !== behaviorIndex
                                        );
                                        setCallManifesto({ ...callManifesto, stages: updated });
                                      }}
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ))}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-700"
                                  onClick={() => {
                                    const updated = [...callManifesto.stages];
                                    updated[stageIndex].badBehaviors.push("");
                                    setCallManifesto({ ...callManifesto, stages: updated });
                                  }}
                                >
                                  <Plus className="h-3 w-3 mr-1" />
                                  Add behavior
                                </Button>
                              </div>

                              {/* Key Moments */}
                              <div className="space-y-2">
                                <Label className="text-sm text-blue-700">Key Moments</Label>
                                {stage.keyMoments.map((moment, momentIndex) => (
                                  <div key={momentIndex} className="flex items-center gap-2">
                                    <Input
                                      value={moment}
                                      onChange={(e) => {
                                        const updated = [...callManifesto.stages];
                                        updated[stageIndex].keyMoments[momentIndex] = e.target.value;
                                        setCallManifesto({ ...callManifesto, stages: updated });
                                      }}
                                      className="flex-1 text-sm border-blue-200 focus:border-blue-500"
                                    />
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        const updated = [...callManifesto.stages];
                                        updated[stageIndex].keyMoments = updated[stageIndex].keyMoments.filter(
                                          (_, i) => i !== momentIndex
                                        );
                                        setCallManifesto({ ...callManifesto, stages: updated });
                                      }}
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ))}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-blue-700"
                                  onClick={() => {
                                    const updated = [...callManifesto.stages];
                                    updated[stageIndex].keyMoments.push("");
                                    setCallManifesto({ ...callManifesto, stages: updated });
                                  }}
                                >
                                  <Plus className="h-3 w-3 mr-1" />
                                  Add key moment
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  <Button
                    variant="outline"
                    onClick={() => {
                      const newStage: ManifestoStage = {
                        id: generateId(),
                        name: "",
                        goal: "",
                        goodBehaviors: [],
                        badBehaviors: [],
                        keyMoments: [],
                        order: callManifesto.stages.length + 1,
                      };
                      setCallManifesto({
                        ...callManifesto,
                        stages: [...callManifesto.stages, newStage],
                      });
                      setExpandedStages(new Set([...expandedStages, newStage.id]));
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Stage
                  </Button>
                </div>

                {/* Objections & Rebuttals */}
                <div className="space-y-4 pt-4 border-t border-zinc-200">
                  <h3 className="font-semibold text-zinc-900">Objection Rebuttals</h3>
                  {callManifesto.objections.map((objection, objIndex) => (
                    <div key={objection.id} className="p-3 bg-zinc-50 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <Input
                          value={objection.name}
                          onChange={(e) => {
                            const updated = [...callManifesto.objections];
                            updated[objIndex].name = e.target.value;
                            setCallManifesto({ ...callManifesto, objections: updated });
                          }}
                          placeholder="Objection name (e.g., Spouse/Partner)"
                          className="font-medium"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setCallManifesto({
                              ...callManifesto,
                              objections: callManifesto.objections.filter((o) => o.id !== objection.id),
                            });
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="space-y-1 pl-2">
                        <Label className="text-xs text-zinc-500">Rebuttals</Label>
                        {objection.rebuttals.map((rebuttal, rebuttalIndex) => (
                          <div key={rebuttalIndex} className="flex items-start gap-2">
                            <Textarea
                              value={rebuttal}
                              onChange={(e) => {
                                const updated = [...callManifesto.objections];
                                updated[objIndex].rebuttals[rebuttalIndex] = e.target.value;
                                setCallManifesto({ ...callManifesto, objections: updated });
                              }}
                              className="flex-1 text-sm min-h-[60px]"
                              rows={2}
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const updated = [...callManifesto.objections];
                                updated[objIndex].rebuttals = updated[objIndex].rebuttals.filter(
                                  (_, i) => i !== rebuttalIndex
                                );
                                setCallManifesto({ ...callManifesto, objections: updated });
                              }}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-zinc-600"
                          onClick={() => {
                            const updated = [...callManifesto.objections];
                            updated[objIndex].rebuttals.push("");
                            setCallManifesto({ ...callManifesto, objections: updated });
                          }}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add rebuttal
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    onClick={() => {
                      setCallManifesto({
                        ...callManifesto,
                        objections: [
                          ...callManifesto.objections,
                          { id: generateId(), name: "", rebuttals: [] },
                        ],
                      });
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Objection
                  </Button>
                </div>
              </CardContent>
            )}
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
