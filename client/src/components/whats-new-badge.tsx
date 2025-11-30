import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sparkles, ExternalLink, Check, Zap, Shield, TrendingUp, MessageCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";

interface PlatformUpdate {
  id: string;
  title: string;
  description: string;
  date: string;
  category: 'feature' | 'improvement' | 'bugfix' | 'security' | 'announcement';
  badge?: string;
  version?: string;
  learnMoreUrl?: string;
  isNew?: boolean;
  hasViewed?: boolean;
}

interface UpdatesResponse {
  success: boolean;
  updates: PlatformUpdate[];
  count: number;
}

interface UnviewedCountResponse {
  success: boolean;
  count: number;
}

export function WhatsNewBadge() {
  const [open, setOpen] = useState(false);

  const { data: updatesData } = useQuery<UpdatesResponse>({
    queryKey: ['/api/whats-new/latest'],
    staleTime: 60000,
  });

  const { data: unviewedData } = useQuery<UnviewedCountResponse>({
    queryKey: ['/api/whats-new/unviewed-count'],
    staleTime: 30000,
  });

  const updates = updatesData?.updates || [];
  const unviewedCount = unviewedData?.count || 0;

  const markViewedMutation = useMutation({
    mutationFn: async (updateId: string) => {
      await apiRequest('POST', `/api/whats-new/${updateId}/viewed`, { source: 'badge' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/whats-new'] });
      queryClient.invalidateQueries({ queryKey: ['/api/whats-new/latest'] });
      queryClient.invalidateQueries({ queryKey: ['/api/whats-new/unviewed-count'] });
    },
  });

  const markAllViewedMutation = useMutation({
    mutationFn: async () => {
      for (const update of updates.filter(u => !u.hasViewed)) {
        await apiRequest('POST', `/api/whats-new/${update.id}/viewed`, { source: 'badge-clear-all' });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/whats-new'] });
      queryClient.invalidateQueries({ queryKey: ['/api/whats-new/latest'] });
      queryClient.invalidateQueries({ queryKey: ['/api/whats-new/unviewed-count'] });
      setOpen(false);
    },
  });

  const handleMarkViewed = (updateId: string) => {
    markViewedMutation.mutate(updateId);
  };

  const handleClearAll = () => {
    markAllViewedMutation.mutate();
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'feature': return <Sparkles className="h-3 w-3" />;
      case 'improvement': return <TrendingUp className="h-3 w-3" />;
      case 'bugfix': return <Zap className="h-3 w-3" />;
      case 'security': return <Shield className="h-3 w-3" />;
      case 'announcement': return <MessageCircle className="h-3 w-3" />;
      default: return <Sparkles className="h-3 w-3" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'feature':
        return 'bg-blue-500/10 text-blue-700 dark:text-blue-400';
      case 'improvement':
        return 'bg-muted/10 text-muted-foreground';
      case 'bugfix':
        return 'bg-orange-500/10 text-orange-700 dark:text-orange-400';
      case 'security':
        return 'bg-red-500/10 text-red-700 dark:text-red-400';
      case 'announcement':
        return 'bg-purple-500/10 text-purple-700 dark:text-purple-400';
      default:
        return 'bg-muted/10 text-muted-foreground';
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon"
          className="relative h-9 w-9 hover:bg-white/10"
          data-testid="button-whats-new"
          title="What's New"
        >
          <div className="relative">
            <Sparkles className="h-4 w-4 animate-sparkles-combined" />
            {unviewedCount > 0 && (
              <span className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white flex items-center justify-center text-[10px] font-bold animate-badge-glow">
                {unviewedCount > 9 ? '9+' : unviewedCount}
              </span>
            )}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start" side="right" sideOffset={8}>
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            <h3 className="font-semibold">What's New</h3>
          </div>
          {unviewedCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={handleClearAll}
              disabled={markAllViewedMutation.isPending}
              data-testid="button-clear-all-updates"
            >
              <Check className="h-3 w-3 mr-1" />
              Mark All Read
            </Button>
          )}
        </div>
        <Separator />
        <ScrollArea className="h-[400px]">
          {updates.length === 0 ? (
            <div className="p-8 text-center">
              <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No new updates
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {updates.map((update) => (
                <div 
                  key={update.id} 
                  className={`p-4 space-y-2 relative group cursor-pointer hover-elevate ${!update.hasViewed ? 'bg-primary/5' : ''}`}
                  onClick={() => !update.hasViewed && handleMarkViewed(update.id)}
                  data-testid={`update-${update.id}`}
                >
                  {!update.hasViewed && (
                    <div className="absolute top-4 right-4 h-2 w-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500" />
                  )}
                  <div className="flex items-start justify-between gap-2 pr-6">
                    <h4 className="font-medium text-sm">{update.title}</h4>
                    {update.badge && (
                      <Badge variant="default" className="text-xs bg-primary">
                        {update.badge}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {update.description}
                  </p>
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className={`text-xs ${getCategoryColor(update.category)}`}
                      >
                        <span className="flex items-center gap-1">
                          {getCategoryIcon(update.category)}
                          {update.category}
                        </span>
                      </Badge>
                      {update.version && (
                        <span className="text-xs text-muted-foreground">v{update.version}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(update.date), { addSuffix: true })}
                    </p>
                  </div>
                  {update.learnMoreUrl && (
                    <a
                      href={update.learnMoreUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1 pt-1"
                      onClick={(e) => e.stopPropagation()}
                      data-testid={`link-learn-more-${update.id}`}
                    >
                      Learn more
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        <Separator />
        <div className="p-3">
          <Link href="/updates">
            <Button variant="outline" size="sm" className="w-full" data-testid="button-view-all-updates">
              View All Updates
            </Button>
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
