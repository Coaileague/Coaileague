import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, Sparkles, Zap, Shield, TrendingUp } from "lucide-react";
import { format } from "date-fns";

interface Update {
  id: string;
  title: string;
  description: string;
  date: string;
  category: "feature" | "improvement" | "bugfix" | "security";
  badge?: string;
}

const updates: Update[] = [
  {
    id: "mobile-schedule-2025-11-20",
    title: "Mobile-First AI Scheduling™",
    description: "Completely redesigned mobile scheduling experience with week navigation, real-time stats cards (hours, cost, overtime, open shifts), swipe-friendly day tabs, and streamlined shift creation with bottom sheet interface. Supports open (unassigned) shifts with dedicated display cards.",
    date: "2025-11-20",
    category: "feature",
    badge: "NEW",
  },
  {
    id: "1",
    title: "AI Analytics™ - AI Analytics Platform",
    description: "Launch of autonomous AI analytics with real-time insights, cost-saving recommendations, and anomaly detection. Get actionable recommendations with confidence scores and estimated ROI impact.",
    date: "2025-11-04",
    category: "feature",
    badge: "NEW",
  },
  {
    id: "2",
    title: "AI Records™ - Natural Language Search",
    description: "Search your entire workforce database using natural language. Ask questions like 'Show me employees hired this month' or 'Find invoices over $5000' and get instant results.",
    date: "2025-11-04",
    category: "feature",
    badge: "NEW",
  },
  {
    id: "3",
    title: "Animated CoAIleague Logo",
    description: "Brand refresh featuring our new animated logo with pulsing hub, rotating ring, and network connections - representing autonomous workforce management at scale.",
    date: "2025-11-05",
    category: "improvement",
  },
  {
    id: "4",
    title: "4-Tier Value-Based Pricing",
    description: "New pricing model clearly separating manual tools ($299), automation ($599), AI intelligence ($999), and enterprise scale ($2,999) with transparent per-employee overage pricing.",
    date: "2025-11-04",
    category: "improvement",
  },
  {
    id: "5",
    title: "Mobile-First Responsive Design",
    description: "Enhanced mobile experience across all pages with responsive grids, optimized navigation patterns, and touch-friendly controls.",
    date: "2025-11-04",
    category: "improvement",
  },
  {
    id: "6",
    title: "Security Enhancements",
    description: "Improved authentication flow with account locking, password complexity requirements, and session management upgrades.",
    date: "2025-11-03",
    category: "security",
  },
];

export default function Updates() {
  const getCategoryIcon = (category: Update["category"]) => {
    switch (category) {
      case "feature": return <Sparkles className="h-4 w-4" />;
      case "improvement": return <TrendingUp className="h-4 w-4" />;
      case "bugfix": return <Zap className="h-4 w-4" />;
      case "security": return <Shield className="h-4 w-4" />;
    }
  };

  const getCategoryColor = (category: Update["category"]) => {
    switch (category) {
      case "feature": return "bg-blue-500/10 text-blue-500";
      case "improvement": return "bg-muted/10 text-blue-500";
      case "bugfix": return "bg-orange-500/10 text-orange-500";
      case "security": return "bg-red-500/10 text-red-500";
    }
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-6xl">
      <PageHeader
        title="Product Updates"
        description="Latest features, improvements, and announcements"
        align="center"
      />

      <div className="mt-6 space-y-4">
        {updates.map((update) => (
          <Card key={update.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <CardTitle className="text-lg">{update.title}</CardTitle>
                    {update.badge && (
                      <Badge variant="default" className="bg-primary">
                        {update.badge}
                      </Badge>
                    )}
                  </div>
                  <CardDescription>{update.description}</CardDescription>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge className={getCategoryColor(update.category)}>
                    <span className="flex items-center gap-1">
                      {getCategoryIcon(update.category)}
                      {update.category.charAt(0).toUpperCase() + update.category.slice(1)}
                    </span>
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(update.date), "MMM d, yyyy")}
                  </span>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
