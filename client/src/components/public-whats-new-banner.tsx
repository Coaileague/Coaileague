import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { X, Sparkles, TrendingUp, Zap, Shield, MessageCircle } from "lucide-react";

interface PlatformUpdate {
  id: string;
  title: string;
  description: string;
  date: string;
  category: 'feature' | 'improvement' | 'bugfix' | 'security' | 'announcement';
  version?: string;
}

interface UpdatesResponse {
  success: boolean;
  updates: PlatformUpdate[];
}

export function PublicWhatsNewBanner() {
  const [hidden, setHidden] = useState(false);

  const { data: updatesData } = useQuery<UpdatesResponse>({
    queryKey: ['/api/whats-new/latest'],
    staleTime: 60000,
  });

  const updates = updatesData?.updates?.slice(0, 3) || [];

  if (hidden || updates.length === 0) return null;

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'feature': return <Sparkles className="h-3 w-3" />;
      case 'improvement': return <TrendingUp className="h-3 w-3" />;
      case 'bugfix': return <Zap className="h-3 w-3" />;
      case 'security': return <Shield className="h-3 w-3" />;
      case 'announcement': return <MessageCircle className="h-3 w-3" />;
      default: return <Sparkles className="h-3 w-3" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'feature': return 'bg-blue-500/10 text-blue-700 dark:text-blue-400';
      case 'improvement': return 'bg-green-500/10 text-green-700 dark:text-green-400';
      case 'bugfix': return 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400';
      case 'security': return 'bg-red-500/10 text-red-700 dark:text-red-400';
      case 'announcement': return 'bg-purple-500/10 text-purple-700 dark:text-purple-400';
      default: return 'bg-gray-500/10 text-gray-700 dark:text-gray-400';
    }
  };

  return (
    <div className="w-full bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 border-b border-purple-200/50 dark:border-purple-800/50 py-4">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400 animate-sparkles-combined" />
              <h3 className="font-semibold text-foreground">What's New</h3>
            </div>
            <div className="space-y-2">
              {updates.map((update) => (
                <div key={update.id} className="flex items-start gap-3">
                  <Badge className={`flex-shrink-0 mt-0.5 ${getCategoryColor(update.category)}`}>
                    <div className="flex items-center gap-1">
                      {getCategoryIcon(update.category)}
                      <span className="text-xs capitalize">{update.category}</span>
                    </div>
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground line-clamp-1">{update.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1">{update.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={() => setHidden(true)}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-close-whats-new-banner"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
