import { Header } from "@/components/dashboard/header";
import { Card, CardContent } from "@/components/ui/card";
import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <>
      <Header
        title="Settings"
        description="Manage your account and preferences"
      />
      <div className="p-6">
        <Card>
          <CardContent className="py-16 text-center">
            <Settings className="h-8 w-8 text-muted-foreground mx-auto mb-3" strokeWidth={1.5} />
            <p className="font-medium">Settings</p>
            <p className="text-sm text-muted-foreground mt-1">
              Coming soon — Account settings, billing, and preferences
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
