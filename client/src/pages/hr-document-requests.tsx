/**
 * HR Document Requests
 * ====================
 * Mass-send or individually send onboarding and HR document requests
 * to selected employees. Supports:
 * - Full Onboarding Packet
 * - I-9 Employment Eligibility
 * - W-4 Tax Withholding (Employee)
 * - W-9 Tax Information (Contractor)
 * - Drug-Free Workplace Acknowledgment
 * - Drug Testing Request
 * - Guard Card / License Update
 *
 * Trinity can also send these via chatdock: "Send I9 requests to all missing guards"
 *
 * Credit fees:
 *   - Full Onboarding: 5 credits/employee
 *   - All other types: 2 credits/employee/document
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Send,
  Users,
  FileText,
  Shield,
  ClipboardCheck,
  FlaskConical,
  CreditCard,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronRight,
  MailCheck,
  Briefcase,
  XCircle,
  Coins,
  IdCard,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format, formatDistanceToNow } from "date-fns";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

// ─── TYPES ──────────────────────────────────────────────────────────────────

interface DocType {
  label: string;
  description: string;
  creditCost: number;
  emailSubject: string;
  urgency: string;
  icon: string;
}

interface DocTypesResponse {
  types: Record<string, DocType>;
}

interface EmployeeGap {
  employeeId: string;
  employeeName: string;
  email: string;
  position: string;
  taxClassification: string;
  missingDocuments: string[];
  guardCardExpiryDays: number | null;
  lastRequestSentAt: string | null;
  pendingRequests: number;
}

interface GapsResponse {
  gaps: EmployeeGap[];
  totalGaps: number;
  totalEmployees: number;
}

interface HrDocumentRequest {
  id: string;
  workspaceId: string;
  sentByName: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  documentType: string;
  status: string;
  notes: string | null;
  creditsCharged: number;
  sentVia: string;
  sentAt: string;
  openedAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
}

interface SendResult {
  employeeId: string;
  employeeName: string;
  docType: string;
  success: boolean;
  error?: string;
}

interface SendResponse {
  success: boolean;
  results: SendResult[];
  summary: { sent: number; failed: number; creditsCharged: number };
}

// ─── DOC TYPE ICONS ─────────────────────────────────────────────────────────
const DOC_ICONS: Record<string, React.ReactNode> = {
  full_onboarding: <Briefcase className="h-5 w-5" />,
  i9: <Shield className="h-5 w-5" />,
  w4: <FileText className="h-5 w-5" />,
  w9: <FileText className="h-5 w-5" />,
  drug_free_acknowledgment: <ClipboardCheck className="h-5 w-5" />,
  drug_test_request: <FlaskConical className="h-5 w-5" />,
  guard_card_update: <IdCard className="h-5 w-5" />,
};

const URGENCY_COLORS: Record<string, string> = {
  high: "destructive",
  medium: "secondary",
  low: "outline",
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  sent: { label: "Sent", icon: <Clock className="h-3 w-3" />, color: "secondary" },
  opened: { label: "Opened", icon: <MailCheck className="h-3 w-3" />, color: "outline" },
  completed: { label: "Completed", icon: <CheckCircle2 className="h-3 w-3" />, color: "default" },
  expired: { label: "Expired", icon: <XCircle className="h-3 w-3" />, color: "destructive" },
};

// ─── PAGE CONFIG ─────────────────────────────────────────────────────────────
const pageConfig: CanvasPageConfig = {
  title: "Document Requests",
  description: "Mass-send or individually send HR documents to employees — I-9, W-4, W-9, drug testing, guard card updates, and full onboarding packets",
  icon: Send,
  actions: [],
};

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────
export default function HrDocumentRequests() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"send" | "gaps" | "history">("send");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const [selectedDocTypes, setSelectedDocTypes] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [gapFilter, setGapFilter] = useState<string>("all");

  // ─── QUERIES ───────────────────────────────────────────────────────────────

  const { data: typesData, isLoading: typesLoading } = useQuery<DocTypesResponse>({
    queryKey: ["/api/hr/document-requests/types"],
  });

  const { data: gapsData, isLoading: gapsLoading } = useQuery<GapsResponse>({
    queryKey: ["/api/hr/document-requests/gaps"],
    enabled: tab === "gaps" || tab === "send",
  });

  const { data: historyData, isLoading: historyLoading } = useQuery<{ requests: HrDocumentRequest[] }>({
    queryKey: ["/api/hr/document-requests"],
    enabled: tab === "history",
  });

  const sendMutation = useMutation<SendResponse, Error, { employeeIds: string[]; documentTypes: string[]; notes?: string }>({
    mutationFn: (body) => apiRequest("POST", "/api/hr/document-requests/send", body),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/hr/document-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hr/document-requests/gaps"] });
      toast({
        title: `${data.summary.sent} Request${data.summary.sent !== 1 ? "s" : ""} Sent`,
        description: `${data.summary.creditsCharged} credits charged. ${data.summary.failed > 0 ? `${data.summary.failed} failed.` : ""}`,
      });
      setSelectedEmployees(new Set());
      setSelectedDocTypes(new Set());
      setNotes("");
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || "Failed to send requests";
      toast({ title: "Send Failed", description: msg, variant: "destructive" });
    },
  });

  // ─── DERIVED DATA ──────────────────────────────────────────────────────────

  const docTypes = typesData?.types || {};
  const allEmployeesWithGaps = gapsData?.gaps || [];

  const filteredEmployees = useMemo(() => {
    let list = allEmployeesWithGaps;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(e => e.employeeName.toLowerCase().includes(q) || e.email?.toLowerCase().includes(q));
    }
    if (gapFilter !== "all") {
      list = list.filter(e => e.missingDocuments.includes(gapFilter));
    }
    return list;
  }, [allEmployeesWithGaps, searchQuery, gapFilter]);

  const selectedDocTypesList = Array.from(selectedDocTypes);
  const selectedEmployeesList = Array.from(selectedEmployees);

  const totalCreditCost = useMemo(() => {
    return selectedEmployeesList.length * selectedDocTypesList.reduce((sum, dt) => {
      return sum + (docTypes[dt]?.creditCost || 2);
    }, 0);
  }, [selectedEmployeesList.length, selectedDocTypesList, docTypes]);

  // ─── HELPERS ──────────────────────────────────────────────────────────────

  function toggleEmployee(id: string) {
    setSelectedEmployees(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleDocType(key: string) {
    setSelectedDocTypes(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedEmployees.size === filteredEmployees.length) {
      setSelectedEmployees(new Set());
    } else {
      setSelectedEmployees(new Set(filteredEmployees.map(e => e.employeeId)));
    }
  }

  function handleSend() {
    if (!selectedEmployeesList.length || !selectedDocTypesList.length) return;
    sendMutation.mutate({
      employeeIds: selectedEmployeesList,
      documentTypes: selectedDocTypesList,
      notes: notes || undefined,
    });
  }

  function handleSendToEmployee(employeeId: string, docTypes: string[]) {
    sendMutation.mutate({ employeeIds: [employeeId], documentTypes: docTypes, notes: undefined });
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────

  return (
    <CanvasHubPage config={pageConfig}>
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="mb-6" data-testid="tabs-document-requests">
          <TabsTrigger value="send" data-testid="tab-send">Send Requests</TabsTrigger>
          <TabsTrigger value="gaps" data-testid="tab-gaps">
            Document Gaps
            {gapsData && gapsData.totalGaps > 0 && (
              <Badge variant="destructive" className="ml-2">{gapsData.totalGaps}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">History</TabsTrigger>
        </TabsList>

        {/* ─── SEND TAB ─────────────────────────────────────────────────── */}
        <TabsContent value="send" className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
            {/* Step 1: Select Document Types */}
            <div className="xl:col-span-2 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
                    Choose Document Types
                  </CardTitle>
                  <CardDescription>Select one or more document types to request</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {typesLoading ? (
                    Array.from({ length: 7 }).map((_, i) => <Skeleton key={`skeleton-1-${i}`} className="h-16 w-full" />)
                  ) : (
                    Object.entries(docTypes).map(([key, doc]) => {
                      const isSelected = selectedDocTypes.has(key);
                      return (
                        <button
                          key={key}
                          data-testid={`doc-type-${key}`}
                          onClick={() => toggleDocType(key)}
                          className={`w-full text-left p-3 rounded-md border transition-colors ${
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-border hover-elevate"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`mt-0.5 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`}>
                              {DOC_ICONS[key]}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{doc.label}</span>
                                <Badge variant={URGENCY_COLORS[doc.urgency] as any} className="text-xs">{doc.urgency}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{doc.description}</p>
                              <div className="flex items-center gap-1 mt-1">
                                <Coins className="h-3 w-3 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">{doc.creditCost} cr / employee</span>
                              </div>
                            </div>
                            {isSelected && <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />}
                          </div>
                        </button>
                      );
                    })
                  )}
                </CardContent>
              </Card>

              {/* Optional notes */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Note to Employees <span className="text-muted-foreground font-normal">(optional)</span></CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    placeholder="e.g. Please complete this before your shift on Friday..."
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className="resize-none"
                    rows={3}
                    data-testid="input-notes"
                  />
                </CardContent>
              </Card>
            </div>

            {/* Step 2: Select Employees */}
            <div className="xl:col-span-3 space-y-4">
              <Card className="flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-base flex items-center gap-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
                      Select Employees
                    </CardTitle>
                    <Button variant="ghost" size="sm" onClick={toggleSelectAll} data-testid="button-select-all">
                      {selectedEmployees.size === filteredEmployees.length && filteredEmployees.length > 0 ? "Deselect All" : "Select All"}
                    </Button>
                  </div>
                  <div className="relative mt-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Search employees..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      data-testid="input-search-employees"
                    />
                  </div>
                </CardHeader>
                <CardContent className="flex-1 overflow-auto max-h-[480px] space-y-1 pr-2">
                  {gapsLoading ? (
                    Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
                  ) : filteredEmployees.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">No employees found</p>
                    </div>
                  ) : (
                    filteredEmployees.map((emp) => {
                      const isSelected = selectedEmployees.has(emp.employeeId);
                      return (
                        <div
                          key={emp.employeeId}
                          data-testid={`employee-row-${emp.employeeId}`}
                          className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                            isSelected ? "border-primary bg-primary/5" : "border-border hover-elevate"
                          }`}
                          onClick={() => toggleEmployee(emp.employeeId)}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleEmployee(emp.employeeId)}
                            data-testid={`checkbox-employee-${emp.employeeId}`}
                          />
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarFallback className="text-xs">
                              {emp.employeeName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{emp.employeeName}</p>
                            <p className="text-xs text-muted-foreground truncate">{emp.email || "No email"}</p>
                          </div>
                          <div className="shrink-0 flex flex-col items-end gap-1">
                            {emp.missingDocuments.length > 0 && (
                              <Badge variant="destructive" className="text-xs">
                                {emp.missingDocuments.length} missing
                              </Badge>
                            )}
                            {emp.pendingRequests > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                {emp.pendingRequests} pending
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>

              {/* Cost Summary + Send */}
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Users className="h-4 w-4" />
                        <span>{selectedEmployeesList.length} employee{selectedEmployeesList.length !== 1 ? "s" : ""} selected</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <FileText className="h-4 w-4" />
                        <span>{selectedDocTypesList.length} document type{selectedDocTypesList.length !== 1 ? "s" : ""} selected</span>
                      </div>
                      {totalCreditCost > 0 && (
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <Coins className="h-4 w-4 text-amber-500" />
                          <span>{totalCreditCost} credits will be charged</span>
                        </div>
                      )}
                    </div>
                    <Button
                      onClick={handleSend}
                      disabled={
                        !selectedEmployeesList.length ||
                        !selectedDocTypesList.length ||
                        sendMutation.isPending
                      }
                      data-testid="button-send-requests"
                      size="default"
                    >
                      {sendMutation.isPending ? (
                        <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Sending...</>
                      ) : (
                        <><Send className="h-4 w-4 mr-2" />Send {totalCreditCost > 0 ? `(${totalCreditCost} cr)` : "Requests"}</>
                      )}
                    </Button>
                  </div>
                  {selectedDocTypesList.length > 0 && selectedEmployeesList.length === 0 && (
                    <Alert className="mt-3">
                      <AlertDescription className="text-sm">Select at least one employee to continue.</AlertDescription>
                    </Alert>
                  )}
                  {selectedEmployeesList.length > 0 && selectedDocTypesList.length === 0 && (
                    <Alert className="mt-3">
                      <AlertDescription className="text-sm">Select at least one document type to continue.</AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ─── GAPS TAB ─────────────────────────────────────────────────── */}
        <TabsContent value="gaps" className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm text-muted-foreground">
                {gapsData ? `${gapsData.totalGaps} total gaps across ${gapsData.totalEmployees} employees` : "Analyzing gaps..."}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">Filter:</span>
              {["all", "i9", "w4", "w9", "drug_free_acknowledgment", "guard_card_update"].map(f => (
                <Button
                  key={f}
                  size="sm"
                  variant={gapFilter === f ? "default" : "outline"}
                  onClick={() => setGapFilter(f)}
                  data-testid={`filter-gap-${f}`}
                >
                  {f === "all" ? "All" : f === "drug_free_acknowledgment" ? "Drug-Free" : f.toUpperCase().replace("_", " ")}
                </Button>
              ))}
            </div>
          </div>

          {gapsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : filteredEmployees.filter(e => e.missingDocuments.length > 0).length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-500" />
                <p className="font-medium">No Document Gaps Found</p>
                <p className="text-sm text-muted-foreground mt-1">All employees have complete document requests on file.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredEmployees.filter(e => e.missingDocuments.length > 0).map((emp) => (
                <Card key={emp.employeeId} data-testid={`gap-card-${emp.employeeId}`}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 shrink-0">
                          <AvatarFallback className="text-xs">
                            {emp.employeeName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-sm">{emp.employeeName}</p>
                          <p className="text-xs text-muted-foreground">{emp.email || "No email"} &bull; {emp.position || "Security Officer"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {emp.missingDocuments.map(dt => (
                          <Badge key={dt} variant="destructive" className="text-xs gap-1">
                            {DOC_ICONS[dt]}
                            {docTypes[dt]?.label || dt}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t flex-wrap gap-2">
                      <p className="text-xs text-muted-foreground">
                        {emp.lastRequestSentAt
                          ? `Last request: ${formatDistanceToNow(new Date(emp.lastRequestSentAt), { addSuffix: true })}`
                          : "No requests sent yet"}
                        {emp.pendingRequests > 0 && ` · ${emp.pendingRequests} pending`}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={sendMutation.isPending || !emp.email}
                        onClick={() => handleSendToEmployee(emp.employeeId, emp.missingDocuments)}
                        data-testid={`button-send-gap-${emp.employeeId}`}
                      >
                        <Send className="h-3.5 w-3.5 mr-1.5" />
                        Send All Missing ({emp.missingDocuments.length * 2} cr)
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ─── HISTORY TAB ──────────────────────────────────────────────── */}
        <TabsContent value="history" className="space-y-4">
          {historyLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : !historyData?.requests?.length ? (
            <Card>
              <CardContent className="py-16 text-center">
                <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No Requests Sent Yet</p>
                <p className="text-sm text-muted-foreground mt-1">Sent requests will appear here with their delivery and completion status.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {historyData.requests.map((req) => {
                const statusCfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.sent;
                return (
                  <Card key={req.id} data-testid={`history-row-${req.id}`}>
                    <CardContent className="py-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="text-muted-foreground shrink-0">
                          {DOC_ICONS[req.documentType] || <FileText className="h-5 w-5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{req.employeeName}</span>
                            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="text-sm text-muted-foreground">
                              {docTypes[req.documentType]?.label || req.documentType}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Sent by {req.sentByName} &bull; {format(new Date(req.sentAt), "MMM d, yyyy 'at' h:mm a")}
                            {req.sentVia === "trinity" && " · via Trinity AI"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          <Badge variant={statusCfg.color as any} className="gap-1 text-xs">
                            {statusCfg.icon}
                            {statusCfg.label}
                          </Badge>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Coins className="h-3 w-3" />
                            {req.creditsCharged}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Trinity context hint */}
      <div className="mt-6 p-4 rounded-md border bg-muted/30">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">Trinity can do this for you</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Ask Trinity in the ChatDock: <span className="italic">"Send I-9 requests to all employees missing them"</span> or{" "}
              <span className="italic">"Send full onboarding to all new hires"</span> — Trinity will identify gaps and send automatically.
            </p>
          </div>
        </div>
      </div>
    </CanvasHubPage>
  );
}
