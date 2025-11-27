/**
 * CoAIleague Central Icon
 * Single source of truth for all branding
 * Neural network symbolism with blue→green→cyan gradient
 * Polished, modern, catchy design
 */

interface CoAIleagueIconProps {
  size?: "sm" | "md" | "lg" | "xl";
  animated?: boolean;
  className?: string;
}

const sizeMap = {
  sm: "w-6 h-6",
  md: "w-8 h-8",
  lg: "w-12 h-12",
  xl: "w-16 h-16",
};

export function CoAIleagueIcon({
  size = "md",
  animated = false,
  className = "",
}: CoAIleagueIconProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={`${sizeMap[size]} ${className} ${animated ? "animate-pulse" : ""}`}
      role="img"
      aria-label="CoAIleague"
    >
      <defs>
        <linearGradient id="coaileague-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" /> {/* Blue */}
          <stop offset="50%" stopColor="#10b981" /> {/* Green */}
          <stop offset="100%" stopColor="#06b6d4" /> {/* Cyan */}
        </linearGradient>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background circle */}
      <circle cx="50" cy="50" r="48" fill="none" stroke="url(#coaileague-gradient)" strokeWidth="1.5" opacity="0.2" />

      {/* Neural network nodes (representing AI/intelligence) */}
      {/* Center node */}
      <circle cx="50" cy="50" r="4" fill="url(#coaileague-gradient)" filter="url(#glow)" />

      {/* Top node */}
      <circle cx="50" cy="25" r="3" fill="url(#coaileague-gradient)" filter="url(#glow)" />

      {/* Right node */}
      <circle cx="68" cy="50" r="3" fill="url(#coaileague-gradient)" filter="url(#glow)" />

      {/* Bottom node */}
      <circle cx="50" cy="75" r="3" fill="url(#coaileague-gradient)" filter="url(#glow)" />

      {/* Left node */}
      <circle cx="32" cy="50" r="3" fill="url(#coaileague-gradient)" filter="url(#glow)" />

      {/* Top-right node */}
      <circle cx="62" cy="32" r="2.5" fill="url(#coaileague-gradient)" filter="url(#glow)" />

      {/* Bottom-right node */}
      <circle cx="62" cy="68" r="2.5" fill="url(#coaileague-gradient)" filter="url(#glow)" />

      {/* Bottom-left node */}
      <circle cx="38" cy="68" r="2.5" fill="url(#coaileague-gradient)" filter="url(#glow)" />

      {/* Top-left node */}
      <circle cx="38" cy="32" r="2.5" fill="url(#coaileague-gradient)" filter="url(#glow)" />

      {/* Connection lines (neural connections) */}
      <line x1="50" y1="50" x2="50" y2="25" stroke="url(#coaileague-gradient)" strokeWidth="1.5" opacity="0.6" />
      <line x1="50" y1="50" x2="68" y2="50" stroke="url(#coaileague-gradient)" strokeWidth="1.5" opacity="0.6" />
      <line x1="50" y1="50" x2="50" y2="75" stroke="url(#coaileague-gradient)" strokeWidth="1.5" opacity="0.6" />
      <line x1="50" y1="50" x2="32" y2="50" stroke="url(#coaileague-gradient)" strokeWidth="1.5" opacity="0.6" />

      {/* Diagonal connections */}
      <line x1="50" y1="50" x2="62" y2="32" stroke="url(#coaileague-gradient)" strokeWidth="1" opacity="0.4" />
      <line x1="50" y1="50" x2="62" y2="68" stroke="url(#coaileague-gradient)" strokeWidth="1" opacity="0.4" />
      <line x1="50" y1="50" x2="38" y2="68" stroke="url(#coaileague-gradient)" strokeWidth="1" opacity="0.4" />
      <line x1="50" y1="50" x2="38" y2="32" stroke="url(#coaileague-gradient)" strokeWidth="1" opacity="0.4" />

      {/* Additional network connections */}
      <line x1="50" y1="25" x2="62" y2="32" stroke="url(#coaileague-gradient)" strokeWidth="0.8" opacity="0.3" />
      <line x1="68" y1="50" x2="62" y2="68" stroke="url(#coaileague-gradient)" strokeWidth="0.8" opacity="0.3" />
      <line x1="50" y1="75" x2="38" y2="68" stroke="url(#coaileague-gradient)" strokeWidth="0.8" opacity="0.3" />
      <line x1="32" y1="50" x2="38" y2="32" stroke="url(#coaileague-gradient)" strokeWidth="0.8" opacity="0.3" />
    </svg>
  );
}

export function CoAIleagueIconWithText({
  size = "md",
  className = "",
}: Omit<CoAIleagueIconProps, "animated">) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <CoAIleagueIcon size={size} />
      <span className="font-bold text-lg tracking-tight">CoAIleague</span>
    </div>
  );
}
