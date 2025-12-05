/**
 * UniversalAdminShell - Capability-Driven Admin Panel System
 * ============================================================
 * Consolidates admin page patterns into a single reusable shell that:
 * - Renders panels based on user capabilities
 * - Provides consistent layout and navigation
 * - Supports dynamic panel registration
 * - Handles loading and error states uniformly
 * 
 * Usage:
 * <UniversalAdminShell 
 *   panels={[
 *     { id: 'stats', capability: 'leader', render: () => <StatsPanel /> },
 *     { id: 'users', capability: 'platform_admin', render: () => <UsersPanel /> }
 *   ]}
 *   title="Admin Console"
 * />
 */

import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { RBACRoute, useRBAC, type RBACCapability } from "./rbac-route";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Shield, Settings, Users, Building2, DollarSign, 
  Activity, Server, AlertCircle, RefreshCw, ChevronRight,
  LayoutDashboard
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface AdminPanel {
  id: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  capability: RBACCapability | RBACCapability[];
  category?: 'overview' | 'management' | 'operations' | 'settings';
  badge?: string;
  render: (props: { isActive: boolean }) => React.ReactNode;
  priority?: number;
}

interface UniversalAdminShellProps {
  panels: AdminPanel[];
  title: string;
  subtitle?: string;
  defaultPanel?: string;
  minCapability?: RBACCapability;
  layout?: 'tabs' | 'sidebar' | 'cards';
  showHeader?: boolean;
  onPanelChange?: (panelId: string) => void;
  headerContent?: React.ReactNode;
  className?: string;
}

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  management: Users,
  operations: Server,
  settings: Settings
};

function PanelSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-1/3" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-48" />
    </div>
  );
}

export function UniversalAdminShell({
  panels,
  title,
  subtitle,
  defaultPanel,
  minCapability = 'authenticated',
  layout = 'tabs',
  showHeader = true,
  onPanelChange,
  headerContent,
  className = ""
}: UniversalAdminShellProps) {
  const { user, isLoading } = useAuth();
  const rbac = useRBAC();
  
  const accessiblePanels = useMemo(() => {
    return panels
      .filter(panel => {
        const caps = Array.isArray(panel.capability) ? panel.capability : [panel.capability];
        return rbac.hasAnyCapability(caps);
      })
      .sort((a, b) => (a.priority || 50) - (b.priority || 50));
  }, [panels, rbac]);
  
  const [activePanel, setActivePanel] = useState<string>(
    defaultPanel || accessiblePanels[0]?.id || ''
  );
  
  const handlePanelChange = (panelId: string) => {
    setActivePanel(panelId);
    onPanelChange?.(panelId);
  };
  
  const currentPanel = accessiblePanels.find(p => p.id === activePanel);
  
  const panelsByCategory = useMemo(() => {
    const grouped: Record<string, AdminPanel[]> = {};
    accessiblePanels.forEach(panel => {
      const category = panel.category || 'overview';
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(panel);
    });
    return grouped;
  }, [accessiblePanels]);
  
  return (
    <RBACRoute require={minCapability}>
      <div className={`min-h-full bg-background ${className}`}>
        {showHeader && (
          <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
            <div className="container mx-auto px-4 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Shield className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold tracking-tight" data-testid="admin-shell-title">
                      {title}
                    </h1>
                    {subtitle && (
                      <p className="text-sm text-muted-foreground">{subtitle}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {accessiblePanels.length > 0 && (
                    <Badge variant="secondary" data-testid="panel-count">
                      {accessiblePanels.length} panels
                    </Badge>
                  )}
                  {headerContent}
                </div>
              </div>
            </div>
          </header>
        )}
        
        {isLoading ? (
          <div className="container mx-auto px-4 py-6">
            <PanelSkeleton />
          </div>
        ) : accessiblePanels.length === 0 ? (
          <div className="container mx-auto px-4 py-12">
            <Card className="max-w-md mx-auto">
              <CardHeader className="text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-2">
                  <AlertCircle className="h-6 w-6 text-muted-foreground" />
                </div>
                <CardTitle>No Accessible Panels</CardTitle>
                <CardDescription>
                  You don't have access to any admin panels. Contact your administrator for access.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        ) : layout === 'tabs' ? (
          <div className="container mx-auto px-4 py-6">
            <Tabs value={activePanel} onValueChange={handlePanelChange}>
              <ScrollArea className="w-full whitespace-nowrap">
                <TabsList className="mb-4">
                  {accessiblePanels.map(panel => {
                    const Icon = panel.icon || LayoutDashboard;
                    return (
                      <TabsTrigger 
                        key={panel.id} 
                        value={panel.id}
                        data-testid={`tab-${panel.id}`}
                        className="gap-2"
                      >
                        <Icon className="h-4 w-4" />
                        {panel.title}
                        {panel.badge && (
                          <Badge variant="secondary" className="ml-1 text-xs">
                            {panel.badge}
                          </Badge>
                        )}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </ScrollArea>
              
              {accessiblePanels.map(panel => (
                <TabsContent key={panel.id} value={panel.id}>
                  {panel.render({ isActive: activePanel === panel.id })}
                </TabsContent>
              ))}
            </Tabs>
          </div>
        ) : layout === 'sidebar' ? (
          <div className="flex min-h-[calc(100vh-5rem)]">
            <aside className="w-64 border-r bg-card/50 p-4 hidden md:block">
              <nav className="space-y-2">
                {Object.entries(panelsByCategory).map(([category, categoryPanels]) => (
                  <div key={category} className="space-y-1">
                    <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {category}
                    </div>
                    {categoryPanels.map(panel => {
                      const Icon = panel.icon || CATEGORY_ICONS[category] || LayoutDashboard;
                      const isActive = activePanel === panel.id;
                      return (
                        <Button
                          key={panel.id}
                          variant={isActive ? "secondary" : "ghost"}
                          className="w-full justify-start gap-2"
                          onClick={() => handlePanelChange(panel.id)}
                          data-testid={`nav-${panel.id}`}
                        >
                          <Icon className="h-4 w-4" />
                          <span className="flex-1 text-left">{panel.title}</span>
                          {panel.badge && (
                            <Badge variant={isActive ? "default" : "secondary"} className="text-xs">
                              {panel.badge}
                            </Badge>
                          )}
                          {isActive && <ChevronRight className="h-4 w-4" />}
                        </Button>
                      );
                    })}
                  </div>
                ))}
              </nav>
            </aside>
            
            <main className="flex-1 p-6 overflow-auto">
              {currentPanel?.render({ isActive: true })}
            </main>
          </div>
        ) : (
          <div className="container mx-auto px-4 py-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {accessiblePanels.map(panel => {
                const Icon = panel.icon || LayoutDashboard;
                return (
                  <Card 
                    key={panel.id}
                    className="hover-elevate cursor-pointer transition-all"
                    onClick={() => handlePanelChange(panel.id)}
                    data-testid={`card-${panel.id}`}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <CardTitle className="text-base">{panel.title}</CardTitle>
                          {panel.description && (
                            <CardDescription className="text-xs">
                              {panel.description}
                            </CardDescription>
                          )}
                        </div>
                        {panel.badge && (
                          <Badge variant="secondary">{panel.badge}</Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Button variant="ghost" size="sm" className="w-full gap-2">
                        Open Panel
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            
            {activePanel && currentPanel && (
              <Card className="mt-6">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {currentPanel.icon && (
                        <currentPanel.icon className="h-5 w-5 text-primary" />
                      )}
                      <CardTitle>{currentPanel.title}</CardTitle>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setActivePanel('')}
                    >
                      Close
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {currentPanel.render({ isActive: true })}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </RBACRoute>
  );
}

export function useAdminPanels(panels: AdminPanel[]) {
  const rbac = useRBAC();
  
  return useMemo(() => ({
    accessible: panels.filter(panel => {
      const caps = Array.isArray(panel.capability) ? panel.capability : [panel.capability];
      return rbac.hasAnyCapability(caps);
    }),
    all: panels,
    byCategory: (category: string) => panels.filter(p => p.category === category),
    hasAccess: (panelId: string) => {
      const panel = panels.find(p => p.id === panelId);
      if (!panel) return false;
      const caps = Array.isArray(panel.capability) ? panel.capability : [panel.capability];
      return rbac.hasAnyCapability(caps);
    }
  }), [panels, rbac]);
}

export const COMMON_ADMIN_PANELS: AdminPanel[] = [
  {
    id: 'overview',
    title: 'Overview',
    description: 'Platform statistics and health',
    icon: Activity,
    capability: 'leader',
    category: 'overview',
    priority: 1,
    render: () => <div className="text-muted-foreground">Overview panel content</div>
  },
  {
    id: 'users',
    title: 'User Management',
    description: 'Manage platform users',
    icon: Users,
    capability: 'platform_admin',
    category: 'management',
    priority: 10,
    render: () => <div className="text-muted-foreground">User management panel content</div>
  },
  {
    id: 'workspaces',
    title: 'Workspaces',
    description: 'Manage organizations',
    icon: Building2,
    capability: 'platform_staff',
    category: 'management',
    priority: 11,
    render: () => <div className="text-muted-foreground">Workspace management panel content</div>
  },
  {
    id: 'billing',
    title: 'Billing',
    description: 'Platform billing and invoices',
    icon: DollarSign,
    capability: 'platform_admin',
    category: 'operations',
    priority: 20,
    render: () => <div className="text-muted-foreground">Billing panel content</div>
  },
  {
    id: 'system',
    title: 'System Health',
    description: 'Server and database status',
    icon: Server,
    capability: 'platform_staff',
    category: 'operations',
    priority: 21,
    render: () => <div className="text-muted-foreground">System health panel content</div>
  },
  {
    id: 'settings',
    title: 'Settings',
    description: 'Platform configuration',
    icon: Settings,
    capability: 'platform_admin',
    category: 'settings',
    priority: 30,
    render: () => <div className="text-muted-foreground">Settings panel content</div>
  }
];
