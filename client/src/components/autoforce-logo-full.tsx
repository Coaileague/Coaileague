import { cn } from "@/lib/utils";

interface AutoForceLogoFullProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizes = {
  sm: "w-48 h-14",
  md: "w-64 h-20",
  lg: "w-80 h-24",
  xl: "w-96 h-28",
};

export function AutoForceLogoFull({ size = "md", className }: AutoForceLogoFullProps) {
  return (
    <svg
      viewBox="0 0 400 120"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(sizes[size], className)}
      aria-label="AutoForce™ - Autonomous Management Solutions"
    >
      <defs>
        <linearGradient id="primaryGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: "hsl(var(--primary))", stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: "hsl(217, 91%, 60%)", stopOpacity: 1 }} />
        </linearGradient>
        <linearGradient id="accentGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style={{ stopColor: "hsl(217, 91%, 60%)", stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: "hsl(var(--primary))", stopOpacity: 1 }} />
        </linearGradient>
      </defs>

      {/* Icon: Autonomous Network Nodes */}
      <g transform="translate(20, 30)">
        {/* Central Hub */}
        <circle cx="30" cy="30" r="8" fill="url(#primaryGradient)">
          <animate attributeName="opacity" values="1;0.6;1" dur="2s" repeatCount="indefinite" />
        </circle>

        {/* Orbital Nodes */}
        <circle cx="10" cy="15" r="5" fill="url(#accentGradient)" />
        <circle cx="50" cy="15" r="5" fill="url(#accentGradient)" />
        <circle cx="10" cy="45" r="5" fill="url(#accentGradient)" />
        <circle cx="50" cy="45" r="5" fill="url(#accentGradient)" />

        {/* Connection Lines */}
        <line x1="30" y1="30" x2="10" y2="15" stroke="url(#primaryGradient)" strokeWidth="2" opacity="0.4" />
        <line x1="30" y1="30" x2="50" y2="15" stroke="url(#primaryGradient)" strokeWidth="2" opacity="0.4" />
        <line x1="30" y1="30" x2="10" y2="45" stroke="url(#primaryGradient)" strokeWidth="2" opacity="0.4" />
        <line x1="30" y1="30" x2="50" y2="45" stroke="url(#primaryGradient)" strokeWidth="2" opacity="0.4" />

        {/* Outer Ring */}
        <circle
          cx="30"
          cy="30"
          r="28"
          fill="none"
          stroke="url(#primaryGradient)"
          strokeWidth="2"
          opacity="0.3"
          strokeDasharray="3,3"
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 30 30"
            to="360 30 30"
            dur="20s"
            repeatCount="indefinite"
          />
        </circle>
      </g>

      {/* Text: AutoForce */}
      <text
        x="100"
        y="52"
        fontFamily="'Inter', 'Segoe UI', 'Arial', sans-serif"
        fontSize="32"
        fontWeight="700"
        fill="currentColor"
        className="fill-foreground dark:fill-white"
        letterSpacing="-1"
      >
        AutoForce
      </text>

      {/* Text: ™ with special styling */}
      <text
        x="268"
        y="52"
        fontFamily="'Inter', 'Segoe UI', 'Arial', sans-serif"
        fontSize="32"
        fontWeight="700"
        fill="url(#primaryGradient)"
        letterSpacing="-1"
      >
        ™
      </text>

      {/* Tagline */}
      <text
        x="100"
        y="72"
        fontFamily="'Inter', 'Segoe UI', 'Arial', sans-serif"
        fontSize="11"
        fontWeight="400"
        className="fill-muted-foreground"
        letterSpacing="1.5"
      >
        AUTONOMOUS MANAGEMENT SOLUTIONS
      </text>

      {/* Accent Line */}
      <rect x="100" y="78" width="180" height="2" fill="url(#accentGradient)" opacity="0.6" />
    </svg>
  );
}
