import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LucideIcon, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";

interface MetricTileProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  subtitle?: string;
  trend?: {
    value: string;
    positive?: boolean;
  };
  sparkline?: number[];
  href?: string;
  onClick?: () => void;
}

export function MetricTile({ title, value, icon: Icon, subtitle, trend, sparkline, href, onClick }: MetricTileProps) {
  const isClickable = !!(href || onClick);
  const sparkData = sparkline?.map((v, i) => ({ i, v }));

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
          <div className="flex items-center gap-1 mt-1">
            <span className={`text-xs font-medium ${trend.positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {trend.positive ? '▲' : '▼'} {trend.value}
            </span>
          </div>
        )}
        {sparkData && sparkData.length > 1 && (
          <div className="mt-2 h-10 w-full" data-testid="sparkline-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData}>
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={trend?.positive === false ? '#dc2626' : '#2563EB'}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div style={{ background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', fontSize: 10 }}>
                        ${payload[0].value?.toLocaleString()}
                      </div>
                    );
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
  
  if (href) {
    return <Link href={href} className="block self-start">{content}</Link>;
  }
  
  return content;
}
