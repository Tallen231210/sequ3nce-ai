import { NextResponse } from "next/server";

const GITHUB_OWNER = "Tallen231210";
const GITHUB_REPO = "sequ3nce-ai";
const TAG_PREFIX = "personal-v";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Simple in-memory cache for GitHub release data
let cachedRelease: { tag: string; assets: { name: string; url: string }[]; fetchedAt: number } | null = null;

async function getLatestPersonalRelease() {
  if (cachedRelease && Date.now() - cachedRelease.fetchedAt < CACHE_TTL_MS) {
    return cachedRelease;
  }

  // Fetch releases from GitHub (public repo, no auth needed)
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=20`,
    {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "sequ3nce-updater" },
      next: { revalidate: 300 },
    }
  );

  if (!res.ok) return null;

  const releases = await res.json();

  // Find the latest non-draft release with a personal-v* tag
  const release = releases.find(
    (r: { draft: boolean; prerelease: boolean; tag_name: string }) =>
      !r.draft && r.tag_name.startsWith(TAG_PREFIX)
  );

  if (!release) return null;

  cachedRelease = {
    tag: release.tag_name,
    assets: release.assets.map((a: { name: string; browser_download_url: string }) => ({
      name: a.name,
      url: a.browser_download_url,
    })),
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
    return NextResponse.json({ error: "File parameter required" }, { status: 400 });
  }

  const release = await getLatestPersonalRelease();
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

  // Redirect to the GitHub download URL
  return NextResponse.redirect(asset.url, 302);
}
