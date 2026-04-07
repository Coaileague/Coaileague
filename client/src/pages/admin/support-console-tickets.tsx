import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Ticket, Search, AlertTriangle, Clock, CheckCircle2, ChevronRight,
  Zap, Brain, RefreshCw, Building2, ArrowLeft
} from "lucide-react";

const STATUS_BADGE: Record<string, string> = {
  open:      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  escalated: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  resolved:  "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  closed:    "bg-muted text-muted-foreground",
};

const PRIORITY_BADGE: Record<string, string> = {
  high:   "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  normal: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  low:    "bg-muted text-muted-foreground",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function SupportConsoleTicketsPage() {
  const [, setLocation] = useLocation();
  const [search, setSearch]       = useState("");
  const [statusFilter, setStatus] = useState("all");
  const [priorityFilter, setPriority] = useState("all");
  const [categoryFilter, setCategory] = useState("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/support/escalated", statusFilter, priorityFilter, page],
    refetchInterval: 60000,
  });

  const { data: queueData } = useQuery<any>({
    queryKey: ["/api/support/priority-queue"],
    refetchInterval: 60000,
  });

  const tickets: any[] = data?.tickets ?? data?.data ?? [];
  const totalCount = data?.total ?? tickets.length;

  const filtered = tickets.filter(t => {
    const matchSearch = !search || [t.ticketNumber, t.subject, t.workspaceId, t.description]
      .some(f => f?.toLowerCase().includes(search.toLowerCase()));
    const matchStatus   = statusFilter === "all"   || t.status === statusFilter;
    const matchPriority = priorityFilter === "all" || t.priority === priorityFilter;
    const matchCategory = categoryFilter === "all" || t.category === categoryFilter;
    return matchSearch && matchStatus && matchPriority && matchCategory;
  });

  const stats = {
    open:      tickets.filter(t => t.status === "open").length,
    escalated: tickets.filter(t => t.status === "escalated").length,
    trinity:   tickets.filter(t => t.assigned_to_trinity).length,
    resolved:  tickets.filter(t => t.status === "resolved").length,
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            data-testid="button-back-console"
            onClick={() => setLocation("/admin/support-console")}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Ticket className="w-5 h-5 text-primary" />
              Support Tickets
            </h1>
            <p className="text-sm text-muted-foreground">{totalCount} total tickets across all workspaces</p>
          </div>
        </div>
        <Button variant="outline" size="default" data-testid="button-refresh-tickets" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Open", value: stats.open, icon: Clock, color: "text-yellow-500" },
          { label: "Escalated", value: stats.escalated, icon: AlertTriangle, color: "text-red-500" },
          { label: "Trinity Assigned", value: stats.trinity, icon: Brain, color: "text-purple-500" },
          { label: "Resolved", value: stats.resolved, icon: CheckCircle2, color: "text-green-500" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <s.icon className={`w-5 h-5 ${s.color} shrink-0`} />
              <div>
                <p className="text-2xl font-bold">{isLoading ? "—" : s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Priority Queue notice */}
      {queueData?.queue && queueData.queue.length > 0 && (
        <Card className="border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-900/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-yellow-600" />
              <span className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                {queueData.queue.length} ticket(s) in Trinity priority queue
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {queueData.queue.slice(0, 5).map((item: any) => (
                <Badge
                  key={item.id}
                  className={PRIORITY_BADGE[item.priority] || PRIORITY_BADGE.normal}
                  data-testid={`badge-queue-${item.id}`}
                >
                  {item.ticketNumber || item.id?.slice(0, 8)}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                data-testid="input-ticket-search"
                placeholder="Search by ticket #, workspace, subject…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={statusFilter} onValueChange={v => { setStatus(v); setPage(1); }}>
              <SelectTrigger data-testid="select-status-filter" className="w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="escalated">Escalated</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={v => { setPriority(v); setPage(1); }}>
              <SelectTrigger data-testid="select-priority-filter" className="w-36">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={v => { setCategory(v); setPage(1); }}>
              <SelectTrigger data-testid="select-category-filter" className="w-40">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="account">Account</SelectItem>
                <SelectItem value="payroll">Payroll</SelectItem>
                <SelectItem value="scheduling">Scheduling</SelectItem>
                <SelectItem value="onboarding">Onboarding</SelectItem>
                <SelectItem value="compliance">Compliance</SelectItem>
                <SelectItem value="technical">Technical</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Ticket List */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Ticket className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No tickets match your filters</p>
            </div>
          ) : (
            <div className="divide-y">
              {filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((ticket: any) => (
                <div
                  key={ticket.id}
                  data-testid={`row-ticket-${ticket.id}`}
                  className="flex items-start gap-3 p-4 hover-elevate cursor-pointer"
                  onClick={() => setLocation(`/admin/support-console?workspace=${ticket.workspaceId}`)}
                >
                  <div className="mt-0.5 shrink-0">
                    {ticket.assigned_to_trinity
                      ? <Brain className="w-4 h-4 text-purple-500" />
                      : <Ticket className="w-4 h-4 text-muted-foreground" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-muted-foreground" data-testid={`text-ticket-num-${ticket.id}`}>
                        {ticket.ticketNumber || ticket.id?.slice(0, 8)}
                      </span>
                      <Badge className={STATUS_BADGE[ticket.status] || ""} data-testid={`badge-status-${ticket.id}`}>
                        {ticket.status}
                      </Badge>
                      <Badge className={PRIORITY_BADGE[ticket.priority] || ""} data-testid={`badge-priority-${ticket.id}`}>
                        {ticket.priority}
                      </Badge>
                      {ticket.category && (
                        <Badge variant="outline" className="text-xs" data-testid={`badge-category-${ticket.id}`}>
                          {ticket.category}
                        </Badge>
                      )}
                      {ticket.trinity_attempted && (
                        <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 text-xs">
                          <Zap className="w-2.5 h-2.5 mr-1" />
                          Trinity tried
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium mt-1 truncate" data-testid={`text-subject-${ticket.id}`}>
                      {ticket.subject || ticket.description?.slice(0, 80)}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      {ticket.workspaceId && (
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3 h-3" />
                          {ticket.workspaceId.slice(0, 24)}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {timeAgo(ticket.createdAt || ticket.created_at)}
                      </span>
                      {ticket.time_to_resolution_minutes && (
                        <span className="text-green-600">
                          Resolved in {ticket.time_to_resolution_minutes}m
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <span className="text-sm text-muted-foreground">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="default"
                  data-testid="button-prev-page"
                  disabled={page === 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="default"
                  data-testid="button-next-page"
                  disabled={page * PAGE_SIZE >= filtered.length}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
