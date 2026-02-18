import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { ClerkProvider } from "@clerk/nextjs";
import { ConvexClientProvider } from "@/components/providers/ConvexClientProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sequ3nce.ai - Sales Call Intelligence",
  description: "AI-powered sales call intelligence for high-ticket sales teams",
};

// Force dynamic rendering so Next.js doesn't try to prerender pages at build time.
// ClerkProvider requires NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY which is only available
// at runtime in the Vercel environment, not during the build step.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      appearance={{
        elements: {
          // Hide the "Don't have an account? Sign up" footer on sign-in
          footerAction: { display: "none" },
          footerActionLink: { display: "none" },
        },
      }}
    >
      <html lang="en" className={GeistSans.className}>
        <body className="antialiased">
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
