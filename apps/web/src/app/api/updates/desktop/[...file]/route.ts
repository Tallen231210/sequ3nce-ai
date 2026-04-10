import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const GITHUB_OWNER = "Tallen231210";
const GITHUB_REPO = "sequ3nce-ai";
const TAG_PREFIX = "desktop-v";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Simple in-memory cache for GitHub release data
let cachedRelease: {
  tag: string;
  assets: { name: string; url: string }[];
  fetchedAt: number;
} | null = null;

async function getLatestDesktopRelease() {
  if (cachedRelease && Date.now() - cachedRelease.fetchedAt < CACHE_TTL_MS) {
    return cachedRelease;
  }

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=20`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "sequ3nce-updater",
      },
      cache: "no-store",
    }
  );

  if (!res.ok) return null;

  const releases = await res.json();

  // Find the latest non-draft release with a desktop-v* tag
  const release = releases.find(
    (r: { draft: boolean; prerelease: boolean; tag_name: string }) =>
      !r.draft && r.tag_name.startsWith(TAG_PREFIX)
  );

  if (!release) return null;

  cachedRelease = {
    tag: release.tag_name,
    assets: release.assets.map(
      (a: { name: string; browser_download_url: string }) => ({
        name: a.name,
        url: a.browser_download_url,
      })
    ),
    fetchedAt: Date.now(),
  };

  return cachedRelease;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ file: string[] }> }
) {
  const { file } = await params;
  const filename = file.join("/");

  if (!filename) {
    return NextResponse.json(
      { error: "File parameter required" },
      { status: 400 }
    );
  }

  const release = await getLatestDesktopRelease();
  if (!release) {
    return NextResponse.json({ error: "No release found" }, { status: 404 });
  }

  const asset = release.assets.find((a) => a.name === filename);
  if (!asset) {
    return NextResponse.json(
      { error: `Asset '${filename}' not found in release ${release.tag}` },
      { status: 404 }
    );
  }

  // For manifest YAML files: fetch and proxy the content directly.
  // electron-updater's generic provider needs the YAML body in the response,
  // not a redirect chain.
  if (filename.endsWith(".yml")) {
    const yamlRes = await fetch(asset.url, {
      headers: { "User-Agent": "sequ3nce-updater" },
      redirect: "follow",
    });

    if (!yamlRes.ok) {
      return NextResponse.json(
        { error: "Failed to fetch manifest" },
        { status: 502 }
      );
    }

    const yamlContent = await yamlRes.text();
    return new NextResponse(yamlContent, {
      status: 200,
      headers: {
        "Content-Type": "text/yaml",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  }

  // For binary files (zip, exe, dmg): redirect to the GitHub download URL.
  return NextResponse.redirect(asset.url, 302);
}
