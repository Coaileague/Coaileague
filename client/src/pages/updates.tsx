import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Zap, Shield, TrendingUp, MessageCircle, Calendar, Clock, ArrowRightLeft, Repeat, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";

interface Update {
  id: string;
  title: string;
  description: string;
  date: string;
  category: "feature" | "improvement" | "bugfix" | "security" | "announcement";
  badge?: string;
  version?: string;
  isNew?: boolean;
}

export default function Updates() {
  const { data, isLoading, error } = useQuery<{ success: boolean; updates: Update[] }>({
    queryKey: ['/api/whats-new'],
  });

  const updates = data?.updates || [];

  const getCategoryIcon = (category: Update["category"]) => {
    switch (category) {
      case "feature": return <Sparkles className="h-4 w-4" />;
      case "improvement": return <TrendingUp className="h-4 w-4" />;
      case "bugfix": return <Zap className="h-4 w-4" />;
      case "security": return <Shield className="h-4 w-4" />;
      case "announcement": return <MessageCircle className="h-4 w-4" />;
    }
  };

  const getCategoryColor = (category: Update["category"]) => {
    switch (category) {
      case "feature": return "bg-blue-500/10 text-blue-500";
      case "improvement": return "bg-muted/10 text-blue-500";
      case "bugfix": return "bg-orange-500/10 text-orange-500";
      case "security": return "bg-red-500/10 text-red-500";
      case "announcement": return "bg-purple-500/10 text-purple-500";
    }
  };

  const getFeatureIcon = (title: string) => {
    if (title.toLowerCase().includes('sms')) return <MessageCircle className="h-5 w-5 text-blue-500" />;
    if (title.toLowerCase().includes('calendar')) return <Calendar className="h-5 w-5 text-green-500" />;
    if (title.toLowerCase().includes('timesheet')) return <Clock className="h-5 w-5 text-orange-500" />;
    if (title.toLowerCase().includes('swap')) return <ArrowRightLeft className="h-5 w-5 text-purple-500" />;
    if (title.toLowerCase().includes('recurring')) return <Repeat className="h-5 w-5 text-cyan-500" />;
    return null;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 sm:p-6 max-w-6xl">
        <PageHeader
          title="Product Updates"
          description="Latest features, improvements, and announcements"
          align="center"
        />
        <div className="mt-6 space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-4 sm:p-6 max-w-6xl">
        <PageHeader
          title="Product Updates"
          description="Latest features, improvements, and announcements"
          align="center"
        />
        <Card className="mt-6">
          <CardContent className="flex items-center gap-3 p-6">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <span className="text-muted-foreground">Unable to load updates. Please try again later.</span>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-6xl">
      <PageHeader
        title="Product Updates"
        description="Latest features, improvements, and announcements"
        align="center"
      />

      <div className="mt-6 space-y-4">
        {updates.map((update) => (
          <Card key={update.id} data-testid={`card-update-${update.id}`}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    {getFeatureIcon(update.title)}
                    <CardTitle className="text-lg" data-testid={`title-update-${update.id}`}>{update.title}</CardTitle>
                    {update.badge && (
                      <Badge variant="default" className="bg-primary" data-testid={`badge-update-${update.id}`}>
                        {update.badge}
                      </Badge>
                    )}
                    {update.version && (
                      <Badge variant="outline" className="text-xs">
                        v{update.version}
                      </Badge>
                    )}
                  </div>
                  <CardDescription data-testid={`desc-update-${update.id}`}>{update.description}</CardDescription>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge className={getCategoryColor(update.category)} data-testid={`category-update-${update.id}`}>
                    <span className="flex items-center gap-1">
                      {getCategoryIcon(update.category)}
                      {update.category.charAt(0).toUpperCase() + update.category.slice(1)}
                    </span>
                  </Badge>
                  <span className="text-xs text-muted-foreground" data-testid={`date-update-${update.id}`}>
                    {format(new Date(update.date), "MMM d, yyyy")}
                  </span>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}

        {updates.length === 0 && (
          <Card>
            <CardContent className="text-center py-8">
              <p className="text-muted-foreground">No updates available at this time.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
