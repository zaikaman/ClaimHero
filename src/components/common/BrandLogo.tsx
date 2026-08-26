import React from "react";
import { cn } from "../../lib/utils";

export interface BrandLogoProps {
  /** Size preset */
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "hero";
  /** Optional theme override */
  theme?: "dark" | "light" | "auto";
  /** Whether to display the text wordmark */
  showWordmark?: boolean;
  /** Legacy props kept for compatibility (no-op) */
  showBadge?: boolean;
  badgeText?: string;
  glow?: boolean;
  interactive?: boolean;
  layout?: "horizontal" | "vertical";
  /** Additional wrapper CSS class */
  className?: string;
  /** Optional onClick handler */
  onClick?: () => void;
}

/**
 * Minimalist Sovereign Shield & Medical Cross Emblem
 * Pure iconic monochrome silhouette with precision negative-space cutout.
 * Follows the clean, timeless design principles of Vercel, Linear, and Google.
 */
export const BrandIcon: React.FC<{
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "hero";
  theme?: "dark" | "light" | "auto";
  className?: string;
  glow?: boolean;
  interactive?: boolean;
}> = ({ size = "md", theme = "auto", className }) => {
  const sizeClasses = {
    xs: "size-4 min-w-4 min-h-4",
    sm: "size-5 min-w-5 min-h-5",
    md: "size-6 min-w-6 min-h-6",
    lg: "size-7 min-w-7 min-h-7",
    xl: "size-8 min-w-8 min-h-8",
    hero: "size-10 min-w-10 min-h-10 md:size-12 md:min-w-12 md:min-h-12",
  };

  const isLight = theme === "light";

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center shrink-0 select-none",
        isLight ? "text-zinc-900" : "text-foreground",
        sizeClasses[size] || sizeClasses.md,
        className
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full block aspect-square shrink-0"
      >
        {/* Pure solid shield with negative-space medical necessity cross */}
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M12 2L4 5.5V11.5C4 16.8 7.4 21.6 12 23C16.6 21.6 20 16.8 20 11.5V5.5L12 2ZM10.5 7.5C10.5 6.94772 10.9477 6.5 11.5 6.5H12.5C13.0523 6.5 13.5 6.94772 13.5 7.5V10.5H16.5C17.0523 10.5 17.5 10.9477 17.5 11.5V12.5C17.5 13.0523 17.0523 13.5 16.5 13.5H13.5V16.5C13.5 17.0523 13.0523 17.5 12.5 17.5H11.5C10.9477 17.5 10.5 17.0523 10.5 16.5V13.5H7.5C6.94772 13.5 6.5 13.0523 6.5 12.5V11.5C6.5 10.9477 6.94772 10.5 7.5 10.5H10.5V7.5Z"
        />
      </svg>
    </div>
  );
};

/**
 * Pure, Minimalist Typographic Wordmark
 */
export const BrandWordmark: React.FC<{
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "hero";
  theme?: "dark" | "light" | "auto";
  showBadge?: boolean;
  badgeText?: string;
  className?: string;
}> = ({ size = "md", theme = "auto", className }) => {
  const textSizes = {
    xs: "text-xs tracking-tight",
    sm: "text-sm tracking-tight",
    md: "text-base tracking-tight",
    lg: "text-lg md:text-xl tracking-tight",
    xl: "text-2xl md:text-3xl tracking-tight",
    hero: "text-3xl sm:text-4xl md:text-5xl tracking-tight font-bold",
  };

  const isLight = theme === "light";

  return (
    <span
      className={cn(
        "font-sans select-none inline-flex items-center leading-none",
        isLight ? "text-zinc-900" : "text-foreground",
        textSizes[size] || textSizes.md,
        className
      )}
    >
      <span className="font-semibold">Claim</span>
      <span className="font-bold ml-[1px]">Hero</span>
    </span>
  );
};

/**
 * Unified ClaimHero Brand Logo Lockup
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = "md",
  theme = "auto",
  showWordmark = true,
  className,
  onClick,
}) => {
  const isLight = theme === "light";

  return (
    <div
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 select-none",
        isLight ? "text-zinc-900" : "text-foreground",
        onClick && "cursor-pointer group hover:opacity-90 transition-opacity",
        className
      )}
    >
      <BrandIcon size={size} theme={theme} />
      {showWordmark && <BrandWordmark size={size} theme={theme} />}
    </div>
  );
};

export default BrandLogo;
