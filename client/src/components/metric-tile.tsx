import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface MetricTileProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  subtitle?: string;
  trend?: {
    value: string;
    positive?: boolean;
  };
}

export function MetricTile({ title, value, icon: Icon, subtitle, trend }: MetricTileProps) {
  return (
    <Card className="hover-elevate">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        <Icon className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="text-2xl font-semibold">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
        {trend && (
          <p className={`text-xs mt-1 ${trend.positive ? 'text-green-600' : 'text-red-600'}`}>
            {trend.value}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
