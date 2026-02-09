import { NextResponse } from "next/server";

// Disable static caching - always fetch fresh
export const dynamic = "force-dynamic";

interface GithubRelease {
  tag_name: string;
  name: string;
  published_at: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
    size: number;
  }>;
}

interface FormattedRelease {
  tag_name: string;
  name: string;
  published_at: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
    size: number;
  }>;
}

function formatRelease(release: GithubRelease): FormattedRelease {
  return {
    tag_name: release.tag_name,
    name: release.name,
    published_at: release.published_at,
    assets: release.assets.map((asset) => ({
      name: asset.name,
      browser_download_url: asset.browser_download_url,
      size: asset.size,
    })),
  };
}

export async function GET() {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    return NextResponse.json(
      { error: "GitHub token not configured" },
      { status: 500 }
    );
  }

  try {
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
    };

    // Fetch from both repos in parallel:
    // - sequ3nce-releases: public repo for Swift macOS releases (macos-v*)
    // - sequ3nce-ai: private repo for Electron/Windows releases (desktop-v*)
    const [swiftResponse, electronResponse] = await Promise.all([
      fetch(
        "https://api.github.com/repos/Tallen231210/sequ3nce-releases/releases",
        { headers, cache: "no-store" }
      ),
      fetch(
        "https://api.github.com/repos/Tallen231210/sequ3nce-ai/releases?per_page=100",
        { headers, cache: "no-store" }
      ),
    ]);

    // Find latest Swift macOS release from sequ3nce-releases repo
    let swiftRelease: GithubRelease | undefined;
    if (swiftResponse.ok) {
      const swiftReleases: GithubRelease[] = await swiftResponse.json();
      swiftRelease = swiftReleases.find((r) => r.tag_name.startsWith("macos-v"));
    }

    // Find latest Electron desktop release from sequ3nce-ai repo
    let electronRelease: GithubRelease | undefined;
    if (electronResponse.ok) {
      const electronReleases: GithubRelease[] = await electronResponse.json();
      electronRelease = electronReleases.find((r) =>
        (r.tag_name.startsWith("desktop-v") ||
          (r.tag_name.startsWith("v") && !r.tag_name.startsWith("macos-v"))) &&
        r.assets.some((a) => a.name.toLowerCase().endsWith(".exe"))
      );
    }

    if (!swiftRelease && !electronRelease) {
      return NextResponse.json(
        { error: "No releases found" },
        { status: 404 }
      );
    }

    // Return both releases with clear labels
    // Also include backwards-compatible top-level fields (from electron release)
    const result: {
      swift: FormattedRelease | null;
      electron: FormattedRelease | null;
      tag_name?: string;
      name?: string;
      published_at?: string;
      assets?: Array<{ name: string; browser_download_url: string; size: number }>;
    } = {
      swift: swiftRelease ? formatRelease(swiftRelease) : null,
      electron: electronRelease ? formatRelease(electronRelease) : null,
    };

    // For backwards compatibility, also include electron release at top level
    if (electronRelease) {
      const formatted = formatRelease(electronRelease);
      result.tag_name = formatted.tag_name;
      result.name = formatted.name;
      result.published_at = formatted.published_at;
      result.assets = formatted.assets;
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch releases:", error);
    return NextResponse.json(
      { error: "Failed to fetch releases" },
      { status: 500 }
    );
  }
}
