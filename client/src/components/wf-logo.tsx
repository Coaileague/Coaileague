// WorkforceOS Logo Component
// Realistic neon-style "W" with glowing "OS" superscript

interface WFLogoProps {
  className?: string;
  size?: number;
}

export function WFLogo({ className = "", size = 24 }: WFLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <filter id="neon-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur1"/>
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur2"/>
          <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur3"/>
          <feMerge>
            <feMergeNode in="blur3"/>
            <feMergeNode in="blur2"/>
            <feMergeNode in="blur1"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        <linearGradient id="blue-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      
      {/* Main "W" Letter */}
      <path
        d="M 15 20 L 25 75 L 35 35 L 45 75 L 55 20"
        stroke="url(#blue-gradient)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        filter="url(#neon-glow)"
      />
      
      {/* "OS" Superscript */}
      <text
        x="60"
        y="35"
        fill="url(#blue-gradient)"
        fontSize="20"
        fontWeight="bold"
        fontFamily="Arial, sans-serif"
        filter="url(#neon-glow)"
      >
        OS
      </text>
      
      {/* Additional glow for depth */}
      <path
        d="M 15 20 L 25 75 L 35 35 L 45 75 L 55 20"
        stroke="#3b82f6"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.6"
      />
    </svg>
  );
}

// Compact version for inline use
export function WFLogoCompact({ className = "", size = 16 }: WFLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <filter id="compact-glow">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <path
        d="M 3 4 L 6 18 L 9 8 L 12 18 L 15 4"
        stroke="#3b82f6"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        filter="url(#compact-glow)"
      />
      <text
        x="16"
        y="10"
        fill="#3b82f6"
        fontSize="8"
        fontWeight="bold"
        filter="url(#compact-glow)"
      >
        OS
      </text>
    </svg>
  );
}
