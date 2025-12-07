import { useState, useEffect, useMemo } from "react";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  Sparkles, 
  ExternalLink, 
  Check, 
  Zap, 
  Shield, 
  TrendingUp, 
  MessageCircle,
  Wrench,
  Activity,
  HeadphonesIcon,
  Brain,
  AlertTriangle,
  Rocket,
  Users,
  Settings
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";

type UpdateCategory = 
  | 'feature' 
  | 'improvement' 
  | 'bugfix' 
  | 'security' 
  | 'announcement'
  | 'maintenance'
  | 'diagnostic'
  | 'support'
  | 'ai_brain'
  | 'error';

type TabGroup = 'features' | 'enduser' | 'system';

interface PlatformUpdate {
  id: string;
  title: string;
  description: string;
  date: string;
  category: UpdateCategory;
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

const categoryToTabGroup: Record<UpdateCategory, TabGroup> = {
  feature: 'features',
  improvement: 'features',
  bugfix: 'enduser',
  security: 'enduser',
  announcement: 'enduser',
  maintenance: 'system',
  diagnostic: 'system',
  support: 'system',
  ai_brain: 'system',
  error: 'system',
};

const tabLabels: Record<TabGroup, { label: string; icon: typeof Rocket }> = {
  features: { label: 'Features', icon: Rocket },
  enduser: { label: 'Updates', icon: Users },
  system: { label: 'System', icon: Settings },
};

export function WhatsNewBadge() {
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<TabGroup>('features');
  
  const [timestampTick, setTimestampTick] = useState(0);
  
  useEffect(() => {
    const intervalId = setInterval(() => {
      setTimestampTick(prev => prev + 1);
    }, 60000);
    
    return () => clearInterval(intervalId);
  }, []);
  
  useEffect(() => {
    const handlePlatformUpdate = (event: CustomEvent) => {
      console.log('[WhatsNew] Platform update received via WebSocket:', event.detail);
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
  
  const acknowledgedIds = new Set(JSON.parse(localStorage.getItem('whats-new-acknowledged') || '[]'));
  const filteredUpdates = updates.filter(u => !acknowledgedIds.has(u.id));
  
  const unviewedCount = unviewedData?.count ?? 0;
  const hasNewUpdates = unviewedCount > 0;

  const updatesByTab = useMemo(() => {
    const grouped: Record<TabGroup, PlatformUpdate[]> = {
      features: [],
      enduser: [],
      system: [],
    };
    
    filteredUpdates.forEach(update => {
      const tabGroup = categoryToTabGroup[update.category] || 'enduser';
      grouped[tabGroup].push(update);
    });
    
    return grouped;
  }, [filteredUpdates]);

  const unviewedByTab = useMemo(() => {
    const counts: Record<TabGroup, number> = {
      features: 0,
      enduser: 0,
      system: 0,
    };
    
    filteredUpdates.forEach(update => {
      if (!update.hasViewed) {
        const tabGroup = categoryToTabGroup[update.category] || 'enduser';
        counts[tabGroup]++;
      }
    });
    
    return counts;
  }, [filteredUpdates]);

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
        const acknowledged = JSON.parse(localStorage.getItem('whats-new-acknowledged') || '[]');
        idsToAcknowledge.forEach(id => {
          if (!acknowledged.includes(id)) acknowledged.push(id);
        });
        localStorage.setItem('whats-new-acknowledged', JSON.stringify(acknowledged));
        return data;
      } catch (error) {
        console.error('[WhatsNew] API error:', error);
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
      setTimeout(() => {
        refetchUpdates();
        refetchUnviewed();
      }, 100);
    },
    onError: (error) => {
      console.error('[WhatsNew] Error acknowledging updates:', error);
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

  const toggleSelectAllInTab = () => {
    const tabUpdates = updatesByTab[activeTab];
    const unviewedInTab = tabUpdates.filter(u => !u.hasViewed);
    const allSelected = unviewedInTab.every(u => selectedIds.has(u.id));
    
    const newSelected = new Set(selectedIds);
    if (allSelected) {
      unviewedInTab.forEach(u => newSelected.delete(u.id));
    } else {
      unviewedInTab.forEach(u => newSelected.add(u.id));
    }
    setSelectedIds(newSelected);
  };

  const getCategoryIcon = (category: UpdateCategory) => {
    switch (category) {
      case 'feature': return <Sparkles className="h-3 w-3" />;
      case 'improvement': return <TrendingUp className="h-3 w-3" />;
      case 'bugfix': return <Zap className="h-3 w-3" />;
      case 'security': return <Shield className="h-3 w-3" />;
      case 'announcement': return <MessageCircle className="h-3 w-3" />;
      case 'maintenance': return <Wrench className="h-3 w-3" />;
      case 'diagnostic': return <Activity className="h-3 w-3" />;
      case 'support': return <HeadphonesIcon className="h-3 w-3" />;
      case 'ai_brain': return <Brain className="h-3 w-3" />;
      case 'error': return <AlertTriangle className="h-3 w-3" />;
      default: return <Sparkles className="h-3 w-3" />;
    }
  };

  const getCategoryColor = (category: UpdateCategory) => {
    switch (category) {
      case 'feature':
        return 'bg-blue-500/10 text-blue-700 dark:text-blue-400';
      case 'improvement':
        return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
      case 'bugfix':
        return 'bg-orange-500/10 text-orange-700 dark:text-orange-400';
      case 'security':
        return 'bg-red-500/10 text-red-700 dark:text-red-400';
      case 'announcement':
        return 'bg-purple-500/10 text-purple-700 dark:text-purple-400';
      case 'maintenance':
        return 'bg-amber-500/10 text-amber-700 dark:text-amber-400';
      case 'diagnostic':
        return 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400';
      case 'support':
        return 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400';
      case 'ai_brain':
        return 'bg-violet-500/10 text-violet-700 dark:text-violet-400';
      case 'error':
        return 'bg-rose-500/10 text-rose-700 dark:text-rose-400';
      default:
        return 'bg-muted/10 text-muted-foreground';
    }
  };

  const getCategoryLabel = (category: UpdateCategory): string => {
    switch (category) {
      case 'feature': return 'New Feature';
      case 'improvement': return 'Improvement';
      case 'bugfix': return 'Bug Fix';
      case 'security': return 'Security';
      case 'announcement': return 'Announcement';
      case 'maintenance': return 'Maintenance';
      case 'diagnostic': return 'Diagnostic';
      case 'support': return 'Support';
      case 'ai_brain': return 'AI Brain';
      case 'error': return 'Error';
      default: return category;
    }
  };

  const sparkles = [
    { top: "-6px", right: "0px", delay: "0s" },
    { top: "2px", right: "-6px", delay: "0.3s" },
    { bottom: "-5px", right: "2px", delay: "0.6s" },
    { top: "0px", left: "-6px", delay: "0.9s" },
  ];

  const currentTabUpdates = updatesByTab[activeTab];
  const unviewedInCurrentTab = currentTabUpdates.filter(u => !u.hasViewed);
  const allUnviewedSelectedInTab = unviewedInCurrentTab.length > 0 && 
    unviewedInCurrentTab.every(u => selectedIds.has(u.id));

  const renderUpdateItem = (update: PlatformUpdate) => (
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
                  {getCategoryLabel(update.category)}
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
  );

  const renderEmptyState = (tab: TabGroup) => {
    const messages: Record<TabGroup, { title: string; description: string }> = {
      features: { 
        title: 'No new features', 
        description: 'Check back later for exciting updates' 
      },
      enduser: { 
        title: 'No user updates', 
        description: 'All caught up with user-facing changes' 
      },
      system: { 
        title: 'No system messages', 
        description: 'All systems running smoothly' 
      },
    };
    
    const { title, description } = messages[tab];
    const TabIcon = tabLabels[tab].icon;
    
    return (
      <div className="p-8 text-center">
        <TabIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
    );
  };

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
      <PopoverContent className="w-[calc(100vw-2rem)] sm:w-96 max-h-[85vh] sm:max-h-[600px] p-0" align="start" side="right" sideOffset={8}>
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
        
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabGroup)} className="w-full">
          <TabsList className="w-full grid grid-cols-3 h-10 rounded-none border-b bg-transparent p-0">
            {(Object.keys(tabLabels) as TabGroup[]).map((tab) => {
              const { label, icon: TabIcon } = tabLabels[tab];
              const count = unviewedByTab[tab];
              return (
                <TabsTrigger 
                  key={tab}
                  value={tab}
                  className="relative rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none flex items-center gap-1.5 text-xs"
                  data-testid={`tab-${tab}`}
                >
                  <TabIcon className="h-3.5 w-3.5" />
                  <span>{label}</span>
                  {count > 0 && (
                    <span className="ml-1 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
                      {count > 9 ? '9+' : count}
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
          
          {(Object.keys(tabLabels) as TabGroup[]).map((tab) => (
            <TabsContent key={tab} value={tab} className="mt-0">
              {unviewedByTab[tab] > 0 && activeTab === tab && (
                <div className="p-3 flex items-center gap-2 border-b">
                  <button
                    onClick={toggleSelectAllInTab}
                    className="flex items-center justify-center w-5 h-5 rounded border border-gray-300 dark:border-gray-600"
                    data-testid={`button-select-all-${tab}`}
                  >
                    {allUnviewedSelectedInTab && <Check className="h-3 w-3" />}
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {selectedIds.size === 0 ? 'Select to acknowledge' : `${[...selectedIds].filter(id => updatesByTab[tab].some(u => u.id === id)).length}/${unviewedByTab[tab]} selected`}
                  </span>
                </div>
              )}
              
              <ScrollArea className="h-[35vh] sm:h-[350px]">
                {updatesByTab[tab].length === 0 ? (
                  renderEmptyState(tab)
                ) : (
                  <div className="divide-y">
                    {updatesByTab[tab].map(renderUpdateItem)}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          ))}
        </Tabs>
        
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
