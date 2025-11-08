import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, DollarSign, FileText, Package, Users, UserCircle, Sparkles, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";

export default function OperationsFamilyPage() {
  const modules = [
    {
      name: "ScheduleOS™",
      icon: Calendar,
      description: "Smart AI-powered scheduling with drag-and-drop, conflict detection, and mobile sync",
      features: ["Drag & Drop", "Conflict Detection", "Mobile Sync", "Auto-optimization"],
      url: "/schedule",
      color: "from-indigo-500 to-blue-500"
    },
    {
      name: "TimeOS™",
      icon: Clock,
      description: "Comprehensive time tracking with geofencing, mobile clock-in, and overtime management",
      features: ["Geofencing", "Mobile Clock-in", "Overtime Tracking", "Break Management"],
      url: "/time-tracking",
      color: "from-cyan-500 to-teal-500"
    },
    {
      name: "PayrollOS™",
      icon: DollarSign,
      description: "Automated payroll processing with tax calculations, direct deposit, and compliance",
      features: ["Auto Processing", "Tax Calculations", "Direct Deposit", "Pay Stubs"],
      url: "/payroll",
      color: "from-primary to-green-500"
    },
    {
      name: "BillOS™",
      icon: FileText,
      description: "Automated invoice generation, client billing, payment tracking, and expense management",
      features: ["Auto Invoicing", "Payment Tracking", "Expense Reports", "Client Portal"],
      url: "/invoices",
      color: "from-amber-500 to-orange-500"
    },
    {
      name: "TrainingOS™",
      icon: Package,
      description: "Learning management system with courses, certifications, and compliance tracking",
      features: ["Course Catalog", "Certifications", "Progress Tracking", "Compliance"],
      url: "/training",
      color: "from-purple-500 to-pink-500"
    },
    {
      name: "Workforce Management",
      icon: Users,
      description: "Employee and client management with profiles, documents, and relationship tracking",
      features: ["Employee Profiles", "Client Management", "Document Storage", "Analytics"],
      url: "/employees",
      color: "from-rose-500 to-red-500"
    }
  ];

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 border border-indigo-500/30">
              <Sparkles className="h-12 w-12 text-indigo-400" />
            </div>
          </div>
          <h1 className="text-4xl md:text-6xl font-black bg-gradient-to-r from-indigo-400 via-cyan-400 to-teal-400 bg-clip-text text-transparent">
            Workforce Operations OS
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Automate and optimize your daily workforce operations with integrated scheduling, time tracking, and payroll
          </p>
          <Badge variant="outline" className="text-sm px-4 py-1">
            6 OS Modules
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

        {/* ROI Section */}
        <Card className="border-2 border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-2xl">Operational Excellence & ROI</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center space-y-2">
                <div className="text-4xl font-black text-primary">85%</div>
                <p className="text-sm text-muted-foreground">Time Savings on Payroll</p>
              </div>
              <div className="text-center space-y-2">
                <div className="text-4xl font-black text-primary">$255k</div>
                <p className="text-sm text-muted-foreground">Annual Savings (5 FTE Replacement)</p>
              </div>
              <div className="text-center space-y-2">
                <div className="text-4xl font-black text-primary">99.9%</div>
                <p className="text-sm text-muted-foreground">Billing Accuracy Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
