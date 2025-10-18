import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, Book, Sparkles, Clock } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface KnowledgeArticle {
  id: string;
  title: string;
  content: string;
  summary?: string | null;
  category?: string | null;
  tags?: string[] | null;
  isPublic: boolean;
  createdAt: string;
}

interface KnowledgeQuery {
  id: string;
  query: string;
  response: string;
  responseTime: number;
  createdAt: string;
}

export function KnowledgeAssistant() {
  const [question, setQuestion] = useState("");
  const { toast } = useToast();

  // Fetch recent queries
  const { data: recentQueries } = useQuery<KnowledgeQuery[]>({
    queryKey: ["/api/knowledge/queries/recent"],
    retry: false,
  });

  // Fetch knowledge articles
  const { data: articles } = useQuery<KnowledgeArticle[]>({
    queryKey: ["/api/knowledge/articles"],
  });

  // Ask mutation
  const askMutation = useMutation({
    mutationFn: async (query: string) => {
      const response = await apiRequest("/api/knowledge/ask", {
        method: "POST",
        body: JSON.stringify({ query }),
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/queries/recent"] });
      toast({
        title: "✅ Answer Retrieved",
        description: "AI assistant found relevant information",
      });
    },
    onError: () => {
      toast({
        title: "❌ Search Failed",
        description: "Unable to search knowledge base. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAsk = () => {
    if (!question.trim()) {
      toast({
        title: "⚠️ Empty Question",
        description: "Please enter a question",
        variant: "destructive",
      });
      return;
    }

    askMutation.mutate(question);
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Ask AI Assistant */}
      <Card data-testid="card-knowledge-assistant">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>AI Knowledge Assistant</CardTitle>
            </div>
            <Badge variant="outline" className="gap-1">
              <Book className="h-3 w-3" />
              {articles?.length || 0} Articles
            </Badge>
          </div>
          <CardDescription>
            Ask questions about policies, procedures, and company information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="What is the vacation policy?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAsk()}
                className="pl-10"
                data-testid="input-ask-question"
              />
            </div>
            <Button
              onClick={handleAsk}
              disabled={askMutation.isPending}
              data-testid="button-ask"
            >
              {askMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Searching...
                </>
              ) : (
                "Ask"
              )}
            </Button>
          </div>

          {askMutation.data && (
            <Card className="bg-muted/50 border-primary/20">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm">AI Answer</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-sm">
                <div className="whitespace-pre-wrap" data-testid="text-ai-response">
                  {askMutation.data.response}
                </div>
                {askMutation.data.articles && askMutation.data.articles.length > 0 && (
                  <div className="mt-4 pt-4 border-t space-y-2">
                    <p className="font-medium text-xs text-muted-foreground">Sources:</p>
                    {askMutation.data.articles.map((article: KnowledgeArticle, idx: number) => (
                      <div key={article.id} className="text-xs flex items-start gap-2">
                        <Badge variant="outline" className="h-5 min-w-5 flex items-center justify-center p-0">
                          {idx + 1}
                        </Badge>
                        <span className="flex-1">{article.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="text-xs text-muted-foreground">
            💡 Tip: You can also use <code className="bg-muted px-1 py-0.5 rounded">/ask</code> in the chat
          </div>
        </CardContent>
      </Card>

      {/* Browse Knowledge Base */}
      <Card data-testid="card-knowledge-browse">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Book className="h-5 w-5 text-primary" />
            <CardTitle>Knowledge Base</CardTitle>
          </div>
          <CardDescription>
            Browse available policies and documentation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] pr-4">
            {articles && articles.length > 0 ? (
              <div className="space-y-3">
                {articles.map((article) => (
                  <Card key={article.id} className="hover-elevate" data-testid={`article-${article.id}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{article.title}</CardTitle>
                      {article.category && (
                        <Badge variant="outline" className="w-fit text-xs">
                          {article.category}
                        </Badge>
                      )}
                    </CardHeader>
                    {article.summary && (
                      <CardContent className="text-xs text-muted-foreground pb-3">
                        {article.summary}
                      </CardContent>
                    )}
                    {article.tags && article.tags.length > 0 && (
                      <CardContent className="pt-0 pb-3 flex flex-wrap gap-1">
                        {article.tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                <Book className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No knowledge articles available yet</p>
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Recent Queries - Full Width */}
      {recentQueries && recentQueries.length > 0 && (
        <Card className="md:col-span-2" data-testid="card-recent-queries">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              <CardTitle>Recent Questions</CardTitle>
            </div>
            <CardDescription>
              Your recent knowledge base queries
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentQueries.slice(0, 5).map((query) => (
                <div key={query.id} className="flex items-start gap-3 text-sm">
                  <Badge variant="outline" className="mt-0.5">
                    {query.responseTime}ms
                  </Badge>
                  <div className="flex-1 space-y-1">
                    <p className="font-medium">{query.query}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{query.response}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
