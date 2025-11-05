import { cn } from "@/lib/utils";

interface NeuralALogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  showText?: boolean;
}

const sizes = {
  sm: "w-12 h-12",
  md: "w-16 h-16",
  lg: "w-24 h-24",
  xl: "w-32 h-32",
};

export function NeuralALogo({ size = "md", className, showText = false }: NeuralALogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className={cn("neural-a-icon relative", sizes[size])}>
        <style>{`
          @keyframes pulse-primary {
            0%, 100% { 
              filter: drop-shadow(0 0 10px hsl(var(--primary)));
              opacity: 1;
            }
            50% { 
              filter: drop-shadow(0 0 20px hsl(var(--primary)));
              opacity: 0.9;
            }
          }

          @keyframes trace-glow {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 0.6; }
          }

          .neural-a-icon svg {
            width: 100%;
            height: 100%;
            overflow: visible;
          }

          .neural-trace {
            fill: none;
            stroke: hsl(var(--muted-foreground));
            stroke-width: 2;
            opacity: 0.4;
            animation: trace-glow 3s infinite ease-in-out;
          }

          .neural-trace:nth-child(2) { animation-delay: 0.5s; }
          .neural-trace:nth-child(3) { animation-delay: 1s; }
          .neural-trace:nth-child(4) { animation-delay: 1.5s; }

          .main-neural-a {
            fill: none;
            stroke: hsl(var(--primary));
            stroke-width: 6;
            stroke-linecap: round;
            stroke-linejoin: round;
            filter: drop-shadow(0 0 10px hsl(var(--primary)));
            animation: pulse-primary 2s infinite ease-in-out;
          }

          .neural-node {
            fill: hsl(var(--primary));
            filter: drop-shadow(0 0 8px hsl(var(--primary)));
            animation: pulse-primary 2s infinite ease-in-out;
          }
        `}</style>
        <svg viewBox="0 0 100 100" className="neural-a-svg">
          {/* Neural network traces (background connections) */}
          <path className="neural-trace" d="M 20,80 Q 30,50 50,20" />
          <path className="neural-trace" d="M 80,80 Q 70,50 50,20" />
          <path className="neural-trace" d="M 35,60 L 65,60" />
          <path className="neural-trace" d="M 25,75 Q 50,65 75,75" />
          
          {/* Main 'A' shape */}
          <path 
            className="main-neural-a"
            d="M 30,85 L 50,15 L 70,85 M 38,60 L 62,60"
          />
          
          {/* Neural nodes at key points */}
          <circle className="neural-node" cx="50" cy="15" r="3" />
          <circle className="neural-node" cx="30" cy="85" r="3" />
          <circle className="neural-node" cx="70" cy="85" r="3" />
          <circle className="neural-node" cx="38" cy="60" r="2.5" />
          <circle className="neural-node" cx="62" cy="60" r="2.5" />
        </svg>
      </div>
      {showText && (
        <div className="flex flex-col">
          <span className="text-lg font-bold tracking-tight text-foreground">
            Auto<span className="text-primary">Force</span>™
          </span>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
            AI-Powered
          </span>
        </div>
      )}
    </div>
  );
}
