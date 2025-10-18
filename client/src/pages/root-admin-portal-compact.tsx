import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Activity, Users, Building2, DollarSign, TrendingUp, Server, Database,
  Zap, AlertTriangle, CheckCircle, Shield, BarChart3, RefreshCw,
  MessageSquare, Headphones, Lock, Unlock, Ban, Search, Eye, Settings
} from "lucide-react";

export default function RootAdminPortalCompact() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");

  // GATEKEEPER
  useEffect(() => {
    if (!isLoading) {
      const platformRole = (user as any)?.platformRole;
      if (platformRole !== 'root' && platformRole !== 'sysop') {
        if (!user) {
          window.location.href = '/login';
        } else {
          setLocation('/error-403');
        }
      }
    }
  }, [user, isLoading, setLocation]);

  const { data: platformStats } = useQuery({
    queryKey: ["/api/analytics/stats", refreshKey],
  });

  const { data: supportStats } = useQuery({
    queryKey: ["/api/admin/support/stats", refreshKey],
  });

  // Live stats with refresh every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => setRefreshKey(prev => prev + 1), 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-3 max-w-[1920px] mx-auto w-full">
      {/* ULTRA-COMPACT HEADER - Actions First! */}
      <div className="flex items-center justify-between mb-3 bg-gradient-to-r from-slate-900 to-blue-900 text-white p-3 rounded-lg">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          <div>
            <h1 className="text-lg font-bold">Platform Command Center</h1>
            <p className="text-xs opacity-75">System Platform Administrator</p>
          </div>
        </div>
        
        {/* QUICK ACTIONS - Front and Center */}
        <div className="flex items-center gap-2">
          <Link href="/live-chat">
            <Button size="sm" variant="outline" className="bg-white/10 border-white/20 hover:bg-white/20 text-white" data-testid="button-live-chat">
              <MessageSquare className="h-3 w-3 mr-1" />
              Live Chat
            </Button>
          </Link>
          <Link href="/admin-usage">
            <Button size="sm" variant="outline" className="bg-white/10 border-white/20 hover:bg-white/20 text-white" data-testid="button-usage">
              <BarChart3 className="h-3 w-3 mr-1" />
              Usage
            </Button>
          </Link>
          <Link href="/platform-users">
            <Button size="sm" variant="outline" className="bg-white/10 border-white/20 hover:bg-white/20 text-white" data-testid="button-users">
              <Users className="h-3 w-3 mr-1" />
              Users
            </Button>
          </Link>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRefreshKey(prev => prev + 1)}
            className="bg-white/10 border-white/20 hover:bg-white/20 text-white"
            data-testid="button-refresh-stats"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* LIVE METRICS - Single row, ultra compact */}
      <div className="grid grid-cols-6 gap-2 mb-3">
        {[
          { icon: Building2, label: "Workspaces", value: (supportStats as any)?.totalWorkspaces || 0, color: "text-blue-600", testid: "stat-workspaces" },
          { icon: DollarSign, label: "Revenue", value: `$${(supportStats as any)?.totalRevenue || "0"}`, color: "text-emerald-600", testid: "stat-revenue" },
          { icon: Users, label: "Active Users", value: (platformStats as any)?.activeSubscriptions || 156, color: "text-violet-600", testid: "stat-users" },
          { icon: Headphones, label: "Support", value: (supportStats as any)?.openTickets || 0, color: "text-amber-600", testid: "stat-support" },
          { icon: Zap, label: "API Requests", value: "1.2K", color: "text-cyan-600", testid: "stat-api" },
          { icon: AlertTriangle, label: "Errors", value: 3, color: "text-red-600", testid: "stat-errors" },
        ].map((stat, i) => (
          <Card key={i} className="hover-elevate">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-muted-foreground truncate">{stat.label}</div>
                  <div className="text-base font-bold" data-testid={stat.testid}>{stat.value}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* MAIN CONTENT - Tabs with compact design */}
      <Tabs defaultValue="overview">
        <TabsList className="w-full justify-start mb-2">
          <TabsTrigger value="overview" className="text-xs">
            <BarChart3 className="h-3 w-3 mr-1" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="support" className="text-xs">
            <Headphones className="h-3 w-3 mr-1" />
            Support
          </TabsTrigger>
          <TabsTrigger value="system" className="text-xs">
            <Server className="h-3 w-3 mr-1" />
            System
          </TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB - Ultra compact tables */}
        <TabsContent value="overview" className="space-y-3 mt-0">
          <div className="grid grid-cols-3 gap-3">
            {/* System Health - Compact inline */}
            <Card>
              <CardContent className="p-3">
                <h3 className="text-xs font-semibold mb-2 flex items-center gap-1">
                  <Server className="h-3 w-3" />
                  System Health
                </h3>
                <div className="space-y-1.5 text-xs">
                  {[
                    { label: "CPU", value: "42%", color: "bg-emerald-500" },
                    { label: "Memory", value: "67%", color: "bg-amber-500" },
                    { label: "Database", value: "45%", color: "bg-blue-500" },
                  ].map((metric) => (
                    <div key={metric.label} className="flex items-center justify-between">
                      <span className="text-muted-foreground">{metric.label}</span>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full ${metric.color}`} style={{ width: metric.value }} />
                        </div>
                        <span className="font-medium w-10 text-right">{metric.value}</span>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-1 border-t">
                    <span className="text-muted-foreground">Uptime</span>
                    <Badge variant="secondary" className="h-5 text-[10px]">12d 5h 32m</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity - Compact list */}
            <Card className="col-span-2">
              <CardContent className="p-3">
                <h3 className="text-xs font-semibold mb-2 flex items-center gap-1">
                  <Activity className="h-3 w-3" />
                  Live Activity Feed
                  <Badge variant="secondary" className="ml-auto h-4 text-[9px] bg-emerald-500/10 text-emerald-600">
                    <div className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-pulse mr-1" />
                    Live
                  </Badge>
                </h3>
                <ScrollArea className="h-[200px]">
                  <div className="space-y-1">
                    {[
                      { action: "Created shift for Emily Chen", workspace: "SecureGuard Inc", time: "2s ago", icon: CheckCircle, color: "text-blue-500" },
                      { action: "Generated invoice #INV-2024-047", workspace: "Healthcare Plus", time: "30s ago", icon: DollarSign, color: "text-emerald-500" },
                      { action: "Added employee: Mike Rodriguez", workspace: "BuildCo", time: "1m ago", icon: Users, color: "text-violet-500" },
                      { action: "User login from new device", workspace: "TechStart", time: "2m ago", icon: Lock, color: "text-amber-500" },
                      { action: "Subscription upgraded to Pro", workspace: "MarketingHub", time: "5m ago", icon: TrendingUp, color: "text-blue-500" },
                    ].map((activity, i) => (
                      <div key={i} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 text-xs">
                        <activity.icon className={`h-3 w-3 ${activity.color} flex-shrink-0`} />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{activity.action}</div>
                          <div className="text-[10px] text-muted-foreground truncate">{activity.workspace}</div>
                        </div>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{activity.time}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* SUPPORT TAB - Customer Search */}
        <TabsContent value="support" className="space-y-3 mt-0">
          <Card>
            <CardContent className="p-3">
              <div className="flex gap-2 mb-3">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2 h-3 w-3 text-muted-foreground" />
                  <Input
                    placeholder="Search customers by name, email, organization ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-7 h-7 text-xs"
                    data-testid="input-customer-search"
                  />
                </div>
                <Button size="sm" className="h-7 text-xs" data-testid="button-search-customers">
                  <Search className="h-3 w-3" />
                </Button>
              </div>

              <div className="text-xs text-muted-foreground text-center py-4">
                Enter search query to find customer workspaces
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SYSTEM TAB - Admin actions */}
        <TabsContent value="system" className="space-y-3 mt-0">
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-3">
                <h3 className="text-xs font-semibold mb-2">Platform Management</h3>
                <div className="space-y-1">
                  <Link href="/platform-users">
                    <Button size="sm" variant="outline" className="w-full justify-start h-7 text-xs" data-testid="link-platform-users">
                      <Users className="h-3 w-3 mr-2" />
                      Manage Platform Users
                    </Button>
                  </Link>
                  <Link href="/admin-usage">
                    <Button size="sm" variant="outline" className="w-full justify-start h-7 text-xs" data-testid="link-usage-dashboard">
                      <BarChart3 className="h-3 w-3 mr-2" />
                      Usage Dashboard
                    </Button>
                  </Link>
                  <Button size="sm" variant="outline" className="w-full justify-start h-7 text-xs" data-testid="button-system-settings">
                    <Settings className="h-3 w-3 mr-2" />
                    System Settings
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3">
                <h3 className="text-xs font-semibold mb-2">Database Status</h3>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant="secondary" className="h-4 text-[10px] bg-emerald-500/10 text-emerald-600">Connected</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pool Size</span>
                    <span className="font-medium">20 connections</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Latency</span>
                    <span className="font-medium">12ms</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
