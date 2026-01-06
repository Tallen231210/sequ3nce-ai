import { NextRequest, NextResponse } from "next/server";

// Disable static caching
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    return NextResponse.json(
      { error: "GitHub token not configured" },
      { status: 500 }
    );
  }

  // Get the asset name from query params
  const searchParams = request.nextUrl.searchParams;
  const asset = searchParams.get("asset");

  if (!asset) {
    return NextResponse.json(
      { error: "Asset parameter required" },
      { status: 400 }
    );
  }

  // Validate asset name to prevent path traversal
  if (asset.includes("/") || asset.includes("..")) {
    return NextResponse.json(
      { error: "Invalid asset name" },
      { status: 400 }
    );
  }

  try {
    // First, get the latest release to find the asset ID
    const releaseResponse = await fetch(
      "https://api.github.com/repos/Tallen231210/sequ3nce-ai/releases/latest",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
        cache: "no-store",
      }
    );

    if (!releaseResponse.ok) {
      throw new Error(`GitHub API error: ${releaseResponse.status}`);
    }

    const release = await releaseResponse.json();

    // Find the matching asset
    const matchingAsset = release.assets.find(
      (a: any) => a.name === asset
    );

    if (!matchingAsset) {
      return NextResponse.json(
        { error: "Asset not found in latest release" },
        { status: 404 }
      );
    }

    // Download the asset using the GitHub API (with auth)
    // Use the asset's url (not browser_download_url) with octet-stream accept header
    const downloadResponse = await fetch(matchingAsset.url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/octet-stream",
      },
    });

    if (!downloadResponse.ok) {
      throw new Error(`Download failed: ${downloadResponse.status}`);
    }

    // Stream the response back to the user
    const headers = new Headers();
    headers.set("Content-Type", "application/octet-stream");
    headers.set(
      "Content-Disposition",
      `attachment; filename="${matchingAsset.name}"`
    );
    headers.set("Content-Length", matchingAsset.size.toString());

    return new NextResponse(downloadResponse.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("Failed to download asset:", error);
    return NextResponse.json(
      { error: "Failed to download asset" },
      { status: 500 }
    );
  }
}
