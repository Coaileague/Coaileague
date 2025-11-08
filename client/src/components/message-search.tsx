import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Calendar, MessageSquare, User, X } from "lucide-react";
import { format } from "date-fns";

interface SearchResult {
  id: string;
  messageContent: string;
  senderName: string;
  senderId: string;
  roomName: string;
  roomId: string;
  createdAt: Date;
  isFormatted?: boolean | null;
  formattedContent?: string | null;
}

interface MessageSearchProps {
  roomId?: string;
  trigger?: React.ReactNode;
}

export function MessageSearch({ roomId, trigger }: MessageSearchProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [activeSearch, setActiveSearch] = useState<string>("");

  // Build query URL with parameters
  const buildSearchUrl = () => {
    const params = new URLSearchParams();
    if (activeSearch) params.set('query', activeSearch);
    if (roomId) params.set('roomId', roomId);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    params.set('limit', '50');
    return `/api/comm-os/messages/search?${params.toString()}`;
  };

  const hasFilters = !!activeSearch || !!roomId || !!startDate || !!endDate;

  const { data: searchResults, isLoading } = useQuery<{
    results: SearchResult[];
    totalCount: number;
    limit: number;
  }>({
    queryKey: [buildSearchUrl()],
    enabled: hasFilters,
  });

  const handleSearch = () => {
    setActiveSearch(searchQuery);
  };

  const handleClearFilters = () => {
    setSearchQuery("");
    setActiveSearch("");
    setStartDate("");
    setEndDate("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" data-testid="button-search-messages">
            <Search className="w-4 h-4 mr-2" />
            Search Messages
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="w-5 h-5 text-primary" />
            Search Messages
          </DialogTitle>
          <DialogDescription>
            Search across all messages in {roomId ? 'this room' : 'all accessible rooms'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="search-query">Search Query</Label>
              <Input
                id="search-query"
                data-testid="input-search-query"
                placeholder="Enter keywords to search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearch();
                }}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={handleSearch} data-testid="button-execute-search">
                <Search className="w-4 h-4 mr-2" />
                Search
              </Button>
              {(activeSearch || startDate || endDate) && (
                <Button 
                  variant="outline" 
                  onClick={handleClearFilters}
                  data-testid="button-clear-filters"
                >
                  <X className="w-4 h-4 mr-2" />
                  Clear
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="start-date">Start Date</Label>
              <Input
                id="start-date"
                data-testid="input-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="end-date">End Date</Label>
              <Input
                id="end-date"
                data-testid="input-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {activeSearch && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Showing results for:</span>
              <Badge variant="secondary" data-testid="badge-active-search">
                {activeSearch}
              </Badge>
              {searchResults && (
                <span className="text-xs">
                  ({searchResults.totalCount} results)
                </span>
              )}
            </div>
          )}
        </div>

        <ScrollArea className="flex-1 mt-4 pr-4">
          <div className="space-y-3">
            {isLoading && (
              <div className="text-center py-8 text-muted-foreground" data-testid="text-loading">
                <Search className="w-8 h-8 mx-auto mb-2 animate-pulse" />
                Searching messages...
              </div>
            )}

            {!isLoading && !activeSearch && !roomId && (
              <div className="text-center py-8 text-muted-foreground" data-testid="text-no-search">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Enter a search query to find messages</p>
              </div>
            )}

            {!isLoading && searchResults && searchResults.results.length === 0 && (
              <div className="text-center py-8 text-muted-foreground" data-testid="text-no-results">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No messages found matching your search</p>
              </div>
            )}

            {!isLoading && searchResults && searchResults.results.map((result, index) => (
              <div
                key={result.id}
                data-testid={`result-message-${index}`}
                className="p-4 border rounded-lg hover-elevate active-elevate-2 space-y-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <User className="w-4 h-4 text-primary flex-shrink-0" />
                    <span className="font-medium truncate">{result.senderName}</span>
                    <Badge variant="outline" className="flex-shrink-0">
                      {result.roomName}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(result.createdAt), 'MMM d, yyyy HH:mm')}
                  </div>
                </div>
                
                <div className="text-sm">
                  {result.isFormatted && result.formattedContent ? (
                    <div 
                      className="prose prose-sm max-w-none dark:prose-invert"
                      dangerouslySetInnerHTML={{ __html: result.formattedContent }}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{result.messageContent}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
