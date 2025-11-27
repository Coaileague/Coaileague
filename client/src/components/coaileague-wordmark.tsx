import { cn } from "@/lib/utils";

interface CoAIleagueWordmarkProps {
  variant?: "stability" | "integrated" | "efficiency";
  className?: string;
}

export function CoAIleagueWordmark({ variant = "stability", className }: CoAIleagueWordmarkProps) {
  if (variant === "stability") {
    return (
      <div className={cn("flex items-baseline font-inter", className)}>
        <span className="text-foreground dark:text-white font-extrabold tracking-tight" style={{ fontSize: '1em', letterSpacing: '-0.03em' }}>
          CoAIleague
        </span>
        <span className="text-primary font-extrabold tracking-tight" style={{ fontSize: '1em', letterSpacing: '-0.03em' }}>
          ™
        </span>
      </div>
    );
  }

  if (variant === "integrated") {
    return (
      <div className={cn("flex items-center font-inter", className)}>
        <span className="text-foreground dark:text-white font-black tracking-tight uppercase" style={{ fontSize: '1em', letterSpacing: '-0.02em' }}>
          COAILEAGUE
        </span>
        <span 
          className="bg-primary text-primary-foreground font-black rounded px-1.5 py-0.5 ml-1.5 inline-block"
          style={{ 
            fontSize: '0.4em',
            transform: 'translateY(-0.3em)'
          }}
        >
          ™
        </span>
      </div>
    );
  }

  // efficiency variant
  return (
    <div className={cn("flex items-baseline font-inter", className)}>
      <span className="text-foreground dark:text-white font-extralight tracking-widest uppercase" style={{ fontSize: '1em', letterSpacing: '0.08em' }}>
        COAILEAGUE
      </span>
      <span className="text-primary font-extralight tracking-widest uppercase" style={{ fontSize: '1em', letterSpacing: '0.08em' }}>
        ™
      </span>
    </div>
  );
}
