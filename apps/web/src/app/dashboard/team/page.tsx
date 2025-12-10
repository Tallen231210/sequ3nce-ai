import { Header } from "@/components/dashboard/header";
import { Card, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";

export default function TeamPage() {
  return (
    <>
      <Header
        title="Team"
        description="Manage your closers and team members"
      />
      <div className="p-6">
        <Card>
          <CardContent className="py-16 text-center">
            <Users className="h-8 w-8 text-muted-foreground mx-auto mb-3" strokeWidth={1.5} />
            <p className="font-medium">Team Management</p>
            <p className="text-sm text-muted-foreground mt-1">
              Coming soon — Add and manage your sales team
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
