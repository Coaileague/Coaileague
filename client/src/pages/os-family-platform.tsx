import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, Zap, TrendingUp, Shield, LayoutDashboard, Sparkles, ArrowRight, Lock } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";

export default function PlatformFamilyPage() {
  const modules = [
    {
      name: "QueryOS™",
      icon: Activity,
      description: "Platform staff diagnostics with user search, account management, and impersonation controls",
      features: ["User Diagnostics", "Account Management", "Impersonation", "Audit Logs"],
      url: "/query-os",
      color: "from-red-500 to-blue-500",
      adminOnly: true
    },
    {
      name: "IntegrationOS™",
      icon: Zap,
      description: "External service ecosystem with marketplace, API keys, webhooks, and OAuth2 connections",
      features: ["Marketplace", "API Keys", "Webhooks", "OAuth2"],
      url: "/integrations",
      color: "from-blue-500 to-indigo-500"
    },
    {
      name: "BudgetOS™",
      icon: TrendingUp,
      description: "Budget planning and control with variance analysis, forecasting, and approval workflows",
      features: ["Budget Planning", "Variance Analysis", "Forecasting", "Approvals"],
      url: "/budget",
      color: "from-primary to-blue-500"
    },
    {
      name: "Command Center",
      icon: Shield,
      description: "Administrative command center with system health, user management, and platform controls",
      features: ["System Health", "User Management", "Platform Config", "Security"],
      url: "/admin/command",
      color: "from-violet-500 to-purple-500",
      adminOnly: true
    },
    {
      name: "Admin Dashboard",
      icon: LayoutDashboard,
      description: "Centralized admin dashboard with metrics, alerts, and quick access to all platform functions",
      features: ["Metrics Overview", "Alert Center", "Quick Actions", "System Status"],
      url: "/dashboard",
      color: "from-blue-500 to-blue-600"
    }
  ];

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-red-500/20 to-purple-500/20 border border-red-500/30">
              <Sparkles className="h-12 w-12 text-red-400" />
            </div>
          </div>
          <h1 className="text-4xl md:text-6xl font-black bg-gradient-to-r from-red-400 via-orange-400 to-blue-400 bg-clip-text text-transparent">
            Platform & Control OS
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Enterprise-grade platform administration, diagnostics, and integration management for complete control
          </p>
          <Badge variant="outline" className="text-sm px-4 py-1">
            5 OS Modules
          </Badge>
        </div>

        {/* OS Modules Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {modules.map((module) => {
            const Icon = module.icon;
            return (
              <Card key={module.name} className="hover-elevate overflow-visible border-2">
                <CardHeader>
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${module.color} flex items-center justify-center mb-4`}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <CardTitle className="text-xl">{module.name}</CardTitle>
                    {module.adminOnly && (
                      <Badge variant="destructive" className="text-[9px] px-1.5 py-0">
                        <Lock className="h-2.5 w-2.5 mr-1" />
                        ADMIN
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="text-base">
                    {module.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    {module.features.map((feature) => (
                      <div key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                        {feature}
                      </div>
                    ))}
                  </div>
                  <Link href={module.url}>
                    <Button className="w-full" size="sm" data-testid={`button-launch-${module.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
                      Launch Module
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Security & Compliance */}
        <Card className="border-2 border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Shield className="h-6 w-6" />
              Enterprise Security & Control
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <h3 className="font-bold text-lg">🔒 SOC 2 Type II Compliant</h3>
                <p className="text-sm text-muted-foreground">
                  Full audit trails, encryption at rest and in transit, and comprehensive access controls
                </p>
              </div>
              <div className="space-y-2">
                <h3 className="font-bold text-lg">🛡️ Role-Based Access Control</h3>
                <p className="text-sm text-muted-foreground">
                  Granular permissions system with root, admin, manager, and employee role hierarchies
                </p>
              </div>
              <div className="space-y-2">
                <h3 className="font-bold text-lg">📊 Real-Time Monitoring</h3>
                <p className="text-sm text-muted-foreground">
                  Live system health dashboards, performance metrics, and automated alerting
                </p>
              </div>
              <div className="space-y-2">
                <h3 className="font-bold text-lg">🔌 Enterprise Integrations</h3>
                <p className="text-sm text-muted-foreground">
                  Connect to QuickBooks, Salesforce, Slack, ADP, and 50+ enterprise platforms
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
