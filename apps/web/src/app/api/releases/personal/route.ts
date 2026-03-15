import { NextResponse } from "next/server";

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

    const response = await fetch(
      "https://api.github.com/repos/Tallen231210/sequ3nce-ai/releases?per_page=100",
      { headers, cache: "no-store" }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch releases" },
        { status: 502 }
      );
    }

    const releases: GithubRelease[] = await response.json();
    const personalRelease = releases.find(
      (r) => r.tag_name.startsWith("personal-v") && !r.tag_name.includes("draft")
    );

    if (!personalRelease) {
      return NextResponse.json(
        { error: "No Personal releases found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      electron: {
        tag_name: personalRelease.tag_name,
        name: personalRelease.name,
        published_at: personalRelease.published_at,
        assets: personalRelease.assets.map((asset) => ({
          name: asset.name,
          browser_download_url: asset.browser_download_url,
          size: asset.size,
        })),
      },
    });
  } catch (error) {
    console.error("Failed to fetch personal releases:", error);
    return NextResponse.json(
      { error: "Failed to fetch releases" },
      { status: 500 }
    );
  }
}
