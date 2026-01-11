import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Mail, Inbox, Send, FileText, Star, Archive, Trash2, 
  Search, Plus, RefreshCw, Reply, Forward, Users, Building2,
  MailOpen, Clock, AlertCircle, Check, Menu, Sparkles, Wand2,
  ArrowLeft, MoreVertical, FolderOpen, Bell, ExternalLink,
  ChevronRight, Calendar, MapPin, Phone, User, Filter,
  Briefcase, Shield, AlertTriangle, ClipboardList, Paperclip, X, Download
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { format, formatDistanceToNow } from "date-fns";

interface EmailAttachment {
  name: string;
  url: string;
  size: number;
  type: string;
}

interface UnifiedEmail {
  id: string;
  type: 'internal' | 'external' | 'system';
  fromAddress: string;
  fromName: string | null;
  toAddresses: string | string[];
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  priority: string;
  sentAt: string | null;
  createdAt: string;
  isRead: boolean;
  isStarred: boolean;
  status: string;
  threadId: string | null;
  aiSummary?: string | null;
  enhancedByTrinity?: boolean;
  attachments?: EmailAttachment[];
  senderProfile?: {
    name: string;
    role?: string;
    department?: string;
    phone?: string;
    location?: string;
  };
}

interface EmailTemplate {
  id: string;
  name: string;
  code: string;
  icon: typeof Mail;
  subject: string;
  body: string;
  category: 'shift' | 'incident' | 'client' | 'team' | 'compliance';
}

const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'shift-reminder',
    name: 'Shift Reminder',
    code: 'SR',
    icon: Clock,
    category: 'shift',
    subject: 'Shift Reminder: {{shift_date}} at {{location}}',
    body: `Hello {{employee_name}},

This is a reminder that you are scheduled to work:

Date: {{shift_date}}
Time: {{shift_start}} - {{shift_end}}
Location: {{location}}

Please arrive 15 minutes early for briefing. If you cannot make this shift, please contact your supervisor immediately.

Thank you,
{{sender_name}}`
  },
  {
    id: 'incident-report',
    name: 'Incident Notification',
    code: 'IR',
    icon: AlertTriangle,
    category: 'incident',
    subject: 'Incident Report: {{incident_type}} at {{location}}',
    body: `INCIDENT NOTIFICATION

Incident Type: {{incident_type}}
Date/Time: {{incident_datetime}}
Location: {{location}}
Reporting Officer: {{officer_name}}

Summary:
{{incident_summary}}

Action Taken:
{{action_taken}}

Follow-up Required: {{follow_up_required}}

This report requires immediate review.

{{sender_name}}`
  },
  {
    id: 'client-update',
    name: 'Client Update',
    code: 'CU',
    icon: Building2,
    category: 'client',
    subject: 'Security Update: {{property_name}} - {{date}}',
    body: `Dear {{client_name}},

Please find your security update for {{property_name}}:

Reporting Period: {{date_range}}
Total Patrols: {{patrol_count}}
Incidents: {{incident_count}}

Highlights:
{{highlights}}

Please let us know if you have any questions or concerns.

Best regards,
{{sender_name}}
{{company_name}}`
  },
  {
    id: 'coverage-request',
    name: 'Coverage Request',
    code: 'CVR',
    icon: Users,
    category: 'shift',
    subject: 'Coverage Needed: {{shift_date}} at {{location}}',
    body: `COVERAGE REQUEST

A shift needs coverage:

Date: {{shift_date}}
Time: {{shift_start}} - {{shift_end}}
Location: {{location}}
Original Officer: {{original_officer}}
Reason: {{reason}}

If you are available to cover this shift, please respond to this email or contact your supervisor.

Thank you,
{{sender_name}}`
  },
  {
    id: 'daily-report',
    name: 'Daily Activity Report',
    code: 'DAR',
    icon: ClipboardList,
    category: 'compliance',
    subject: 'Daily Activity Report - {{location}} - {{date}}',
    body: `DAILY ACTIVITY REPORT

Location: {{location}}
Date: {{date}}
Officer: {{officer_name}}
Shift: {{shift_time}}

ACTIVITIES:
{{activities}}

PATROL CHECKS:
{{patrol_checks}}

INCIDENTS:
{{incidents}}

NOTES:
{{notes}}

Report submitted by: {{officer_name}}
Time: {{submission_time}}`
  },
  {
    id: 'team-memo',
    name: 'Team Memo',
    code: 'TM',
    icon: Users,
    category: 'team',
    subject: 'Team Memo: {{memo_subject}}',
    body: `TEAM MEMO

To: {{team_name}}
From: {{sender_name}}
Date: {{date}}
Re: {{memo_subject}}

{{memo_content}}

Please acknowledge receipt of this memo.

{{sender_name}}`
  }
];

const TAB_CONFIG = [
  { value: 'all', label: 'All', icon: Mail },
  { value: 'internal', label: 'Internal', icon: Users },
  { value: 'external', label: 'External', icon: ExternalLink },
  { value: 'system', label: 'System', icon: Bell },
];

const PRIORITY_COLORS = {
  low: 'text-muted-foreground',
  normal: '',
  high: 'text-amber-500',
  urgent: 'text-destructive',
};

export default function UnifiedInbox() {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  
  const [activeTab, setActiveTab] = useState('all');
  const [selectedEmail, setSelectedEmail] = useState<UnifiedEmail | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [showContext, setShowContext] = useState(!isMobile);
  
  const [composeTo, setComposeTo] = useState('');
  const [composeCc, setComposeCc] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [originalBody, setOriginalBody] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);

  const { data: mailboxData, isLoading: mailboxLoading } = useQuery({
    queryKey: ['/api/internal-email/mailbox/auto-create'],
  });

  const mailbox = mailboxData?.mailbox;

  const { data: internalEmailsData, isLoading: internalLoading, refetch: refetchInternal } = useQuery({
    queryKey: ['/api/internal-email/inbox', 'inbox', searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({ folder: 'inbox' });
      if (searchQuery) params.set('search', searchQuery);
      const res = await fetch(`/api/internal-email/inbox?${params}`, { credentials: 'include' });
      return res.json();
    },
    enabled: !!mailbox,
  });

  const { data: externalEmailsData, isLoading: externalLoading } = useQuery({
    queryKey: ['/api/external-emails'],
  });

  const { data: systemNotifications } = useQuery({
    queryKey: ['/api/notifications/recent'],
  });

  const internalEmails: UnifiedEmail[] = useMemo(() => 
    (internalEmailsData?.emails || []).map((e: any) => ({
      ...e,
      type: 'internal' as const,
      toAddresses: e.toAddresses,
      attachments: e.attachments ? (typeof e.attachments === 'string' ? JSON.parse(e.attachments) : e.attachments) : undefined,
    })), [internalEmailsData]);

  const externalEmails: UnifiedEmail[] = useMemo(() => 
    (externalEmailsData?.data || []).map((item: any) => ({
      id: item.email?.id || item.id,
      type: 'external' as const,
      fromAddress: item.email?.fromEmail || 'you@company.com',
      fromName: item.sentByUser ? `${item.sentByUser.firstName} ${item.sentByUser.lastName}` : null,
      toAddresses: item.email?.toEmail || '',
      subject: item.email?.subject,
      bodyText: null,
      bodyHtml: item.email?.bodyHtml,
      priority: 'normal',
      sentAt: item.email?.sentAt,
      createdAt: item.email?.createdAt,
      isRead: true,
      isStarred: false,
      status: item.email?.status || 'sent',
      attachments: item.email?.attachments ? (typeof item.email.attachments === 'string' ? JSON.parse(item.email.attachments) : item.email.attachments) : undefined,
      threadId: null,
      enhancedByTrinity: item.email?.enhancedByTrinity,
    })), [externalEmailsData]);

  const systemEmails: UnifiedEmail[] = useMemo(() => 
    (systemNotifications?.notifications || []).slice(0, 20).map((n: any) => ({
      id: n.id,
      type: 'system' as const,
      fromAddress: 'system@coaileague.internal',
      fromName: 'System',
      toAddresses: '',
      subject: n.title,
      bodyText: n.message,
      bodyHtml: null,
      priority: n.priority || 'normal',
      sentAt: n.createdAt,
      createdAt: n.createdAt,
      isRead: n.read,
      isStarred: false,
      status: n.read ? 'read' : 'unread',
      threadId: null,
    })), [systemNotifications]);

  const allEmails = useMemo(() => {
    let emails: UnifiedEmail[] = [];
    if (activeTab === 'all' || activeTab === 'internal') {
      emails = [...emails, ...internalEmails];
    }
    if (activeTab === 'all' || activeTab === 'external') {
      emails = [...emails, ...externalEmails];
    }
    if (activeTab === 'all' || activeTab === 'system') {
      emails = [...emails, ...systemEmails];
    }
    return emails.sort((a, b) => 
      new Date(b.sentAt || b.createdAt).getTime() - new Date(a.sentAt || a.createdAt).getTime()
    );
  }, [activeTab, internalEmails, externalEmails, systemEmails]);

  const unreadCounts = useMemo(() => ({
    all: [...internalEmails, ...externalEmails, ...systemEmails].filter(e => !e.isRead).length,
    internal: internalEmails.filter(e => !e.isRead).length,
    external: 0,
    system: systemEmails.filter(e => !e.isRead).length,
  }), [internalEmails, externalEmails, systemEmails]);

  const sendEmailMutation = useMutation({
    mutationFn: async (data: { to: string[]; cc?: string[]; subject: string; bodyText: string; bodyHtml?: string; sendExternal?: boolean; attachments?: { name: string; url: string; size: number; type: string }[] }) => {
      const isExternal = data.to.some(r => !r.endsWith('@coaileague.internal'));
      if (isExternal) {
        const res = await apiRequest('/api/external-emails', {
          method: 'POST',
          body: JSON.stringify({
            toEmail: data.to[0],
            ccEmails: data.cc || [],
            subject: data.subject,
            bodyHtml: data.bodyHtml || data.bodyText,
            attachments: data.attachments,
          }),
          headers: { 'Content-Type': 'application/json' },
        });
        if (res.data?.id) {
          await apiRequest(`/api/external-emails/${res.data.id}/send`, { method: 'POST' });
        }
        return res;
      }
      return apiRequest('/api/internal-email/send', {
        method: 'POST',
        body: JSON.stringify({
          to: data.to,
          cc: data.cc,
          subject: data.subject,
          bodyText: data.bodyText,
          bodyHtml: data.bodyHtml,
          attachments: data.attachments,
        }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      toast({ title: 'Email sent successfully' });
      resetCompose();
      queryClient.invalidateQueries({ queryKey: ['/api/internal-email/inbox'] });
      queryClient.invalidateQueries({ queryKey: ['/api/external-emails'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to send email', description: err.message, variant: 'destructive' });
    },
  });

  const enhanceMutation = useMutation({
    mutationFn: (data: { subject: string; body: string; tone?: string }) => 
      apiRequest('/api/external-emails/enhance', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: (res: any) => {
      if (res.data?.body) {
        setOriginalBody(composeBody);
        setComposeBody(res.data.body);
        if (res.data.subject) setComposeSubject(res.data.subject);
        toast({ title: 'Enhanced by Trinity', description: 'Review the improvements before sending' });
      }
      setIsEnhancing(false);
    },
    onError: () => {
      setIsEnhancing(false);
      toast({ title: 'Enhancement failed', variant: 'destructive' });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async ({ id, isRead }: { id: string; isRead: boolean }) => {
      return apiRequest(`/api/internal-email/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isRead }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/internal-email/inbox'] });
    },
  });

  const toggleStarMutation = useMutation({
    mutationFn: async ({ id, isStarred }: { id: string; isStarred: boolean }) => {
      return apiRequest(`/api/internal-email/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isStarred }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/internal-email/inbox'] });
    },
  });

  const deleteEmailMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/internal-email/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      toast({ title: 'Email moved to trash' });
      setSelectedEmail(null);
      queryClient.invalidateQueries({ queryKey: ['/api/internal-email/inbox'] });
    },
  });

  const resetCompose = () => {
    setComposeTo('');
    setComposeCc('');
    setComposeSubject('');
    setComposeBody('');
    setOriginalBody('');
    setSelectedTemplate(null);
    setAttachments([]);
    setComposeOpen(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      const maxSize = 10 * 1024 * 1024; // 10MB per file
      const validFiles = newFiles.filter(f => {
        if (f.size > maxSize) {
          toast({ title: `${f.name} is too large (max 10MB)`, variant: 'destructive' });
          return false;
        }
        // Prevent duplicate files
        if (attachments.some(existing => existing.name === f.name && existing.size === f.size)) {
          toast({ title: `${f.name} is already attached`, variant: 'destructive' });
          return false;
        }
        return true;
      });
      setAttachments(prev => [...prev, ...validFiles]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const uploadAttachments = async (files: File[]): Promise<{ name: string; url: string; size: number; type: string }[]> => {
    if (files.length === 0) return [];
    
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    
    const res = await fetch('/api/email-attachments/upload', {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });
    
    if (!res.ok) {
      throw new Error('Failed to upload attachments');
    }
    
    const data = await res.json();
    return data.attachments || [];
  };

  const handleSend = async () => {
    if (!composeTo.trim() || !composeSubject.trim()) {
      toast({ title: 'Please fill in recipient and subject', variant: 'destructive' });
      return;
    }
    
    const recipients = composeTo.split(',').map(e => e.trim()).filter(Boolean);
    const ccRecipients = composeCc.split(',').map(e => e.trim()).filter(Boolean);
    
    let uploadedAttachments: { name: string; url: string; size: number; type: string }[] = [];
    
    if (attachments.length > 0) {
      setIsUploadingAttachments(true);
      try {
        uploadedAttachments = await uploadAttachments(attachments);
      } catch (err) {
        toast({ title: 'Failed to upload attachments', variant: 'destructive' });
        setIsUploadingAttachments(false);
        return;
      }
      setIsUploadingAttachments(false);
    }
    
    sendEmailMutation.mutate({
      to: recipients,
      cc: ccRecipients.length > 0 ? ccRecipients : undefined,
      subject: composeSubject,
      bodyText: composeBody,
      bodyHtml: `<div style="white-space: pre-wrap;">${composeBody}</div>`,
      attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
    });
  };

  const handleEnhance = () => {
    if (!composeBody) {
      toast({ title: 'Write some content first', variant: 'destructive' });
      return;
    }
    setIsEnhancing(true);
    enhanceMutation.mutate({ subject: composeSubject, body: composeBody, tone: 'professional' });
  };

  const handleTemplateSelect = (template: EmailTemplate) => {
    setSelectedTemplate(template);
    setComposeSubject(template.subject);
    setComposeBody(template.body);
    toast({ title: `Template loaded: ${template.name}`, description: 'Replace {{placeholders}} with actual values' });
  };

  const handleEmailClick = (email: UnifiedEmail) => {
    setSelectedEmail(email);
    if (!email.isRead && email.type === 'internal') {
      markReadMutation.mutate({ id: email.id, isRead: true });
    }
  };

  const handleReply = () => {
    if (!selectedEmail) return;
    setComposeTo(selectedEmail.fromAddress);
    setComposeSubject(`Re: ${selectedEmail.subject || ''}`);
    setComposeOpen(true);
  };

  const formatEmailDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    if (diffHours < 24) {
      return format(date, 'h:mm a');
    }
    if (diffHours < 168) {
      return format(date, 'EEE');
    }
    return format(date, 'MMM d');
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'internal': return <Users className="h-3 w-3" />;
      case 'external': return <ExternalLink className="h-3 w-3" />;
      case 'system': return <Bell className="h-3 w-3" />;
      default: return <Mail className="h-3 w-3" />;
    }
  };

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'internal': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
      case 'external': return 'bg-purple-500/10 text-purple-600 dark:text-purple-400';
      case 'system': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
      default: return '';
    }
  };

  const isLoading = mailboxLoading || internalLoading || externalLoading;

  if (isLoading && !allEmails.length) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading your inbox...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Unified Inbox</h1>
          <p className="text-sm text-muted-foreground">All your communications in one place</p>
        </div>
        <Button onClick={() => setComposeOpen(true)} data-testid="button-compose">
          <Plus className="h-4 w-4 mr-2" />
          Compose
        </Button>
      </div>

      <div className="flex items-center gap-2 p-2 border-b bg-muted/30">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search emails..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
            data-testid="input-search"
          />
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => { refetchInternal(); }}
          data-testid="button-refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-4 mt-2 justify-start">
          {TAB_CONFIG.map(tab => (
            <TabsTrigger key={tab.value} value={tab.value} className="gap-2" data-testid={`tab-${tab.value}`}>
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {unreadCounts[tab.value as keyof typeof unreadCounts] > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] text-xs">
                  {unreadCounts[tab.value as keyof typeof unreadCounts]}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="flex-1 flex overflow-hidden">
          <div className={`flex-1 flex flex-col border-r ${selectedEmail && !isMobile ? 'w-2/5' : 'w-full'}`}>
            <ScrollArea className="flex-1">
              {allEmails.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No messages in this view</p>
                </div>
              ) : (
                allEmails.map(email => (
                  <div
                    key={`${email.type}-${email.id}`}
                    className={`p-4 border-b cursor-pointer hover-elevate transition-colors ${
                      !email.isRead ? 'bg-primary/5' : ''
                    } ${selectedEmail?.id === email.id ? 'bg-muted' : ''}`}
                    onClick={() => handleEmailClick(email)}
                    data-testid={`email-item-${email.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarFallback className={`text-sm ${getTypeBadgeColor(email.type)}`}>
                          {(email.fromName || email.fromAddress).charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-sm truncate flex-1 ${!email.isRead ? 'font-semibold' : ''}`}>
                            {email.fromName || email.fromAddress.split('@')[0]}
                          </span>
                          <Badge variant="outline" className={`text-xs shrink-0 ${getTypeBadgeColor(email.type)}`}>
                            {getTypeIcon(email.type)}
                          </Badge>
                          {(email.priority === 'high' || email.priority === 'urgent') && (
                            <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                          )}
                          <span className="text-xs text-muted-foreground shrink-0">
                            {formatEmailDate(email.sentAt || email.createdAt)}
                          </span>
                        </div>
                        <p className={`text-sm truncate ${!email.isRead ? 'font-medium' : 'text-muted-foreground'}`}>
                          {email.subject || '(No subject)'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {email.bodyText?.substring(0, 80) || 'No preview available'}
                        </p>
                      </div>
                      {email.type === 'internal' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleStarMutation.mutate({ id: email.id, isStarred: !email.isStarred });
                          }}
                        >
                          <Star className={`h-4 w-4 ${email.isStarred ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </ScrollArea>
          </div>

          {selectedEmail && !isMobile && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-3 border-b flex items-center gap-2 bg-muted/30">
                <Button variant="ghost" size="icon" onClick={handleReply} data-testid="button-reply">
                  <Reply className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" data-testid="button-forward">
                  <Forward className="h-4 w-4" />
                </Button>
                <div className="flex-1" />
                {selectedEmail.type === 'internal' && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleStarMutation.mutate({ id: selectedEmail.id, isStarred: !selectedEmail.isStarred })}
                    >
                      <Star className={`h-4 w-4 ${selectedEmail.isStarred ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteEmailMutation.mutate(selectedEmail.id)}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
              <ScrollArea className="flex-1 p-6">
                <h2 className="text-xl font-semibold mb-4">{selectedEmail.subject || '(No subject)'}</h2>
                <div className="flex items-start gap-4 mb-6">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className={getTypeBadgeColor(selectedEmail.type)}>
                      {(selectedEmail.fromName || selectedEmail.fromAddress).charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{selectedEmail.fromName || selectedEmail.fromAddress.split('@')[0]}</span>
                      <Badge variant="outline" className={`text-xs ${getTypeBadgeColor(selectedEmail.type)}`}>
                        {selectedEmail.type}
                      </Badge>
                      {selectedEmail.enhancedByTrinity && (
                        <Badge variant="outline" className="text-xs">
                          <Sparkles className="h-3 w-3 mr-1" /> Trinity
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{selectedEmail.fromAddress}</p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(selectedEmail.sentAt || selectedEmail.createdAt), 'PPpp')}
                    </p>
                  </div>
                </div>
                <Separator className="my-4" />
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  {selectedEmail.bodyHtml ? (
                    <div dangerouslySetInnerHTML={{ __html: selectedEmail.bodyHtml }} />
                  ) : (
                    <p className="whitespace-pre-wrap">{selectedEmail.bodyText}</p>
                  )}
                </div>
                
                {/* Attachments Display */}
                {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                  <div className="mt-6 pt-4 border-t">
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                      <Paperclip className="h-4 w-4" />
                      Attachments ({selectedEmail.attachments.length})
                    </h4>
                    <div className="grid gap-2">
                      {selectedEmail.attachments.map((attachment, idx) => (
                        <a
                          key={idx}
                          href={attachment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30 hover-elevate transition-colors"
                          data-testid={`attachment-${idx}`}
                        >
                          <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{attachment.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatFileSize(attachment.size)} - {attachment.type.split('/')[1]?.toUpperCase() || 'FILE'}
                            </p>
                          </div>
                          <Download className="h-4 w-4 text-muted-foreground shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
        </div>
      </Tabs>

      {selectedEmail && isMobile && (
        <Sheet open={!!selectedEmail} onOpenChange={() => setSelectedEmail(null)}>
          <SheetContent side="right" className="w-full sm:max-w-lg p-0">
            <div className="flex flex-col h-full">
              <SheetHeader className="p-4 border-b">
                <SheetTitle className="text-left pr-8">{selectedEmail.subject || '(No subject)'}</SheetTitle>
              </SheetHeader>
              <ScrollArea className="flex-1 p-4">
                <div className="flex items-start gap-3 mb-4">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback>{(selectedEmail.fromName || selectedEmail.fromAddress).charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{selectedEmail.fromName || selectedEmail.fromAddress.split('@')[0]}</p>
                    <p className="text-sm text-muted-foreground">{selectedEmail.fromAddress}</p>
                  </div>
                </div>
                <div className="prose prose-sm dark:prose-invert">
                  {selectedEmail.bodyHtml ? (
                    <div dangerouslySetInnerHTML={{ __html: selectedEmail.bodyHtml }} />
                  ) : (
                    <p className="whitespace-pre-wrap">{selectedEmail.bodyText}</p>
                  )}
                </div>
                
                {/* Attachments Display (Mobile) */}
                {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Paperclip className="h-4 w-4" />
                      Attachments ({selectedEmail.attachments.length})
                    </h4>
                    <div className="space-y-2">
                      {selectedEmail.attachments.map((attachment, idx) => (
                        <a
                          key={idx}
                          href={attachment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 p-2 rounded-md border bg-muted/30"
                        >
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm truncate flex-1">{attachment.name}</span>
                          <Download className="h-4 w-4" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </ScrollArea>
              <div className="p-4 border-t flex gap-2">
                <Button className="flex-1" onClick={handleReply}>
                  <Reply className="h-4 w-4 mr-2" /> Reply
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}

      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent size="xl" className="max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Compose Email
              {selectedTemplate && (
                <Badge variant="outline" className="ml-2">
                  {selectedTemplate.name}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              Send internal or external emails with AI enhancement
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4">
            <div className="flex flex-wrap gap-2 p-3 bg-muted/50 rounded-lg">
              <span className="text-sm font-medium text-muted-foreground mr-2">Templates:</span>
              {EMAIL_TEMPLATES.map(template => (
                <Button
                  key={template.id}
                  variant={selectedTemplate?.id === template.id ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => handleTemplateSelect(template)}
                  className="h-8"
                  data-testid={`template-${template.id}`}
                >
                  <template.icon className="h-3 w-3 mr-1" />
                  {template.name}
                </Button>
              ))}
            </div>

            <div className="grid gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="to">To *</Label>
                  <Input
                    id="to"
                    placeholder="recipient@example.com"
                    value={composeTo}
                    onChange={(e) => setComposeTo(e.target.value)}
                    data-testid="input-to"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Use @coaileague.internal for internal, real email for external
                  </p>
                </div>
                <div>
                  <Label htmlFor="cc">CC</Label>
                  <Input
                    id="cc"
                    placeholder="cc@example.com"
                    value={composeCc}
                    onChange={(e) => setComposeCc(e.target.value)}
                    data-testid="input-cc"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="subject">Subject *</Label>
                <Input
                  id="subject"
                  placeholder="Email subject"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
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
                    disabled={isEnhancing || !composeBody}
                    data-testid="button-enhance"
                  >
                    {isEnhancing ? (
                      <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Enhancing...</>
                    ) : (
                      <><Wand2 className="h-4 w-4 mr-2" /> Enhance with Trinity</>
                    )}
                  </Button>
                </div>
                <Textarea
                  id="body"
                  placeholder="Write your message..."
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  className="min-h-[200px]"
                  data-testid="input-body"
                />
                {originalBody && (
                  <div className="mt-2 p-3 bg-primary/5 rounded-lg border border-primary/20">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Trinity enhanced this email</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setComposeBody(originalBody); setOriginalBody(''); }}
                      >
                        Revert
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Attachments Section */}
              <div>
                <Label>Attachments</Label>
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById('email-file-upload')?.click()}
                      data-testid="button-attach-file"
                    >
                      <Paperclip className="h-4 w-4 mr-2" />
                      Attach Files
                    </Button>
                    <input
                      id="email-file-upload"
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleFileUpload}
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.txt,.csv,.zip"
                    />
                    <span className="text-xs text-muted-foreground">
                      Max 10MB per file. PDF, DOC, XLS, images accepted.
                    </span>
                  </div>
                  {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 p-3 bg-muted/50 rounded-lg">
                      {attachments.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 px-3 py-1.5 bg-background rounded-md border"
                        >
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm truncate max-w-[150px]">{file.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatFileSize(file.size)}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeAttachment(index)}
                            className="text-muted-foreground hover:text-destructive"
                            data-testid={`button-remove-attachment-${index}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-shrink-0 gap-2">
            <Button variant="outline" onClick={resetCompose}>
              Cancel
            </Button>
            <Button 
              onClick={handleSend} 
              disabled={sendEmailMutation.isPending || isUploadingAttachments} 
              data-testid="button-send"
            >
              {isUploadingAttachments ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Uploading...</>
              ) : sendEmailMutation.isPending ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Sending...</>
              ) : (
                <><Send className="h-4 w-4 mr-2" /> Send{attachments.length > 0 && ` (${attachments.length} file${attachments.length > 1 ? 's' : ''})`}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
