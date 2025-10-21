import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Briefcase, UserCog, Activity, BarChart3, FileText, Sparkles, ArrowRight, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";

export default function GrowthFamilyPage() {
  const modules = [
    {
      name: "HireOS™",
      icon: Briefcase,
      description: "Intelligent recruitment workflow with candidate tracking, interview scheduling, and offer management",
      features: ["Candidate Pipeline", "Interview Scheduling", "Offer Letters", "ATS Integration"],
      url: "/owner/hireos/workflow-builder",
      color: "from-violet-500 to-purple-500"
    },
    {
      name: "TalentOS™",
      icon: UserCog,
      description: "Leadership development and talent management with succession planning and performance reviews",
      features: ["Succession Planning", "Performance Reviews", "Leadership Pipeline", "Skills Matrix"],
      url: "/leaders-hub",
      color: "from-fuchsia-500 to-pink-500"
    },
    {
      name: "EngagementOS™",
      icon: Activity,
      description: "Employee engagement analytics with pulse surveys, feedback loops, and recognition programs",
      features: ["Pulse Surveys", "Feedback Loops", "Recognition", "Sentiment Analysis"],
      url: "/engagement/dashboard",
      color: "from-rose-500 to-red-500"
    },
    {
      name: "AnalyticsOS™",
      icon: BarChart3,
      description: "Real-time workforce analytics with predictive insights and customizable dashboards",
      features: ["Real-time Dashboards", "Predictive Analytics", "Custom Reports", "KPI Tracking"],
      url: "/analytics",
      color: "from-cyan-500 to-blue-500"
    },
    {
      name: "ReportOS™",
      icon: FileText,
      description: "Automated report generation with compliance tracking and executive summaries",
      features: ["Auto Reports", "Compliance Tracking", "Executive Summaries", "Export Options"],
      url: "/reports",
      color: "from-emerald-500 to-teal-500"
    }
  ];

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-violet-500/20 to-pink-500/20 border border-violet-500/30">
              <Sparkles className="h-12 w-12 text-violet-400" />
            </div>
          </div>
          <h1 className="text-4xl md:text-6xl font-black bg-gradient-to-r from-violet-400 via-fuchsia-400 to-pink-400 bg-clip-text text-transparent">
            Growth & Intelligence OS
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Scale your organization with AI-powered recruitment, talent management, and predictive analytics
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
                  <CardTitle className="text-xl">{module.name}</CardTitle>
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

        {/* Intelligence Section */}
        <Card className="border-2 border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <TrendingUp className="h-6 w-6" />
              AI-Powered Growth Intelligence
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <h3 className="font-bold text-lg">🎯 Predictive Hiring</h3>
                <p className="text-sm text-muted-foreground">
                  AI algorithms predict candidate success rates, reducing time-to-hire by 60% and improving retention
                </p>
              </div>
              <div className="space-y-2">
                <h3 className="font-bold text-lg">📈 Turnover Prevention</h3>
                <p className="text-sm text-muted-foreground">
                  Machine learning identifies at-risk employees 90 days before turnover, enabling proactive retention
                </p>
              </div>
              <div className="space-y-2">
                <h3 className="font-bold text-lg">🧠 Skills Gap Analysis</h3>
                <p className="text-sm text-muted-foreground">
                  Automated skills mapping identifies training needs and succession planning opportunities
                </p>
              </div>
              <div className="space-y-2">
                <h3 className="font-bold text-lg">💡 Strategic Insights</h3>
                <p className="text-sm text-muted-foreground">
                  Executive dashboards with actionable intelligence for data-driven talent decisions
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
