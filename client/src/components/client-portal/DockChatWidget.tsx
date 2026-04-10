import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  X,
  Send,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  Paperclip,
  DollarSign,
  Users,
  ThumbsDown,
  ShieldAlert,
  Star,
  HelpCircle,
  Bot,
  Sparkles,
  Shield,
  Zap,
  ArrowRight,
  Clock,
  FileText,
  Copy,
  Check,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

type ReportType =
  | "billing_discrepancy"
  | "staff_issue"
  | "complaint"
  | "violation"
  | "service_quality"
  | "other";

interface ChatMessage {
  role: "bot" | "user";
  content: string;
  timestamp: Date;
}

type WidgetState =
  | "closed"
  | "selecting"
  | "chatting"
  | "submitting"
  | "submitted";

interface DockChatWidgetProps {
  orgWorkspaceId: string;
  clientId?: string;
  clientName?: string;
  clientEmail?: string;
}

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  billing_discrepancy: "Billing",
  staff_issue: "Staff Issue",
  complaint: "Complaint",
  violation: "Violation",
  service_quality: "Quality",
  other: "Other",
};

const REPORT_TYPE_FULL_LABELS: Record<ReportType, string> = {
  billing_discrepancy: "Billing Discrepancy",
  staff_issue: "Staff / Personnel Issue",
  complaint: "Service Complaint",
  violation: "Policy Violation",
  service_quality: "Service Quality Issue",
  other: "Other Concern",
};

const REPORT_TYPE_DESCRIPTIONS: Record<ReportType, string> = {
  billing_discrepancy: "Incorrect charges, invoice errors, or payment disputes",
  staff_issue: "Concerns about a specific guard or staff member",
  complaint: "General dissatisfaction with our service",
  violation: "Breach of contract terms or post orders",
  service_quality: "Performance gaps or missed service requirements",
  other: "Any other issue you'd like to report",
};

const REPORT_TYPE_ICONS: Record<ReportType, typeof DollarSign> = {
  billing_discrepancy: DollarSign,
  staff_issue: Users,
  complaint: ThumbsDown,
  violation: ShieldAlert,
  service_quality: Star,
  other: HelpCircle,
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

export default function DockChatWidget({
  orgWorkspaceId,
  clientId,
  clientName,
  clientEmail,
}: DockChatWidgetProps) {
  const [widgetState, setWidgetState] = useState<WidgetState>("closed");
  const [reportType, setReportType] = useState<ReportType>("complaint");
  const [sessionId, setSessionId] = useState<string>("");
  const [ticketNumber, setTicketNumber] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [evidenceText, setEvidenceText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<{
    severity?: string;
    sentimentLabel?: string;
    recommendedActions?: string[];
    aiSummary?: string;
  } | null>(null);

  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const addBotMessage = (content: string) => {
    setMessages((prev) => [
      ...prev,
      { role: "bot", content, timestamp: new Date() },
    ]);
  };

  const addUserMessage = (content: string) => {
    setMessages((prev) => [
      ...prev,
      { role: "user", content, timestamp: new Date() },
    ]);
  };

  const startSession = async () => {
    setIsLoading(true);
    try {
      const result = await apiRequest("POST", "/api/clients/dockchat/start", {
        orgWorkspaceId,
        clientId,
        clientName,
        clientEmail,
        reportType,
      });

      // @ts-expect-error — TS migration: fix in refactoring sprint
      if (result.state === "credit_denied") {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        addBotMessage(result.message);
        return;
      }

      // @ts-expect-error — TS migration: fix in refactoring sprint
      setSessionId(result.sessionId);
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setTicketNumber(result.ticketNumber);
      setMessages([
        // @ts-expect-error — TS migration: fix in refactoring sprint
        { role: "bot", content: result.message, timestamp: new Date() },
      ]);
      setWidgetState("chatting");
    } catch (err: any) {
      addBotMessage(
        "Sorry, I couldn't start the session. Please try again or contact your security provider directly."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async () => {
    const msg = inputValue.trim();
    if (!msg || !sessionId) return;

    addUserMessage(msg);
    setInputValue("");
    setIsLoading(true);

    try {
      if (
        msg.toLowerCase() === "submit" ||
        msg.toLowerCase() === "/done" ||
        msg.toLowerCase() === "confirm"
      ) {
        await submitReport();
        return;
      }

      const result = await apiRequest("POST", "/api/clients/dockchat/message", {
        sessionId,
        message: msg,
        evidenceText: evidenceText || undefined,
      });

      // @ts-expect-error — TS migration: fix in refactoring sprint
      addBotMessage(result.message);

      // @ts-expect-error — TS migration: fix in refactoring sprint
      if (result.state === "satisfaction_check") {
        setTimeout(() => {
          addBotMessage(
            "Ready to submit? Type **submit** to finalize your report, or continue sharing details."
          );
        }, 600);
      }
    } catch (err: any) {
      addBotMessage(
        "I had trouble processing your message. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const submitReport = async () => {
    setWidgetState("submitting");
    setIsLoading(true);

    try {
      const result = await apiRequest("POST", "/api/clients/dockchat/close", {
        sessionId,
        title: `${REPORT_TYPE_FULL_LABELS[reportType]} — ${new Date().toLocaleDateString()}`,
      });

      // @ts-expect-error — TS migration: fix in refactoring sprint
      if (result.success) {
        setSubmissionResult({
          // @ts-expect-error — TS migration: fix in refactoring sprint
          severity: result.severity,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          sentimentLabel: result.sentimentLabel,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          recommendedActions: result.recommendedActions,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          aiSummary: result.aiSummary,
        });
        // @ts-expect-error — TS migration: fix in refactoring sprint
        setTicketNumber(result.ticketNumber || ticketNumber);
        // @ts-expect-error — TS migration: fix in refactoring sprint
        addBotMessage(result.message);
        setWidgetState("submitted");
      } else {
        addBotMessage(
          "There was an issue submitting your report. Please try again."
        );
        setWidgetState("chatting");
      }
    } catch (err: any) {
      addBotMessage(
        "Failed to submit report. Please contact your security provider directly."
      );
      setWidgetState("chatting");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const resetWidget = () => {
    setWidgetState("closed");
    setSessionId("");
    setTicketNumber("");
    setMessages([]);
    setInputValue("");
    setEvidenceText("");
    setShowEvidence(false);
    setSubmissionResult(null);
    setReportType("complaint");
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const renderFormattedLine = (line: string) => {
    const parts = line.split(/(\*\*.+?\*\*|__.+?__)/g);
    return parts.map((part, idx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={idx}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("__") && part.endsWith("__")) {
        return <strong key={idx}>{part.slice(2, -2)}</strong>;
      }
      return <span key={idx}>{part}</span>;
    });
  };

  if (widgetState === "closed") {
    return (
      <div className="fixed bottom-6 right-6 z-50" data-testid="dockchat-fab-container">
        <div className="relative">
          <div
            className="absolute inset-0 rounded-full pointer-events-none dockchat-glow"
          />
          <div
            className="absolute inset-0 rounded-full pointer-events-none dockchat-ring"
          />
          <div
            className="absolute inset-0 rounded-full pointer-events-none dockchat-ring-outer"
          />
          <div
            className="absolute inset-0 rounded-full pointer-events-none dockchat-ring-gradient"
          />
          <div className="relative h-14 w-14">
            <Button
              data-testid="button-open-dockchat"
              onClick={() => setWidgetState("selecting")}
              size="icon"
              className="rounded-full shadow-sm border-0 absolute inset-0 w-full h-full dockchat-fab-bg"
            >
              <Shield className="h-6 w-6" />
            </Button>
          </div>
        </div>
        <div className="absolute -top-1 -right-1 pointer-events-none" data-testid="status-fab-online">
          <span className="flex h-3.5 w-3.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 dockchat-status-ping" />
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-green-500 border border-background" />
          </span>
        </div>
      </div>
    );
  }

  if (widgetState === "selecting") {
    return (
      <div
        className="fixed z-50 shadow-sm border bg-card flex flex-col overflow-hidden dockchat-slide-up max-sm:inset-0 max-sm:w-full max-sm:h-full max-sm:rounded-none sm:bottom-6 sm:right-6 sm:w-[380px] sm:rounded-md"
        style={{ maxHeight: '100dvh' }}
      >
        <div
          className="relative flex items-center justify-between gap-2 p-3 sm:p-4 border-b text-primary-foreground dockchat-header-bg dockchat-header-shine"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))' }}
        >
          <div
            className="absolute inset-0 opacity-[0.07] pointer-events-none dockchat-dot-pattern"
          />
          <div className="relative flex items-center gap-2.5">
            <div className="relative">
              <div className="flex items-center justify-center h-9 w-9 rounded-full bg-white/15 backdrop-blur-sm border border-white/10">
                <Shield className="h-4.5 w-4.5" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60 dockchat-status-ping" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-400 border border-white/30" />
              </span>
            </div>
            <div>
              <span className="font-semibold text-sm block">Report an Issue</span>
              <span className="text-xs opacity-70 flex items-center gap-1">
                <Zap className="h-2.5 w-2.5" />
                AI-powered assistant
              </span>
            </div>
          </div>
          <Button
            data-testid="button-close-dockchat"
            variant="ghost"
            size="icon"
            onClick={resetWidget}
            className="relative text-primary-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Select the type of concern you'd like to report. Our AI assistant will guide you through documenting it.
          </p>

          <div className="space-y-2.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              What are you reporting?
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(REPORT_TYPE_LABELS) as ReportType[]).map((type) => {
                const Icon = REPORT_TYPE_ICONS[type];
                const isSelected = reportType === type;
                return (
                  <button
                    key={type}
                    data-testid={`card-report-type-${type}`}
                    onClick={() => setReportType(type)}
                    className={`group relative flex flex-col items-center gap-1.5 p-3 rounded-md border text-center transition-colors cursor-pointer ${
                      isSelected
                        ? "border-primary bg-primary/5 dark:bg-primary/10 shadow-sm dockchat-card-selected"
                        : "border-border hover-elevate"
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute top-1 right-1">
                        <Check className="h-3 w-3 text-primary" />
                      </div>
                    )}
                    <div
                      className={`flex items-center justify-center h-9 w-9 rounded-md transition-colors ${
                        isSelected
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-muted text-muted-foreground group-hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className={`text-[11px] font-medium leading-tight ${isSelected ? "text-primary" : "text-foreground"}`}>
                      {REPORT_TYPE_LABELS[type]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-md border p-3 bg-muted/30 flex items-start gap-2.5 dockchat-desc-fade-in">
            <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 shrink-0 mt-0.5">
              <FileText className="h-3 w-3 text-primary" />
            </div>
            <div>
              <span className="text-xs font-medium text-foreground block mb-0.5">
                {REPORT_TYPE_FULL_LABELS[reportType]}
              </span>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {REPORT_TYPE_DESCRIPTIONS[reportType]}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Badge variant="secondary" className="text-[10px]">
                <Zap className="h-2.5 w-2.5 mr-0.5" />
                10 credits
              </Badge>
              <span>per session</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Shield className="h-2.5 w-2.5" />
              <span>Encrypted</span>
            </div>
          </div>

          <Button
            data-testid="button-start-dockchat"
            onClick={startSession}
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Start AI Session
            {!isLoading && <ArrowRight className="h-3.5 w-3.5 ml-1" />}
          </Button>
        </div>
      </div>
    );
  }

  if (widgetState === "submitted") {
    return (
      <div
        className="fixed z-50 shadow-sm border bg-card flex flex-col overflow-hidden dockchat-slide-up max-sm:inset-0 max-sm:w-full max-sm:h-full max-sm:rounded-none sm:bottom-6 sm:right-6 sm:w-[380px] sm:rounded-md"
        style={{ maxHeight: '100dvh' }}
      >
        <div
          className="relative flex items-center justify-between gap-2 p-3 sm:p-4 border-b text-white dockchat-success-bg dockchat-header-shine"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))' }}
        >
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center h-9 w-9 rounded-full bg-white/15 backdrop-blur-sm border border-white/10">
              <CheckCircle2 className="h-4.5 w-4.5" />
            </div>
            <div>
              <span className="font-semibold text-sm block">Report Submitted</span>
              <span className="text-xs opacity-70 flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                Successfully processed
              </span>
            </div>
          </div>
          <Button
            data-testid="button-close-submitted"
            variant="ghost"
            size="icon"
            onClick={resetWidget}
            className="text-white"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1 max-h-80">
          <div className="p-4 space-y-3">
            <div className="text-center py-3">
              <div
                className="inline-flex items-center justify-center h-16 w-16 rounded-full mb-3 dockchat-success-ring dockchat-scale-in"
              >
                <div className="flex items-center justify-center h-11 w-11 rounded-full bg-green-100 dark:bg-green-900/40">
                  <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <p className="text-sm font-semibold" data-testid="text-submission-confirmed">Report submitted successfully</p>
              <p className="text-xs text-muted-foreground mt-1">Your provider has been notified</p>
            </div>

            <div className="rounded-md border border-primary/20 bg-primary/5 dark:bg-primary/10 p-3.5 text-center dockchat-ticket-card">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
                Reference Number
              </span>
              <span
                className="text-xl font-bold font-mono tracking-widest text-primary block"
                data-testid="text-ticket-number"
              >
                {ticketNumber}
              </span>
              <button
                data-testid="button-copy-ticket"
                onClick={() => {
                  navigator.clipboard?.writeText(ticketNumber);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="inline-flex items-center gap-1 mt-2 text-[10px] text-muted-foreground transition-colors cursor-pointer hover-elevate rounded-md px-2 py-0.5"
              >
                {copied ? <Check className="h-2.5 w-2.5 text-green-500" /> : <Copy className="h-2.5 w-2.5" />}
                {copied ? "Copied" : "Copy reference"}
              </button>
            </div>

            {(submissionResult?.severity || submissionResult?.sentimentLabel) && (
              <div className="rounded-md border p-3 space-y-2.5">
                {submissionResult?.severity && (
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      Severity
                    </span>
                    <span
                      className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${
                        SEVERITY_COLORS[submissionResult.severity] ||
                        SEVERITY_COLORS.medium
                      }`}
                      data-testid="text-severity-level"
                    >
                      {submissionResult.severity?.toUpperCase()}
                    </span>
                  </div>
                )}
                {submissionResult?.sentimentLabel && (
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      Sentiment
                    </span>
                    <span className="text-xs capitalize" data-testid="text-sentiment-label">
                      {submissionResult.sentimentLabel}
                    </span>
                  </div>
                )}
              </div>
            )}

            {submissionResult?.aiSummary && (
              <div className="rounded-md border border-primary/20 p-3 bg-primary/5 dark:bg-primary/10">
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 dockchat-ai-pulse">
                    <Sparkles className="h-3 w-3 text-primary" />
                  </div>
                  <span className="text-xs font-semibold text-primary">AI Summary</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed" data-testid="text-ai-summary">
                  {submissionResult.aiSummary}
                </p>
              </div>
            )}

            {messages.slice(-1).map((msg, i) => (
              <div key={i} className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
                {msg.content.replace(/\*\*/g, "")}
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="p-4 border-t space-y-2">
          <Button
            data-testid="button-new-report"
            variant="outline"
            onClick={resetWidget}
            className="w-full"
          >
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            Submit Another Report
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed z-50 shadow-sm border bg-card flex flex-col overflow-hidden dockchat-slide-up max-sm:inset-0 max-sm:w-full max-sm:h-full max-sm:rounded-none sm:bottom-6 sm:right-6 sm:w-[380px] sm:rounded-md sm:max-h-[560px]"
      style={{ maxHeight: '100dvh' }}
    >
      <div
        className="relative flex items-center justify-between gap-2 p-3 border-b text-primary-foreground shrink-0 dockchat-header-bg dockchat-header-shine"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))' }}
      >
        <div
          className="absolute inset-0 opacity-[0.05] pointer-events-none dockchat-dot-pattern-sm"
        />
        <div className="relative flex items-center gap-2.5 min-w-0">
          <div className="relative shrink-0">
            <div className="flex items-center justify-center h-9 w-9 rounded-full bg-white/15 backdrop-blur-sm border border-white/10">
              <Shield className="h-4 w-4" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
              <span
                className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60 dockchat-status-ping"
              />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500 border border-white/30" />
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">HelpAI</span>
              <div className="flex items-center gap-1 shrink-0">
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-green-400 dockchat-ai-indicator" />
                <span className="text-[10px] opacity-80">Online</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge
                variant="secondary"
                className="text-[10px] bg-white/20 text-white border-0 shrink-0"
              >
                {REPORT_TYPE_LABELS[reportType]}
              </Badge>
              {ticketNumber && (
                <span
                  className="text-[10px] opacity-60 font-mono"
                  data-testid="text-session-ticket"
                >
                  {ticketNumber}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="relative flex items-center gap-1 shrink-0">
          <Button
            data-testid="button-minimize-dockchat"
            variant="ghost"
            size="icon"
            onClick={() => setWidgetState("closed")}
            className="text-primary-foreground"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button
            data-testid="button-close-dockchat-chat"
            variant="ghost"
            size="icon"
            onClick={resetWidget}
            className="text-primary-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0"
        data-testid="chat-messages-area"
      >
        {messages.map((msg, i) => {
          const isUser = msg.role === "user";
          const isFirstInGroup = i === 0 || messages[i - 1].role !== msg.role;
          const isLastInGroup = i === messages.length - 1 || messages[i + 1]?.role !== msg.role;
          return (
            <div
              key={i}
              className={`flex gap-2 dockchat-msg-in ${isUser ? "justify-end" : "justify-start"}`}
            >
              {!isUser && isFirstInGroup && (
                <div className="flex items-end shrink-0">
                  <div className="relative">
                    <div className="flex items-center justify-center h-7 w-7 rounded-full bg-primary/10 dark:bg-primary/20">
                      <Bot className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div
                      className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary border border-background flex items-center justify-center dockchat-ai-pulse"
                    >
                      <Sparkles className="w-1.5 h-1.5 text-primary-foreground" />
                    </div>
                  </div>
                </div>
              )}
              {!isUser && !isFirstInGroup && <div className="w-7 shrink-0" />}
              <div className="flex flex-col max-w-[80%]">
                <div
                  className={`relative px-3 py-2 text-sm leading-relaxed shadow-sm ${
                    isUser
                      ? `bg-primary text-primary-foreground ${
                          isLastInGroup ? "rounded-md rounded-br-sm dockchat-bubble-user" : "rounded-md"
                        }`
                      : `bg-muted text-foreground ${
                          isLastInGroup ? "rounded-md rounded-bl-sm dockchat-bubble-bot" : "rounded-md"
                        }`
                  }`}
                  data-testid={`message-${msg.role}-${i}`}
                >
                  {msg.content.split("\n").map((line, j) => (
                    <span key={j}>
                      {renderFormattedLine(line)}
                      {j < msg.content.split("\n").length - 1 && <br />}
                    </span>
                  ))}
                </div>
                <span className={`text-[10px] text-muted-foreground mt-0.5 ${isUser ? "text-right" : "text-left"}`}>
                  {formatTime(msg.timestamp)}
                </span>
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex gap-2 justify-start dockchat-msg-in" data-testid="typing-indicator">
            <div className="flex items-end shrink-0">
              <div className="relative">
                <div className="flex items-center justify-center h-7 w-7 rounded-full bg-primary/10 dark:bg-primary/20">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary border border-background flex items-center justify-center dockchat-ai-pulse-fast">
                  <Sparkles className="w-1.5 h-1.5 text-primary-foreground" />
                </div>
              </div>
            </div>
            <div className="dockchat-typing-bar px-4 py-2.5 shadow-sm">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-primary/70 dockchat-wave-dot dockchat-wave-dot-1" />
                  <span className="inline-block h-2 w-2 rounded-full bg-primary/70 dockchat-wave-dot dockchat-wave-dot-2" />
                  <span className="inline-block h-2 w-2 rounded-full bg-primary/70 dockchat-wave-dot dockchat-wave-dot-3" />
                </div>
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Sparkles className="h-2.5 w-2.5 text-primary/50" />
                  AI is analyzing
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {showEvidence && (
        <div className="px-3 pb-2 shrink-0">
          <Textarea
            data-testid="input-evidence"
            placeholder="Paste evidence details here (invoice numbers, dates, names, descriptions)..."
            value={evidenceText}
            onChange={(e) => setEvidenceText(e.target.value)}
            className="text-xs resize-none"
            rows={3}
          />
        </div>
      )}

      {widgetState === "chatting" && messages.length >= 2 && (
        <div className="px-3 pb-2 shrink-0">
          <Button
            data-testid="button-submit-report"
            variant="outline"
            size="sm"
            onClick={submitReport}
            disabled={isLoading}
            className="w-full text-xs border-primary/30 text-primary"
          >
            {isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <CheckCircle2 className="h-3 w-3 mr-1" />
            )}
            Submit Report & Generate Summary
          </Button>
        </div>
      )}

      <div className="p-3 border-t bg-background shrink-0">
        <div className="flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <Textarea
              ref={inputRef}
              data-testid="input-chat-message"
              placeholder={
                widgetState === "submitting"
                  ? "Submitting..."
                  : "Describe your issue..."
              }
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading || widgetState === "submitting"}
              className="text-sm resize-none min-h-[40px] max-h-24"
              rows={1}
            />
          </div>
          <div className="flex gap-1 shrink-0">
            <Button
              data-testid="button-attach-evidence"
              variant="ghost"
              size="icon"
              onClick={() => setShowEvidence(!showEvidence)}
              title="Attach evidence"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              data-testid="button-send-message"
              size="icon"
              onClick={sendMessage}
              disabled={!inputValue.trim() || isLoading || widgetState === "submitting"}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5 opacity-70">
          Enter to send · Shift+Enter for new line · Type{" "}
          <code className="text-[10px] bg-muted px-1 rounded">/done</code> to
          submit
        </p>
      </div>

    </div>
  );
}
