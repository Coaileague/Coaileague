import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LucideIcon, ChevronRight } from "lucide-react";
import { Link } from "wouter";

interface MetricTileProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  subtitle?: string;
  trend?: {
    value: string;
    positive?: boolean;
  };
  href?: string;
  onClick?: () => void;
}

export function MetricTile({ title, value, icon: Icon, subtitle, trend, href, onClick }: MetricTileProps) {
  const isClickable = !!(href || onClick);
  
  const content = (
    <Card className={`hover-elevate ${isClickable ? 'cursor-pointer active-elevate-2' : ''}`} onClick={onClick}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        <div className="flex items-center gap-1">
          <Icon className="h-4 w-4 text-primary" />
          {isClickable && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
        </div>
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
  
  if (href) {
    return <Link href={href} className="block">{content}</Link>;
  }
  
  return content;
}
