import { cn } from "@/lib/utils";
import { logoConfig, isAnimationEnabled, getAnimationConfig } from "@/config/logoConfig";

interface CoAIleagueLogoFullProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

/**
 * CoAIleague Full Logo with Autonomous Network Icon
 */
export function CoAIleagueLogoFull({ size = "md", className }: CoAIleagueLogoFullProps) {
  const svgSizes = {
    sm: logoConfig.sizes.svg.sm,
    md: logoConfig.sizes.svg.md,
    lg: logoConfig.sizes.svg.lg,
    xl: logoConfig.sizes.svg.xl,
  };

  return (
    <svg
      viewBox="0 0 420 120"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(svgSizes[size], className)}
      aria-label={logoConfig.accessibility.ariaLabel}
      data-testid={`${logoConfig.accessibility.testIdPrefix}-full-svg`}
    >
      <defs>
        <style>{`
          ${getAnimationConfig("pulseCore").keyframes}
          ${getAnimationConfig("flowNode").keyframes}
          ${getAnimationConfig("rotateRing").keyframes}
          ${getAnimationConfig("flowEnergy").keyframes}
          ${getAnimationConfig("glowPulse").keyframes}

          .core-node { animation: pulse-core 2s ease-in-out infinite; }
          .orbital-node { animation: flow-node 3s ease-in-out infinite; }
          .connection-line { stroke-dasharray: 100; animation: flow-energy 2.5s ease-in-out infinite; }
          .outer-ring { animation: rotate-ring 20s linear infinite; }
        `}</style>

        <radialGradient id="coreGradientFull">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="1" />
          <stop offset="100%" stopColor="hsl(217, 91%, 60%)" stopOpacity="0.8" />
        </radialGradient>

        <linearGradient id="textGradientFull" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="1" />
          <stop offset="100%" stopColor="hsl(217, 91%, 60%)" stopOpacity="1" />
        </linearGradient>

        <filter id="glowFull">
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Icon section */}
      <g transform="translate(20, 30)">
        {/* Outer rotating ring */}
        <circle
          className="outer-ring"
          cx="30"
          cy="30"
          r="28"
          fill="none"
          stroke="hsl(217, 91%, 60%)"
          strokeWidth="0.8"
          opacity="0.2"
          strokeDasharray="6,3"
        />

        {/* Connection lines */}
        <line
          className="connection-line"
          x1="30"
          y1="30"
          x2="30"
          y2="6"
          stroke="hsl(var(--primary))"
          strokeWidth="1.2"
          opacity="0.6"
        />
        <line
          className="connection-line"
          x1="30"
          y1="30"
          x2="48"
          y2="48"
          stroke="hsl(var(--primary))"
          strokeWidth="1.2"
          opacity="0.6"
        />
        <line
          className="connection-line"
          x1="30"
          y1="30"
          x2="12"
          y2="48"
          stroke="hsl(var(--primary))"
          strokeWidth="1.2"
          opacity="0.6"
        />

        {/* Core */}
        <circle
          className="core-node"
          cx="30"
          cy="30"
          r="3.5"
          fill="url(#coreGradientFull)"
          filter="url(#glowFull)"
        />

        {/* Nodes */}
        <circle
          className="orbital-node"
          cx="30"
          cy="6"
          r="2.5"
          fill="hsl(217, 91%, 60%)"
          opacity="0.8"
          filter="url(#glowFull)"
        />
        <circle
          className="orbital-node"
          cx="48"
          cy="48"
          r="2.5"
          fill="hsl(217, 91%, 60%)"
          opacity="0.8"
          filter="url(#glowFull)"
          style={{ animationDelay: "0.6s" }}
        />
        <circle
          className="orbital-node"
          cx="12"
          cy="48"
          r="2.5"
          fill="hsl(217, 91%, 60%)"
          opacity="0.8"
          filter="url(#glowFull)"
          style={{ animationDelay: "1.2s" }}
        />

        {/* Energy pulse */}
        <circle
          cx="30"
          cy="30"
          r="6"
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="0.4"
          opacity="0.4"
          style={{ animation: `glow-pulse ${getAnimationConfig("glowPulse").duration} ease-in-out infinite` }}
        />
      </g>

      {/* Brand name */}
      <text
        x="110"
        y="56"
        fontFamily={logoConfig.typography.fontFamily}
        fontSize="38"
        fontWeight="700"
        fill="currentColor"
        className="fill-foreground dark:fill-white"
        letterSpacing="-0.5"
      >
        {logoConfig.brand.name}
      </text>

      {/* Trademark */}
      <text
        x="310"
        y="48"
        fontFamily={logoConfig.typography.fontFamily}
        fontSize="16"
        fontWeight="700"
        fill="url(#textGradientFull)"
      >
        {logoConfig.brand.trademark}
      </text>

      {/* Tagline */}
      <text
        x="110"
        y="75"
        fontFamily={logoConfig.typography.fontFamily}
        fontSize="11"
        fontWeight="500"
        fill="hsl(var(--muted-foreground))"
        letterSpacing="1.5"
        className="fill-muted-foreground"
      >
        {logoConfig.brand.taglineAlt.toUpperCase()}
      </text>

      {/* Accent line */}
      <line
        x1="110"
        y1="80"
        x2="310"
        y2="80"
        stroke="url(#textGradientFull)"
        strokeWidth="1"
        opacity="0.5"
      />
    </svg>
  );
}
