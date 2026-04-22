import { useState } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Star, AlertTriangle, FileText, User, ChevronLeft, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";

const NOTE_TYPE_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  commendation: { label: "Commendation", color: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30", icon: Star },
  concern: { label: "Concern", color: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30", icon: AlertTriangle },
  warning: { label: "Warning", color: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30", icon: AlertTriangle },
  neutral: { label: "Note", color: "bg-muted/50 text-muted-foreground border-muted", icon: FileText },
};

const DISCIPLINARY_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  verbal_warning: { label: "Verbal Warning", color: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30" },
  written_warning: { label: "Written Warning", color: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30" },
  pip: { label: "Performance Improvement Plan", color: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30" },
  termination: { label: "Termination", color: "bg-red-700/15 text-red-800 dark:text-red-300 border-red-700/30" },
};

export default function OfficerHrRecord() {
  const [, params] = useRoute("/employees/:employeeId/hr-record");
  const employeeId = params?.employeeId ?? "";
  const { user } = useAuth();
  const { toast } = useToast();
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [showDisciplinaryDialog, setShowDisciplinaryDialog] = useState(false);
  const [noteType, setNoteType] = useState("neutral");
  const [noteContent, setNoteContent] = useState("");
  const [disciplinaryType, setDisciplinaryType] = useState("verbal_warning");
  const [disciplinaryDescription, setDisciplinaryDescription] = useState("");

  // Phase 4 — Trinity 5-W intake
  const [showTrinityDialog, setShowTrinityDialog] = useState(false);
  const [subjectType, setSubjectType] = useState<"employee" | "contractor_1099">("employee");
  const [fiveW, setFiveW] = useState({
    who: "",
    what: "",
    where: "",
    when: "",
    why: "",
    how: "",
    witnesses: "",
    priorIncidents: "",
    rawNarrative: "",
  });
  const [trinityDraft, setTrinityDraft] = useState<any | null>(null);

  const canManage = user?.role === "owner" || user?.role === "manager" || user?.role === "root_admin";

  const pageConfig: CanvasPageConfig = {
    id: "officer-hr-record",
    title: "Officer HR Record",
    subtitle: "Performance notes and disciplinary history",
    // @ts-expect-error — TS migration: fix in refactoring sprint
    category: "workforce",
  };

  const { data: employee, isLoading: empLoading } = useQuery<any>({
    queryKey: ["/api/employees", employeeId],
    enabled: !!employeeId,
  });

  const { data: performanceNotes = [], isLoading: notesLoading } = useQuery<any[]>({
    queryKey: ["/api/performance-notes", { employeeId }],
    enabled: !!employeeId,
  });

  const { data: disciplinaryRecords = [], isLoading: discLoading } = useQuery<any[]>({
    queryKey: ["/api/disciplinary-records", { employeeId }],
    enabled: !!employeeId,
  });

  const addNoteMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/performance-notes", {
        employeeId,
        noteType,
        content: noteContent,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/performance-notes", { employeeId }] });
      setShowNoteDialog(false);
      setNoteContent("");
      setNoteType("neutral");
      toast({ title: "Note added" });
    },
    onError: () => toast({ title: "Failed to add note", variant: "destructive" }),
  });

  const addDisciplinaryMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/disciplinary-records", {
        employeeId,
        recordType: disciplinaryType,
        description: disciplinaryDescription,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/disciplinary-records", { employeeId }] });
      setShowDisciplinaryDialog(false);
      setDisciplinaryDescription("");
      setDisciplinaryType("verbal_warning");
      toast({ title: "Disciplinary record created" });
    },
    onError: () => toast({ title: "Failed to create record", variant: "destructive" }),
  });

  // Phase 4 — Trinity-powered 5-W intake and finalize
  const trinityIntakeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/disciplinary-records/trinity-intake", {
        subjectId: employeeId,
        subjectType,
        who: fiveW.who,
        what: fiveW.what,
        where: fiveW.where,
        when: fiveW.when,
        why: fiveW.why,
        how: fiveW.how,
        witnesses: fiveW.witnesses,
        priorIncidents: fiveW.priorIncidents,
        rawNarrative: fiveW.rawNarrative,
      });
      return await res.json();
    },
    onSuccess: (result: any) => {
      setTrinityDraft(result);
      toast({ title: "Trinity drafted the document — review before sending" });
    },
    onError: () =>
      toast({ title: "Document generation failed", variant: "destructive" }),
  });

  const finalizeMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/disciplinary-records/finalize", {
        subjectId: employeeId,
        subjectType,
        documentType: trinityDraft?.documentType,
        documentTitle: trinityDraft?.documentTitle,
        documentContent: trinityDraft?.documentContent,
        sopViolationsFound: trinityDraft?.sopViolationsFound,
        severityLevel: trinityDraft?.severityLevel,
        scoreDeduction: trinityDraft?.scoreDeduction,
        signingSequence: trinityDraft?.signingSequence,
        rehabilitationSuggestions: trinityDraft?.rehabilitationSuggestions,
        lodCount: trinityDraft?.lodCount,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/disciplinary-records", { employeeId }] });
      setShowTrinityDialog(false);
      setTrinityDraft(null);
      setFiveW({
        who: "",
        what: "",
        where: "",
        when: "",
        why: "",
        how: "",
        witnesses: "",
        priorIncidents: "",
        rawNarrative: "",
      });
      toast({ title: "Document sent for signature" });
    },
    onError: () =>
      toast({ title: "Failed to send for signature", variant: "destructive" }),
  });

  const isLoading = empLoading || notesLoading || discLoading;
  const employeeName = employee
    ? `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim()
    : "Officer";

  return (
    <CanvasHubPage config={{ ...pageConfig, title: `${employeeName} — HR Record` }}>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4 mb-2">
          <Link href="/employees">
            <Button variant="ghost" size="sm" data-testid="button-back-to-employees">
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back to Employees
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-muted-foreground" />
            <span className="font-semibold text-lg">{isLoading ? "Loading..." : employeeName}</span>
          </div>
        </div>

        <Tabs defaultValue="performance-notes">
          <TabsList className="flex w-max gap-1 mb-4">
            <TabsTrigger value="performance-notes" data-testid="tab-performance-notes">
              Performance Notes
              {performanceNotes.length > 0 && (
                <Badge className="ml-2">{performanceNotes.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="disciplinary-records" data-testid="tab-disciplinary-records">
              Disciplinary
              {disciplinaryRecords.length > 0 && (
                <Badge className="ml-2" variant="destructive">{disciplinaryRecords.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ─── PERFORMANCE NOTES ─── */}
          <TabsContent value="performance-notes" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Performance Notes</h3>
                <p className="text-sm text-muted-foreground">Manager notes on this officer — commendations, concerns, and general observations.</p>
              </div>
              {canManage && (
                <Button size="sm" onClick={() => setShowNoteDialog(true)} data-testid="button-add-performance-note">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Note
                </Button>
              )}
            </div>

            {notesLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : performanceNotes.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">No performance notes yet</p>
                  <p className="text-sm mt-1">Add a note to track this officer's performance over time.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {performanceNotes.map((note: any) => {
                  const config = NOTE_TYPE_CONFIG[note.noteType] ?? NOTE_TYPE_CONFIG.neutral;
                  const Icon = config.icon;
                  return (
                    <Card key={note.id} data-testid={`card-performance-note-${note.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 flex-1">
                            <Badge variant="outline" className={`text-xs shrink-0 mt-0.5 ${config.color}`}>
                              <Icon className="h-3 w-3 mr-1" />
                              {config.label}
                            </Badge>
                            <p className="text-sm leading-relaxed flex-1">{note.content}</p>
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                            {format(new Date(note.createdAt), "MMM d, yyyy")}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ─── DISCIPLINARY RECORDS ─── */}
          <TabsContent value="disciplinary-records" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Disciplinary Records</h3>
                <p className="text-sm text-muted-foreground">Formal HR actions — verbal/written warnings, PIPs, and terminations.</p>
              </div>
              {canManage && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => setShowTrinityDialog(true)}
                    data-testid="button-trinity-intake"
                  >
                    <Sparkles className="h-4 w-4 mr-1" />
                    Trinity Write-Up (5-W)
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => setShowDisciplinaryDialog(true)} data-testid="button-add-disciplinary-record">
                    <Plus className="h-4 w-4 mr-1" />
                    New Record
                  </Button>
                </div>
              )}
            </div>

            {discLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : disciplinaryRecords.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  <Star className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">Clean record</p>
                  <p className="text-sm mt-1">No disciplinary actions on file for this officer.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {disciplinaryRecords.map((record: any) => {
                  const config = DISCIPLINARY_TYPE_CONFIG[record.recordType] ?? DISCIPLINARY_TYPE_CONFIG.verbal_warning;
                  return (
                    <Card key={record.id} data-testid={`card-disciplinary-record-${record.id}`}>
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <Badge variant="outline" className={`text-xs shrink-0 ${config.color}`}>
                            {config.label}
                          </Badge>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant={record.status === "active" ? "default" : "secondary"} className="text-xs">
                              {record.status}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(record.issuedAt), "MMM d, yyyy")}
                            </span>
                          </div>
                        </div>
                        <p className="text-sm leading-relaxed text-foreground">{record.description}</p>
                        {record.acknowledgedAt && (
                          <p className="text-xs text-muted-foreground">
                            Acknowledged {format(new Date(record.acknowledgedAt), "MMM d, yyyy")}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Performance Note Dialog */}
      <Dialog open={showNoteDialog} onOpenChange={setShowNoteDialog}>
        <DialogContent data-testid="dialog-add-performance-note">
          <DialogHeader>
            <DialogTitle>Add Performance Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Note Type</Label>
              <Select value={noteType} onValueChange={setNoteType}>
                <SelectTrigger data-testid="select-note-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="commendation">Commendation</SelectItem>
                  <SelectItem value="neutral">General Note</SelectItem>
                  <SelectItem value="concern">Concern</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Note Content</Label>
              <Textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Describe the performance observation..."
                className="min-h-[100px] resize-none"
                data-testid="textarea-note-content"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowNoteDialog(false)} data-testid="button-cancel-note">
              Cancel
            </Button>
            <Button
              onClick={() => addNoteMutation.mutate()}
              disabled={addNoteMutation.isPending || !noteContent.trim()}
              data-testid="button-submit-note"
            >
              {addNoteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Disciplinary Record Dialog */}
      <Dialog open={showDisciplinaryDialog} onOpenChange={setShowDisciplinaryDialog}>
        <DialogContent data-testid="dialog-add-disciplinary-record">
          <DialogHeader>
            <DialogTitle>New Disciplinary Record</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Action Type</Label>
              <Select value={disciplinaryType} onValueChange={setDisciplinaryType}>
                <SelectTrigger data-testid="select-disciplinary-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="verbal_warning">Verbal Warning</SelectItem>
                  <SelectItem value="written_warning">Written Warning</SelectItem>
                  <SelectItem value="pip">Performance Improvement Plan</SelectItem>
                  <SelectItem value="termination">Termination</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={disciplinaryDescription}
                onChange={(e) => setDisciplinaryDescription(e.target.value)}
                placeholder="Describe the reason for this disciplinary action..."
                className="min-h-[100px] resize-none"
                data-testid="textarea-disciplinary-description"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDisciplinaryDialog(false)} data-testid="button-cancel-disciplinary">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => addDisciplinaryMutation.mutate()}
              disabled={addDisciplinaryMutation.isPending || !disciplinaryDescription.trim()}
              data-testid="button-submit-disciplinary"
            >
              {addDisciplinaryMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Trinity 5-W Intake Dialog */}
      <Dialog
        open={showTrinityDialog}
        onOpenChange={(open) => {
          setShowTrinityDialog(open);
          if (!open) setTrinityDraft(null);
        }}
      >
        <DialogContent className="max-w-2xl" data-testid="dialog-trinity-intake">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Trinity 5-W Disciplinary Intake
            </DialogTitle>
          </DialogHeader>

          {!trinityDraft ? (
            <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
              <div className="space-y-1.5">
                <Label>Subject Type</Label>
                <Select value={subjectType} onValueChange={(v) => setSubjectType(v as any)}>
                  <SelectTrigger data-testid="select-subject-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Employee (W-2)</SelectItem>
                    <SelectItem value="contractor_1099">Contractor (1099)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Contractors receive a Letter of Dissatisfaction, not a disciplinary write-up (IRS
                  classification compliance).
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Who</Label>
                  <Input
                    value={fiveW.who}
                    onChange={(e) => setFiveW({ ...fiveW, who: e.target.value })}
                    placeholder="Officer / contractor involved"
                    data-testid="input-5w-who"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Where</Label>
                  <Input
                    value={fiveW.where}
                    onChange={(e) => setFiveW({ ...fiveW, where: e.target.value })}
                    placeholder="Site / post"
                    data-testid="input-5w-where"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>When</Label>
                  <Input
                    value={fiveW.when}
                    onChange={(e) => setFiveW({ ...fiveW, when: e.target.value })}
                    placeholder="Date and time"
                    data-testid="input-5w-when"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>How Discovered</Label>
                  <Input
                    value={fiveW.how}
                    onChange={(e) => setFiveW({ ...fiveW, how: e.target.value })}
                    placeholder="Supervisor round, client call, GPS alert..."
                    data-testid="input-5w-how"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>What Happened *</Label>
                <Textarea
                  value={fiveW.what}
                  onChange={(e) => setFiveW({ ...fiveW, what: e.target.value })}
                  placeholder="Describe the specific incident in factual detail..."
                  className="min-h-[70px] resize-none"
                  data-testid="textarea-5w-what"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Why It's a Problem *</Label>
                <Textarea
                  value={fiveW.why}
                  onChange={(e) => setFiveW({ ...fiveW, why: e.target.value })}
                  placeholder="Which policy, SOP, or safety standard was violated?"
                  className="min-h-[60px] resize-none"
                  data-testid="textarea-5w-why"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Witnesses (optional)</Label>
                <Input
                  value={fiveW.witnesses}
                  onChange={(e) => setFiveW({ ...fiveW, witnesses: e.target.value })}
                  placeholder="Names of anyone who saw the incident"
                  data-testid="input-5w-witnesses"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Prior Related Incidents (optional)</Label>
                <Input
                  value={fiveW.priorIncidents}
                  onChange={(e) => setFiveW({ ...fiveW, priorIncidents: e.target.value })}
                  placeholder="Any prior coaching, warnings, or similar incidents"
                  data-testid="input-5w-prior"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Additional Context (optional)</Label>
                <Textarea
                  value={fiveW.rawNarrative}
                  onChange={(e) => setFiveW({ ...fiveW, rawNarrative: e.target.value })}
                  placeholder="Anything else Trinity should know..."
                  className="min-h-[50px] resize-none"
                  data-testid="textarea-5w-narrative"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
              <div className="rounded-md border p-3 bg-muted/40">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Trinity's Recommendation
                </p>
                <p className="text-sm font-semibold">{trinityDraft.documentTitle}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Severity: {String(trinityDraft.severityLevel).toUpperCase()} · Score impact: −
                  {trinityDraft.scoreDeduction} pts
                  {trinityDraft.lodCount ? ` · LOD ${trinityDraft.lodCount}/3` : ""}
                </p>
              </div>

              {trinityDraft.trinityNarrative && (
                <div className="rounded-md border p-3 text-sm">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    Trinity's Reasoning
                  </p>
                  <p className="whitespace-pre-wrap">{trinityDraft.trinityNarrative}</p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Generated Document</Label>
                <Textarea
                  value={trinityDraft.documentContent}
                  readOnly
                  className="min-h-[260px] font-mono text-xs"
                  data-testid="textarea-trinity-doc"
                />
              </div>

              {Array.isArray(trinityDraft.rehabilitationSuggestions) &&
                trinityDraft.rehabilitationSuggestions.length > 0 && (
                  <div className="rounded-md border p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                      Rehabilitation Suggestions
                    </p>
                    <ul className="text-sm list-disc list-inside space-y-0.5">
                      {trinityDraft.rehabilitationSuggestions.map((s: string, i: number) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowTrinityDialog(false);
                setTrinityDraft(null);
              }}
              data-testid="button-cancel-trinity"
            >
              Cancel
            </Button>
            {!trinityDraft ? (
              <Button
                onClick={() => trinityIntakeMutation.mutate()}
                disabled={
                  trinityIntakeMutation.isPending ||
                  !fiveW.what.trim() ||
                  !fiveW.why.trim()
                }
                data-testid="button-submit-trinity-intake"
              >
                {trinityIntakeMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Generate with Trinity
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={() => finalizeMutation.mutate()}
                disabled={finalizeMutation.isPending}
                data-testid="button-finalize-trinity"
              >
                {finalizeMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Finalize &amp; Send for Signature
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CanvasHubPage>
  );
}
