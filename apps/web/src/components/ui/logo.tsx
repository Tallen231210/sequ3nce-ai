import Image from "next/image";
import Link from "next/link";

interface LogoProps {
  className?: string;
  height?: number;
  href?: string;
}

export function Logo({ className = "", height = 24, href }: LogoProps) {
  const logoImage = (
    <Image
      src="/logo.png"
      alt="Sequ3nce.ai"
      width={height * 5.5} // Layout width driver — keep; rendered height follows the real ratio
      height={height}
      className={className}
      // The source PNG is 41KB — smaller than most optimizer output. Serving
      // it untouched keeps the wordmark crisp on retina screens instead of
      // upscaling a 128px resized copy (the blur Tyler spotted).
      unoptimized
      style={{ height: "auto" }}
      priority
    />
  );

  if (href) {
    return (
      <Link href={href} className="flex items-center">
        {logoImage}
      </Link>
    );
  }

  return logoImage;
}
