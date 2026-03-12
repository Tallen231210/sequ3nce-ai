"use client";

import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, X } from "lucide-react";

const INDUSTRIES = [
  "Solar", "Insurance", "Real Estate", "SaaS", "Coaching",
  "Agency", "Info Products", "E-Commerce", "Financial Services", "Other",
];

const TICKET_RANGES = [
  "Under $1k", "$1k-$3k", "$3k-$10k", "$10k-$25k", "$25k-$50k", "$50k+",
];

interface JobPostingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: Id<"teams">;
  clerkId: string;
  editPosting?: any;
}

export function JobPostingDialog({
  open,
  onOpenChange,
  teamId,
  clerkId,
  editPosting,
}: JobPostingDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [industry, setIndustry] = useState("");
  const [ticketRange, setTicketRange] = useState("");
  const [ote, setOte] = useState("");
  const [skillInput, setSkillInput] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [contactEmail, setContactEmail] = useState("");
  const [contactUrl, setContactUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const createPosting = useMutation(api.b2cJobBoard.createJobPosting);
  const updatePosting = useMutation(api.b2cJobBoard.updateJobPosting);

  // Pre-fill for edit mode
  useEffect(() => {
    if (editPosting) {
      setTitle(editPosting.title || "");
      setDescription(editPosting.description || "");
      setIndustry(editPosting.industry || "");
      setTicketRange(editPosting.ticketRange || "");
      setOte(editPosting.ote || "");
      setSkills(editPosting.requiredSkills || []);
      setContactEmail(editPosting.contactEmail || "");
      setContactUrl(editPosting.contactUrl || "");
    } else {
      setTitle("");
      setDescription("");
      setIndustry("");
      setTicketRange("");
      setOte("");
      setSkills([]);
      setSkillInput("");
      setContactEmail("");
      setContactUrl("");
    }
  }, [editPosting, open]);

  const handleAddSkill = () => {
    const trimmed = skillInput.trim();
    if (trimmed && !skills.includes(trimmed) && skills.length < 20) {
      setSkills([...skills, trimmed]);
      setSkillInput("");
    }
  };

  const handleRemoveSkill = (skill: string) => {
    setSkills(skills.filter((s) => s !== skill));
  };

  const handleSave = async () => {
    if (!title.trim() || !description.trim()) return;

    setIsSaving(true);
    try {
      if (editPosting) {
        await updatePosting({
          postingId: editPosting._id,
          teamId,
          title: title.trim(),
          description: description.trim(),
          industry: industry || undefined,
          ticketRange: ticketRange || undefined,
          ote: ote.trim() || undefined,
          requiredSkills: skills.length > 0 ? skills : undefined,
          contactEmail: contactEmail.trim() || undefined,
          contactUrl: contactUrl.trim() || undefined,
        });
      } else {
        await createPosting({
          teamId,
          createdBy: clerkId,
          title: title.trim(),
          description: description.trim(),
          industry: industry || undefined,
          ticketRange: ticketRange || undefined,
          ote: ote.trim() || undefined,
          requiredSkills: skills.length > 0 ? skills : undefined,
          contactEmail: contactEmail.trim() || undefined,
          contactUrl: contactUrl.trim() || undefined,
        });
      }
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save posting:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editPosting ? "Edit Job Posting" : "Post a Job"}
          </DialogTitle>
          <DialogDescription>
            {editPosting
              ? "Update your job posting details."
              : "Create a new job posting to attract closers."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium">
              Title <span className="text-red-500">*</span>
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Senior High-Ticket Closer"
              className="mt-1.5"
              maxLength={200}
            />
          </div>

          <div>
            <Label className="text-sm font-medium">
              Description <span className="text-red-500">*</span>
            </Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the role, responsibilities, and ideal candidate..."
              className="mt-1.5 min-h-[120px]"
              maxLength={5000}
            />
            <p className="text-xs text-zinc-400 mt-1">
              {description.length}/5000
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Industry</Label>
              <Select value={industry} onValueChange={setIndustry}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map((ind) => (
                    <SelectItem key={ind} value={ind}>
                      {ind}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-medium">Ticket Range</Label>
              <Select value={ticketRange} onValueChange={setTicketRange}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select range" />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_RANGES.map((range) => (
                    <SelectItem key={range} value={range}>
                      {range}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium">OTE (On-Target Earnings)</Label>
            <Input
              value={ote}
              onChange={(e) => setOte(e.target.value)}
              placeholder="e.g., $150k-$250k OTE"
              className="mt-1.5"
              maxLength={100}
            />
          </div>

          <div>
            <Label className="text-sm font-medium">Required Skills</Label>
            <div className="flex gap-2 mt-1.5">
              <Input
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                placeholder="Add a skill..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddSkill();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddSkill}
                disabled={!skillInput.trim()}
              >
                Add
              </Button>
            </div>
            {skills.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {skills.map((skill) => (
                  <Badge
                    key={skill}
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() => handleRemoveSkill(skill)}
                  >
                    {skill}
                    <X className="h-3 w-3 ml-1" />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Contact Email</Label>
              <Input
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="hiring@company.com"
                className="mt-1.5"
                type="email"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Contact URL</Label>
              <Input
                value={contactUrl}
                onChange={(e) => setContactUrl(e.target.value)}
                placeholder="https://calendly.com/..."
                className="mt-1.5"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!title.trim() || !description.trim() || isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : editPosting ? (
              "Save Changes"
            ) : (
              "Post Job"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
