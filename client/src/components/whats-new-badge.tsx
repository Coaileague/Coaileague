
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sparkles, ExternalLink, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface FeatureUpdate {
  id: string;
  title: string;
  description: string;
  category: 'new' | 'improvement' | 'fix' | 'security' | 'maintenance';
  releaseDate: Date;
  learnMoreUrl?: string;
}

export function WhatsNewBadge() {
  const [open, setOpen] = useState(false);

  const { data: updates = [] } = useQuery<FeatureUpdate[]>({
    queryKey: ['/api/feature-updates'],
  });

  const dismissMutation = useMutation({
    mutationFn: async (updateId: string) => {
      await apiRequest('POST', `/api/feature-updates/${updateId}/dismiss`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/feature-updates'] });
    },
  });

  const handleDismiss = (updateId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    dismissMutation.mutate(updateId);
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'new':
        return 'bg-muted/10 text-blue-700 dark:text-blue-400';
      case 'improvement':
        return 'bg-blue-500/10 text-blue-700 dark:text-blue-400';
      case 'fix':
        return 'bg-orange-500/10 text-orange-700 dark:text-orange-400';
      case 'security':
        return 'bg-red-500/10 text-red-700 dark:text-red-400';
      default:
        return 'bg-gray-500/10 text-gray-700 dark:text-gray-400';
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" data-testid="button-whats-new">
              <Sparkles className="h-5 w-5" />
              {updates.length > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white flex items-center justify-center text-xs font-medium">
                  {updates.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>What's New - Feature Updates</p>
        </TooltipContent>
      </Tooltip>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            <h3 className="font-semibold">What's New</h3>
          </div>
        </div>
        <Separator />
        <ScrollArea className="h-[400px]">
          {updates.length === 0 ? (
            <div className="p-8 text-center">
              <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No new updates
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {updates.map((update) => (
                <div key={update.id} className="p-4 space-y-2 relative group" data-testid={`update-${update.id}`}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => handleDismiss(update.id, e)}
                    disabled={dismissMutation.isPending}
                    data-testid={`button-dismiss-${update.id}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <div className="flex items-start justify-between gap-2 pr-8">
                    <h4 className="font-medium text-sm">{update.title}</h4>
                    <Badge
                      variant="secondary"
                      className={`text-xs ${getCategoryColor(update.category)}`}
                    >
                      {update.category}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {update.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(update.releaseDate), {
                        addSuffix: true,
                      })}
                    </p>
                    {update.learnMoreUrl && (
                      <a
                        href={update.learnMoreUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                        data-testid={`link-learn-more-${update.id}`}
                      >
                        Learn more
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
