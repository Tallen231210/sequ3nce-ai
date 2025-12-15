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
      width={height * 5.5} // Approximate aspect ratio from the logo
      height={height}
      className={className}
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
