/**
 * Org Operations Briefing Channel
 * ===================================
 * Leadership-only intelligence feed. Trinity auto-posts daily ops briefings,
 * escalations, advisory insights, cash-flow alerts, compliance flags, and
 * OT risk summaries here. Managers and owners only.
 *
 * Route: /briefing-channel
 * Access: org_owner, co_owner, manager, department_manager
 */

import { useState, useRef } from "react";
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow, parseISO, isValid } from "date-fns";
import {
  Radio,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Volume2,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { TrinityLogo } from "@/components/ui/coaileague-logo-mark";
import { useTrinityModal } from "@/components/trinity-chat-modal";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { queryClient, apiRequest } from "@/lib/queryClient";

type BriefingPriority = "critical" | "high" | "normal" | "low";
type BriefingType = "briefing";

interface BriefingPost {
  id: string;
  type: BriefingType;
  priority: BriefingPriority;
  title: string;
  message: string;
  richContent?: {
    isBriefingChannel?: boolean;
    category?: string;
    creditCost?: number;
    confidenceScore?: number;
  };
  createdAt: string;
  isActive: boolean;
}

const PRIORITY_STYLES: Record<BriefingPriority, { border: string; badgeBg: string; badgeText: string; label: string }> = {
  critical: { border: "border-l-4 border-l-red-500", badgeBg: "bg-red-500", badgeText: "text-white", label: "CRITICAL" },
  high:     { border: "border-l-4 border-l-amber-500", badgeBg: "bg-amber-500", badgeText: "text-white", label: "HIGH" },
  normal:   { border: "border-l-4 border-l-cyan-500", badgeBg: "bg-cyan-100 dark:bg-cyan-900", badgeText: "text-cyan-700 dark:text-cyan-300", label: "BRIEFING" },
  low:      { border: "border-l-2 border-l-slate-300", badgeBg: "bg-slate-100 dark:bg-slate-800", badgeText: "text-slate-600 dark:text-slate-300", label: "INFO" },
};

function safeFormatTime(dateStr: string): string {
  try {
    const d = parseISO(dateStr);
    if (!isValid(d)) return dateStr;
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return dateStr;
  }
}

function BriefingCard({ post }: { post: BriefingPost }) {
  const [expanded, setExpanded] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { openWithContext } = useTrinityModal();
  const style = PRIORITY_STYLES[post.priority] || PRIORITY_STYLES.normal;
  const category = post.richContent?.category || "BRIEFING";
  const confidenceScore = post.richContent?.confidenceScore;
  const lines = post.message.split("\n").filter(Boolean);

  async function handlePlayTTS() {
    if (ttsLoading) return;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setTtsLoading(true);
    try {
      const ttsText = `${post.title}. ${post.message.replace(/\n/g, ' ')}`;
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const blob = await apiRequest("POST", "/api/voice/tts", { text: ttsText, voice: "alloy" }, { responseType: 'blob' });
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => URL.revokeObjectURL(url);
      audio.play();
    } catch {
    } finally {
      setTtsLoading(false);
    }
  }

  const preview = lines.slice(0, 3);
  const rest = lines.slice(3);
  const hasMore = rest.length > 0;

  const handleAskTrinity = () => {
    openWithContext(
      `Regarding this ops briefing: "${post.title}"\n\n${post.message}\n\nCan you help me understand this situation and what action I should take?`
    );
  };

  return (
    <div
      className={`rounded-md bg-card mb-3 overflow-hidden ${style.border} shadow-sm`}
      data-testid={`briefing-card-${post.id}`}
    >
      {/* Category Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50 bg-muted/20">
        <TrinityLogo size={16} />
        <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
          {category}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {confidenceScore !== undefined && (
            <Badge
              variant="secondary"
              className="text-[9px] px-1.5 py-0 h-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-0"
            >
              {confidenceScore}% confidence
            </Badge>
          )}
          <Badge
            className={`text-[9px] px-1.5 py-0 h-4 font-bold ${style.badgeBg} ${style.badgeText} border-0`}
          >
            {style.label}
          </Badge>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            {safeFormatTime(post.createdAt)}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-3">
        <h3 className="font-semibold text-sm mb-2">{post.title}</h3>
        <div className="text-sm text-muted-foreground space-y-0.5">
          {preview.map((line, i) => (
            <p key={i} className="leading-relaxed">
              {line}
            </p>
          ))}
          {hasMore && expanded && rest.map((line, i) => (
            <p key={i} className="leading-relaxed">
              {line}
            </p>
          ))}
        </div>

        {/* Expand/Collapse */}
        {hasMore && (
          <button
            className="flex items-center gap-1 text-[11px] text-muted-foreground mt-2 hover:text-foreground transition-colors"
            onClick={() => setExpanded(e => !e)}
            data-testid={`briefing-expand-${post.id}`}
          >
            {expanded ? (
              <><ChevronUp className="h-3 w-3" /> Show less</>
            ) : (
              <><ChevronDown className="h-3 w-3" /> Show {rest.length} more line{rest.length > 1 ? "s" : ""}</>
            )}
          </button>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 mt-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={handleAskTrinity}
            data-testid={`briefing-ask-trinity-${post.id}`}
          >
            <TrinityLogo size={12} />
            <span className="ml-1">Ask Trinity</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={handlePlayTTS}
            disabled={ttsLoading}
            data-testid={`briefing-play-tts-${post.id}`}
          >
            {ttsLoading ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Volume2 className="h-3 w-3 mr-1" />
            )}
            {ttsLoading ? "Loading..." : "Play Audio"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function BriefingChannelPage() {
  const { workspaceRole } = useWorkspaceAccess();
  const { openWithContext } = useTrinityModal();

  // Guard — only managers/owners see this
  const isAuthorized = ["org_owner", "co_owner", "department_manager", "supervisor"].includes(
    workspaceRole || ""
  );

  const {
    data: posts,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery<BriefingPost[]>({
    queryKey: ["/api/broadcasts/briefing"],
    enabled: isAuthorized,
    staleTime: 60_000,
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/broadcasts/briefing"] });
    refetch();
  };

  const handleAskTrinityForBriefing = () => {
    openWithContext(
      "Can you give me a comprehensive operations briefing for today? Include shift coverage, missed punches, upcoming certification expirations, overdue invoices, and any financial alerts."
    );
  };

  if (!isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-muted-foreground">
        <Radio className="h-12 w-12 opacity-30" />
        <p className="text-sm">Access restricted to managers and owners.</p>
      </div>
    );
  }

  const pageConfig: CanvasPageConfig = {
    id: 'briefing-channel',
    title: 'Ops Briefing Channel',
    category: 'communication',
    showHeader: false,
  };

  return (
    <CanvasHubPage config={pageConfig}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-cyan-500" />
            <h1 className="text-lg font-bold">Ops Briefing Channel</h1>
          </div>
          <Badge
            variant="secondary"
            className="text-[9px] px-2 py-0 h-4 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-0 font-semibold"
          >
            TRINITY INTELLIGENCE
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={handleAskTrinityForBriefing}
            data-testid="button-briefing-ask-trinity"
          >
            <TrinityLogo size={14} />
            <span className="ml-1.5">Ask for briefing</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleRefresh}
            disabled={isFetching}
            data-testid="button-briefing-refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Subtitle */}
      <div className="px-6 py-2 border-b border-border/50 bg-muted/20">
        <p className="text-xs text-muted-foreground">
          Trinity posts operational intelligence here automatically — daily briefings, escalations, cash flow alerts, compliance flags, and advisory insights. Visible to managers and owners only.
        </p>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="px-6 py-4">
          {isLoading && (
            <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading briefings...</span>
            </div>
          )}

          {isError && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 opacity-40" />
              <p className="text-sm">Failed to load briefings. Check your connection and try again.</p>
              <Button variant="outline" size="sm" onClick={handleRefresh} data-testid="button-briefing-retry">
                Retry
              </Button>
            </div>
          )}

          {!isLoading && !isError && (!posts || posts.length === 0) && (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-muted-foreground">
              <div className="flex items-center justify-center h-16 w-16 rounded-full bg-cyan-500/10">
                <Radio className="h-8 w-8 text-cyan-500/60" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">No briefings yet</p>
                <p className="text-xs mt-1">
                  Trinity will post operational briefings here during the next scheduled scan.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAskTrinityForBriefing}
                data-testid="button-briefing-request-now"
              >
                <TrinityLogo size={14} />
                <span className="ml-1.5">Request briefing now</span>
              </Button>
            </div>
          )}

          {!isLoading && !isError && posts && posts.length > 0 && (
            <div>
              {/* Stats row */}
              <div className="flex items-center gap-4 mb-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-cyan-500" />
                  {posts.length} briefing{posts.length !== 1 ? "s" : ""} posted
                </span>
                {posts.some(p => p.priority === "critical") && (
                  <span className="flex items-center gap-1 text-red-500 font-medium">
                    <AlertTriangle className="h-3 w-3" />
                    {posts.filter(p => p.priority === "critical").length} critical
                  </span>
                )}
              </div>

              <Separator className="mb-4" />

              {/* Briefing cards — critical first, then by date */}
              {[...posts]
                .sort((a, b) => {
                  const pScore: Record<string, number> = { critical: 4, high: 3, normal: 2, low: 1 };
                  const pd = (pScore[b.priority] || 0) - (pScore[a.priority] || 0);
                  if (pd !== 0) return pd;
                  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                })
                .map(post => (
                  <BriefingCard key={post.id} post={post} />
                ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </CanvasHubPage>
  );
}
