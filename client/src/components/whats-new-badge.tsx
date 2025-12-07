import { useState, useEffect } from "react";
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Live timestamp ticker - forces re-render every 60s for fresh relative times
  const [timestampTick, setTimestampTick] = useState(0);
  
  useEffect(() => {
    const intervalId = setInterval(() => {
      setTimestampTick(prev => prev + 1);
    }, 60000); // Update every minute
    
    return () => clearInterval(intervalId);
  }, []);
  
  // Listen for WebSocket events for real-time updates
  useEffect(() => {
    const handlePlatformUpdate = (event: CustomEvent) => {
      console.log('[WhatsNew] Platform update received via WebSocket:', event.detail);
      // Invalidate all queries to fetch fresh data including combined notifications
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/combined'] });
      queryClient.invalidateQueries({ queryKey: ['/api/whats-new'] });
      queryClient.invalidateQueries({ queryKey: ['/api/whats-new/latest'] });
      queryClient.invalidateQueries({ queryKey: ['/api/whats-new/unviewed-count'] });
      queryClient.invalidateQueries({ queryKey: ['/api/whats-new/new-features'] });
    };
    
    const handleWhatsNewCleared = (event: CustomEvent) => {
      console.log('[WhatsNew] All cleared via WebSocket:', event.detail);
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/combined'] });
      queryClient.invalidateQueries({ queryKey: ['/api/whats-new'] });
      queryClient.invalidateQueries({ queryKey: ['/api/whats-new/latest'] });
      queryClient.invalidateQueries({ queryKey: ['/api/whats-new/unviewed-count'] });
      queryClient.invalidateQueries({ queryKey: ['/api/whats-new/new-features'] });
    };
    
    const handleWhatsNewViewed = (event: CustomEvent) => {
      console.log('[WhatsNew] Item viewed via WebSocket (cross-tab sync):', event.detail);
      // Sync view state across tabs by refetching
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/combined'] });
      queryClient.invalidateQueries({ queryKey: ['/api/whats-new'] });
      queryClient.invalidateQueries({ queryKey: ['/api/whats-new/latest'] });
      queryClient.invalidateQueries({ queryKey: ['/api/whats-new/unviewed-count'] });
      queryClient.invalidateQueries({ queryKey: ['/api/whats-new/new-features'] });
    };
    
    window.addEventListener('platform_update' as any, handlePlatformUpdate);
    window.addEventListener('whats_new_cleared' as any, handleWhatsNewCleared);
    window.addEventListener('whats_new_viewed' as any, handleWhatsNewViewed);
    
    return () => {
      window.removeEventListener('platform_update' as any, handlePlatformUpdate);
      window.removeEventListener('whats_new_cleared' as any, handleWhatsNewCleared);
      window.removeEventListener('whats_new_viewed' as any, handleWhatsNewViewed);
    };
  }, []);

  const { data: updatesData, refetch: refetchUpdates } = useQuery<UpdatesResponse>({
    queryKey: ['/api/whats-new/latest'],
    staleTime: 0,
  });

  const { data: unviewedData, refetch: refetchUnviewed } = useQuery<UnviewedCountResponse>({
    queryKey: ['/api/whats-new/unviewed-count'],
    staleTime: 0,
  });

  const updates = updatesData?.updates || [];
  
  // Filter out locally acknowledged items
  const acknowledgedIds = new Set(JSON.parse(localStorage.getItem('whats-new-acknowledged') || '[]'));
  const filteredUpdates = updates.filter(u => !acknowledgedIds.has(u.id));
  
  // Trust API count as single source of truth - no fallback logic
  const unviewedCount = unviewedData?.count ?? 0;
  const hasNewUpdates = unviewedCount > 0;

  const acknowledgeSelectedMutation = useMutation({
    mutationFn: async () => {
      const idsToAcknowledge = Array.from(selectedIds);
      if (idsToAcknowledge.length === 0) return { markedCount: 0 };
      
      console.log('[WhatsNew] Acknowledging IDs:', idsToAcknowledge);
      try {
        const response = await apiRequest('POST', '/api/whats-new/mark-all-viewed', { 
          updateIds: idsToAcknowledge, 
          source: 'badge-selection' 
        });
        const data = await response.json();
        console.log('[WhatsNew] Response:', data);
        // Store locally for anonymous users
        const acknowledged = JSON.parse(localStorage.getItem('whats-new-acknowledged') || '[]');
        idsToAcknowledge.forEach(id => {
          if (!acknowledged.includes(id)) acknowledged.push(id);
        });
        localStorage.setItem('whats-new-acknowledged', JSON.stringify(acknowledged));
        return data;
      } catch (error) {
        console.error('[WhatsNew] API error:', error);
        // Even if API fails, mark as acknowledged locally
        const acknowledged = JSON.parse(localStorage.getItem('whats-new-acknowledged') || '[]');
        idsToAcknowledge.forEach(id => {
          if (!acknowledged.includes(id)) acknowledged.push(id);
        });
        localStorage.setItem('whats-new-acknowledged', JSON.stringify(acknowledged));
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log('[WhatsNew] Success! Marked:', data);
      setSelectedIds(new Set());
      // Force refresh immediately
      setTimeout(() => {
        refetchUpdates();
        refetchUnviewed();
      }, 100);
    },
    onError: (error) => {
      console.error('[WhatsNew] Error acknowledging updates:', error);
      // Still clear selection and refresh even on error (localStorage should have saved)
      setSelectedIds(new Set());
      setTimeout(() => {
        refetchUpdates();
        refetchUnviewed();
      }, 100);
    }
  });

  const toggleSelectUpdate = (updateId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(updateId)) {
      newSelected.delete(updateId);
    } else {
      newSelected.add(updateId);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === updates.filter(u => !u.hasViewed).length) {
      setSelectedIds(new Set());
    } else {
      const unviewedIds = updates.filter(u => !u.hasViewed).map(u => u.id);
      setSelectedIds(new Set(unviewedIds));
    }
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

  const sparkles = [
    { top: "-6px", right: "0px", delay: "0s" },
    { top: "2px", right: "-6px", delay: "0.3s" },
    { bottom: "-5px", right: "2px", delay: "0.6s" },
    { top: "0px", left: "-6px", delay: "0.9s" },
  ];

  const unviewedUpdates = filteredUpdates.filter(u => !u.hasViewed);
  const allUnviewedSelected = unviewedUpdates.length > 0 && selectedIds.size === unviewedUpdates.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon"
          className="relative h-10 w-10"
          data-testid="button-whats-new"
          title="What's New"
        >
          <div className="relative inline-flex">
            <Sparkles 
              className={`h-4 w-4 relative z-10 transition-all ${hasNewUpdates ? "animate-star-spin-colors" : ""}`} 
              style={hasNewUpdates ? { willChange: 'transform, filter' } : undefined}
            />
            
            {hasNewUpdates && sparkles.map((sparkle, idx) => (
              <div
                key={idx}
                className="absolute pointer-events-none sparkle-star animate-star-spin-colors"
                style={{
                  top: sparkle.top,
                  right: sparkle.right,
                  bottom: sparkle.bottom,
                  left: sparkle.left,
                  animationDelay: sparkle.delay,
                  willChange: 'transform, filter, color',
                }}
              />
            ))}
            
            {hasNewUpdates && (
              <span className="absolute -top-2 -right-2 h-5 w-5 rounded-full text-white flex items-center justify-center text-[10px] font-bold animate-whatsnew-badge-glow"
                style={{
                  background: "linear-gradient(135deg, #06b6d4, #0891b2, #4ecdc4)",
                }}
              >
                {unviewedCount > 9 ? '9+' : unviewedCount}
              </span>
            )}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[calc(100vw-2rem)] sm:w-80 max-h-[85vh] sm:max-h-[600px] p-0" align="start" side="right" sideOffset={8}>
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            <h3 className="font-semibold">What's New</h3>
          </div>
          {selectedIds.size > 0 && (
            <Button
              variant="default"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => acknowledgeSelectedMutation.mutate()}
              disabled={acknowledgeSelectedMutation.isPending}
              data-testid="button-acknowledge-selected"
            >
              <Check className="h-3 w-3 mr-1" />
              Acknowledge ({selectedIds.size})
            </Button>
          )}
        </div>
        <Separator />
        
        {unviewedUpdates.length > 0 && (
          <>
            <div className="p-3 flex items-center gap-2 border-b">
              <button
                onClick={toggleSelectAll}
                className="flex items-center justify-center w-5 h-5 rounded border border-gray-300 dark:border-gray-600"
                data-testid="button-select-all"
              >
                {allUnviewedSelected && <Check className="h-3 w-3" />}
              </button>
              <span className="text-xs text-muted-foreground">
                {selectedIds.size === 0 ? 'Select to acknowledge' : `${selectedIds.size}/${unviewedUpdates.length} selected`}
              </span>
            </div>
          </>
        )}

        <ScrollArea className="h-[40vh] sm:h-[400px]">
          {filteredUpdates.length === 0 ? (
            <div className="p-8 text-center">
              <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No new updates
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredUpdates.map((update) => (
                <div 
                  key={update.id} 
                  className={`p-4 space-y-2 relative group ${!update.hasViewed ? 'bg-primary/5' : 'opacity-60'}`}
                  data-testid={`update-${update.id}`}
                >
                  {!update.hasViewed && (
                    <div className="absolute top-4 right-4 h-2 w-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500" />
                  )}
                  
                  <div className="flex items-start gap-3 pr-6">
                    {!update.hasViewed && (
                      <button
                        onClick={() => toggleSelectUpdate(update.id)}
                        className="flex items-center justify-center w-5 h-5 rounded border border-gray-300 dark:border-gray-600 mt-0.5 flex-shrink-0"
                        data-testid={`checkbox-${update.id}`}
                      >
                        {selectedIds.has(update.id) && <Check className="h-3 w-3" />}
                      </button>
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-medium text-sm">{update.title}</h4>
                        {update.badge && (
                          <Badge variant="default" className="text-xs bg-primary flex-shrink-0">
                            {update.badge}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {update.description}
                      </p>
                      <div className="flex items-center justify-between pt-2 gap-2">
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
                          className="text-xs text-primary hover:underline flex items-center gap-1 pt-2"
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`link-learn-more-${update.id}`}
                        >
                          Learn more
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
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
