import { cn } from "@/lib/utils";
import workforceOSLogo from "@assets/workforceos-logo-full.png";

interface WorkforceOSLogoProps {
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  showText?: boolean;
  animated?: boolean;
  className?: string;
}

/**
 * WorkforceOS Logo Component - New Professional Design
 * Features: AI Brain, Automation Gear, Compliance Shield, Circuit Intelligence, Professional Workforce
 * Can be static (image) or animated (SVG with animations)
 */
export function WorkforceOSLogo({ 
  size = "md", 
  showText = true,
  animated = false,
  className 
}: WorkforceOSLogoProps) {
  const sizes = {
    sm: {
      container: "w-48 h-48",
      image: "w-full h-full object-contain"
    },
    md: {
      container: "w-64 h-64",
      image: "w-full h-full object-contain"
    },
    lg: {
      container: "w-80 h-80",
      image: "w-full h-full object-contain"
    },
    xl: {
      container: "w-96 h-96",
      image: "w-full h-full object-contain"
    },
    hero: {
      container: "w-[32rem] h-[32rem]",
      image: "w-full h-full object-contain"
    }
  };

  if (!animated) {
    // Static version - uses the PNG image
    return (
      <div className={cn("flex flex-col items-center", className)} data-testid="logo-static">
        <div className={sizes[size].container}>
          <img 
            src={workforceOSLogo} 
            alt="WorkforceOS - Complete Workforce Management Platform" 
            className={sizes[size].image}
          />
        </div>
      </div>
    );
  }

  // Animated version - SVG with CSS animations
  return (
    <div className={cn("flex flex-col items-center", className)} data-testid="logo-animated">
      <div className={cn("relative", sizes[size].container)}>
        <svg
          viewBox="0 0 400 400"
          className="w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Gradients */}
            <linearGradient id="teal-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0d9488" />
              <stop offset="100%" stopColor="#14b8a6" />
            </linearGradient>
            
            <linearGradient id="navy-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1e3a5f" />
              <stop offset="100%" stopColor="#2c5282" />
            </linearGradient>

            {/* Glowing filter for head */}
            <filter id="head-glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>

            {/* Pulsing glow for shield */}
            <filter id="shield-glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          {/* Center Professional (Navy Blue - Dark) */}
          <g transform="translate(200, 230)" className="animate-pulse-slow">
            {/* Body/Suit */}
            <path
              d="M-40,-30 L-50,30 L-30,50 L30,50 L50,30 L40,-30 Z"
              fill="url(#navy-gradient)"
              filter="url(#head-glow)"
            />
            {/* Tie */}
            <path
              d="M0,-30 L-5,10 L0,30 L5,10 Z"
              fill="#f0f9ff"
              opacity="0.9"
            />
            {/* Collar */}
            <path
              d="M-15,-30 L0,-20 L15,-30"
              stroke="#f0f9ff"
              strokeWidth="3"
              fill="none"
            />
            {/* Head */}
            <ellipse
              cx="0"
              cy="-50"
              rx="25"
              ry="30"
              fill="url(#navy-gradient)"
              filter="url(#head-glow)"
              className="animate-glow-pulse"
            />
          </g>

          {/* Top Left: AI Brain Head (Teal) */}
          <g transform="translate(100, 80)" className="animate-float">
            {/* Head outline */}
            <path
              d="M0,0 L10,-5 L20,0 L25,10 L25,25 L20,35 L10,40 L0,35 L-5,25 L-5,10 Z"
              fill="url(#teal-gradient)"
              stroke="#0d9488"
              strokeWidth="2"
            />
            {/* Circuit brain - animated paths */}
            <g className="animate-circuit-pulse">
              <circle cx="8" cy="15" r="3" fill="#f0f9ff" opacity="0.8" />
              <circle cx="15" cy="10" r="2" fill="#f0f9ff" opacity="0.6" />
              <circle cx="12" cy="22" r="2.5" fill="#f0f9ff" opacity="0.7" />
              <path d="M8,15 L15,10 M8,15 L12,22" stroke="#f0f9ff" strokeWidth="1.5" opacity="0.6" />
            </g>
          </g>

          {/* Top Right: Automation Gear (Teal) */}
          <g transform="translate(300, 80)">
            <circle 
              cx="0" 
              cy="0" 
              r="30" 
              fill="url(#teal-gradient)" 
              className="animate-spin-slow"
            />
            {/* Gear teeth */}
            <g className="animate-spin-slow">
              <rect x="-4" y="-35" width="8" height="10" fill="url(#teal-gradient)" />
              <rect x="-4" y="25" width="8" height="10" fill="url(#teal-gradient)" />
              <rect x="-35" y="-4" width="10" height="8" fill="url(#teal-gradient)" />
              <rect x="25" y="-4" width="10" height="8" fill="url(#teal-gradient)" />
              <rect x="-26" y="-26" width="8" height="8" fill="url(#teal-gradient)" transform="rotate(-45 -22 -22)" />
              <rect x="18" y="-26" width="8" height="8" fill="url(#teal-gradient)" transform="rotate(45 22 -22)" />
              <rect x="-26" y="18" width="8" height="8" fill="url(#teal-gradient)" transform="rotate(45 -22 22)" />
              <rect x="18" y="18" width="8" height="8" fill="url(#teal-gradient)" transform="rotate(-45 22 22)" />
            </g>
            {/* Center hole */}
            <circle cx="0" cy="0" r="12" fill="#f0f9ff" />
          </g>

          {/* Bottom Left: Circuit Intelligence Brain (Teal) */}
          <g transform="translate(100, 320)">
            {/* Brain outline */}
            <path
              d="M0,0 Q-15,-5 -20,5 Q-22,15 -18,25 Q-10,32 0,30 Q10,32 18,25 Q22,15 20,5 Q15,-5 0,0"
              fill="url(#teal-gradient)"
              stroke="#0d9488"
              strokeWidth="2"
            />
            {/* Circuit pathways - animated */}
            <g className="animate-circuit-pulse">
              <circle cx="-8" cy="10" r="2.5" fill="#f0f9ff" opacity="0.8" className="animate-pulse" />
              <circle cx="8" cy="10" r="2.5" fill="#f0f9ff" opacity="0.8" className="animate-pulse delay-300" />
              <circle cx="0" cy="18" r="3" fill="#f0f9ff" opacity="0.9" className="animate-pulse delay-600" />
              <circle cx="-5" cy="5" r="2" fill="#f0f9ff" opacity="0.7" />
              <circle cx="5" cy="5" r="2" fill="#f0f9ff" opacity="0.7" />
              <path d="M-8,10 L0,18 L8,10" stroke="#f0f9ff" strokeWidth="1.5" opacity="0.5" />
            </g>
          </g>

          {/* Bottom Right: Compliance Shield (Teal) */}
          <g transform="translate(300, 320)" className="animate-shield-pulse">
            {/* Shield shape */}
            <path
              d="M0,-30 L-25,-20 L-25,10 Q-25,25 0,35 Q25,25 25,10 L25,-20 Z"
              fill="url(#teal-gradient)"
              stroke="#0d9488"
              strokeWidth="2"
              filter="url(#shield-glow)"
            />
            {/* Checkmark */}
            <path
              d="M-10,5 L-3,12 L12,-8"
              stroke="#f0f9ff"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </g>

          {/* Connection Lines */}
          <g stroke="#0d9488" strokeWidth="2" opacity="0.3" className="animate-pulse-slow">
            <line x1="125" y1="100" x2="175" y2="200" />
            <line x1="275" y1="100" x2="225" y2="200" />
            <line x1="125" y1="300" x2="175" y2="250" />
            <line x1="275" y1="300" x2="225" y2="250" />
          </g>
        </svg>
      </div>

      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        @keyframes pulse-slow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        
        @keyframes float {
          0%, 100% { transform: translate(100px, 80px) translateY(0px); }
          50% { transform: translate(100px, 80px) translateY(-5px); }
        }
        
        @keyframes glow-pulse {
          0%, 100% { 
            filter: drop-shadow(0 0 8px rgba(59, 130, 246, 0.5));
          }
          50% { 
            filter: drop-shadow(0 0 16px rgba(59, 130, 246, 0.8));
          }
        }
        
        @keyframes circuit-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        
        @keyframes shield-pulse {
          0%, 100% { 
            transform: translate(300px, 320px) scale(1);
            filter: drop-shadow(0 0 4px rgba(13, 148, 136, 0.4));
          }
          50% { 
            transform: translate(300px, 320px) scale(1.05);
            filter: drop-shadow(0 0 8px rgba(13, 148, 136, 0.7));
          }
        }
        
        .animate-spin-slow {
          animation: spin-slow 8s linear infinite;
        }
        
        .animate-pulse-slow {
          animation: pulse-slow 3s ease-in-out infinite;
        }
        
        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
        
        .animate-glow-pulse {
          animation: glow-pulse 2s ease-in-out infinite;
        }
        
        .animate-circuit-pulse {
          animation: circuit-pulse 2.5s ease-in-out infinite;
        }
        
        .animate-shield-pulse {
          animation: shield-pulse 2s ease-in-out infinite;
        }

        .delay-300 {
          animation-delay: 0.3s;
        }

        .delay-600 {
          animation-delay: 0.6s;
        }
      `}</style>
    </div>
  );
}
