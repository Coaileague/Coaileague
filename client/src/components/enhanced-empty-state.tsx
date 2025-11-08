import { Button } from "@/components/ui/button";
import { LucideIcon } from "lucide-react";
import { AutoForceLogo } from "@/components/autoforce-logo";

interface EnhancedEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  testId?: string;
  variant?: "default" | "purple" | "professional" | "blue";
  showLogo?: boolean;
}

export function EnhancedEmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  testId,
  variant = "professional",
  showLogo = true
}: EnhancedEmptyStateProps) {
  const variantStyles = {
    default: {
      gradient: "from-primary/20 via-primary/10 to-transparent",
      iconBg: "bg-primary/20",
      iconColor: "text-primary",
      glow: "shadow-primary/20",
    },
    purple: {
      gradient: "from-purple-500/20 via-purple-400/10 to-transparent",
      iconBg: "bg-purple-500/20",
      iconColor: "text-purple-400",
      glow: "shadow-purple-500/30",
    },
    professional: {
      gradient: "from-primary/20 via-accent/10 to-transparent",
      iconBg: "bg-muted/30/20",
      iconColor: "text-primary",
      glow: "shadow-primary/30",
    },
    blue: {
      gradient: "from-blue-500/20 via-blue-400/10 to-transparent",
      iconBg: "bg-blue-500/20",
      iconColor: "text-blue-400",
      glow: "shadow-blue-500/30",
    },
  };

  const styles = variantStyles[variant];

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-12 px-4">
      {/* WorkforceOS Logo */}
      {showLogo && (
        <div className="mb-4">
          <AutoForceLogo size="sm" variant="icon" animated={false} />
        </div>
      )}

      {/* Animated gradient background circle */}
      <div className={`relative w-32 h-32 bg-gradient-to-br ${styles.gradient} rounded-full animate-pulse`}>
        {/* Glow effect */}
        <div className={`absolute inset-0 rounded-full blur-xl ${styles.glow} shadow-2xl`} />
        
        {/* Icon container with layered effect */}
        <div className={`absolute inset-0 flex items-center justify-center`}>
          <div className={`p-6 rounded-2xl ${styles.iconBg} backdrop-blur-sm border border-white/10 shadow-lg`}>
            <Icon className={`h-12 w-12 ${styles.iconColor} drop-shadow-lg`} strokeWidth={1.5} />
          </div>
        </div>

        {/* Decorative rings */}
        <div className={`absolute inset-0 rounded-full border-2 ${styles.iconBg} border-dashed animate-spin`} style={{ animationDuration: '20s' }} />
        <div className={`absolute inset-2 rounded-full border ${styles.iconBg} border-dotted animate-spin`} style={{ animationDuration: '15s', animationDirection: 'reverse' }} />
      </div>

      {/* Content */}
      <div className="text-center space-y-2 max-w-md">
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
      </div>

      {/* Action button */}
      {actionLabel && onAction && (
        <Button 
          onClick={onAction}
          size="lg"
          className="shadow-lg hover:shadow-xl transition-all"
          data-testid={testId}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
