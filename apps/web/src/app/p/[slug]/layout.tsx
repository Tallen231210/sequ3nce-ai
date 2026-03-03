import type { Metadata } from "next";

const CONVEX_SITE_URL =
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL ||
  (process.env.NEXT_PUBLIC_CONVEX_URL || "").replace(".cloud", ".site");

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  try {
    const response = await fetch(
      `${CONVEX_SITE_URL}/b2c/public-profile?slug=${encodeURIComponent(slug)}`,
      { next: { revalidate: 300 } }
    );

    if (!response.ok) {
      return {
        title: "Profile Not Found | Sequ3nce",
        description: "This closer profile could not be found.",
      };
    }

    const profile = await response.json();
    const title = `${profile.name} | Sequ3nce`;
    const description = profile.headline
      ? `${profile.headline} — View verified sales stats and profile on Sequ3nce.`
      : `View ${profile.name}'s verified sales profile on Sequ3nce.`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "profile",
        ...(profile.photoUrl && { images: [{ url: profile.photoUrl }] }),
      },
      twitter: {
        card: "summary",
        title,
        description,
        ...(profile.photoUrl && { images: [profile.photoUrl] }),
      },
    };
  } catch {
    return {
      title: "Closer Profile | Sequ3nce",
      description: "View verified sales profiles on Sequ3nce.",
    };
  }
}

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
