import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { LucideIcon } from "lucide-react";

interface AutomationToggleProps {
  icon: LucideIcon;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
  disabled?: boolean;
}

export function AutomationToggle({
  icon: Icon,
  title,
  description,
  enabled,
  onToggle,
  badge,
  badgeVariant = "secondary",
  disabled = false,
}: AutomationToggleProps) {
  const testId = `toggle-${title.toLowerCase().replace(/\s+/g, '-')}`;
  
  return (
    <div className="flex items-center justify-between gap-3 p-4 border rounded-lg">
      <div className="flex items-start gap-3">
        <Icon className="h-5 w-5 text-muted-foreground mt-0.5" />
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Label htmlFor={testId} className="font-medium cursor-pointer">
              {title}
            </Label>
            {badge && (
              <Badge variant={badgeVariant} className="text-xs">
                {badge}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch
        id={testId}
        checked={enabled}
        onCheckedChange={onToggle}
        disabled={disabled}
        data-testid={testId}
      />
    </div>
  );
}
