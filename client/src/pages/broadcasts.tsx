import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useBroadcasts, useMyBroadcasts } from "@/hooks/useBroadcasts";
import { isSupportRole } from "@/config/chatroomsConfig";
import { BroadcastCard } from "@/components/broadcasts/BroadcastCard";
import { BroadcastComposer } from "@/components/broadcasts/BroadcastComposer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Megaphone, Plus, Search, Loader2, Filter, Inbox, Send
} from "lucide-react";
import {
  CanvasHubPage,
  type CanvasPageConfig,
} from "@/components/canvas-hub";

const broadcastsConfig: CanvasPageConfig = {
  id: 'broadcasts',
  title: 'Broadcasts',
  category: 'communication',
  // @ts-expect-error — TS migration: fix in refactoring sprint
  variant: 'default',
  showHeader: true,
};

export default function Broadcasts() {
  const { user } = useAuth();
  const [composerOpen, setComposerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const workspaceRole = user?.workspaceRole;
  const hasSupportAccess = isSupportRole(user?.platformRole);
  const isManager = workspaceRole === 'org_owner' || workspaceRole === 'co_owner' || workspaceRole === 'manager' || hasSupportAccess;

  const { data: sentBroadcasts, isLoading: loadingSent } = useBroadcasts({ limit: 50 });
  const { data: myBroadcasts, isLoading: loadingMy } = useMyBroadcasts({ limit: 50 });

  const filteredSent = useMemo(() => {
    let items = sentBroadcasts || [];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(b => b.title?.toLowerCase().includes(q) || b.message?.toLowerCase().includes(q));
    }
    if (typeFilter !== 'all') {
      items = items.filter(b => b.type === typeFilter);
    }
    return items;
  }, [sentBroadcasts, searchQuery, typeFilter]);

  const filteredReceived = useMemo(() => {
    let items = myBroadcasts || [];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(b => b.title?.toLowerCase().includes(q) || b.message?.toLowerCase().includes(q));
    }
    if (typeFilter !== 'all') {
      items = items.filter(b => b.type === typeFilter);
    }
    return items;
  }, [myBroadcasts, searchQuery, typeFilter]);

  const unreadCount = (myBroadcasts || []).filter(b => !b.recipient?.readAt).length;

  return (
    <CanvasHubPage config={broadcastsConfig}>
      <div className="flex flex-col h-full">
        <div className="shrink-0 border-b border-border bg-card px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Megaphone className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground" data-testid="text-broadcasts-title">Broadcasts</h1>
                <p className="text-sm text-muted-foreground">Company-wide announcements and alerts</p>
              </div>
            </div>
            {isManager && (
              <Button onClick={() => setComposerOpen(true)} data-testid="button-send-broadcast">
                <Send className="h-4 w-4 mr-2" />
                Send Broadcast
              </Button>
            )}
          </div>

          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search broadcasts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-broadcasts"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full md:w-[180px]" data-testid="select-broadcast-type-filter">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="announcement">Announcements</SelectItem>
                <SelectItem value="alert">Alerts</SelectItem>
                <SelectItem value="policy_update">Policy Updates</SelectItem>
                <SelectItem value="feature_release">New Features</SelectItem>
                <SelectItem value="feedback_request">Feedback</SelectItem>
                <SelectItem value="celebration">Celebrations</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <Tabs defaultValue="received" className="h-full flex flex-col">
            <div className="px-4 sm:px-6 pt-3 shrink-0">
              <TabsList data-testid="tabs-broadcast-view">
                <TabsTrigger value="received" className="gap-1.5" data-testid="tab-received">
                  <Inbox className="h-4 w-4" />
                  Received
                  {unreadCount > 0 && (
                    <Badge className="ml-1 text-[10px] px-1.5 py-0 h-4">{unreadCount}</Badge>
                  )}
                </TabsTrigger>
                {isManager && (
                  <TabsTrigger value="sent" className="gap-1.5" data-testid="tab-sent">
                    <Send className="h-4 w-4" />
                    Sent
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            <TabsContent value="received" className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
              {loadingMy ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredReceived.length === 0 ? (
                <div className="text-center py-12">
                  <Megaphone className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">No broadcasts yet</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">You'll see company announcements here</p>
                </div>
              ) : (
                <div className="space-y-3 max-w-2xl mx-auto">
                  {filteredReceived.map((b) => (
                    <BroadcastCard
                      key={b.id}
                      broadcast={b}
                      recipient={b.recipient}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            {isManager && (
              <TabsContent value="sent" className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
                {loadingSent ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredSent.length === 0 ? (
                  <div className="text-center py-12">
                    <Send className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">No broadcasts sent</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">Send your first broadcast to the team</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-w-2xl mx-auto">
                    {filteredSent.map((b) => (
                      <BroadcastCard key={b.id} broadcast={b} />
                    ))}
                  </div>
                )}
              </TabsContent>
            )}
          </Tabs>
        </div>

        <BroadcastComposer
          open={composerOpen}
          onOpenChange={setComposerOpen}
          isPlatformLevel={hasSupportAccess}
        />
      </div>
    </CanvasHubPage>
  );
}
