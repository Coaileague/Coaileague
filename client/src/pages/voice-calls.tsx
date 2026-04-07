import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import {
  PhoneCall, PhoneOff, Clock, Search, Download,
  FileText, MicOff, Phone
} from "lucide-react";

interface CallSession {
  id: string;
  twilioCallSid: string;
  callerNumber?: string;
  callerName?: string;
  status: string;
  extensionReached?: string;
  extensionLabel?: string;
  language: string;
  startedAt: string;
  endedAt?: string;
  durationSeconds?: number;
  actualCostCents?: number;
  transcript?: string;
  recordingUrl?: string;
  clockInSuccess?: boolean;
  clockInReferenceId?: string;
}

interface TranscriptData {
  transcript?: string;
  recordingUrl?: string;
  session: CallSession;
}

const STATUS_COLORS: Record<string, string> = {
  completed: "text-green-600 border-green-200",
  "in_progress": "text-blue-600 border-blue-200",
  failed: "text-destructive border-destructive/30",
  "no-answer": "text-muted-foreground border-muted",
  initiated: "text-muted-foreground border-muted",
};

const EXT_LABELS: Record<string, string> = {
  sales: "Sales",
  client_support: "Client Support",
  employment_verification: "Verification",
  staff: "Staff",
  emergency: "Emergency",
  careers: "Careers",
  unknown: "Unknown",
};

function formatDuration(sec?: number) {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString([], {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function formatDollars(cents?: number) {
  if (!cents) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function TranscriptModal({ call }: { call: CallSession }) {
  const { data, isLoading } = useQuery<TranscriptData>({
    queryKey: ["/api/voice/calls", call.id, "transcript"],
    queryFn: () =>
      fetch(`/api/voice/calls/${call.id}/transcript`, { credentials: "include" }).then(r => r.json()),
    enabled: true,
  });

  return (
    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Call Transcript — {call.callerNumber || "Unknown"}
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Status</p>
            <Badge variant="outline" className={STATUS_COLORS[call.status] || ""}>
              {call.status}
            </Badge>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Duration</p>
            <p className="font-medium">{formatDuration(call.durationSeconds)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Extension</p>
            <p className="font-medium">{EXT_LABELS[call.extensionLabel || ""] || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Language</p>
            <p className="font-medium">{call.language === "es" ? "Spanish" : "English"}</p>
          </div>
        </div>

        {call.clockInSuccess && call.clockInReferenceId && (
          <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-md border border-green-200 dark:border-green-900">
            <p className="text-sm font-medium text-green-800 dark:text-green-200">
              Voice Clock-In Successful
            </p>
            <p className="text-xs text-green-600 dark:text-green-400">
              Reference: {call.clockInReferenceId}
            </p>
          </div>
        )}

        {isLoading ? (
          <div className="h-32 bg-muted rounded-md animate-pulse" />
        ) : data?.recordingUrl ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Recording</p>
            <audio controls className="w-full" data-testid="audio-recording">
              <source src={data.recordingUrl} />
            </audio>
          </div>
        ) : null}

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Transcript</p>
          {isLoading ? (
            <div className="space-y-1">
              {[1, 2, 3].map(i => <div key={i} className="h-4 bg-muted rounded animate-pulse" />)}
            </div>
          ) : data?.transcript ? (
            <pre className="text-sm whitespace-pre-wrap font-sans bg-muted/40 p-3 rounded-md max-h-64 overflow-y-auto" data-testid="text-transcript">
              {data.transcript}
            </pre>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <MicOff className="h-4 w-4" />
              <p className="text-sm">No transcript available for this call.</p>
            </div>
          )}
        </div>
      </div>
    </DialogContent>
  );
}

function exportToCSV(calls: CallSession[]) {
  const headers = ["Caller", "Status", "Extension", "Language", "Started", "Duration", "Cost", "Clock-In Ref"];
  const rows = calls.map(c => [
    c.callerNumber || "",
    c.status,
    EXT_LABELS[c.extensionLabel || ""] || "",
    c.language,
    formatTime(c.startedAt),
    formatDuration(c.durationSeconds),
    formatDollars(c.actualCostCents),
    c.clockInReferenceId || "",
  ]);

  const csvContent = [headers, ...rows].map(row => row.map(v => `"${v}"`).join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `voice-calls-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function VoiceCallsPage() {
  const [search, setSearch] = useState("");
  const [selectedCall, setSelectedCall] = useState<CallSession | null>(null);

  const { data, isLoading } = useQuery<{ calls: CallSession[]; total: number }>({
    queryKey: ["/api/voice/calls"],
  });

  const calls = data?.calls || [];

  const filtered = calls.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (c.callerNumber || "").includes(q) ||
      (c.extensionLabel || "").includes(q) ||
      (c.status || "").includes(q) ||
      (c.clockInReferenceId || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <PhoneCall className="h-6 w-6" />
            Voice Call History
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Inbound call log with transcripts and clock-in records
          </p>
        </div>
        <Button
          variant="outline"
          data-testid="button-export-csv"
          onClick={() => exportToCSV(filtered)}
          disabled={filtered.length === 0}
        >
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          data-testid="input-search-calls"
          placeholder="Search by caller, extension, status, or reference..."
          className="pl-9"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">Call Log</CardTitle>
            <Badge variant="outline">
              {isLoading ? "..." : `${filtered.length} call${filtered.length !== 1 ? "s" : ""}`}
            </Badge>
          </div>
          <CardDescription>All inbound calls answered by Trinity</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-14 bg-muted rounded-md animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Phone className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{search ? "No calls match your search." : "No calls recorded yet."}</p>
              {!search && (
                <p className="text-xs mt-1">Calls will appear here once Trinity starts answering.</p>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map(call => (
                <div
                  key={call.id}
                  data-testid={`row-call-${call.id}`}
                  className="py-3 flex items-center justify-between gap-3 flex-wrap"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
                      call.status === "completed" ? "bg-green-100 dark:bg-green-950" : "bg-muted"
                    }`}>
                      {call.status === "completed" ? (
                        <PhoneCall className="h-4 w-4 text-green-600" />
                      ) : (
                        <PhoneOff className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" data-testid={`text-caller-${call.id}`}>
                        {call.callerNumber || "Unknown"}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">{formatTime(call.startedAt)}</span>
                        {call.extensionLabel && (
                          <span className="text-xs text-muted-foreground">
                            · {EXT_LABELS[call.extensionLabel] || call.extensionLabel}
                          </span>
                        )}
                        {call.clockInSuccess && (
                          <Badge variant="secondary" className="text-xs">Clock-In</Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="hidden sm:flex items-center gap-1 text-muted-foreground text-xs">
                      <Clock className="h-3 w-3" />
                      {formatDuration(call.durationSeconds)}
                    </div>
                    <Badge variant="outline" className={`text-xs ${STATUS_COLORS[call.status] || ""}`}>
                      {call.status}
                    </Badge>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          data-testid={`button-view-transcript-${call.id}`}
                          onClick={() => setSelectedCall(call)}
                        >
                          <FileText className="h-3.5 w-3.5" />
                        </Button>
                      </DialogTrigger>
                      <TranscriptModal call={call} />
                    </Dialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
