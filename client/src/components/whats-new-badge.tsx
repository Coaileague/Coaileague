
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sparkles, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface FeatureUpdate {
  id: string;
  title: string;
  description: string;
  category: 'new' | 'improvement' | 'fix';
  releaseDate: Date;
  learnMoreUrl?: string;
}

export function WhatsNewBadge() {
  const [open, setOpen] = useState(false);

  const { data: updates = [] } = useQuery({
    queryKey: ['/api/feature-updates'],
    enabled: open,
  });

  const { data: lastViewed } = useQuery({
    queryKey: ['/api/feature-updates/last-viewed'],
  });

  const unreadCount = updates.filter(
    (update: FeatureUpdate) =>
      !lastViewed || new Date(update.releaseDate) > new Date(lastViewed)
  ).length;

  const markAsViewed = async () => {
    await apiRequest('/api/feature-updates/mark-viewed', {
      method: 'POST',
    });
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'new':
        return 'bg-green-500/10 text-green-700 dark:text-green-400';
      case 'improvement':
        return 'bg-blue-500/10 text-blue-700 dark:text-blue-400';
      case 'fix':
        return 'bg-orange-500/10 text-orange-700 dark:text-orange-400';
      default:
        return 'bg-gray-500/10 text-gray-700 dark:text-gray-400';
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) {
          markAsViewed();
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Sparkles className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="default"
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs bg-gradient-to-r from-purple-500 to-pink-500"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
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
                No new updates yet
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {updates.map((update: FeatureUpdate) => (
                <div key={update.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
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
