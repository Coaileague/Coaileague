import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Mail, Inbox, Send, FileText, Star, Archive, Trash2, 
  Search, Plus, RefreshCw, ChevronLeft, Reply, Forward,
  MailOpen, Clock, AlertCircle, Check, Menu, Sparkles,
  ArrowLeft, MoreVertical, FolderOpen
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Email {
  id: string;
  fromAddress: string;
  fromName: string | null;
  toAddresses: string;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  priority: string;
  isInternal: boolean;
  sentAt: string | null;
  createdAt: string;
  isRead: boolean;
  isStarred: boolean;
  isImportant: boolean;
  recipientId: string;
  status: string;
  threadId: string | null;
  aiSummary?: string | null;
}

interface Mailbox {
  id: string;
  emailAddress: string;
  displayName: string | null;
  unreadCount: number;
  totalMessages: number;
}

interface Folder {
  id: string;
  name: string;
  folderType: string;
  messageCount: number;
  unreadCount: number;
  isSystem: boolean;
}

const folderIcons: Record<string, typeof Inbox> = {
  inbox: Inbox,
  sent: Send,
  drafts: FileText,
  starred: Star,
  archive: Archive,
  trash: Trash2,
  custom: Mail,
};

const folderLabels: Record<string, string> = {
  inbox: "Inbox",
  sent: "Sent",
  drafts: "Drafts",
  starred: "Starred",
  archive: "Archive",
  trash: "Trash",
};

export default function InboxPage() {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [selectedFolder, setSelectedFolder] = useState("inbox");
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [folderSheetOpen, setFolderSheetOpen] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);

  const { data: mailboxData, isLoading: mailboxLoading } = useQuery({
    queryKey: ["/api/internal-email/mailbox/auto-create"],
  });

  const mailbox = mailboxData?.mailbox as Mailbox | undefined;

  const { data: foldersData } = useQuery({
    queryKey: ["/api/internal-email/folders"],
    enabled: !!mailbox,
  });

  // @ts-expect-error — TS migration: fix in refactoring sprint
  const folders = (foldersData?.folders || []) as Folder[];

  const { data: emailsData, isLoading: emailsLoading, refetch: refetchEmails, isFetching } = useQuery({
    queryKey: ["/api/internal-email/inbox", selectedFolder, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({ folder: selectedFolder });
      if (searchQuery) params.set("search", searchQuery);
      const res = await fetch(`/api/internal-email/inbox?${params}`, { credentials: "include" });
      return res.json();
    },
    enabled: !!mailbox,
  });

  const emails = (emailsData?.emails || []) as Email[];

  const sendEmailMutation = useMutation({
    mutationFn: async (data: { to: string[]; subject: string; bodyText: string; sendExternal?: boolean }) => {
      return apiRequest("/api/internal-email/send", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      toast({ title: "Email sent successfully" });
      setComposeOpen(false);
      setComposeTo("");
      setComposeSubject("");
      setComposeBody("");
      queryClient.invalidateQueries({ queryKey: ["/api/internal-email/inbox"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to send email", description: err.message, variant: "destructive" });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async ({ id, isRead }: { id: string; isRead: boolean }) => {
      return apiRequest(`/api/internal-email/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isRead }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/internal-email/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/internal-email/mailbox/auto-create"] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Update Failed',
        description: error.message || 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const toggleStarMutation = useMutation({
    mutationFn: async ({ id, isStarred }: { id: string; isStarred: boolean }) => {
      return apiRequest(`/api/internal-email/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isStarred }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/internal-email/inbox"] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Star Failed',
        description: error.message || 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const deleteEmailMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/internal-email/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      toast({ title: "Email moved to trash" });
      setSelectedEmail(null);
      queryClient.invalidateQueries({ queryKey: ["/api/internal-email/inbox"] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Delete Failed',
        description: error.message || 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const restoreEmailMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/internal-email/${id}/restore`, { method: "POST" });
    },
    onSuccess: () => {
      toast({ title: "Email restored to inbox" });
      setSelectedEmail(null);
      queryClient.invalidateQueries({ queryKey: ["/api/internal-email/inbox"] });
    },
    onError: () => {
      toast({ title: "Failed to restore email", variant: "destructive" });
    },
  });

  const handleSendEmail = () => {
    if (!composeTo.trim() || !composeSubject.trim()) {
      toast({ title: "Please fill in recipient and subject", variant: "destructive" });
      return;
    }
    const recipients = composeTo.split(",").map(e => e.trim()).filter(Boolean);
    const sendExternal = recipients.some(r => !r.endsWith("@coaileague.internal"));
    sendEmailMutation.mutate({
      to: recipients,
      subject: composeSubject,
      bodyText: composeBody,
      sendExternal,
    });
  };

  const handleEmailClick = (email: Email) => {
    setSelectedEmail(email);
    if (!email.isRead) {
      markReadMutation.mutate({ id: email.id, isRead: true });
    }
  };

  const handleGenerateSummary = async () => {
    if (!selectedEmail) return;
    setGeneratingSummary(true);
    try {
      const res = await apiRequest(`/api/internal-email/${selectedEmail.id}/summarize`, {
        method: "POST",
      });
      if (res.summary) {
        setSelectedEmail({ ...selectedEmail, aiSummary: res.summary });
        setShowSummary(true);
        toast({ title: "Summary generated" });
      }
    } catch (err) {
      toast({ title: "Could not generate summary", variant: "destructive" });
    } finally {
      setGeneratingSummary(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 86400000) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    if (diff < 604800000) {
      return date.toLocaleDateString([], { weekday: "short" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const parseRecipients = (str: string) => {
    try {
      return JSON.parse(str);
    } catch {
      return [str];
    }
  };

  const handleFolderSelect = (folderType: string) => {
    setSelectedFolder(folderType);
    setSelectedEmail(null);
    setFolderSheetOpen(false);
  };

  const currentFolderLabel = folderLabels[selectedFolder] || selectedFolder;
  const currentFolderIcon = folderIcons[selectedFolder] || Mail;
  const CurrentFolderIcon = currentFolderIcon;

  const unreadTotal = folders.reduce((sum, f) => sum + (f.unreadCount || 0), 0);

  if (mailboxLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Setting up your mailbox...</p>
        </div>
      </div>
    );
  }

  const FoldersList = ({ onSelect }: { onSelect?: (folder: string) => void }) => (
    <div className="space-y-1">
      {folders.map((folder) => {
        const Icon = folderIcons[folder.folderType] || Mail;
        const isSelected = selectedFolder === folder.folderType;
        return (
          <Button
            key={folder.id}
            variant={isSelected ? "secondary" : "ghost"}
            className="w-full justify-start gap-3 h-11"
            onClick={() => onSelect ? onSelect(folder.folderType) : handleFolderSelect(folder.folderType)}
            data-testid={`folder-${folder.folderType}`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">{folder.name}</span>
            {folder.unreadCount > 0 && (
              <Badge variant="secondary" className="text-xs font-medium">
                {folder.unreadCount}
              </Badge>
            )}
          </Button>
        );
      })}
    </div>
  );

  const ComposeDialog = () => (
    <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
      <DialogContent size="lg" className="max-h-[80dvh] sm:max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Message</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>To</Label>
            <Input 
              placeholder="recipient@coaileague.internal"
              value={composeTo}
              onChange={(e) => setComposeTo(e.target.value)}
              data-testid="input-compose-to"
              className="h-11"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Separate multiple recipients with commas
            </p>
          </div>
          <div>
            <Label>Subject</Label>
            <Input 
              placeholder="Email subject"
              value={composeSubject}
              onChange={(e) => setComposeSubject(e.target.value)}
              data-testid="input-compose-subject"
              className="h-11"
            />
          </div>
          <div>
            <Label>Message</Label>
            <Textarea 
              placeholder="Write your message..."
              className="min-h-[150px] sm:min-h-[200px]"
              value={composeBody}
              onChange={(e) => setComposeBody(e.target.value)}
              data-testid="input-compose-body"
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setComposeOpen(false)} className="h-11">
              Cancel
            </Button>
            <Button 
              onClick={handleSendEmail}
              disabled={sendEmailMutation.isPending}
              data-testid="button-send-email"
              className="h-11"
            >
              {sendEmailMutation.isPending ? "Sending..." : "Send"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  const EmailListItem = ({ email }: { email: Email }) => (
    <div
      className={['p-4 border-b cursor-pointer hover-elevate active:bg-muted/50 transition-colors', !email.isRead ? "bg-primary/5" : "", selectedEmail?.id === email.id && !isMobile ? "bg-muted" : ""].join(' ')}
      onClick={() => handleEmailClick(email)}
      data-testid={`email-item-${email.id}`}
    >
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 -ml-1"
          onClick={(e) => {
            e.stopPropagation();
            toggleStarMutation.mutate({ id: email.id, isStarred: !email.isStarred });
          }}
          data-testid={`button-star-${email.id}`}
        >
          <Star className={`h-4 w-4 ${email.isStarred ? "fill-yellow-400 text-yellow-400" : ""}`} />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-sm truncate flex-1 ${!email.isRead ? "font-semibold" : ""}`}>
              {email.fromName || email.fromAddress.split("@")[0]}
            </span>
            {(email.priority === "high" || email.priority === "urgent") && (
              <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
            )}
            <span className="text-xs text-muted-foreground shrink-0">
              {formatDate(email.sentAt || email.createdAt)}
            </span>
          </div>
          <p className={`text-sm truncate mb-1 ${!email.isRead ? "font-medium" : "text-muted-foreground"}`}>
            {email.subject || "(No subject)"}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {email.bodyText?.substring(0, 100) || "No preview available"}
          </p>
        </div>
      </div>
    </div>
  );

  const EmailDetail = () => {
    if (!selectedEmail) return null;
    
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="sticky top-0 z-10 p-3 border-b bg-background flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSelectedEmail(null)}
            data-testid="button-back"
            className="h-10 w-10"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10"
            onClick={handleGenerateSummary}
            disabled={generatingSummary}
            data-testid="button-ai-summary"
            title="Generate AI Summary"
          >
            <Sparkles className={`h-5 w-5 ${generatingSummary ? "animate-pulse" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10"
            onClick={() => {
              setComposeTo(selectedEmail.fromAddress);
              setComposeSubject(`Re: ${selectedEmail.subject || ""}`);
              setComposeOpen(true);
            }}
            data-testid="button-reply"
          >
            <Reply className="h-5 w-5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem 
                onClick={() => {
                  setComposeSubject(`Fwd: ${selectedEmail.subject || ""}`);
                  setComposeBody(`\n\n--- Forwarded message ---\nFrom: ${selectedEmail.fromAddress}\nSubject: ${selectedEmail.subject}\n\n${selectedEmail.bodyText || ""}`);
                  setComposeOpen(true);
                }}
              >
                <Forward className="h-4 w-4 mr-2" />
                Forward
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toggleStarMutation.mutate({ id: selectedEmail.id, isStarred: !selectedEmail.isStarred })}>
                <Star className="h-4 w-4 mr-2" />
                {selectedEmail.isStarred ? "Unstar" : "Star"}
              </DropdownMenuItem>
              {selectedFolder === 'trash' ? (
                <DropdownMenuItem 
                  onClick={() => restoreEmailMutation.mutate(selectedEmail.id)}
                  disabled={restoreEmailMutation.isPending}
                  className="text-primary"
                  data-testid="button-restore"
                >
                  <Inbox className="h-4 w-4 mr-2" />
                  {restoreEmailMutation.isPending ? 'Restoring...' : 'Restore to Inbox'}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem 
                  onClick={() => deleteEmailMutation.mutate(selectedEmail.id)}
                  disabled={deleteEmailMutation.isPending}
                  className="text-destructive"
                  data-testid="button-delete"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {deleteEmailMutation.isPending ? 'Deleting...' : 'Delete'}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 sm:p-6">
            <h2 className="text-lg sm:text-xl font-semibold mb-4" data-testid="email-subject">
              {selectedEmail.subject || "(No subject)"}
            </h2>
            
            {(showSummary || selectedEmail.aiSummary) && (
              <Card className="mb-4 border-primary/20 bg-primary/5">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-primary">AI Summary</span>
                  </div>
                  <p className="text-sm">{selectedEmail.aiSummary || "Generating summary..."}</p>
                </CardContent>
              </Card>
            )}
            
            <div className="flex items-start gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold shrink-0">
                {(selectedEmail.fromName || selectedEmail.fromAddress).charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {selectedEmail.fromName || selectedEmail.fromAddress.split("@")[0]}
                  </span>
                  {selectedEmail.isInternal && (
                    <Badge variant="outline" className="text-xs">Internal</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground truncate">
                  {selectedEmail.fromAddress}
                </p>
                <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                  <Clock className="h-3 w-3" />
                  {new Date(selectedEmail.sentAt || selectedEmail.createdAt).toLocaleString()}
                </p>
              </div>
            </div>

            <div className="text-sm text-muted-foreground mb-4">
              <span>To: {parseRecipients(selectedEmail.toAddresses).join(", ")}</span>
            </div>

            <Separator className="my-4" />

            <div className="prose prose-sm dark:prose-invert max-w-none" data-testid="email-body">
              {selectedEmail.bodyHtml ? (
                <div dangerouslySetInnerHTML={{ __html: selectedEmail.bodyHtml }} />
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-sm">{selectedEmail.bodyText}</pre>
              )}
            </div>
          </div>
        </ScrollArea>
      </div>
    );
  };

  if (isMobile) {
    if (selectedEmail) {
      return (
        <>
          <EmailDetail />
          <ComposeDialog />
        </>
      );
    }

    return (
      <div className="flex flex-col h-full bg-background" data-testid="inbox-page">
        <div className="sticky top-0 z-10 border-b bg-background">
          <div className="flex items-center gap-2 p-3">
            <Sheet open={folderSheetOpen} onOpenChange={setFolderSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" data-testid="button-folders">
                  <FolderOpen className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetHeader className="p-4 border-b">
                  <SheetTitle>Folders</SheetTitle>
                </SheetHeader>
                <div className="p-2">
                  <FoldersList onSelect={handleFolderSelect} />
                </div>
                {mailbox && (
                  <div className="p-3 border-t mt-auto">
                    <p className="text-xs text-muted-foreground truncate">{mailbox.emailAddress}</p>
                  </div>
                )}
              </SheetContent>
            </Sheet>
            
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <CurrentFolderIcon className="h-5 w-5 text-muted-foreground shrink-0" />
              <span className="font-medium truncate">{currentFolderLabel}</span>
              {unreadTotal > 0 && (
                <Badge variant="secondary" className="text-xs">{unreadTotal}</Badge>
              )}
            </div>
            
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => refetchEmails()} 
              disabled={isFetching}
              className="h-10 w-10 shrink-0"
              data-testid="button-refresh"
            >
              <RefreshCw className={`h-5 w-5 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
          
          <div className="px-3 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search emails..."
                className="pl-9 h-11"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search-emails"
              />
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1">
          {emailsLoading ? (
            <div className="p-4 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-8 w-8 rounded" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : emails.length === 0 ? (
            <div className="p-8 text-center">
              <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No emails in {currentFolderLabel}</p>
            </div>
          ) : (
            <div>
              {emails.map((email) => (
                <EmailListItem key={email.id} email={email} />
              ))}
            </div>
          )}
        </ScrollArea>

        <Button
          className="fixed bottom-20 right-4 h-14 w-14 rounded-full shadow-lg"
          onClick={() => setComposeOpen(true)}
          data-testid="button-compose"
        >
          <Plus className="h-6 w-6" />
        </Button>
        
        <ComposeDialog />
      </div>
    );
  }

  return (
    <div className="flex h-full bg-background" data-testid="inbox-page">
      <div className="w-56 lg:w-64 border-r bg-muted/30 flex flex-col">
        <div className="p-3">
          <Button 
            className="w-full gap-2 h-10" 
            onClick={() => setComposeOpen(true)}
            data-testid="button-compose"
          >
            <Plus className="h-4 w-4" />
            Compose
          </Button>
        </div>

        <Separator />

        {mailbox && (
          <div className="px-3 py-2 text-xs text-muted-foreground truncate" title={mailbox.emailAddress}>
            {mailbox.emailAddress}
          </div>
        )}

        <ScrollArea className="flex-1 px-2">
          <FoldersList />
        </ScrollArea>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="p-3 border-b flex items-center gap-2">
          <div className="flex items-center gap-2">
            <CurrentFolderIcon className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{currentFolderLabel}</span>
          </div>
          <div className="relative flex-1 max-w-md ml-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search emails..."
              className="pl-9 h-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search-emails"
            />
          </div>
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => refetchEmails()} 
            disabled={isFetching}
            data-testid="button-refresh"
            className="h-9 w-9"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className={[selectedEmail ? "w-2/5 xl:w-1/3 border-r" : "flex-1", 'overflow-hidden'].join(' ')}>
            <ScrollArea className="h-full">
              {emailsLoading ? (
                <div className="p-4 space-y-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex gap-3">
                      <Skeleton className="h-8 w-8 rounded" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                        <Skeleton className="h-3 w-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : emails.length === 0 ? (
                <div className="p-8 text-center">
                  <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No emails in {currentFolderLabel}</p>
                </div>
              ) : (
                <div>
                  {emails.map((email) => (
                    <EmailListItem key={email.id} email={email} />
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {selectedEmail && (
            <div className="flex-1 overflow-hidden">
              <EmailDetail />
            </div>
          )}
        </div>
      </div>
      
      <ComposeDialog />
    </div>
  );
}
