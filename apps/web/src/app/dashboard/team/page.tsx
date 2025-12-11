"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Header } from "@/components/dashboard/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Users, MoreHorizontal, UserPlus, Loader2 } from "lucide-react";
import { useTeam } from "@/hooks/useTeam";
import { Id } from "../../../../convex/_generated/dataModel";

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getStatusBadge(status: string) {
  switch (status) {
    case "active":
      return <Badge variant="default">Active</Badge>;
    case "pending":
      return <Badge variant="outline">Pending</Badge>;
    case "deactivated":
      return <Badge variant="secondary">Deactivated</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export default function TeamPage() {
  const { user } = useUser();
  const { team, isLoading: isTeamLoading, clerkId } = useTeam();

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Delete confirmation state
  const [closerToDelete, setCloserToDelete] = useState<{
    id: Id<"closers">;
    name: string;
  } | null>(null);

  // Convex queries and mutations
  const closers = useQuery(
    api.closers.getClosers,
    clerkId ? { clerkId } : "skip"
  );
  const closerCounts = useQuery(
    api.closers.getCloserCounts,
    clerkId ? { clerkId } : "skip"
  );

  const billing = useQuery(
    api.billing.getTeamBilling,
    clerkId ? { clerkId } : "skip"
  );

  const addCloser = useMutation(api.closers.addCloser);
  const removeCloser = useMutation(api.closers.removeCloser);
  const updateCloserStatus = useMutation(api.closers.updateCloserStatus);

  // Helper to update Stripe seats
  const updateStripeSeats = async (newSeatCount: number) => {
    // Only update if user has an active subscription
    if (!billing?.stripeSubscriptionId) return;

    try {
      await fetch("/api/stripe/update-seats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seatCount: newSeatCount }),
      });
    } catch (err) {
      console.error("Failed to update Stripe seats:", err);
    }
  };

  // Email validation
  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  // Handle form submit
  const handleAddCloser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    if (!isValidEmail(email)) {
      setError("Please enter a valid email address");
      return;
    }

    if (!clerkId) {
      setError("You must be signed in");
      return;
    }

    setIsSubmitting(true);

    try {
      await addCloser({
        clerkId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
      });

      // Update Stripe seats (current active/pending count + 1 for the new closer)
      const currentActiveCount = closerCounts?.active || 0;
      const currentPendingCount = closerCounts?.pending || 0;
      await updateStripeSeats(currentActiveCount + currentPendingCount + 1);

      setName("");
      setEmail("");
      setSuccess(`${name} has been added to your team`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add closer");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle remove closer
  const handleRemoveCloser = async () => {
    if (!closerToDelete || !clerkId) return;

    try {
      // Check if the closer being removed was active/pending (billable)
      const closerBeingRemoved = closers?.find(
        (c) => c._id === closerToDelete.id
      );
      const wasBillable =
        closerBeingRemoved?.status === "active" ||
        closerBeingRemoved?.status === "pending";

      await removeCloser({
        clerkId,
        closerId: closerToDelete.id,
      });

      // Update Stripe seats if the closer was billable
      if (wasBillable) {
        const currentActiveCount = closerCounts?.active || 0;
        const currentPendingCount = closerCounts?.pending || 0;
        const newCount = currentActiveCount + currentPendingCount - 1;
        await updateStripeSeats(Math.max(0, newCount));
      }

      setCloserToDelete(null);
    } catch (err) {
      console.error("Failed to remove closer:", err);
    }
  };

  // Handle status change
  const handleStatusChange = async (
    closerId: Id<"closers">,
    newStatus: "active" | "pending" | "deactivated"
  ) => {
    if (!clerkId) return;

    try {
      // Get the closer's current status
      const closer = closers?.find((c) => c._id === closerId);
      const oldStatus = closer?.status;

      await updateCloserStatus({
        clerkId,
        closerId,
        status: newStatus,
      });

      // Update Stripe seats if billable status changed
      const wasActiveBefore =
        oldStatus === "active" || oldStatus === "pending";
      const isActiveNow = newStatus === "active" || newStatus === "pending";

      if (wasActiveBefore !== isActiveNow) {
        const currentActiveCount = closerCounts?.active || 0;
        const currentPendingCount = closerCounts?.pending || 0;
        let newCount = currentActiveCount + currentPendingCount;

        if (wasActiveBefore && !isActiveNow) {
          // Deactivating: subtract 1
          newCount = Math.max(0, newCount - 1);
        } else if (!wasActiveBefore && isActiveNow) {
          // Reactivating: add 1
          newCount = newCount + 1;
        }

        await updateStripeSeats(newCount);
      }
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  // Loading state
  if (isTeamLoading || closers === undefined) {
    return (
      <>
        <Header title="Team" description="Manage your closers and team members" />
        <div className="p-6 flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Team" description="Manage your closers and team members" />
      <div className="p-6 space-y-6">
        {/* Team Overview */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">
              {team?.name || "Your Team"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6 text-sm">
              <div>
                <span className="text-muted-foreground">Total Closers:</span>{" "}
                <span className="font-medium">{closerCounts?.total || 0}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Active:</span>{" "}
                <span className="font-medium">{closerCounts?.active || 0}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Pending:</span>{" "}
                <span className="font-medium">{closerCounts?.pending || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Add Closer Form */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <UserPlus className="h-4 w-4" strokeWidth={1.5} />
              Add Closer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddCloser} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    placeholder="John Smith"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="john@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}

              {success && (
                <p className="text-sm text-green-600">{success}</p>
              )}

              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  "Add Closer"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Closers List */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="h-4 w-4" strokeWidth={1.5} />
              Closers
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {closers.length === 0 ? (
              <div className="py-16 text-center">
                <Users className="h-8 w-8 text-muted-foreground mx-auto mb-3" strokeWidth={1.5} />
                <p className="text-muted-foreground">No closers yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Add your first closer using the form above
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closers.map((closer) => (
                    <TableRow key={closer._id}>
                      <TableCell className="font-medium">{closer.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {closer.email}
                      </TableCell>
                      <TableCell>{getStatusBadge(closer.status)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(closer.invitedAt)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {closer.status !== "active" && (
                              <DropdownMenuItem
                                onClick={() =>
                                  handleStatusChange(closer._id, "active")
                                }
                              >
                                Mark as Active
                              </DropdownMenuItem>
                            )}
                            {closer.status !== "deactivated" && (
                              <DropdownMenuItem
                                onClick={() =>
                                  handleStatusChange(closer._id, "deactivated")
                                }
                              >
                                Deactivate
                              </DropdownMenuItem>
                            )}
                            {closer.status === "deactivated" && (
                              <DropdownMenuItem
                                onClick={() =>
                                  handleStatusChange(closer._id, "pending")
                                }
                              >
                                Reactivate
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600 focus:text-red-600"
                              onClick={() =>
                                setCloserToDelete({
                                  id: closer._id,
                                  name: closer.name,
                                })
                              }
                            >
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!closerToDelete}
        onOpenChange={() => setCloserToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Closer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {closerToDelete?.name} from your
              team? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveCloser}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
