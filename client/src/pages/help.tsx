import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HelpCircle, Book, MessageSquare, Video, FileText, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Link } from "wouter";

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
    description: "Learn the basics of AutoForce™ and set up your workspace",
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

  const filteredArticles = helpArticles.filter(article =>
    article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    article.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    article.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-6xl">
      <PageHeader
        title="Help Center"
        description="Find answers and learn how to use AutoForce™"
        align="center"
      />

      <div className="mt-6 space-y-6">
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
            <Card className="hover-elevate cursor-pointer">
              <Link href="/chat">
                <CardHeader>
                  <MessageSquare className="h-8 w-8 text-primary mb-2" />
                  <CardTitle className="text-lg">Live Chat Support</CardTitle>
                  <CardDescription>
                    Get instant help from our support team
                  </CardDescription>
                </CardHeader>
              </Link>
            </Card>

            <Card className="hover-elevate cursor-pointer">
              <Link href="/updates">
                <CardHeader>
                  <Video className="h-8 w-8 text-primary mb-2" />
                  <CardTitle className="text-lg">Product Updates</CardTitle>
                  <CardDescription>
                    See what's new in AutoForce™
                  </CardDescription>
                </CardHeader>
              </Link>
            </Card>

            <Card className="hover-elevate cursor-pointer">
              <Link href="/contact">
                <CardHeader>
                  <FileText className="h-8 w-8 text-primary mb-2" />
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
                    <article.icon className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <CardTitle className="text-lg">{article.title}</CardTitle>
                        <span className="text-xs text-muted-foreground px-2 py-1 bg-muted rounded">
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
    </div>
  );
}
