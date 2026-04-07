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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Star, AlertTriangle, FileText, User, ChevronLeft } from "lucide-react";
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

  const canManage = user?.role === "owner" || user?.role === "manager" || user?.role === "root_admin";

  const pageConfig: CanvasPageConfig = {
    id: "officer-hr-record",
    title: "Officer HR Record",
    subtitle: "Performance notes and disciplinary history",
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
                <Button size="sm" variant="destructive" onClick={() => setShowDisciplinaryDialog(true)} data-testid="button-add-disciplinary-record">
                  <Plus className="h-4 w-4 mr-1" />
                  New Record
                </Button>
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
    </CanvasHubPage>
  );
}
