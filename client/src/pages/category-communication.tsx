import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, Lock, Headphones, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

export default function CommunicationFamilyPage() {
  const modules = [
    {
      name: "Team Chat",
      icon: MessageSquare,
      description: "Organization-wide chatrooms with real-time messaging, room management, and access control",
      features: ["Public & Private Rooms", "Member Management", "Real-time Updates", "Room Archives"],
      url: "/chatrooms",
      color: "from-blue-500 to-cyan-500"
    },
    {
      name: "Private Messages",
      icon: Lock,
      description: "Secure direct messaging with 'whispered' badges and encrypted conversations",
      features: ["1-on-1 DMs", "Staff Support Channels", "Encrypted Indicators", "Conversation History"],
      url: "/messages",
      color: "from-cyan-500 to-blue-600"
    },
    {
      name: "Support",
      icon: Headphones,
      description: "Get help via knowledge base, FAQ, and ticket system with Trinity AI assistance",
      features: ["Knowledge Base", "Ticket System", "FAQ", "Trinity AI Help"],
      url: "/support",
      color: "from-primary to-teal-500"
    }
  ];

  const pageConfig: CanvasPageConfig = {
    id: 'category-communication',
    title: 'Communication & Collaboration',
    subtitle: 'Connect your entire organization with powerful communication tools designed for modern workforces',
    category: 'operations',
    headerActions: (
      <Badge variant="outline" className="text-sm px-4 py-1">
        Communication Hub
      </Badge>
    ),
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-8">
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

        <Card className="border-2 border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-2xl">Why Communication Family?</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <h3 className="font-bold text-lg">Real-Time Connectivity</h3>
                <p className="text-sm text-muted-foreground">
                  Keep your team connected with instant messaging, live updates, and mobile-optimized interfaces
                </p>
              </div>
              <div className="space-y-2">
                <h3 className="font-bold text-lg">Enterprise Security</h3>
                <p className="text-sm text-muted-foreground">
                  End-to-end encryption, role-based access control, and compliance-ready audit trails
                </p>
              </div>
              <div className="space-y-2">
                <h3 className="font-bold text-lg">Unified Platform</h3>
                <p className="text-sm text-muted-foreground">
                  One platform for chatrooms, DMs, and support - reducing the need for multiple tools
                </p>
              </div>
              <div className="space-y-2">
                <h3 className="font-bold text-lg">Analytics & Insights</h3>
                <p className="text-sm text-muted-foreground">
                  Track engagement, response times, and communication patterns with built-in analytics
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </CanvasHubPage>
  );
}
