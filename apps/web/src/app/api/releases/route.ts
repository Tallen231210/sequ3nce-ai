import { NextResponse } from "next/server";

export async function GET() {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    return NextResponse.json(
      { error: "GitHub token not configured" },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      "https://api.github.com/repos/Tallen231210/sequ3nce-ai/releases/latest",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
        // Cache for 5 minutes
        next: { revalidate: 300 },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: "No releases found" },
          { status: 404 }
        );
      }
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const release = await response.json();

    // Only return the fields we need (don't expose everything)
    return NextResponse.json({
      tag_name: release.tag_name,
      name: release.name,
      published_at: release.published_at,
      assets: release.assets.map((asset: any) => ({
        name: asset.name,
        browser_download_url: asset.browser_download_url,
        size: asset.size,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch release:", error);
    return NextResponse.json(
      { error: "Failed to fetch release" },
      { status: 500 }
    );
  }
}
