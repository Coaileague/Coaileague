import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Zap, Shield, TrendingUp, MessageCircle, Calendar, Clock, ArrowRightLeft, Repeat, AlertCircle, Loader2, Bell } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { TrinityLogo } from "@/components/trinity-logo";

interface Update {
  id: string;
  title: string;
  description: string;
  date: string;
  category: string;
  badge?: string;
  version?: string;
  isNew?: boolean;
  priority?: number;
}

export default function Updates() {
  const { data, isLoading, error } = useQuery<{ success: boolean; updates: Update[] }>({
    queryKey: ['/api/whats-new'],
  });

  const updates = data?.updates || [];

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "feature": return <Sparkles className="h-3.5 w-3.5" />;
      case "improvement": return <TrendingUp className="h-3.5 w-3.5" />;
      case "bugfix": return <Zap className="h-3.5 w-3.5" />;
      case "security": return <Shield className="h-3.5 w-3.5" />;
      case "announcement": return <Bell className="h-3.5 w-3.5" />;
      default: return <Sparkles className="h-3.5 w-3.5" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "feature": return "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400";
      case "improvement": return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
      case "bugfix": return "bg-orange-500/10 text-orange-600 dark:text-orange-400";
      case "security": return "bg-red-500/10 text-red-600 dark:text-red-400";
      case "announcement": return "bg-purple-500/10 text-purple-600 dark:text-purple-400";
      default: return "bg-muted/20 text-muted-foreground";
    }
  };

  const getFeatureIcon = (title: string) => {
    const lower = title.toLowerCase();
    if (lower.includes('sms')) return <MessageCircle className="h-5 w-5 text-blue-500 dark:text-blue-400" />;
    if (lower.includes('calendar')) return <Calendar className="h-5 w-5 text-green-500 dark:text-green-400" />;
    if (lower.includes('timesheet')) return <Clock className="h-5 w-5 text-orange-500 dark:text-orange-400" />;
    if (lower.includes('swap')) return <ArrowRightLeft className="h-5 w-5 text-purple-500 dark:text-purple-400" />;
    if (lower.includes('recurring')) return <Repeat className="h-5 w-5 text-cyan-500 dark:text-cyan-400" />;
    if (lower.includes('compliance') || lower.includes('certification')) return <Shield className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />;
    if (lower.includes('database') || lower.includes('connection')) return <Zap className="h-5 w-5 text-amber-500 dark:text-amber-400" />;
    return null;
  };

  const safeFormatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return 'Recently';
      return formatDistanceToNow(d, { addSuffix: true });
    } catch {
      return 'Recently';
    }
  };

  const pageConfig: CanvasPageConfig = {
    id: "product-updates",
    title: "Product Updates",
    subtitle: "Latest features, improvements, and announcements",
    category: "dashboard",
    maxWidth: "4xl",
  };

  if (isLoading) {
    return (
      <CanvasHubPage config={pageConfig}>
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
          <span className="text-sm text-muted-foreground">Loading updates...</span>
        </div>
      </CanvasHubPage>
    );
  }

  if (error) {
    return (
      <CanvasHubPage config={pageConfig}>
        <Card>
          <CardContent className="flex items-center gap-3 p-6">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <span className="text-muted-foreground">Unable to load updates. Please try again later.</span>
          </CardContent>
        </Card>
      </CanvasHubPage>
    );
  }

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-3">
        {updates.map((update) => (
          <Card key={update.id} className="overflow-hidden" data-testid={`card-update-${update.id}`}>
            <div className="flex gap-3 sm:gap-4 p-4">
              <div className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-gradient-to-br from-cyan-500/15 to-blue-500/15 dark:from-cyan-400/20 dark:to-blue-400/20 ring-1 ring-cyan-500/20 dark:ring-cyan-400/25 mt-0.5">
                {getFeatureIcon(update.title) || <TrinityLogo size={22} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm sm:text-base leading-tight" data-testid={`title-update-${update.id}`}>
                      {update.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge className={`${getCategoryColor(update.category)} border-0`} data-testid={`category-update-${update.id}`}>
                        <span className="flex items-center gap-1">
                          {getCategoryIcon(update.category)}
                          {update.category.charAt(0).toUpperCase() + update.category.slice(1)}
                        </span>
                      </Badge>
                      {update.badge && (
                        <Badge variant="default" className="bg-primary" data-testid={`badge-update-${update.id}`}>
                          {update.badge}
                        </Badge>
                      )}
                      {update.isNew && (
                        <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0">
                          New
                        </Badge>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0" data-testid={`date-update-${update.id}`}>
                    {safeFormatDate(update.date)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed" data-testid={`desc-update-${update.id}`}>
                  {update.description}
                </p>
              </div>
            </div>
          </Card>
        ))}

        {updates.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
              <Sparkles className="h-8 w-8 opacity-40" />
            </div>
            <span className="text-sm font-medium">All caught up</span>
            <span className="text-xs mt-1">No updates available at this time.</span>
          </div>
        )}
      </div>
    </CanvasHubPage>
  );
}
