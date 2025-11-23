import { cn } from "@/lib/utils";
import { logoConfig } from "@/config/logoConfig";

interface AutoForceLogoFullProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

export function AutoForceLogoFull({ size = "md", className }: AutoForceLogoFullProps) {
  const svgSizes = {
    sm: logoConfig.sizes.svg.sm,
    md: logoConfig.sizes.svg.md,
    lg: logoConfig.sizes.svg.lg,
    xl: logoConfig.sizes.svg.xl,
  };

  return (
    <svg
      viewBox="0 0 400 120"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(svgSizes[size], className)}
      aria-label={logoConfig.accessibility.ariaLabel}
      data-testid={`${logoConfig.accessibility.testIdPrefix}-full-svg`}
    >
      <defs>
        <linearGradient
          id={logoConfig.gradients.primary.id}
          x1={logoConfig.gradients.primary.x1}
          y1={logoConfig.gradients.primary.y1}
          x2={logoConfig.gradients.primary.x2}
          y2={logoConfig.gradients.primary.y2}
        >
          {logoConfig.gradients.primary.stops.map((stop, idx) => (
            <stop key={idx} offset={stop.offset} style={{ stopColor: stop.color, stopOpacity: 1 }} />
          ))}
        </linearGradient>
        <linearGradient
          id={logoConfig.gradients.accent.id}
          x1={logoConfig.gradients.accent.x1}
          y1={logoConfig.gradients.accent.y1}
          x2={logoConfig.gradients.accent.x2}
          y2={logoConfig.gradients.accent.y2}
        >
          {logoConfig.gradients.accent.stops.map((stop, idx) => (
            <stop key={idx} offset={stop.offset} style={{ stopColor: stop.color, stopOpacity: 1 }} />
          ))}
        </linearGradient>
      </defs>

      {/* Icon: Autonomous Network Nodes */}
      {logoConfig.networkIcon.enabled && (
        <g transform="translate(20, 30)">
          {/* Central Hub */}
          <circle
            cx="30"
            cy="30"
            r={logoConfig.networkIcon.centralHub.size}
            fill={`url(#${logoConfig.gradients.primary.id})`}
          >
            <animate
              attributeName="opacity"
              values="1;0.6;1"
              dur={logoConfig.networkIcon.centralHub.animationDuration}
              repeatCount="indefinite"
            />
          </circle>

          {/* Orbital Nodes */}
          {logoConfig.networkIcon.orbitalNodes.positions.map((pos, idx) => (
            <circle
              key={idx}
              cx={pos.x}
              cy={pos.y}
              r={logoConfig.networkIcon.orbitalNodes.size}
              fill={`url(#${logoConfig.gradients.accent.id})`}
            />
          ))}

          {/* Connection Lines */}
          {logoConfig.networkIcon.orbitalNodes.positions.map((pos, idx) => (
            <line
              key={idx}
              x1="30"
              y1="30"
              x2={pos.x}
              y2={pos.y}
              stroke={`url(#${logoConfig.gradients.primary.id})`}
              strokeWidth={logoConfig.networkIcon.connections.strokeWidth}
              opacity={logoConfig.networkIcon.connections.opacity}
            />
          ))}

          {/* Outer Ring */}
          <circle
            cx="30"
            cy="30"
            r={logoConfig.networkIcon.outerRing.radius}
            fill="none"
            stroke={`url(#${logoConfig.gradients.primary.id})`}
            strokeWidth={logoConfig.networkIcon.outerRing.strokeWidth}
            opacity={logoConfig.networkIcon.outerRing.opacity}
            strokeDasharray="3,3"
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 30 30"
              to="360 30 30"
              dur={logoConfig.networkIcon.outerRing.animationDuration}
              repeatCount="indefinite"
            />
          </circle>
        </g>
      )}

      {/* Text: Brand Name */}
      <text
        x="100"
        y="52"
        fontFamily={logoConfig.typography.fontFamily}
        fontSize={logoConfig.typography.fontSize.main}
        fontWeight={logoConfig.typography.fontWeight.main}
        fill="currentColor"
        className="fill-foreground dark:fill-white"
        letterSpacing={logoConfig.typography.letterSpacing.main}
      >
        {logoConfig.brand.name}
      </text>

      {/* Text: Trademark with special styling */}
      <text
        x="268"
        y="52"
        fontFamily={logoConfig.typography.fontFamily}
        fontSize={logoConfig.typography.fontSize.trademark}
        fontWeight={logoConfig.typography.fontWeight.trademark}
        fill={`url(#${logoConfig.gradients.primary.id})`}
        letterSpacing={logoConfig.typography.letterSpacing.main}
      >
        {logoConfig.brand.trademark}
      </text>

      {/* Tagline */}
      <text
        x="100"
        y="72"
        fontFamily={logoConfig.typography.fontFamily}
        fontSize={logoConfig.typography.fontSize.tagline}
        fontWeight={logoConfig.typography.fontWeight.tagline}
        className="fill-muted-foreground"
        letterSpacing={logoConfig.typography.letterSpacing.tagline}
      >
        {logoConfig.brand.taglineAlt.toUpperCase()}
      </text>

      {/* Accent Line */}
      <rect
        x="100"
        y="78"
        width="180"
        height="2"
        fill={`url(#${logoConfig.gradients.accent.id})`}
        opacity="0.6"
      />
    </svg>
  );
}
