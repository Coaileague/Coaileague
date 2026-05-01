import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { format } from "date-fns";
import {
  Eye,
  FileText,
  ClipboardList,
  Send,
  CheckCircle,
  XCircle,
  Clock,
  Search,
  Download,
  Forward,
  Mail,
  Plus,
  RefreshCw,
  PenLine,
  Layers,
  Inbox,
  UserCheck,
  FileCheck,
} from 'lucide-react';;

const PAGE_CONFIG: CanvasPageConfig = {
  id: "forms-manager",
  title: "Forms Manager",
  subtitle: "Create, send, track, and archive all forms with full PDF and signature pipeline",
  category: "operations",
  maxWidth: "7xl",
};

const STATUS_COLORS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  sent: "outline",
  opened: "secondary",
  submitted: "default",
  expired: "destructive",
  pending: "outline",
  waiting: "secondary",
  signed: "default",
  complete: "default",
  incomplete: "destructive",
};

const STATUS_ICONS: Record<string, typeof Clock> = {
  sent: Send,
  opened: Eye,
  submitted: CheckCircle,
  expired: XCircle,
  pending: Clock,
  waiting: Clock,
  signed: FileCheck,
  complete: CheckCircle,
};

function StatusBadge({ status }: { status: string }) {
  const variant = STATUS_COLORS[status] || "secondary";
  const Icon = STATUS_ICONS[status] || Clock;
  return (
    <Badge variant={variant} className="gap-1 text-xs capitalize" data-testid={`badge-status-${status}`}>
      <Icon className="w-3 h-3" />
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

interface PlatformForm {
  id: string;
  title: string;
  form_type: string;
  description?: string;
  fields: any[];
  requires_signature: boolean;
  is_active: boolean;
  created_at: string;
}

interface FormInvitation {
  id: string;
  sent_to_email?: string;
  sent_to_name?: string;
  status: string;
  form_title: string;
  created_at: string;
  submitted_at?: string;
  expires_at: string;
}

interface FormSubmission {
  id: string;
  form_id: string;
  submitted_by_name?: string;
  submitted_by_email?: string;
  submitted_at: string;
  signature_type?: string;
  device_type?: string;
  generated_document_url?: string;
  trinity_processing_status: string;
}

interface SigningSequence {
  id: string;
  document_title: string;
  status: string;
  total_signers: number;
  signed_count: number;
  created_at: string;
  completed_at?: string;
}

// ─── Forms Tab ─────────────────────────────────────────────────────────────
function FormsTab({ forms, isLoading }: { forms: PlatformForm[]; isLoading: boolean }) {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const { toast } = useToast();

  const form = useForm({
    defaultValues: { title: "", form_type: "general", description: "" },
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const fields = [
        { name: "full_name", label: "Full Name", type: "text", required: true },
        { name: "email", label: "Email Address", type: "email", required: true },
        { name: "notes", label: "Additional Notes", type: "textarea", required: false },
      ];
      const res = await apiRequest("POST", "/api/forms", { ...data, fields });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Form created", description: "Your new form is ready to send." });
      queryClient.invalidateQueries({ queryKey: ["/api/forms"] });
      setShowCreate(false);
      form.reset();
    },
    onError: (e) => toast({ title: "Failed to create form", description: e?.message, variant: "destructive" }),
  });

  const filtered = forms.filter(f =>
    f.title.toLowerCase().includes(search.toLowerCase()) ||
    f.form_type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search forms..." value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-forms" />
        </div>
        <Button onClick={() => setShowCreate(true)} data-testid="button-create-form">
          <Plus className="w-4 h-4 mr-1" />New Form
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Card key={i} className="animate-pulse"><CardContent className="p-4 h-24 bg-muted/30" /></Card>)}
        </div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <Layers className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No forms found. Create your first form to get started.</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(f => (
            <Card key={f.id} className="hover-elevate" data-testid={`card-form-${f.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium truncate" data-testid={`text-form-title-${f.id}`}>{f.title}</h4>
                    <p className="text-xs text-muted-foreground mt-0.5 capitalize">{f.form_type.replace(/_/g, " ")}</p>
                  </div>
                  {f.requires_signature && (
                    <Badge variant="outline" className="text-xs shrink-0"><PenLine className="w-3 h-3 mr-1" />Signature</Badge>
                  )}
                </div>
                {f.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{f.description}</p>
                )}
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <span className="text-xs text-muted-foreground">{f.fields?.length || 0} fields</span>
                  <span className="text-xs text-muted-foreground">{format(new Date(f.created_at), "MMM d, yyyy")}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-[2500] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <Card className="w-full max-w-lg">
            <CardContent className="p-6 space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Create New Form</h3>
                <p className="text-sm text-muted-foreground">Set up a form to send to employees, clients, or applicants.</p>
              </div>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(d => createMutation.mutate(d))} className="space-y-4">
                  <FormField control={form.control} name="title" rules={{ required: "Title is required" }} render={({ field }) => (
                    <FormItem>
                      <FormLabel>Form Title</FormLabel>
                      <FormControl><Input {...field} placeholder="e.g. Employee Onboarding Form" data-testid="input-form-title" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="form_type" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Form Type</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-form-type"><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="general">General</SelectItem>
                          <SelectItem value="onboarding">Onboarding</SelectItem>
                          <SelectItem value="compliance">Compliance</SelectItem>
                          <SelectItem value="incident_report">Incident Report</SelectItem>
                          <SelectItem value="application">Job Application</SelectItem>
                          <SelectItem value="acknowledgment">Policy Acknowledgment</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="description" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                      <FormControl><Textarea {...field} placeholder="Describe the purpose of this form..." data-testid="input-form-description" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" type="button" onClick={() => setShowCreate(false)} data-testid="button-cancel-create-form">Cancel</Button>
                    <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-create-form">
                      {createMutation.isPending ? "Creating..." : "Create Form"}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── Invitations Tab ───────────────────────────────────────────────────────
function InvitationsTab({ forms }: { forms: PlatformForm[] }) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showSend, setShowSend] = useState(false);

  const invForm = useForm({
    defaultValues: { formId: "", email: "", name: "", expiresHours: "168" },
  });

  const { data: invitations = [], isLoading } = useQuery<FormInvitation[]>({
    queryKey: ["/api/forms/invitations"],
  });

  const sendMutation = useMutation({
    mutationFn: async (data) => {
      const res = await apiRequest("POST", `/api/forms/${data.formId}/invite`, {
        email: data.email,
        name: data.name,
        expiresHours: Number(data.expiresHours),
      });
      return res.json();
    },
    onSuccess: (d) => {
      toast({
        title: "Invitation sent",
        description: d.emailSent
          ? `Form sent to ${invForm.getValues("email")} via email.`
          : "Invitation created successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/forms/invitations"] });
      setShowSend(false);
      invForm.reset();
    },
    onError: (e) => toast({ title: "Failed to send", description: e?.message, variant: "destructive" }),
  });

  const reminderMutation = useMutation({
    mutationFn: async (invId: string) => {
      const res = await apiRequest("POST", `/api/forms/${invId}/reminder`, {});
      return res.json();
    },
    onSuccess: () => toast({ title: "Reminder sent" }),
    onError: () => toast({ title: "Failed to send reminder", variant: "destructive" }),
  });

  const filtered = invitations.filter(inv => {
    const matchSearch = !search ||
      inv.sent_to_email?.toLowerCase().includes(search.toLowerCase()) ||
      inv.sent_to_name?.toLowerCase().includes(search.toLowerCase()) ||
      inv.form_title?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || inv.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search invitations..." value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-invitations" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36" data-testid="select-status-filter"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="opened">Opened</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setShowSend(true)} data-testid="button-send-invitation">
          <Send className="w-4 h-4 mr-1" />Send Form
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Card key={i} className="animate-pulse"><CardContent className="p-4 h-16 bg-muted/30" /></Card>)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <Inbox className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No invitations found. Send a form to get started.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(inv => (
            <Card key={inv.id} data-testid={`card-invitation-${inv.id}`}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm" data-testid={`text-inv-form-${inv.id}`}>{inv.form_title}</span>
                      <StatusBadge status={inv.status} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {inv.sent_to_name || inv.sent_to_email || "—"} · {format(new Date(inv.created_at), "MMM d, yyyy")}
                      {inv.submitted_at ? ` · Submitted ${format(new Date(inv.submitted_at), "MMM d")}` : ""}
                    </p>
                  </div>
                  {inv.status !== "submitted" && inv.status !== "expired" && (
                    <Button variant="ghost" size="sm" onClick={() => reminderMutation.mutate(inv.id)} disabled={reminderMutation.isPending} data-testid={`button-reminder-${inv.id}`}>
                      <RefreshCw className="w-3.5 h-3.5 mr-1" />Remind
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showSend && (
        <div className="fixed inset-0 z-[2500] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <Card className="w-full max-w-lg">
            <CardContent className="p-6 space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Send Form Invitation</h3>
                <p className="text-sm text-muted-foreground">The recipient will receive a secure email link to complete the form.</p>
              </div>
              <Form {...invForm}>
                <form onSubmit={invForm.handleSubmit(d => sendMutation.mutate(d))} className="space-y-4">
                  <FormField control={invForm.control} name="formId" rules={{ required: "Select a form" }} render={({ field }) => (
                    <FormItem>
                      <FormLabel>Form</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-send-form"><SelectValue placeholder="Select a form..." /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {forms.map(f => <SelectItem key={f.id} value={f.id}>{f.title}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={invForm.control} name="email" rules={{ required: "Email is required" }} render={({ field }) => (
                    <FormItem>
                      <FormLabel>Recipient Email</FormLabel>
                      <FormControl><Input {...field} type="email" placeholder="recipient@example.com" data-testid="input-inv-email" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={invForm.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Recipient Name <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                      <FormControl><Input {...field} placeholder="Full name" data-testid="input-inv-name" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={invForm.control} name="expiresHours" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expires In</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-expires"><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="24">24 hours</SelectItem>
                          <SelectItem value="72">3 days</SelectItem>
                          <SelectItem value="168">7 days</SelectItem>
                          <SelectItem value="336">14 days</SelectItem>
                          <SelectItem value="720">30 days</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" type="button" onClick={() => setShowSend(false)} data-testid="button-cancel-send">Cancel</Button>
                    <Button type="submit" disabled={sendMutation.isPending} data-testid="button-confirm-send">
                      {sendMutation.isPending ? "Sending..." : "Send Invitation"}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── Submissions Tab ────────────────────────────────────────────────────────
function SubmissionsTab({ forms }: { forms: PlatformForm[] }) {
  const { toast } = useToast();
  const [selectedForm, setSelectedForm] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [viewSub, setViewSub] = useState<FormSubmission | null>(null);
  const [showForward, setShowForward] = useState(false);
  const [forwardEmail, setForwardEmail] = useState("");
  const [forwardMessage, setForwardMessage] = useState("");

  const { data: submissions = [], isLoading } = useQuery<FormSubmission[]>({
    queryKey: ["/api/forms", selectedForm, "submissions"],
    queryFn: async () => {
      if (selectedForm === "all") {
        const results = await Promise.all(
          forms.slice(0, 10).map(f =>
            fetch(`/api/forms/${f.id}/submissions`, { credentials: "include" })
              .then(r => r.json()).catch(() => [])
          )
        );
        return (results.flat() as FormSubmission[]);
      }
      const r = await fetch(`/api/forms/${selectedForm}/submissions`, { credentials: "include" });
      return r.json();
    },
    enabled: forms.length > 0,
  });

  const forwardMutation = useMutation({
    mutationFn: async ({ id, email, message }: { id: string; email: string; message: string }) => {
      const res = await apiRequest("POST", `/api/forms/submissions/${id}/forward`, { toEmail: email, message });
      return res.json();
    },
    onSuccess: (d) => {
      toast({ title: "Forwarded", description: `Submission sent to ${d.sentTo}.` });
      setShowForward(false);
      setViewSub(null);
      setForwardEmail("");
      setForwardMessage("");
    },
    onError: (e) => toast({ title: "Failed to forward", description: e?.message, variant: "destructive" }),
  });

  const filtered = (submissions as FormSubmission[]).filter(s => {
    if (!search) return true;
    return (
      s.submitted_by_name?.toLowerCase().includes(search.toLowerCase()) ||
      s.submitted_by_email?.toLowerCase().includes(search.toLowerCase())
    );
  }).sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search submissions..." value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-submissions" />
        </div>
        <Select value={selectedForm} onValueChange={setSelectedForm}>
          <SelectTrigger className="w-48" data-testid="select-form-filter"><SelectValue placeholder="All forms" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Forms</SelectItem>
            {forms.map(f => <SelectItem key={f.id} value={f.id}>{f.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Card key={i} className="animate-pulse"><CardContent className="p-4 h-16 bg-muted/30" /></Card>)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <ClipboardList className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No submissions yet. Send forms to begin collecting responses.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(sub => (
            <Card key={sub.id} data-testid={`card-submission-${sub.id}`}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm" data-testid={`text-sub-name-${sub.id}`}>
                        {sub.submitted_by_name || "Anonymous"}
                      </span>
                      <Badge variant={sub.trinity_processing_status === "complete" ? "default" : "secondary"} className="text-xs">
                        {sub.trinity_processing_status === "complete" ? "Processed" : sub.trinity_processing_status === "failed" ? "Failed" : "Processing"}
                      </Badge>
                      {sub.signature_type && (
                        <Badge variant="outline" className="text-xs"><PenLine className="w-3 h-3 mr-1" />Signed</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {sub.submitted_by_email || "—"} · {format(new Date(sub.submitted_at), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" title="Download PDF" onClick={() => window.open(`/api/forms/submissions/${sub.id}/pdf`, "_blank")} data-testid={`button-download-${sub.id}`}>
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Forward" onClick={() => { setViewSub(sub); setShowForward(true); }} data-testid={`button-forward-${sub.id}`}>
                      <Forward className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showForward && viewSub && (
        <div className="fixed inset-0 z-[2500] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md">
            <CardContent className="p-6 space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Forward Submission</h3>
                <p className="text-sm text-muted-foreground">Send this submission record to another email address.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="forward-email">Recipient Email</Label>
                <Input id="forward-email" type="email" value={forwardEmail} onChange={e => setForwardEmail(e.target.value)} placeholder="recipient@example.com" data-testid="input-forward-email" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="forward-message">Message <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Textarea id="forward-message" value={forwardMessage} onChange={e => setForwardMessage(e.target.value)} placeholder="Add a note..." data-testid="input-forward-message" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => { setShowForward(false); setViewSub(null); }} data-testid="button-cancel-forward">Cancel</Button>
                <Button
                  onClick={() => forwardMutation.mutate({ id: viewSub.id, email: forwardEmail, message: forwardMessage })}
                  disabled={!forwardEmail || forwardMutation.isPending}
                  data-testid="button-confirm-forward"
                >
                  {forwardMutation.isPending ? "Sending..." : "Forward"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── Signing Tab ────────────────────────────────────────────────────────────
function SigningTab() {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [docTitle, setDocTitle] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("30");
  const [signers, setSigners] = useState([{ name: "", email: "", role: "signer" }]);

  const { data: sequences = [], isLoading } = useQuery<SigningSequence[]>({
    queryKey: ["/api/forms/signing/sequences"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!docTitle.trim()) throw new Error("Document title is required");
      const validSigners = signers.filter(s => s.name && s.email);
      if (!validSigners.length) throw new Error("At least one signer with name and email is required");
      const res = await apiRequest("POST", "/api/forms/signing/sequences", {
        documentTitle: docTitle,
        expiresInDays: Number(expiresInDays),
        signers: validSigners.map((s, i) => ({ ...s, order: i + 1 })),
      });
      return res.json();
    },
    onSuccess: (d) => {
      toast({
        title: "Signing sequence created",
        description: d.firstSignerEmailSent
          ? "The first signer has been emailed their signing link."
          : "Signing tokens created. Share the links manually.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/forms/signing/sequences"] });
      setShowCreate(false);
      setDocTitle("");
      setSigners([{ name: "", email: "", role: "signer" }]);
    },
    onError: (e) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });

  const addSigner = () => setSigners(prev => [...prev, { name: "", email: "", role: "signer" }]);
  const removeSigner = (i: number) => setSigners(prev => prev.filter((_, idx) => idx !== i));
  const updateSigner = (i: number, field: string, value: string) =>
    setSigners(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">Multi-party document signing with sequential email delivery.</p>
        <div className="relative">
          <Button
            disabled
            title="E-signature signing sequences are coming in V1.1"
            data-testid="button-create-sequence"
            className="opacity-60 cursor-not-allowed"
          >
            <Plus className="w-4 h-4 mr-1" />New Signing Sequence
            <span className="ml-2 text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-medium">V1.1</span>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2].map(i => <Card key={i} className="animate-pulse"><CardContent className="p-4 h-16 bg-muted/30" /></Card>)}</div>
      ) : sequences.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <UserCheck className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No signing sequences yet. Create one to collect multi-party signatures.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {sequences.map(seq => (
            <Card key={seq.id} data-testid={`card-sequence-${seq.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h4 className="font-medium text-sm" data-testid={`text-seq-title-${seq.id}`}>{seq.document_title}</h4>
                      <StatusBadge status={seq.status || "pending"} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {seq.signed_count} of {seq.total_signers} signed · {format(new Date(seq.created_at), "MMM d, yyyy")}
                      {seq.completed_at ? ` · Completed ${format(new Date(seq.completed_at), "MMM d")}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {Array.from({ length: Number(seq.total_signers) }).map((_, i) => (
                      <div
                        key={i}
                        className={['w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium', i < Number(seq.signed_count)
                            ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                            : "bg-muted text-muted-foreground"].join(' ')}
                        data-testid={`badge-signer-${seq.id}-${i}`}
                      >
                        {i < Number(seq.signed_count) ? <CheckCircle className="w-3.5 h-3.5" /> : i + 1}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-[2500] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <Card className="w-full max-w-xl">
            <CardContent className="p-6">
              <div className="mb-4">
                <h3 className="text-lg font-semibold">Create Signing Sequence</h3>
                <p className="text-sm text-muted-foreground">Signers receive their link in order — each is emailed when it's their turn.</p>
              </div>
              <ScrollArea className="max-h-[55vh] pr-2">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="doc-title">Document Title</Label>
                    <Input id="doc-title" value={docTitle} onChange={e => setDocTitle(e.target.value)} placeholder="e.g. Employment Agreement" data-testid="input-doc-title" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Expires In</Label>
                    <Select value={expiresInDays} onValueChange={setExpiresInDays}>
                      <SelectTrigger data-testid="select-seq-expires"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">7 days</SelectItem>
                        <SelectItem value="14">14 days</SelectItem>
                        <SelectItem value="30">30 days</SelectItem>
                        <SelectItem value="60">60 days</SelectItem>
                        <SelectItem value="90">90 days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Separator />
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Signers (in order)</Label>
                      <Button variant="outline" size="sm" onClick={addSigner} data-testid="button-add-signer">
                        <Plus className="w-3.5 h-3.5 mr-1" />Add Signer
                      </Button>
                    </div>
                    {signers.map((signer, i) => (
                      <Card key={i} className="p-3">
                        <div className="flex items-start gap-2">
                          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0 mt-1">{i + 1}</div>
                          <div className="flex-1 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs">Name</Label>
                                <Input value={signer.name} onChange={e => updateSigner(i, "name", e.target.value)} placeholder="Full name" className="mt-1" data-testid={`input-signer-name-${i}`} />
                              </div>
                              <div>
                                <Label className="text-xs">Email</Label>
                                <Input type="email" value={signer.email} onChange={e => updateSigner(i, "email", e.target.value)} placeholder="email@example.com" className="mt-1" data-testid={`input-signer-email-${i}`} />
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs">Role</Label>
                              <Select value={signer.role} onValueChange={v => updateSigner(i, "role", v)}>
                                <SelectTrigger className="mt-1" data-testid={`select-signer-role-${i}`}><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="signer">Signer</SelectItem>
                                  <SelectItem value="employee">Employee</SelectItem>
                                  <SelectItem value="manager">Manager</SelectItem>
                                  <SelectItem value="client">Client</SelectItem>
                                  <SelectItem value="witness">Witness</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          {signers.length > 1 && (
                            <Button variant="ghost" size="icon" onClick={() => removeSigner(i)} className="shrink-0 mt-1" data-testid={`button-remove-signer-${i}`}>
                              <XCircle className="w-4 h-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              </ScrollArea>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowCreate(false)} data-testid="button-cancel-sequence">Cancel</Button>
                <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} data-testid="button-confirm-sequence">
                  {createMutation.isPending ? "Creating..." : "Create & Send to First Signer"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── Page Root ──────────────────────────────────────────────────────────────
export default function FormsManager() {
  const { data: forms = [], isLoading } = useQuery<PlatformForm[]>({
    queryKey: ["/api/forms"],
  });

  return (
    <CanvasHubPage config={PAGE_CONFIG}>
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Forms", value: forms.length, icon: Layers, color: "text-blue-500" },
            { label: "Active Forms", value: forms.filter(f => f.is_active).length, icon: CheckCircle, color: "text-green-500" },
            { label: "PDF Engine", value: "Live", icon: FileText, color: "text-amber-500" },
            { label: "Trinity Mail", value: "Active", icon: Mail, color: "text-purple-500" },
          ].map(stat => (
            <Card key={stat.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                  <span className="text-xs text-muted-foreground">{stat.label}</span>
                </div>
                <p className="text-2xl font-bold" data-testid={`stat-${stat.label.toLowerCase().replace(/ /g, "-")}`}>
                  {stat.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="submissions">
          <TabsList className="flex flex-wrap gap-1 h-auto" data-testid="tabs-forms-manager">
            <TabsTrigger value="forms" data-testid="tab-forms">
              <Layers className="w-4 h-4 mr-1.5" />Forms
            </TabsTrigger>
            <TabsTrigger value="invitations" data-testid="tab-invitations">
              <Send className="w-4 h-4 mr-1.5" />Invitations
            </TabsTrigger>
            <TabsTrigger value="submissions" data-testid="tab-submissions">
              <ClipboardList className="w-4 h-4 mr-1.5" />Submissions
            </TabsTrigger>
            <TabsTrigger value="signing" data-testid="tab-signing">
              <PenLine className="w-4 h-4 mr-1.5" />Signing
            </TabsTrigger>
          </TabsList>

          <TabsContent value="forms" className="mt-4">
            <FormsTab forms={forms} isLoading={isLoading} />
          </TabsContent>
          <TabsContent value="invitations" className="mt-4">
            <InvitationsTab forms={forms} />
          </TabsContent>
          <TabsContent value="submissions" className="mt-4">
            <SubmissionsTab forms={forms} />
          </TabsContent>
          <TabsContent value="signing" className="mt-4">
            <SigningTab />
          </TabsContent>
        </Tabs>
      </div>
    </CanvasHubPage>
  );
}
