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

  // Always use SVG (with or without animations) - NO MORE PNG
  const animationClass = animated ? '' : 'static-logo';
  
  return (
    <div className={cn("flex flex-col items-center", className)} data-testid={animated ? "logo-animated" : "logo-static"}>
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

          {/* Center Professional (Navy Blue - Dark with MORE DETAIL) */}
          <g transform="translate(200, 230)" className={animated ? "animate-pulse-slow" : ""}>
            {/* Body/Suit - More detailed */}
            <path
              d="M-45,-35 L-55,35 L-35,55 L35,55 L55,35 L45,-35 Z"
              fill="url(#navy-gradient)"
              stroke="#1e3a5f"
              strokeWidth="2"
              filter="url(#head-glow)"
            />
            {/* Shoulders detail */}
            <path
              d="M-45,-35 L-55,5 L-40,0 L-40,-35 M45,-35 L55,5 L40,0 L40,-35"
              fill="#2c5282"
              opacity="0.8"
            />
            {/* White shirt collar - V-neck */}
            <path
              d="M-20,-35 L-15,-25 L0,-20 L15,-25 L20,-35 L15,-30 L0,-25 L-15,-30 Z"
              fill="#f0f9ff"
              stroke="#e0f2fe"
              strokeWidth="1"
            />
            {/* Tie - More detailed */}
            <path
              d="M0,-25 L-6,0 L-4,15 L0,35 L4,15 L6,0 Z"
              fill="#1e293b"
              stroke="#0f172a"
              strokeWidth="1"
            />
            {/* Tie knot */}
            <rect
              x="-5"
              y="-28"
              width="10"
              height="6"
              fill="#1e293b"
              stroke="#0f172a"
              strokeWidth="1"
            />
            {/* Head - Better silhouette */}
            <ellipse
              cx="0"
              cy="-55"
              rx="28"
              ry="35"
              fill="url(#navy-gradient)"
              stroke="#1e3a5f"
              strokeWidth="2"
              filter="url(#head-glow)"
              className={animated ? "animate-glow-pulse" : ""}
            />
            {/* Neck */}
            <rect
              x="-10"
              y="-25"
              width="20"
              height="15"
              fill="url(#navy-gradient)"
              rx="3"
            />
          </g>

          {/* Top Left: AI Brain Head (Teal) - MUCH MORE DETAIL like original */}
          <g transform="translate(100, 80)" className={animated ? "animate-float" : ""}>
            {/* Head profile silhouette */}
            <path
              d="M5,-15 Q15,-20 25,-15 Q30,-10 30,0 Q30,8 28,15 Q25,25 20,32 Q15,38 8,40 Q0,42 -5,38 Q-10,30 -8,20 Q-6,10 0,5 Q2,0 5,-8 Z"
              fill="url(#teal-gradient)"
              stroke="#0d9488"
              strokeWidth="2.5"
            />
            {/* Ear detail */}
            <ellipse cx="28" cy="5" rx="4" ry="6" fill="#14b8a6" />
            
            {/* Circuit brain inside - MORE DETAIL */}
            <g className={animated ? "animate-circuit-pulse" : ""}>
              {/* Main circuit nodes */}
              <circle cx="10" cy="8" r="3.5" fill="#f0f9ff" stroke="#e0f2fe" strokeWidth="1.5" />
              <circle cx="18" cy="5" r="2.5" fill="#f0f9ff" stroke="#e0f2fe" strokeWidth="1" />
              <circle cx="15" cy="15" r="3" fill="#f0f9ff" stroke="#e0f2fe" strokeWidth="1.5" />
              <circle cx="8" cy="18" r="2" fill="#f0f9ff" stroke="#e0f2fe" strokeWidth="1" />
              <circle cx="12" cy="25" r="2.5" fill="#f0f9ff" stroke="#e0f2fe" strokeWidth="1" />
              
              {/* Circuit pathways */}
              <path d="M10,8 L18,5" stroke="#f0f9ff" strokeWidth="2" opacity="0.8" />
              <path d="M10,8 L15,15" stroke="#f0f9ff" strokeWidth="2" opacity="0.8" />
              <path d="M10,8 L8,18" stroke="#f0f9ff" strokeWidth="1.5" opacity="0.7" />
              <path d="M15,15 L12,25" stroke="#f0f9ff" strokeWidth="1.5" opacity="0.7" />
              <path d="M8,18 L12,25" stroke="#f0f9ff" strokeWidth="1.5" opacity="0.6" />
            </g>
          </g>

          {/* Top Right: Automation Gear (Teal) - MORE DETAILED 8-tooth gear */}
          <g transform="translate(300, 80)" className={animated ? "animate-spin-slow" : ""}>
            {/* Main gear body */}
            <circle 
              cx="0" 
              cy="0" 
              r="32" 
              fill="url(#teal-gradient)"
              stroke="#0d9488"
              strokeWidth="2"
            />
            
            {/* 8 precise gear teeth */}
            {/* Top */}
            <rect x="-5" y="-40" width="10" height="12" fill="#14b8a6" stroke="#0d9488" strokeWidth="1.5" rx="1" />
            {/* Bottom */}
            <rect x="-5" y="28" width="10" height="12" fill="#14b8a6" stroke="#0d9488" strokeWidth="1.5" rx="1" />
            {/* Left */}
            <rect x="-40" y="-5" width="12" height="10" fill="#14b8a6" stroke="#0d9488" strokeWidth="1.5" rx="1" />
            {/* Right */}
            <rect x="28" y="-5" width="12" height="10" fill="#14b8a6" stroke="#0d9488" strokeWidth="1.5" rx="1" />
            {/* Top-left diagonal */}
            <rect x="-32" y="-32" width="10" height="10" fill="#14b8a6" stroke="#0d9488" strokeWidth="1.5" rx="1" transform="rotate(-45 -27 -27)" />
            {/* Top-right diagonal */}
            <rect x="22" y="-32" width="10" height="10" fill="#14b8a6" stroke="#0d9488" strokeWidth="1.5" rx="1" transform="rotate(45 27 -27)" />
            {/* Bottom-left diagonal */}
            <rect x="-32" y="22" width="10" height="10" fill="#14b8a6" stroke="#0d9488" strokeWidth="1.5" rx="1" transform="rotate(45 -27 27)" />
            {/* Bottom-right diagonal */}
            <rect x="22" y="22" width="10" height="10" fill="#14b8a6" stroke="#0d9488" strokeWidth="1.5" rx="1" transform="rotate(-45 27 27)" />
            
            {/* Center hole - larger and detailed */}
            <circle cx="0" cy="0" r="14" fill="#f0f9ff" stroke="#e0f2fe" strokeWidth="2" />
            <circle cx="0" cy="0" r="8" fill="none" stroke="#cbd5e1" strokeWidth="1" />
          </g>

          {/* Bottom Left: Circuit Intelligence Brain (Teal) - DETAILED brain lobes */}
          <g transform="translate(100, 320)">
            {/* Brain outline - More realistic brain shape with lobes */}
            <path
              d="M0,-5 Q-8,-8 -15,-5 Q-20,-2 -22,5 Q-24,12 -22,18 Q-20,25 -15,30 Q-8,34 0,32 Q8,34 15,30 Q20,25 22,18 Q24,12 22,5 Q20,-2 15,-5 Q8,-8 0,-5"
              fill="url(#teal-gradient)"
              stroke="#0d9488"
              strokeWidth="2.5"
            />
            {/* Brain folds/lobes detail */}
            <path
              d="M-5,0 Q-10,5 -8,12 M5,0 Q10,5 8,12 M0,8 Q-3,15 0,20 M0,8 Q3,15 0,20"
              stroke="#14b8a6"
              strokeWidth="2"
              fill="none"
              opacity="0.6"
            />
            
            {/* Circuit pathways - MORE DETAIL */}
            <g className={animated ? "animate-circuit-pulse" : ""}>
              {/* Left hemisphere nodes */}
              <circle cx="-12" cy="8" r="3" fill="#f0f9ff" stroke="#e0f2fe" strokeWidth="1.5" className={animated ? "animate-pulse" : ""} />
              <circle cx="-10" cy="18" r="2.5" fill="#f0f9ff" stroke="#e0f2fe" strokeWidth="1" className={animated ? "animate-pulse delay-300" : ""} />
              <circle cx="-6" cy="12" r="2" fill="#f0f9ff" stroke="#e0f2fe" strokeWidth="1" />
              
              {/* Right hemisphere nodes */}
              <circle cx="12" cy="8" r="3" fill="#f0f9ff" stroke="#e0f2fe" strokeWidth="1.5" className={animated ? "animate-pulse delay-300" : ""} />
              <circle cx="10" cy="18" r="2.5" fill="#f0f9ff" stroke="#e0f2fe" strokeWidth="1" className={animated ? "animate-pulse delay-600" : ""} />
              <circle cx="6" cy="12" r="2" fill="#f0f9ff" stroke="#e0f2fe" strokeWidth="1" />
              
              {/* Central node */}
              <circle cx="0" cy="22" r="3.5" fill="#f0f9ff" stroke="#e0f2fe" strokeWidth="1.5" className={animated ? "animate-pulse delay-600" : ""} />
              
              {/* Circuit connections */}
              <path d="M-12,8 L-6,12 L0,22" stroke="#f0f9ff" strokeWidth="2" opacity="0.8" />
              <path d="M12,8 L6,12 L0,22" stroke="#f0f9ff" strokeWidth="2" opacity="0.8" />
              <path d="M-10,18 L0,22 L10,18" stroke="#f0f9ff" strokeWidth="2" opacity="0.7" />
              <path d="M-12,8 L12,8" stroke="#f0f9ff" strokeWidth="1.5" opacity="0.5" strokeDasharray="3,2" />
            </g>
          </g>

          {/* Bottom Right: Compliance Shield (Teal) - MORE DETAILED shield */}
          <g transform="translate(300, 320)" className={animated ? "animate-shield-pulse" : ""}>
            {/* Shield shape - Better proportions */}
            <path
              d="M0,-32 L-28,-22 L-28,8 Q-28,20 -20,28 Q-10,34 0,38 Q10,34 20,28 Q28,20 28,8 L28,-22 Z"
              fill="url(#teal-gradient)"
              stroke="#0d9488"
              strokeWidth="3"
              filter="url(#shield-glow)"
            />
            {/* Shield border detail */}
            <path
              d="M0,-28 L-24,-20 L-24,8 Q-24,18 -17,25 Q-9,30 0,33 Q9,30 17,25 Q24,18 24,8 L24,-20 Z"
              fill="none"
              stroke="#14b8a6"
              strokeWidth="1.5"
              opacity="0.6"
            />
            {/* Center highlight */}
            <ellipse
              cx="0"
              cy="5"
              rx="18"
              ry="22"
              fill="#14b8a6"
              opacity="0.3"
            />
            
            {/* Large checkmark - MORE VISIBLE */}
            <path
              d="M-12,3 L-4,13 L15,-10"
              stroke="#f0f9ff"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            {/* Checkmark shadow for depth */}
            <path
              d="M-12,3 L-4,13 L15,-10"
              stroke="#e0f2fe"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity="0.7"
            />
          </g>

          {/* Connection Lines */}
          <g stroke="#0d9488" strokeWidth="2" opacity="0.3" className={animated ? "animate-pulse-slow" : ""}>
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
