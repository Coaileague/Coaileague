import { cn } from "@/lib/utils";
import { logoConfig } from "@/config/logoConfig";

interface AutoForceLogoFullProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

/**
 * AutoForce™ Full Logo - Modern SVG with brand name
 * Uses centralized logoConfig for all styling and animations
 */
export function AutoForceLogoFull({ size = "md", className }: AutoForceLogoFullProps) {
  const svgSizes = {
    sm: logoConfig.sizes.svg.sm,
    md: logoConfig.sizes.svg.md,
    lg: logoConfig.sizes.svg.lg,
    xl: logoConfig.sizes.svg.xl,
  };

  return (
    <svg
      viewBox="0 0 400 100"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(svgSizes[size], className)}
      aria-label={logoConfig.accessibility.ariaLabel}
      data-testid={`${logoConfig.accessibility.testIdPrefix}-full-svg`}
    >
      <defs>
        <style>{`
          @keyframes shimmer {
            0%, 100% { opacity: 0.6; }
            50% { opacity: 1; }
          }
          
          .geometric-line {
            animation: shimmer 2.5s ease-in-out infinite;
            transition: stroke-width 0.3s ease;
          }
          
          .geometric-line:hover {
            stroke-width: 7;
          }
        `}</style>
        <linearGradient
          id="textGradient"
          x1="0%"
          y1="0%"
          x2="100%"
          y2="0%"
        >
          <stop offset="0%" style={{ stopColor: "hsl(var(--primary))", stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: "hsl(217, 91%, 60%)", stopOpacity: 1 }} />
        </linearGradient>
      </defs>

      {/* Icon Group */}
      <g transform="translate(10, 15)">
        {/* Badge background circle */}
        <circle cx="30" cy="30" r="28" fill="url(#textGradient)" opacity="0.1" />

        {/* Geometric A paths */}
        <path
          className="geometric-line"
          d="M 18 48 L 30 12"
          stroke="hsl(var(--primary))"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <path
          className="geometric-line"
          d="M 42 48 L 30 12"
          stroke="hsl(var(--primary))"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <path
          className="geometric-line"
          d="M 22 32 L 38 32"
          stroke="hsl(var(--primary))"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Accent dot */}
        <circle cx="30" cy="10" r="2.5" fill="hsl(60, 100%, 50%)" opacity="0.8" />
      </g>

      {/* Text: Brand Name */}
      <text
        x="85"
        y="42"
        fontFamily={logoConfig.typography.fontFamily}
        fontSize="32"
        fontWeight="700"
        fill="currentColor"
        letterSpacing="-0.5"
        className="fill-foreground dark:fill-white"
      >
        {logoConfig.brand.name}
      </text>

      {/* Trademark */}
      <text
        x="275"
        y="36"
        fontFamily={logoConfig.typography.fontFamily}
        fontSize="14"
        fontWeight="700"
        fill="url(#textGradient)"
      >
        {logoConfig.brand.trademark}
      </text>

      {/* Tagline */}
      <text
        x="85"
        y="60"
        fontFamily={logoConfig.typography.fontFamily}
        fontSize="10"
        fontWeight="500"
        fill="hsl(var(--muted-foreground))"
        letterSpacing="1.5"
        className="fill-muted-foreground"
      >
        {logoConfig.brand.taglineAlt.toUpperCase()}
      </text>

      {/* Accent line */}
      <line
        x1="85"
        y1="65"
        x2="265"
        y2="65"
        stroke="url(#textGradient)"
        strokeWidth="1"
        opacity="0.6"
      />
    </svg>
  );
}
