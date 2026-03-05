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

  // Validate asset name to prevent path traversal and ensure it's a valid release file
  if (
    asset.includes("/") ||
    asset.includes("..") ||
    asset.includes("\\") ||
    asset.length > 100 ||
    !/^[\w\-\.]+\.(dmg|zip|exe|deb|rpm|yml)$/.test(asset)
  ) {
    return NextResponse.json(
      { error: "Invalid asset name" },
      { status: 400 }
    );
  }

  try {
    // Get optional release tag from query params (e.g., "macos-v1.0.0" or "desktop-v1.2.27")
    const releaseTag = searchParams.get("release");

    // Swift macOS releases live in sequ3nce-releases repo, Electron in sequ3nce-ai
    const repo = releaseTag?.startsWith("macos-v")
      ? "Tallen231210/sequ3nce-releases"
      : "Tallen231210/sequ3nce-ai";

    // Fetch specific release by tag, or latest if not specified
    const releaseUrl = releaseTag
      ? `https://api.github.com/repos/${repo}/releases/tags/${releaseTag}`
      : `https://api.github.com/repos/${repo}/releases/latest`;

    const releaseResponse = await fetch(releaseUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
      cache: "no-store",
    });

    if (!releaseResponse.ok) {
      if (releaseResponse.status === 404) {
        return NextResponse.json(
          { error: releaseTag ? `Release ${releaseTag} not found` : "No releases found" },
          { status: 404 }
        );
      }
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

    // Request the asset with octet-stream accept header.
    // GitHub responds with a 302 redirect to a signed, time-limited URL
    // that doesn't require auth. We redirect the user there directly
    // instead of proxying the file through Vercel (which has body size limits).
    const downloadResponse = await fetch(matchingAsset.url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/octet-stream",
      },
      redirect: "manual",
    });

    // GitHub returns 302 with a signed S3 URL in the Location header
    if (downloadResponse.status === 302 || downloadResponse.status === 301) {
      const redirectUrl = downloadResponse.headers.get("Location");
      if (redirectUrl) {
        return NextResponse.redirect(redirectUrl);
      }
    }

    // Fallback: if no redirect, try streaming (works for small files)
    if (downloadResponse.ok) {
      const safeFilename = encodeURIComponent(matchingAsset.name).replace(/'/g, "%27");
      const responseHeaders = new Headers();
      responseHeaders.set("Content-Type", "application/octet-stream");
      responseHeaders.set(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${safeFilename}`
      );
      responseHeaders.set("Content-Length", matchingAsset.size.toString());

      return new NextResponse(downloadResponse.body, {
        status: 200,
        headers: responseHeaders,
      });
    }

    throw new Error(`Download failed: ${downloadResponse.status}`);
  } catch (error) {
    console.error("Failed to download asset:", error);
    return NextResponse.json(
      { error: "Failed to download asset" },
      { status: 500 }
    );
  }
}
