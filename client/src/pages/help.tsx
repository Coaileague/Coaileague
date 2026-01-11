import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HelpCircle, Book, MessageSquare, Video, FileText, Search, Sparkles, ArrowLeft, Home } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { WorkspaceLayout } from "@/components/workspace-layout";

interface HelpArticle {
  id: string;
  title: string;
  description: string;
  category: string;
  icon: React.ElementType;
}

const helpArticles: HelpArticle[] = [
  {
    id: "1",
    title: "Getting Started Guide",
    description: "Learn the basics of CoAIleague and set up your workspace",
    category: "Basics",
    icon: Book,
  },
  {
    id: "2",
    title: "Time Tracking Tutorial",
    description: "Master clock-in/clock-out, timesheet approval, and GPS tracking",
    category: "Operations",
    icon: Video,
  },
  {
    id: "3",
    title: "Billing & Invoicing",
    description: "Generate invoices, track payments, and manage client billing",
    category: "Finance",
    icon: FileText,
  },
  {
    id: "4",
    title: "Using AI-Powered Search",
    description: "Search your database with natural language queries",
    category: "AI Features",
    icon: Search,
  },
  {
    id: "5",
    title: "AI Analytics Dashboard",
    description: "Understand AI-generated insights and recommendations",
    category: "AI Features",
    icon: FileText,
  },
  {
    id: "6",
    title: "Contact Support",
    description: "Get help from our support team via live chat or tickets",
    category: "Support",
    icon: MessageSquare,
  },
];

export default function Help() {
  const [searchQuery, setSearchQuery] = useState("");
  const [, setLocation] = useLocation();

  const filteredArticles = helpArticles.filter(article =>
    article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    article.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    article.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <WorkspaceLayout maxWidth="6xl">
      {/* Navigation Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => setLocation('/dashboard')}
          data-testid="button-back-to-dashboard"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link 
            href="/dashboard" 
            className="hover:text-foreground transition-colors"
            aria-label="Go to Dashboard"
            data-testid="link-breadcrumb-home"
          >
            <Home className="h-4 w-4" />
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">Help Center</span>
        </div>
      </div>

      {/* Hero Section */}
      <div className="bg-gradient-to-br from-violet-50 via-indigo-50 to-purple-50 dark:from-slate-900 dark:via-violet-950/30 dark:to-slate-900 border border-violet-100 dark:border-violet-900/30 rounded-lg mb-6">
        <div className="px-4 sm:px-6 py-8 sm:py-12">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="h-1 w-8 sm:w-12 bg-gradient-to-r from-violet-600 to-indigo-600" />
              <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-mono flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-violet-600" />
                Knowledge Base
              </span>
              <div className="h-1 w-8 sm:w-12 bg-gradient-to-r from-violet-600 to-indigo-600" />
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 dark:text-gray-100" data-testid="heading-help-center">
              Help Center
            </h1>
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Find answers and learn how to use CoAIleague
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Search Bar */}
        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search help articles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-help"
              />
            </div>
          </CardContent>
        </Card>

        {/* Quick Access */}
        <div className="grid gap-4">
          <h2 className="text-xl font-bold">Quick Access</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card className="hover-elevate cursor-pointer border-violet-100 dark:border-violet-900/30">
              <Link href="/chat">
                <CardHeader>
                  <div className="h-10 w-10 rounded-md bg-violet-50 dark:bg-violet-950/50 flex items-center justify-center mb-2">
                    <MessageSquare className="h-5 w-5 text-violet-600" />
                  </div>
                  <CardTitle className="text-lg">Live Chat Support</CardTitle>
                  <CardDescription>
                    Get instant help from our support team
                  </CardDescription>
                </CardHeader>
              </Link>
            </Card>

            <Card className="hover-elevate cursor-pointer border-indigo-100 dark:border-indigo-900/30">
              <Link href="/updates">
                <CardHeader>
                  <div className="h-10 w-10 rounded-md bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center mb-2">
                    <Video className="h-5 w-5 text-indigo-600" />
                  </div>
                  <CardTitle className="text-lg">Product Updates</CardTitle>
                  <CardDescription>
                    See what's new in CoAIleague
                  </CardDescription>
                </CardHeader>
              </Link>
            </Card>

            <Card className="hover-elevate cursor-pointer border-purple-100 dark:border-purple-900/30">
              <Link href="/contact">
                <CardHeader>
                  <div className="h-10 w-10 rounded-md bg-purple-50 dark:bg-purple-950/50 flex items-center justify-center mb-2">
                    <FileText className="h-5 w-5 text-purple-600" />
                  </div>
                  <CardTitle className="text-lg">Contact Sales</CardTitle>
                  <CardDescription>
                    Questions about pricing or enterprise features
                  </CardDescription>
                </CardHeader>
              </Link>
            </Card>
          </div>
        </div>

        {/* Help Articles */}
        <div className="grid gap-4">
          <h2 className="text-xl font-bold">Documentation</h2>
          <div className="grid gap-4">
            {filteredArticles.map((article) => (
              <Card key={article.id} className="hover-elevate cursor-pointer">
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-md bg-violet-50 dark:bg-violet-950/50 flex items-center justify-center flex-shrink-0">
                      <article.icon className="h-5 w-5 text-violet-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <CardTitle className="text-lg">{article.title}</CardTitle>
                        <span className="text-xs text-violet-600 dark:text-violet-400 px-2 py-1 bg-violet-50 dark:bg-violet-950/50 rounded">
                          {article.category}
                        </span>
                      </div>
                      <CardDescription>{article.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </WorkspaceLayout>
  );
}
