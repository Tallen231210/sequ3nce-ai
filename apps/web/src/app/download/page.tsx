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

interface ReleasesResponse {
  electron: Release | null;
}

type Platform = "mac" | "windows";

export default function DownloadPage() {
  const [releases, setReleases] = useState<ReleasesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch releases from our API (proxies to GitHub with auth)
    const fetchReleases = async () => {
      try {
        const response = await fetch("/api/releases");
        if (response.ok) {
          const data: ReleasesResponse = await response.json();
          setReleases(data);
        }
      } catch (error) {
        console.error("Failed to fetch releases:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchReleases();
  }, []);

  const getDownloadUrl = (platformType: Platform): string | null => {
    if (!releases?.electron) return null;
    const electronRelease = releases.electron;

    if (platformType === "mac") {
      // Prefer DMG over ZIP for macOS
      const dmgAsset = electronRelease.assets.find((a) =>
        a.name.toLowerCase().endsWith(".dmg")
      );
      const zipAsset = electronRelease.assets.find((a) =>
        a.name.toLowerCase().endsWith(".zip")
      );
      const asset = dmgAsset || zipAsset;
      return asset
        ? `/api/releases/download?asset=${encodeURIComponent(asset.name)}&release=${electronRelease.tag_name}`
        : null;
    }

    if (platformType === "windows") {
      const asset = electronRelease.assets.find((a) => {
        const name = a.name.toLowerCase();
        return name.endsWith(".exe") && !name.includes("nupkg");
      });
      return asset
        ? `/api/releases/download?asset=${encodeURIComponent(asset.name)}&release=${electronRelease.tag_name}`
        : null;
    }

    return null;
  };

  const formatSize = (bytes: number): string => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const getAssetSize = (platformType: Platform): string => {
    if (!releases?.electron) return "";
    const electronRelease = releases.electron;

    if (platformType === "mac") {
      const dmgAsset = electronRelease.assets.find((a) =>
        a.name.toLowerCase().endsWith(".dmg")
      );
      const zipAsset = electronRelease.assets.find((a) =>
        a.name.toLowerCase().endsWith(".zip")
      );
      const asset = dmgAsset || zipAsset;
      return asset ? formatSize(asset.size) : "";
    }

    if (platformType === "windows") {
      const asset = electronRelease.assets.find((a) => {
        const name = a.name.toLowerCase();
        return name.endsWith(".exe") && !name.includes("nupkg");
      });
      return asset ? formatSize(asset.size) : "";
    }

    return "";
  };

  // Get version string — both platforms use the same Electron release
  const getVersion = (): string => {
    if (!releases?.electron) return "";
    return releases.electron.tag_name.replace("desktop-v", "").replace(/^v/, "");
  };

  const platformInfo = {
    mac: {
      name: "macOS",
      icon: (
        <svg className="w-16 h-16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
        </svg>
      ),
      extension: ".dmg",
      instructions: "Open the DMG and drag Sequ3nce to Applications.",
      requirement: "Requires macOS 10.15 (Catalina) or later",
    },
    windows: {
      name: "Windows",
      icon: (
        <svg className="w-16 h-16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 12V6.75l6-1.32v6.48L3 12m17-9v8.75l-10 .15V5.21L20 3M3 13l6 .09v6.81l-6-1.15V13m17 .25V22l-10-1.91V13.1l10 .15z" />
        </svg>
      ),
      extension: ".exe",
      instructions: "Download and run the installer. Follow the on-screen instructions.",
      requirement: "Requires Windows 10 or later (64-bit)",
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
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Download Sequ3nce for Desktop
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Get real-time ammo during your sales calls. Add a meeting bot to any
            call and get instant insights to help you close more deals.
          </p>
        </div>

        {/* Platform Selection */}
        <div className="mb-16">
          <p className="text-center text-gray-600 mb-8">
            Select your operating system to download:
          </p>
          <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
            {(["mac", "windows"] as const).map((p) => (
              <div
                key={p}
                className="border-2 border-gray-200 rounded-2xl p-8 text-center hover:border-gray-400 transition-colors bg-gray-50"
              >
                <div className="flex justify-center mb-4 text-gray-700">
                  {platformInfo[p].icon}
                </div>
                <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                  {platformInfo[p].name}
                </h2>
                {releases && (
                  <p className="text-gray-500 mb-4">
                    Version {getVersion()}
                    {getAssetSize(p) && ` • ${getAssetSize(p)}`}
                  </p>
                )}

                {loading ? (
                  <div className="w-8 h-8 border-2 border-gray-300 border-t-black rounded-full animate-spin mx-auto mb-4" />
                ) : getDownloadUrl(p) ? (
                  <a
                    href={getDownloadUrl(p)!}
                    className="inline-block bg-black text-white font-medium px-8 py-3 rounded-lg hover:bg-gray-800 transition-colors mb-4"
                  >
                    Download{platformInfo[p].extension ? ` ${platformInfo[p].extension}` : ""}
                  </a>
                ) : (
                  <button
                    disabled
                    className="inline-block bg-gray-300 text-gray-500 font-medium px-8 py-3 rounded-lg cursor-not-allowed mb-4"
                  >
                    Coming Soon
                  </button>
                )}

                <p className="text-sm text-gray-500">
                  {platformInfo[p].requirement}
                </p>
              </div>
            ))}
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
                Add your meeting bot to any Zoom, Google Meet, or Teams call
              </span>
            </li>
            <li className="flex items-start">
              <span className="w-6 h-6 rounded-full bg-white text-black text-sm font-medium flex items-center justify-center mr-3 flex-shrink-0 mt-0.5">
                4
              </span>
              <span>
                Get real-time ammo and AI analysis as your call progresses
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
