import { cn } from "@/lib/utils";

interface AnimatedBootupLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizes = {
  sm: "w-16 h-16 text-2xl",
  md: "w-24 h-24 text-3xl",
  lg: "w-32 h-32 text-4xl",
  xl: "w-40 h-40 text-5xl",
};

export function AnimatedBootupLogo({ size = "lg", className }: AnimatedBootupLogoProps) {
  return (
    <div className={cn("animated-bootup-container", sizes[size], className)}>
      <style>{`
        @keyframes boxGlow {
          0%, 100% {
            box-shadow: 0 0 5px rgba(59, 130, 246, 0.3),
                        0 0 10px rgba(59, 130, 246, 0.2),
                        0 0 15px rgba(59, 130, 246, 0.1);
          }
          50% {
            box-shadow: 0 0 10px rgba(59, 130, 246, 0.5),
                        0 0 20px rgba(59, 130, 246, 0.3),
                        0 0 30px rgba(59, 130, 246, 0.2);
          }
        }

        @keyframes boxBoot {
          0% {
            transform: scale(0.8);
            opacity: 0;
            border-color: rgba(59, 130, 246, 0.2);
          }
          50% {
            transform: scale(1.05);
            opacity: 1;
            border-color: rgba(59, 130, 246, 0.8);
          }
          100% {
            transform: scale(1);
            opacity: 1;
            border-color: rgba(59, 130, 246, 0.6);
          }
        }

        @keyframes textActivate {
          0% {
            opacity: 0;
            transform: scale(0.5);
            color: rgba(59, 130, 246, 0.3);
          }
          60% {
            opacity: 0;
            transform: scale(0.5);
          }
          80% {
            opacity: 1;
            transform: scale(1.2);
            color: rgba(59, 130, 246, 1);
            text-shadow: 0 0 20px rgba(59, 130, 246, 0.8);
          }
          100% {
            opacity: 1;
            transform: scale(1);
            color: rgba(59, 130, 246, 0.9);
            text-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
          }
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.7;
          }
        }

        .animated-bootup-container {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .animated-bootup-box {
          position: relative;
          width: 100%;
          height: 100%;
          border: 3px solid rgba(59, 130, 246, 0.6);
          border-radius: 12px;
          background: linear-gradient(135deg, 
            rgba(15, 23, 42, 0.9) 0%, 
            rgba(30, 41, 59, 0.8) 50%, 
            rgba(15, 23, 42, 0.9) 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          animation: boxBoot 1.5s ease-out, boxGlow 2s ease-in-out infinite;
          animation-delay: 0s, 1.5s;
          backdrop-filter: blur(10px);
        }

        .animated-bootup-text {
          font-family: 'Inter', 'Segoe UI', -apple-system, sans-serif;
          font-weight: 900;
          letter-spacing: -0.05em;
          background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 50%, #3b82f6 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: textActivate 2s ease-out, pulse 2s ease-in-out infinite;
          animation-delay: 0s, 2s;
          user-select: none;
        }

        .animated-bootup-corner {
          position: absolute;
          width: 8px;
          height: 8px;
          background: rgba(59, 130, 246, 0.8);
          animation: pulse 1.5s ease-in-out infinite;
        }

        .corner-tl {
          top: -4px;
          left: -4px;
          border-radius: 2px 0 0 0;
        }

        .corner-tr {
          top: -4px;
          right: -4px;
          border-radius: 0 2px 0 0;
          animation-delay: 0.2s;
        }

        .corner-bl {
          bottom: -4px;
          left: -4px;
          border-radius: 0 0 0 2px;
          animation-delay: 0.4s;
        }

        .corner-br {
          bottom: -4px;
          right: -4px;
          border-radius: 0 0 2px 0;
          animation-delay: 0.6s;
        }
      `}</style>
      <div className="animated-bootup-box">
        <div className="animated-bootup-corner corner-tl"></div>
        <div className="animated-bootup-corner corner-tr"></div>
        <div className="animated-bootup-corner corner-bl"></div>
        <div className="animated-bootup-corner corner-br"></div>
        <span className="animated-bootup-text">AF</span>
      </div>
    </div>
  );
}
