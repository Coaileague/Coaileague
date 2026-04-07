import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { UniversalModal, UniversalModalDescription, UniversalModalFooter, UniversalModalHeader, UniversalModalTitle, UniversalModalContent } from '@/components/ui/universal-modal';
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Wrench, FileText, Camera, Link as LinkIcon, 
  TrendingUp, Users, Bug, MessageSquare 
} from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const PLATFORM_NAME = (import.meta.env.VITE_PLATFORM_NAME as string) || "CoAIleague";

interface AgentToolbeltProps {
  ticketId?: string;
  selectedUserId?: string | null; // Target user for tools
  selectedUserName?: string | null; // Target user name for display
  onMacroInsert?: (macro: string, targetUserId?: string) => void;
  onRequestFile?: (fileType: string, targetUserId?: string) => void;
  onSendKBLink?: (article: string, targetUserId?: string) => void;
  onEscalate?: (reason: string, queue: string) => void;
  onTransfer?: (agentId: string) => void;
  onCreateBug?: (description: string) => void;
  className?: string;
}

const macros = [
  { id: 'greeting', label: 'Greeting', text: `Hello! Thanks for reaching out to ${PLATFORM_NAME} Support. How can I assist you today?` },
  { id: 'investigation', label: 'Investigating', text: 'I\'m looking into this issue for you. I\'ll have an update shortly.' },
  { id: 'need_info', label: 'Need Info', text: 'To help resolve this, could you provide more details about when this started?' },
  { id: 'resolved', label: 'Resolved', text: 'Great! I\'m glad we could resolve this. Is there anything else I can help with?' },
  { id: 'escalation', label: 'Escalation Notice', text: 'I\'m escalating this to our senior team for specialized assistance. They\'ll reach out shortly.' },
];

const kbArticles = [
  { id: 'getting-started', title: 'Getting Started Guide', url: '/help/getting-started' },
  { id: 'billing', title: 'Billing & Subscriptions', url: '/help/billing' },
  { id: 'security', title: 'Security Best Practices', url: '/help/security' },
  { id: 'integrations', title: 'Integration Setup', url: '/help/integrations' },
  { id: 'troubleshooting', title: 'Common Issues', url: '/help/troubleshooting' },
];

export function AgentToolbelt({
  ticketId,
  selectedUserId,
  selectedUserName,
  onMacroInsert,
  onRequestFile,
  onSendKBLink,
  onEscalate,
  onTransfer,
  onCreateBug,
  className
}: AgentToolbeltProps) {
  const { toast } = useToast();
  const [escalateDialog, setEscalateDialog] = useState(false);
  const [bugDialog, setBugDialog] = useState(false);
  const [escalateReason, setEscalateReason] = useState('');
  const [escalateQueue, setEscalateQueue] = useState('');
  const [bugDescription, setBugDescription] = useState('');

  const handleMacro = (macroText: string) => {
    if (onMacroInsert) {
      onMacroInsert(macroText, selectedUserId || undefined);
    }
    const targetInfo = selectedUserName ? ` for ${selectedUserName}` : "";
    toast({
      title: "Macro Inserted",
      description: `Template text added${targetInfo}`,
    });
  };

  const handleRequestFile = (fileType: string) => {
    if (onRequestFile) {
      onRequestFile(fileType, selectedUserId || undefined);
    }
    const targetInfo = selectedUserName ? ` from ${selectedUserName}` : " from user";
    toast({
      title: "File Requested",
      description: `Requesting ${fileType}${targetInfo}`,
    });
  };

  const handleKBLink = (article: typeof kbArticles[0]) => {
    if (onSendKBLink) {
      onSendKBLink(`[KB] **${article.title}**: ${window.location.origin}${article.url}`, selectedUserId || undefined);
    }
    const targetInfo = selectedUserName ? ` to ${selectedUserName}` : "";
    toast({
      title: "KB Link Sent",
      description: `Sent ${article.title}${targetInfo}`,
    });
  };

  const handleEscalate = () => {
    if (onEscalate && escalateReason && escalateQueue) {
      onEscalate(escalateReason, escalateQueue);
      setEscalateDialog(false);
      setEscalateReason('');
      setEscalateQueue('');
      toast({
        title: "Ticket Escalated",
        description: `Escalated to ${escalateQueue} queue`,
      });
    }
  };

  const handleCreateBug = () => {
    if (onCreateBug && bugDescription) {
      onCreateBug(bugDescription);
      setBugDialog(false);
      setBugDescription('');
      toast({
        title: "Bug Report Created",
        description: "Engineering has been notified",
      });
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="secondary" 
            size="sm" 
            className={`gap-2 ${className || ''}`}
            data-testid="agent-toolbelt-trigger"
          >
            <Wrench className="h-4 w-4" />
            Agent Tools
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Quick Actions</DropdownMenuLabel>
          <DropdownMenuSeparator />

          {/* Macros */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <MessageSquare className="w-4 h-4 mr-2" />
              Insert Macro
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              {macros.map(macro => (
                <DropdownMenuItem 
                  key={macro.id}
                  onClick={() => handleMacro(macro.text)}
                  data-testid={`macro-${macro.id}`}
                >
                  {macro.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* Request Files */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Camera className="w-4 h-4 mr-2" />
              Request File
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              <DropdownMenuItem onClick={() => handleRequestFile('screenshot')} data-testid="request-screenshot">
                Screenshot
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleRequestFile('log')} data-testid="request-log">
                Log File
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleRequestFile('file')} data-testid="request-file">
                General File
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* KB Links */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <LinkIcon className="w-4 h-4 mr-2" />
              Send KB Link
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              {kbArticles.map(article => (
                <DropdownMenuItem 
                  key={article.id}
                  onClick={() => handleKBLink(article)}
                  data-testid={`kb-${article.id}`}
                >
                  {article.title}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          {/* Escalate */}
          <DropdownMenuItem 
            onClick={() => setEscalateDialog(true)}
            data-testid="escalate-button"
          >
            <TrendingUp className="w-4 h-4 mr-2" />
            Escalate Ticket
          </DropdownMenuItem>

          {/* Create Bug */}
          <DropdownMenuItem 
            onClick={() => setBugDialog(true)}
            data-testid="create-bug-button"
          >
            <Bug className="w-4 h-4 mr-2" />
            Create Bug Report
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Escalate Dialog */}
      <UniversalModal open={escalateDialog} onOpenChange={setEscalateDialog}>
        <UniversalModalContent size="md" data-testid="escalate-dialog">
          <UniversalModalHeader>
            <UniversalModalTitle>Escalate Ticket</UniversalModalTitle>
            <UniversalModalDescription>
              Escalate this ticket to a specialized team for further assistance.
            </UniversalModalDescription>
          </UniversalModalHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="escalate-queue">Escalate To</Label>
              <Select value={escalateQueue} onValueChange={setEscalateQueue}>
                <SelectTrigger id="escalate-queue" data-testid="select-escalate-queue">
                  <SelectValue placeholder="Select queue..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sysops">SysOps (Technical)</SelectItem>
                  <SelectItem value="billing">Billing Team</SelectItem>
                  <SelectItem value="engineering">Engineering</SelectItem>
                  <SelectItem value="management">Management</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="escalate-reason">Reason for Escalation</Label>
              <Textarea
                id="escalate-reason"
                value={escalateReason}
                onChange={(e) => setEscalateReason(e.target.value)}
                placeholder="Explain why this needs escalation..."
                rows={3}
                data-testid="input-escalate-reason"
              />
            </div>
          </div>
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setEscalateDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleEscalate}
              disabled={!escalateReason || !escalateQueue}
              data-testid="button-confirm-escalate"
            >
              Escalate
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>

      {/* Bug Report Dialog */}
      <UniversalModal open={bugDialog} onOpenChange={setBugDialog}>
        <UniversalModalContent size="md" data-testid="bug-dialog">
          <UniversalModalHeader>
            <UniversalModalTitle>Create Bug Report</UniversalModalTitle>
            <UniversalModalDescription>
              Report a technical issue to the engineering team.
            </UniversalModalDescription>
          </UniversalModalHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="bug-description">Bug Description</Label>
              <Textarea
                id="bug-description"
                value={bugDescription}
                onChange={(e) => setBugDescription(e.target.value)}
                placeholder="Describe the bug, steps to reproduce, and impact..."
                rows={5}
                data-testid="input-bug-description"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              This will create a ticket for engineering with context from this support session.
            </p>
          </div>
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setBugDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateBug}
              disabled={!bugDescription}
              data-testid="button-confirm-bug"
            >
              Create Bug Report
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>
    </>
  );
}
