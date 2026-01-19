import { Sidebar } from "@/components/dashboard/sidebar";
import { SubscriptionGate } from "@/components/dashboard/subscription-gate";
import { ChatContainer } from "@/components/chat";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SubscriptionGate>
      <div className="min-h-screen bg-background">
        <Sidebar />
        <main className="pl-64">{children}</main>
        <ChatContainer />
      </div>
    </SubscriptionGate>
  );
}
