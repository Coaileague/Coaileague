import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { LucideIcon } from "lucide-react";

interface NotificationChannelProps {
  icon: LucideIcon;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
  status?: "connected" | "disconnected" | "pending";
  children?: React.ReactNode;
}

export function NotificationChannel({
  icon: Icon,
  title,
  description,
  enabled,
  onToggle,
  disabled = false,
  status,
  children,
}: NotificationChannelProps) {
  const testId = `channel-${title.toLowerCase().replace(/\s+/g, '-')}`;
  
  return (
    <div className="p-4 border rounded-lg space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <Icon className="h-5 w-5 text-muted-foreground mt-0.5" />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Label htmlFor={testId} className="font-medium cursor-pointer">
                {title}
              </Label>
              {status && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  status === 'connected' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                  status === 'pending' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                }`}>
                  {status}
                </span>
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
      {children && enabled && (
        <div className="pl-8 pt-2 border-t">
          {children}
        </div>
      )}
    </div>
  );
}
