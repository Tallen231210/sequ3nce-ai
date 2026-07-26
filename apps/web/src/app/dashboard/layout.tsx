import { Sidebar } from "@/components/dashboard/sidebar";
import { SubscriptionGate } from "@/components/dashboard/subscription-gate";
import { ChatContainer } from "@/components/chat";
import { ReinforcementAlert } from "@/components/dashboard/reinforcement-alert";
import { OnboardingBanner } from "@/components/dashboard/onboarding-banner";
import { TimezoneAdopter } from "@/components/dashboard/timezone-adopter";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SubscriptionGate>
      <div className="min-h-screen bg-background">
        <TimezoneAdopter />
        <Sidebar />
        <ReinforcementAlert />
        <OnboardingBanner />
        <main className="pl-64">{children}</main>
        <ChatContainer />
      </div>
    </SubscriptionGate>
  );
}
