import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  User, Building2, CreditCard, FileText, ExternalLink, 
  Clock, CheckCircle, AlertCircle, TrendingUp 
} from "lucide-react";
import { cn } from "@/lib/utils";

interface UserInfo {
  id: string;
  name: string;
  email: string;
  role?: string;
  organization?: string;
  subscriptionTier?: 'free' | 'starter' | 'professional' | 'enterprise';
  accountCreated?: string;
}

interface PreviousTicket {
  id: string;
  subject: string;
  status: 'resolved' | 'escalated' | 'closed';
  createdAt: string;
  resolvedIn?: string;
}

interface KBArticle {
  id: string;
  title: string;
  url: string;
  relevance?: number;
}

interface TicketContextPanelProps {
  user?: UserInfo;
  previousTickets?: PreviousTicket[];
  suggestedArticles?: KBArticle[];
  className?: string;
  isLoading?: boolean;
}

const tierColors = {
  free: 'bg-gray-500',
  starter: 'bg-blue-500',
  professional: 'bg-purple-500',
  enterprise: 'bg-blue-500'
};

const statusIcons = {
  resolved: CheckCircle,
  escalated: TrendingUp,
  closed: AlertCircle
};

export function TicketContextPanel({
  user,
  previousTickets = [],
  suggestedArticles = [],
  className,
  isLoading
}: TicketContextPanelProps) {
  if (isLoading) {
    return (
      <Card className={cn("h-full", className)} data-testid="ticket-context-panel">
        <CardHeader>
          <CardTitle className="text-lg">Customer Context</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 animate-pulse">
            <div className="h-20 bg-muted rounded" />
            <div className="h-32 bg-muted rounded" />
            <div className="h-32 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("h-full flex flex-col", className)} data-testid="ticket-context-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <User className="w-4 h-4" />
          Customer Context
        </CardTitle>
        <CardDescription>Account info and support history</CardDescription>
      </CardHeader>

      <div className="flex-1 overflow-y-auto">
        <CardContent className="space-y-6">
          {/* User Info */}
          {user && (
            <div className="space-y-3" data-testid="user-info-section">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-sm truncate" data-testid="user-name">
                    {user.name}
                  </h3>
                  <p className="text-xs text-muted-foreground truncate" data-testid="user-email">
                    {user.email}
                  </p>
                </div>
                {user.subscriptionTier && (
                  <Badge 
                    className={cn("text-white flex-shrink-0", tierColors[user.subscriptionTier])}
                    data-testid="user-tier-badge"
                  >
                    {user.subscriptionTier}
                  </Badge>
                )}
              </div>

              {user.organization && (
                <div className="flex items-center gap-2 text-sm">
                  <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-muted-foreground truncate" data-testid="user-org">
                    {user.organization}
                  </span>
                </div>
              )}

              {user.accountCreated && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3 flex-shrink-0" />
                  Customer since {new Date(user.accountCreated).toLocaleDateString()}
                </div>
              )}
            </div>
          )}

          <Separator />

          {/* Previous Tickets */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Recent Tickets</h3>
              <Badge variant="outline" className="text-xs">
                {previousTickets.length}
              </Badge>
            </div>

            {previousTickets.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No previous tickets
              </p>
            ) : (
              <div className="space-y-2">
                {previousTickets.slice(0, 3).map((ticket) => {
                  const StatusIcon = statusIcons[ticket.status];
                  return (
                    <Card 
                      key={ticket.id} 
                      className="hover-elevate cursor-pointer"
                      data-testid={`previous-ticket-${ticket.id}`}
                    >
                      <CardContent className="p-3 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium line-clamp-2 flex-1">
                            {ticket.subject}
                          </p>
                          <StatusIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>#{ticket.id.slice(-8)}</span>
                          {ticket.resolvedIn && (
                            <span>Resolved in {ticket.resolvedIn}</span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          <Separator />

          {/* Suggested KB Articles */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Suggested Articles</h3>
              <FileText className="w-4 h-4 text-muted-foreground" />
            </div>

            {suggestedArticles.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No suggested articles
              </p>
            ) : (
              <div className="space-y-2">
                {suggestedArticles.map((article) => (
                  <Button
                    key={article.id}
                    variant="outline"
                    className="w-full justify-start text-left h-auto p-3"
                    onClick={() => window.open(article.url, '_blank')}
                    data-testid={`kb-article-${article.id}`}
                  >
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <FileText className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium line-clamp-2">
                          {article.title}
                        </p>
                        {article.relevance && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {Math.round(article.relevance * 100)}% relevant
                          </p>
                        )}
                      </div>
                      <ExternalLink className="w-3 h-3 flex-shrink-0 text-muted-foreground" />
                    </div>
                  </Button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </div>
    </Card>
  );
}
