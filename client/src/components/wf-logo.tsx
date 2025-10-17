// WorkforceOS Compact Logo Component
// Perfect for inline use in chat, user lists, badges
// Transparent background, animated glow, professional look

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
        <filter id="neon-glow-full" x="-50%" y="-50%" width="200%" height="200%">
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
        <linearGradient id="blue-gradient-full" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="50%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      
      {/* Main "W" Letter */}
      <path
        d="M 15 20 L 25 75 L 35 35 L 45 75 L 55 20"
        stroke="url(#blue-gradient-full)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        filter="url(#neon-glow-full)"
      />
      
      {/* "OS" Superscript */}
      <text
        x="60"
        y="35"
        fill="url(#blue-gradient-full)"
        fontSize="20"
        fontWeight="bold"
        fontFamily="Arial, sans-serif"
        filter="url(#neon-glow-full)"
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

// Compact version for inline use - ENHANCED for chat messages and user lists
// Transparent, glowing, professional, blends with any background
export function WFLogoCompact({ className = "", size = 20 }: WFLogoProps) {
  const uniqueId = Math.random().toString(36).substr(2, 9);
  
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        {/* Multi-layer glow for depth */}
        <filter id={`compact-glow-${uniqueId}`} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur1"/>
          <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur2"/>
          <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur3"/>
          <feMerge>
            <feMergeNode in="blur3"/>
            <feMergeNode in="blur2"/>
            <feMergeNode in="blur1"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        
        {/* Gradient for professional look */}
        <linearGradient id={`compact-gradient-${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="50%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
        
        {/* White core gradient for brightness */}
        <linearGradient id={`bright-core-${uniqueId}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e0f2fe" />
        </linearGradient>
      </defs>
      
      {/* Rounded Container Circle - Subtle glassmorphic background */}
      <circle
        cx="20"
        cy="16"
        r="15"
        fill="rgba(59, 130, 246, 0.1)"
        stroke="rgba(96, 165, 250, 0.3)"
        strokeWidth="0.5"
      />
      
      {/* Main "W" Letter - BIGGER, BOLD, GLOWING */}
      <path
        d="M 8 10 L 12 26 L 16 14 L 20 26 L 24 10"
        stroke={`url(#compact-gradient-${uniqueId})`}
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        filter={`url(#compact-glow-${uniqueId})`}
      />
      
      {/* "OS" Superscript - Clean and Visible */}
      <text
        x="25"
        y="14"
        fill={`url(#compact-gradient-${uniqueId})`}
        fontSize="11"
        fontWeight="900"
        fontFamily="system-ui, -apple-system, sans-serif"
        filter={`url(#compact-glow-${uniqueId})`}
      >
        OS
      </text>
      
      {/* Bright Core for Max Visibility */}
      <path
        d="M 8 10 L 12 26 L 16 14 L 20 26 L 24 10"
        stroke={`url(#bright-core-${uniqueId})`}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.7"
      />
      
      {/* Bright OS Core */}
      <text
        x="25"
        y="14"
        fill="#ffffff"
        fontSize="11"
        fontWeight="900"
        fontFamily="system-ui, -apple-system, sans-serif"
        opacity="0.6"
      >
        OS
      </text>
    </svg>
  );
}
