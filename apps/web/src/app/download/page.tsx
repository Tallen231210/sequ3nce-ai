"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/ui/logo";

interface Release {
  tag_name: string;
  name: string;
  published_at: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
    size: number;
  }>;
}

type Platform = "mac" | "windows" | "linux" | null;

export default function DownloadPage() {
  const [platform, setPlatform] = useState<Platform>(null);
  const [release, setRelease] = useState<Release | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Detect platform
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes("mac")) {
      setPlatform("mac");
    } else if (userAgent.includes("win")) {
      setPlatform("windows");
    } else if (userAgent.includes("linux")) {
      setPlatform("linux");
    }

    // Fetch latest release from our API (proxies to GitHub with auth)
    const fetchRelease = async () => {
      try {
        const response = await fetch("/api/releases");
        if (response.ok) {
          const data = await response.json();
          setRelease(data);
        }
      } catch (error) {
        console.error("Failed to fetch release:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchRelease();
  }, []);

  const getDownloadUrl = (platformType: Platform): string | null => {
    if (!release?.assets) return null;

    const asset = release.assets.find((a) => {
      const name = a.name.toLowerCase();
      switch (platformType) {
        case "mac":
          return name.endsWith(".dmg");
        case "windows":
          return name.endsWith(".exe") && !name.includes("nupkg");
        case "linux":
          return name.endsWith(".deb");
        default:
          return false;
      }
    });

    return asset?.browser_download_url || null;
  };

  const formatSize = (bytes: number): string => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const getAssetSize = (platformType: Platform): string => {
    if (!release?.assets) return "";

    const asset = release.assets.find((a) => {
      const name = a.name.toLowerCase();
      switch (platformType) {
        case "mac":
          return name.endsWith(".dmg");
        case "windows":
          return name.endsWith(".exe") && !name.includes("nupkg");
        case "linux":
          return name.endsWith(".deb");
        default:
          return false;
      }
    });

    return asset ? formatSize(asset.size) : "";
  };

  const platformInfo = {
    mac: {
      name: "macOS",
      icon: (
        <svg className="w-12 h-12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
        </svg>
      ),
      extension: ".dmg",
      instructions: "Open the DMG, drag Sequ3nce to Applications, and launch.",
    },
    windows: {
      name: "Windows",
      icon: (
        <svg className="w-12 h-12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 12V6.75l6-1.32v6.48L3 12m17-9v8.75l-10 .15V5.21L20 3M3 13l6 .09v6.81l-6-1.15V13m17 .25V22l-10-1.91V13.1l10 .15z" />
        </svg>
      ),
      extension: ".exe",
      instructions: "Download and run the installer. Follow the on-screen instructions.",
    },
    linux: {
      name: "Linux",
      icon: (
        <svg className="w-12 h-12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.5 3.33c-1.25 0-2.24 1.12-2.24 2.5 0 1.37.99 2.5 2.24 2.5s2.24-1.12 2.24-2.5c0-1.37-.99-2.5-2.24-2.5m-5.63 9.55c-.55.94-1.37 1.85-1.85 2.78-.48.94-.42 2.19.21 2.98.62.79 1.88 1.04 2.88.74 1.01-.3 1.84-.99 2.68-1.66.85-.68 1.76-1.34 2.82-1.62a4.97 4.97 0 0 1 2.61.04c.5.14 1.06.39 1.33.85.27.46.16 1.08-.17 1.54-.32.46-.85.77-1.39 1.06-.53.3-1.09.58-1.47 1.07-.39.49-.57 1.26-.18 1.76.38.5 1.14.57 1.75.45.61-.12 1.16-.4 1.73-.65.57-.25 1.16-.5 1.78-.48.62.03 1.28.38 1.52.96.23.58.04 1.26-.34 1.78s-.93.89-1.49 1.23c-1.11.69-2.32 1.26-3.59 1.55s-2.58.31-3.81-.13c-1.23-.43-2.33-1.24-3.13-2.27-.8-1.03-1.3-2.27-1.5-3.55-.2-1.27-.1-2.59.29-3.82.39-1.23 1.05-2.37 1.91-3.33" />
        </svg>
      ),
      extension: ".deb",
      instructions: "Download the .deb file and install using your package manager.",
    },
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <Logo href="/" height={28} />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-16">
        {/* Hero */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Download Sequ3nce for Desktop
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Get real-time ammo during your sales calls. The desktop app captures
            audio and delivers instant insights to help you close more deals.
          </p>
        </div>

        {/* Primary Download */}
        {platform && (
          <div className="bg-gray-50 rounded-2xl p-8 mb-12 text-center">
            <div className="flex justify-center mb-4 text-gray-700">
              {platformInfo[platform].icon}
            </div>
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              Sequ3nce for {platformInfo[platform].name}
            </h2>
            {release && (
              <p className="text-gray-500 mb-6">
                Version {release.tag_name.replace("desktop-v", "")}
                {getAssetSize(platform) && ` • ${getAssetSize(platform)}`}
              </p>
            )}

            {loading ? (
              <div className="w-8 h-8 border-2 border-gray-300 border-t-black rounded-full animate-spin mx-auto" />
            ) : getDownloadUrl(platform) ? (
              <a
                href={getDownloadUrl(platform)!}
                className="inline-block bg-black text-white font-medium px-8 py-3 rounded-lg hover:bg-gray-800 transition-colors"
              >
                Download for {platformInfo[platform].name}
              </a>
            ) : (
              <div>
                <button
                  disabled
                  className="inline-block bg-gray-300 text-gray-500 font-medium px-8 py-3 rounded-lg cursor-not-allowed mb-4"
                >
                  Download for {platformInfo[platform].name}
                </button>
                <p className="text-gray-500 text-sm">
                  First release coming soon! Your team manager will notify you when it&apos;s available.
                </p>
              </div>
            )}
            <p className="text-sm text-gray-500 mt-4">
              {platformInfo[platform].instructions}
            </p>
          </div>
        )}

        {/* All Platforms */}
        <div className="mb-16">
          <h3 className="text-lg font-semibold text-gray-900 mb-6 text-center">
            All Platforms
          </h3>
          <div className="grid md:grid-cols-3 gap-4">
            {(["mac", "windows", "linux"] as const).map((p) => (
              <div
                key={p}
                className={`border rounded-xl p-6 text-center transition-colors ${
                  platform === p
                    ? "border-black bg-gray-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex justify-center mb-3 text-gray-600">
                  {platformInfo[p].icon}
                </div>
                <h4 className="font-medium text-gray-900 mb-1">
                  {platformInfo[p].name}
                </h4>
                <p className="text-sm text-gray-500 mb-4">
                  {platformInfo[p].extension}
                  {getAssetSize(p) && ` • ${getAssetSize(p)}`}
                </p>
                {getDownloadUrl(p) ? (
                  <a
                    href={getDownloadUrl(p)!}
                    className="text-sm font-medium text-black hover:underline"
                  >
                    Download
                  </a>
                ) : (
                  <span className="text-sm text-gray-400">Coming soon</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Requirements */}
        <div className="border-t border-gray-200 pt-12">
          <h3 className="text-lg font-semibold text-gray-900 mb-6 text-center">
            System Requirements
          </h3>
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div>
              <h4 className="font-medium text-gray-900 mb-2">macOS</h4>
              <p className="text-sm text-gray-600">
                macOS 10.15 (Catalina) or later
                <br />
                Apple Silicon or Intel
              </p>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Windows</h4>
              <p className="text-sm text-gray-600">
                Windows 10 or later
                <br />
                64-bit required
              </p>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Linux</h4>
              <p className="text-sm text-gray-600">
                Ubuntu 18.04+ or equivalent
                <br />
                Debian-based or RPM-based
              </p>
            </div>
          </div>
        </div>

        {/* Getting Started */}
        <div className="mt-16 bg-gray-900 rounded-2xl p-8 text-white">
          <h3 className="text-xl font-semibold mb-4">Getting Started</h3>
          <ol className="space-y-3 text-gray-300">
            <li className="flex items-start">
              <span className="w-6 h-6 rounded-full bg-white text-black text-sm font-medium flex items-center justify-center mr-3 flex-shrink-0 mt-0.5">
                1
              </span>
              <span>
                Download and install the app for your platform
              </span>
            </li>
            <li className="flex items-start">
              <span className="w-6 h-6 rounded-full bg-white text-black text-sm font-medium flex items-center justify-center mr-3 flex-shrink-0 mt-0.5">
                2
              </span>
              <span>
                Sign in with the email your team manager used to invite you
              </span>
            </li>
            <li className="flex items-start">
              <span className="w-6 h-6 rounded-full bg-white text-black text-sm font-medium flex items-center justify-center mr-3 flex-shrink-0 mt-0.5">
                3
              </span>
              <span>
                Grant microphone/screen recording permission when prompted
              </span>
            </li>
            <li className="flex items-start">
              <span className="w-6 h-6 rounded-full bg-white text-black text-sm font-medium flex items-center justify-center mr-3 flex-shrink-0 mt-0.5">
                4
              </span>
              <span>
                Start your call, click record, and watch the ammo appear
              </span>
            </li>
          </ol>
        </div>

        {/* Help */}
        <div className="mt-12 text-center text-gray-500">
          <p>
            Need help?{" "}
            <a
              href="mailto:support@sequ3nce.ai"
              className="text-black hover:underline"
            >
              Contact support
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
