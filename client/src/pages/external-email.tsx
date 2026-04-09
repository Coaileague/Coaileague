import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Mail, Send, Sparkles, Clock, CheckCircle, XCircle, Eye, 
  Inbox, FileText, Trash2, RefreshCw, AlertCircle, Wand2,
  ChevronRight, Calendar
} from "lucide-react";
import { format } from "date-fns";

const EMAIL_STATUS = {
  pending: { label: "Pending", color: "bg-amber-500", icon: Clock },
  sent: { label: "Sent", color: "bg-blue-500", icon: Send },
  delivered: { label: "Delivered", color: "bg-green-500", icon: CheckCircle },
  opened: { label: "Opened", color: "bg-purple-500", icon: Eye },
  bounced: { label: "Bounced", color: "bg-red-500", icon: XCircle },
  failed: { label: "Failed", color: "bg-red-500", icon: AlertCircle },
};

interface ExternalEmail {
  id: string;
  fromEmail: string;
  toEmail: string;
  ccEmails: string[];
  subject: string;
  bodyHtml: string;
  emailType: string;
  status: string;
  enhancedByTrinity: boolean;
  sentAt: string;
  createdAt: string;
  sentByUser?: { id: string; firstName: string; lastName: string };
}

interface EmailDraft {
  id: string;
  toEmail: string;
  ccEmails: string[];
  subject: string;
  bodyHtml: string;
  lastAutoSavedAt: string;
  createdAt: string;
}

function EmailRow({ email, onClick }: { email: { email: ExternalEmail; sentByUser: any }; onClick: () => void }) {
  const e = email.email;
  const status = EMAIL_STATUS[e.status as keyof typeof EMAIL_STATUS] || EMAIL_STATUS.pending;
  const StatusIcon = status.icon;

  return (
    <div 
      className="flex items-center gap-4 p-4 border-b hover-elevate cursor-pointer"
      onClick={onClick}
      data-testid={`row-email-${e.id}`}
    >
      <div className={`p-2 rounded-full ${status.color}`}>
        <StatusIcon className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{e.toEmail}</span>
          {e.enhancedByTrinity && (
            <Badge variant="outline" className="text-xs shrink-0">
              <Sparkles className="w-3 h-3 mr-1" /> Trinity
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground truncate">{e.subject}</p>
      </div>
      <div className="text-right text-sm text-muted-foreground shrink-0">
        {e.sentAt ? format(new Date(e.sentAt), "MMM d, h:mm a") : format(new Date(e.createdAt), "MMM d")}
      </div>
    </div>
  );
}

export default function ExternalEmail() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("compose");
  const [showCompose, setShowCompose] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<ExternalEmail | null>(null);
  
  const [toEmail, setToEmail] = useState("");
  const [ccEmails, setCcEmails] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [originalBody, setOriginalBody] = useState("");

  const { data: emailsData, isLoading: emailsLoading } = useQuery({
    queryKey: ["/api/external-emails"],
  });

  const { data: draftsData } = useQuery({
    queryKey: ["/api/external-emails/drafts"],
  });

  const sendEmailMutation = useMutation({
    mutationFn: (data: any) => apiRequest("/api/external-emails", { 
      method: "POST", 
      body: JSON.stringify(data), 
      headers: { "Content-Type": "application/json" } 
    }).then(res => {
      if (!res.data?.id) throw new Error("No email ID returned");
      return apiRequest(`/api/external-emails/${res.data.id}/send`, { method: "POST" });
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/external-emails"] });
      resetForm();
      toast({ title: "Email sent successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to send email", description: error.message, variant: "destructive" });
    },
  });

  const saveDraftMutation = useMutation({
    mutationFn: (data: any) => apiRequest("/api/external-emails/drafts", { 
      method: "POST", 
      body: JSON.stringify(data), 
      headers: { "Content-Type": "application/json" } 
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/external-emails/drafts"] });
      toast({ title: "Draft saved" });
    },
  });

  const enhanceMutation = useMutation({
    mutationFn: (data: any) => apiRequest("/api/external-emails/enhance", { 
      method: "POST", 
      body: JSON.stringify(data), 
      headers: { "Content-Type": "application/json" } 
    }),
    onSuccess: (res: any) => {
      if (res.data?.body) {
        setOriginalBody(body);
        setBody(res.data.body);
        if (res.data.subject) setSubject(res.data.subject);
        toast({ title: "Email enhanced by Trinity", description: "Review the changes before sending" });
      } else {
        toast({ title: "Enhancement unavailable", description: "Try again later", variant: "destructive" });
      }
      setIsEnhancing(false);
    },
    onError: () => {
      setIsEnhancing(false);
      toast({ title: "Enhancement failed", variant: "destructive" });
    },
  });

  const emails: ExternalEmail[] = emailsData?.data || [];
  const drafts: EmailDraft[] = draftsData?.data || [];

  const resetForm = () => {
    setToEmail("");
    setCcEmails("");
    setSubject("");
    setBody("");
    setOriginalBody("");
    setShowCompose(false);
  };

  const handleSend = () => {
    if (!toEmail || !subject || !body) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    
    sendEmailMutation.mutate({
      toEmail,
      ccEmails: ccEmails.split(",").map(e => e.trim()).filter(Boolean),
      subject,
      bodyHtml: body,
      enhancedByTrinity: !!originalBody,
      originalBody: originalBody || undefined,
    });
  };

  const handleEnhance = () => {
    if (!body) {
      toast({ title: "Please write some content first", variant: "destructive" });
      return;
    }
    setIsEnhancing(true);
    enhanceMutation.mutate({ subject, body, tone: "professional" });
  };

  const handleSaveDraft = () => {
    saveDraftMutation.mutate({
      toEmail,
      ccEmails: ccEmails.split(",").map(e => e.trim()).filter(Boolean),
      subject,
      bodyHtml: body,
    });
  };

  const loadDraft = (draft: EmailDraft) => {
    setToEmail(draft.toEmail || "");
    setCcEmails(draft.ccEmails?.join(", ") || "");
    setSubject(draft.subject || "");
    setBody(draft.bodyHtml || "");
    setActiveTab("compose");
  };

  const sentEmails = emails.filter(e => e.toEmail.status !== "pending");
  const pendingEmails = emails.filter(e => e.toEmail.status === "pending");

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">External Email</h1>
          <p className="text-muted-foreground">Send professional emails with Trinity AI enhancement</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 p-4 border-b">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Send className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{sentEmails.length}</p>
                <p className="text-sm text-muted-foreground">Emails Sent</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">{emails.filter(e => e.toEmail.status === "opened").length}</p>
                <p className="text-sm text-muted-foreground">Opened</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <div>
                <p className="text-2xl font-bold">{emails.filter(e => e.toEmail.enhancedByTrinity).length}</p>
                <p className="text-sm text-muted-foreground">Trinity Enhanced</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-gray-500" />
              <div>
                <p className="text-2xl font-bold">{drafts.length}</p>
                <p className="text-sm text-muted-foreground">Drafts</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-4 mt-2">
          <TabsTrigger value="compose" data-testid="tab-compose">
            <Mail className="w-4 h-4 mr-2" />
            Compose
          </TabsTrigger>
          <TabsTrigger value="sent" data-testid="tab-sent">
            <Send className="w-4 h-4 mr-2" />
            Sent ({sentEmails.length})
          </TabsTrigger>
          <TabsTrigger value="drafts" data-testid="tab-drafts">
            <FileText className="w-4 h-4 mr-2" />
            Drafts ({drafts.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="compose" className="flex-1 overflow-auto m-0 p-4">
          <Card className="max-w-3xl mx-auto">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5" />
                Compose Email
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="toEmail">To *</Label>
                <Input 
                  id="toEmail" 
                  type="email" 
                  value={toEmail}
                  onChange={(e) => setToEmail(e.target.value)}
                  placeholder="recipient@example.com"
                  data-testid="input-to-email"
                />
              </div>
              <div>
                <Label htmlFor="ccEmails">CC</Label>
                <Input 
                  id="ccEmails" 
                  value={ccEmails}
                  onChange={(e) => setCcEmails(e.target.value)}
                  placeholder="cc1@example.com, cc2@example.com"
                  data-testid="input-cc-emails"
                />
              </div>
              <div>
                <Label htmlFor="subject">Subject *</Label>
                <Input 
                  id="subject" 
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Email subject"
                  data-testid="input-subject"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label htmlFor="body">Message *</Label>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={handleEnhance}
                    disabled={isEnhancing || !body}
                    data-testid="button-enhance"
                  >
                    {isEnhancing ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Enhancing...
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4 mr-2" />
                        Enhance with Trinity
                      </>
                    )}
                  </Button>
                </div>
                <Textarea 
                  id="body" 
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write your email message here..."
                  className="min-h-[200px]"
                  data-testid="input-body"
                />
                {originalBody && (
                  <div className="mt-2 p-2 bg-muted rounded text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      <span className="font-medium">Trinity enhanced this email</span>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => { setBody(originalBody); setOriginalBody(""); }}
                        data-testid="button-revert"
                      >
                        Revert
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between pt-4 border-t">
                <Button variant="outline" onClick={handleSaveDraft} disabled={saveDraftMutation.isPending} data-testid="button-save-draft">
                  <FileText className="w-4 h-4 mr-2" />
                  {saveDraftMutation.isPending ? "Saving..." : "Save Draft"}
                </Button>
                <Button onClick={handleSend} disabled={sendEmailMutation.isPending} data-testid="button-send">
                  {sendEmailMutation.isPending ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send Email
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sent" className="flex-1 overflow-hidden m-0">
          <ScrollArea className="h-full">
            {emailsLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading emails...</div>
            ) : sentEmails.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No sent emails yet</div>
            ) : (
              sentEmails.map((email: any) => (
                <EmailRow key={email.email.id} email={email} onClick={() => setSelectedEmail(email.email)} />
              ))
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="drafts" className="flex-1 overflow-hidden m-0">
          <ScrollArea className="h-full">
            {drafts.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No drafts saved</div>
            ) : (
              drafts.map(draft => (
                <div 
                  key={draft.id}
                  className="flex items-center gap-4 p-4 border-b hover-elevate cursor-pointer"
                  onClick={() => loadDraft(draft)}
                  data-testid={`row-draft-${draft.id}`}
                >
                  <FileText className="w-5 h-5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{draft.toEmail || "(no recipient)"}</p>
                    <p className="text-sm text-muted-foreground truncate">{draft.subject || "(no subject)"}</p>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {format(new Date(draft.lastAutoSavedAt || draft.createdAt), "MMM d")}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              ))
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedEmail} onOpenChange={() => setSelectedEmail(null)}>
        <DialogContent size="xl">
          {selectedEmail && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedEmail.subject}</DialogTitle>
                <DialogDescription>
                  To: {selectedEmail.toEmail}
                  {selectedEmail.ccEmails?.length > 0 && ` | CC: ${selectedEmail.ccEmails.join(", ")}`}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center gap-4 text-sm">
                  <Badge className={EMAIL_STATUS[selectedEmail.status as keyof typeof EMAIL_STATUS]?.color}>
                    {EMAIL_STATUS[selectedEmail.status as keyof typeof EMAIL_STATUS]?.label}
                  </Badge>
                  {selectedEmail.enhancedByTrinity && (
                    <Badge variant="outline">
                      <Sparkles className="w-3 h-3 mr-1" /> Trinity Enhanced
                    </Badge>
                  )}
                  {selectedEmail.sentAt && (
                    <span className="text-muted-foreground">
                      Sent {format(new Date(selectedEmail.sentAt), "MMM d, yyyy h:mm a")}
                    </span>
                  )}
                </div>
                <div className="p-4 border rounded bg-muted/50">
                  <div dangerouslySetInnerHTML={{ __html: selectedEmail.bodyHtml }} />
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
