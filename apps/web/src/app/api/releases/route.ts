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

    // Fetch Electron desktop releases from sequ3nce-ai repo
    // (Both macOS and Windows are now served from the Electron app)
    const electronResponse = await fetch(
      "https://api.github.com/repos/Tallen231210/sequ3nce-ai/releases?per_page=100",
      { headers, cache: "no-store" }
    );

    let electronRelease: GithubRelease | undefined;
    if (electronResponse.ok) {
      const electronReleases: GithubRelease[] = await electronResponse.json();
      electronRelease = electronReleases.find((r) =>
        (r.tag_name.startsWith("desktop-v") ||
          (r.tag_name.startsWith("v") && !r.tag_name.startsWith("macos-v"))) &&
        r.assets.some((a) => a.name.toLowerCase().endsWith(".exe"))
      );
    }

    if (!electronRelease) {
      return NextResponse.json(
        { error: "No releases found" },
        { status: 404 }
      );
    }

    const formatted = formatRelease(electronRelease);
    return NextResponse.json({
      swift: null,
      electron: formatted,
      tag_name: formatted.tag_name,
      name: formatted.name,
      published_at: formatted.published_at,
      assets: formatted.assets,
    });
  } catch (error) {
    console.error("Failed to fetch releases:", error);
    return NextResponse.json(
      { error: "Failed to fetch releases" },
      { status: 500 }
    );
  }
}
