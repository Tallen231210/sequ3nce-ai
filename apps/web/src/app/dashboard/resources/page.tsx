"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useTeam } from "@/hooks/useTeam";
import { Header } from "@/components/dashboard/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Plus,
  FileText,
  Link2,
  CreditCard,
  File,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  GripVertical,
  Check,
  Copy,
  ExternalLink,
} from "lucide-react";

type ResourceType = "script" | "payment_link" | "document" | "link";

interface Resource {
  _id: Id<"closerResources">;
  teamId: Id<"teams">;
  type: string;
  title: string;
  description?: string;
  content?: string;
  url?: string;
  order: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

const RESOURCE_TYPE_CONFIG: Record<
  ResourceType,
  { label: string; icon: React.ReactNode; color: string }
> = {
  script: {
    label: "Sales Script",
    icon: <FileText className="h-4 w-4" />,
    color: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  },
  payment_link: {
    label: "Payment Link",
    icon: <CreditCard className="h-4 w-4" />,
    color: "bg-green-500/10 text-green-600 border-green-500/30",
  },
  document: {
    label: "Document",
    icon: <File className="h-4 w-4" />,
    color: "bg-purple-500/10 text-purple-600 border-purple-500/30",
  },
  link: {
    label: "External Link",
    icon: <Link2 className="h-4 w-4" />,
    color: "bg-orange-500/10 text-orange-600 border-orange-500/30",
  },
};

function ResourceCard({
  resource,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  resource: Resource;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const config = RESOURCE_TYPE_CONFIG[resource.type as ResourceType] || RESOURCE_TYPE_CONFIG.link;

  const handleCopyUrl = async () => {
    if (resource.url) {
      await navigator.clipboard.writeText(resource.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Card className={`transition-opacity ${!resource.isActive ? "opacity-50" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Drag handle placeholder */}
          <div className="pt-1 text-zinc-300">
            <GripVertical className="h-5 w-5" />
          </div>

          {/* Icon */}
          <div className={`p-2 rounded-lg ${config.color}`}>{config.icon}</div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium text-foreground truncate">{resource.title}</h3>
              <Badge variant="outline" className={`text-xs ${config.color}`}>
                {config.label}
              </Badge>
              {!resource.isActive && (
                <Badge variant="secondary" className="text-xs">
                  Hidden
                </Badge>
              )}
            </div>

            {resource.description && (
              <p className="text-sm text-zinc-500 mb-2">{resource.description}</p>
            )}

            {resource.url && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-zinc-400 truncate max-w-[300px]">{resource.url}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopyUrl}>
                  {copied ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
                <a href={resource.url} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </a>
              </div>
            )}

            {resource.type === "script" && resource.content && (
              <p className="text-sm text-zinc-500 mt-1 line-clamp-2">{resource.content}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleActive}>
              {resource.isActive ? (
                <EyeOff className="h-4 w-4 text-zinc-400" />
              ) : (
                <Eye className="h-4 w-4 text-zinc-400" />
              )}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
              <Pencil className="h-4 w-4 text-zinc-400" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDelete}>
              <Trash2 className="h-4 w-4 text-red-400" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AddResourceModal({
  open,
  onOpenChange,
  clerkId,
  editResource,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clerkId: string;
  editResource?: Resource;
}) {
  const [type, setType] = useState<ResourceType>(
    (editResource?.type as ResourceType) || "payment_link"
  );
  const [title, setTitle] = useState(editResource?.title || "");
  const [description, setDescription] = useState(editResource?.description || "");
  const [content, setContent] = useState(editResource?.content || "");
  const [url, setUrl] = useState(editResource?.url || "");
  const [isSaving, setIsSaving] = useState(false);

  const addResource = useMutation(api.resources.addResource);
  const updateResource = useMutation(api.resources.updateResource);

  const handleSave = async () => {
    if (!title.trim()) return;

    setIsSaving(true);
    try {
      if (editResource) {
        await updateResource({
          clerkId,
          resourceId: editResource._id,
          title: title.trim(),
          description: description.trim() || undefined,
          content: type === "script" ? content.trim() : undefined,
          url: type !== "script" ? url.trim() : undefined,
        });
      } else {
        await addResource({
          clerkId,
          type,
          title: title.trim(),
          description: description.trim() || undefined,
          content: type === "script" ? content.trim() : undefined,
          url: type !== "script" ? url.trim() : undefined,
        });
      }

      onOpenChange(false);
      // Reset form
      setType("payment_link");
      setTitle("");
      setDescription("");
      setContent("");
      setUrl("");
    } catch (error) {
      console.error("Failed to save resource:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{editResource ? "Edit Resource" : "Add Resource"}</DialogTitle>
          <DialogDescription>
            {editResource
              ? "Update the resource details."
              : "Add a new resource for your closers to access."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Type Selection (only for new resources) */}
          {!editResource && (
            <div>
              <Label className="text-sm font-medium">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as ResourceType)}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="payment_link">Payment Link</SelectItem>
                  <SelectItem value="script">Sales Script</SelectItem>
                  <SelectItem value="document">Document</SelectItem>
                  <SelectItem value="link">External Link</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Title */}
          <div>
            <Label className="text-sm font-medium">
              Title <span className="text-red-500">*</span>
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                type === "payment_link"
                  ? "e.g., Full Pay - $5,000"
                  : type === "script"
                    ? "e.g., Main Sales Script"
                    : "e.g., Pricing Sheet"
              }
              className="mt-2"
            />
          </div>

          {/* Description */}
          <div>
            <Label className="text-sm font-medium">Description (optional)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description for closers"
              className="mt-2"
            />
          </div>

          {/* URL (for non-script types) */}
          {type !== "script" && (
            <div>
              <Label className="text-sm font-medium">URL</Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={
                  type === "payment_link"
                    ? "https://your-payment-link.com/checkout"
                    : "https://..."
                }
                className="mt-2"
              />
            </div>
          )}

          {/* Content (for script type) */}
          {type === "script" && (
            <div>
              <Label className="text-sm font-medium">Script Content</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Paste your sales script here..."
                className="mt-2 min-h-[200px]"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!title.trim() || isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : editResource ? (
              "Save Changes"
            ) : (
              "Add Resource"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteConfirmModal({
  open,
  onOpenChange,
  resource,
  clerkId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource: Resource | null;
  clerkId: string;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteResource = useMutation(api.resources.deleteResource);

  const handleDelete = async () => {
    if (!resource) return;

    setIsDeleting(true);
    try {
      await deleteResource({
        clerkId,
        resourceId: resource._id,
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to delete resource:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Delete Resource</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete "{resource?.title}"? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LoadingState() {
  return (
    <div className="p-6">
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <Card>
      <CardContent className="py-16">
        <div className="flex flex-col items-center justify-center text-center">
          <FileText className="h-12 w-12 text-zinc-400 mb-4" />
          <h3 className="text-lg font-medium mb-2">No resources yet</h3>
          <p className="text-zinc-500 text-sm max-w-sm mb-4">
            Add payment links, sales scripts, and other resources for your closers to access.
          </p>
          <Button onClick={onAdd}>
            <Plus className="h-4 w-4 mr-2" />
            Add Resource
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ResourcesPage() {
  const { clerkId, isLoading: isTeamLoading } = useTeam();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editResource, setEditResource] = useState<Resource | null>(null);
  const [deleteResource, setDeleteResource] = useState<Resource | null>(null);

  const resources = useQuery(
    api.resources.getResources,
    clerkId ? { clerkId } : "skip"
  );

  const updateResourceMutation = useMutation(api.resources.updateResource);

  const handleToggleActive = async (resource: Resource) => {
    if (!clerkId) return;
    try {
      await updateResourceMutation({
        clerkId,
        resourceId: resource._id,
        isActive: !resource.isActive,
      });
    } catch (error) {
      console.error("Failed to toggle resource:", error);
    }
  };

  if (isTeamLoading || resources === undefined) {
    return (
      <>
        <Header
          title="Closer Resources"
          description="Manage resources for your sales team"
        />
        <LoadingState />
      </>
    );
  }

  return (
    <>
      <Header
        title="Closer Resources"
        description="Manage resources for your sales team"
      />

      <div className="p-6">
        {/* Header with Add Button */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-sm text-zinc-500">
              {resources.length} resource{resources.length !== 1 ? "s" : ""} configured
            </p>
          </div>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Resource
          </Button>
        </div>

        {/* Resources List */}
        {resources.length === 0 ? (
          <EmptyState onAdd={() => setShowAddModal(true)} />
        ) : (
          <div className="space-y-3">
            {resources.map((resource) => (
              <ResourceCard
                key={resource._id}
                resource={resource as Resource}
                onEdit={() => setEditResource(resource as Resource)}
                onDelete={() => setDeleteResource(resource as Resource)}
                onToggleActive={() => handleToggleActive(resource as Resource)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <AddResourceModal
        open={showAddModal || !!editResource}
        onOpenChange={(open) => {
          if (!open) {
            setShowAddModal(false);
            setEditResource(null);
          }
        }}
        clerkId={clerkId || ""}
        editResource={editResource || undefined}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        open={!!deleteResource}
        onOpenChange={(open) => !open && setDeleteResource(null)}
        resource={deleteResource}
        clerkId={clerkId || ""}
      />
    </>
  );
}
