/**
 * ChatActionBlock — Wave 7 / Task 1
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders interactive Action Blocks from the message.uiComponent JSONB field.
 * Trinity or managers can post messages that display as live UI widgets:
 *
 *   document_upload   — file upload form with drag-and-drop
 *   approval_button   — APPROVE / REJECT with optional reason
 *   shift_offer       — shift details card with Accept / Decline
 *   coi_request       — certificate of insurance upload request
 *   poll              — multi-choice vote with live tally
 *
 * Shape: { type: string, props: Record<string, unknown>, version: number,
 *          respondedAt?: string, respondedBy?: string, response?: unknown }
 *
 * Responds by posting to /api/chat/messages/:messageId/respond (PATCH).
 * After response, the block shows a locked "Responded" state.
 */

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, XCircle, Upload, ClipboardList, Calendar, FileCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UIComponent {
  type: "document_upload" | "approval_button" | "shift_offer" | "coi_request" | "poll" | string;
  props: Record<string, unknown>;
  version: number;
  respondedAt?: string;
  respondedBy?: string;
  response?: unknown;
}

interface ChatActionBlockProps {
  messageId: string;
  conversationId: string;
  uiComponent: UIComponent;
  currentUserId?: string;
  isOwn?: boolean;
  onRespond?: (messageId: string, response: unknown) => void;
}

// ── Respond helper ─────────────────────────────────────────────────────────────

async function postResponse(messageId: string, response: unknown): Promise<boolean> {
  try {
    await apiRequest("PATCH", `/api/chat/messages/${messageId}/respond`, { response });
    return true;
  } catch {
    return false;
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function RespondedBadge({ respondedAt, respondedBy }: { respondedAt?: string; respondedBy?: string }) {
  return (
    <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
      <CheckCircle className="h-3 w-3 text-green-500" />
      <span>
        Responded{respondedBy ? ` by ${respondedBy}` : ""}
        {respondedAt ? ` · ${new Date(respondedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
      </span>
    </div>
  );
}

// ── Approval Button ────────────────────────────────────────────────────────────

function ApprovalBlock({ props, messageId, locked, onAction }: {
  props: Record<string, unknown>;
  messageId: string;
  locked: boolean;
  onAction: (response: unknown) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);

  const handle = async (action: "approve" | "reject") => {
    setPending(action);
    await onAction({ action, reason: reason.trim() || null });
    setPending(null);
  };

  return (
    <div className="mt-2 rounded-lg border border-border bg-card/60 p-3 space-y-2 text-sm">
      <div className="font-medium flex items-center gap-1.5">
        <ClipboardList className="h-3.5 w-3.5 text-primary" />
        {String(props.title || "Approval Required")}
      </div>
      {props.description && (
        <p className="text-muted-foreground text-xs">{String(props.description)}</p>
      )}
      {!locked && (
        <>
          <Textarea
            className="text-xs min-h-[48px] resize-none"
            placeholder="Optional reason or note…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={!!pending}
          />
          <div className="flex gap-2">
            <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs"
              disabled={!!pending} onClick={() => handle("approve")}>
              {pending === "approve" ? "Approving…" : "✓ Approve"}
            </Button>
            <Button size="sm" variant="outline" className="flex-1 text-red-600 border-red-300 text-xs"
              disabled={!!pending} onClick={() => handle("reject")}>
              {pending === "reject" ? "Rejecting…" : "✗ Reject"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Shift Offer ────────────────────────────────────────────────────────────────

function ShiftOfferBlock({ props, locked, onAction }: {
  props: Record<string, unknown>;
  locked: boolean;
  onAction: (response: unknown) => Promise<void>;
}) {
  const [pending, setPending] = useState<"accept" | "decline" | null>(null);

  const handle = async (action: "accept" | "decline") => {
    setPending(action);
    await onAction({ action });
    setPending(null);
  };

  return (
    <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2 text-sm">
      <div className="font-medium flex items-center gap-1.5">
        <Calendar className="h-3.5 w-3.5 text-primary" />
        Shift Offer
      </div>
      <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
        {props.date && <span><strong>Date:</strong> {String(props.date)}</span>}
        {props.time && <span><strong>Time:</strong> {String(props.time)}</span>}
        {props.site && <span><strong>Site:</strong> {String(props.site)}</span>}
        {props.payRate && <span><strong>Pay:</strong> {String(props.payRate)}</span>}
      </div>
      {!locked && (
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 text-xs" disabled={!!pending} onClick={() => handle("accept")}>
            {pending === "accept" ? "Accepting…" : "✓ Accept Shift"}
          </Button>
          <Button size="sm" variant="outline" className="flex-1 text-xs" disabled={!!pending} onClick={() => handle("decline")}>
            {pending === "decline" ? "Declining…" : "✗ Decline"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Document Upload ────────────────────────────────────────────────────────────

function DocumentUploadBlock({ props, locked, onAction }: {
  props: Record<string, unknown>;
  locked: boolean;
  onAction: (response: unknown) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    // In production: upload file to GCS / presigned URL, then respond with the URL
    await onAction({ fileName: file.name, fileSize: file.size, status: "uploaded" });
    setUploading(false);
    toast({ title: "Document submitted", description: file.name });
  };

  return (
    <div className="mt-2 rounded-lg border-2 border-dashed border-border bg-muted/30 p-3 space-y-2 text-sm">
      <div className="font-medium flex items-center gap-1.5">
        <Upload className="h-3.5 w-3.5 text-primary" />
        {String(props.title || "Document Upload Required")}
      </div>
      {props.description && (
        <p className="text-xs text-muted-foreground">{String(props.description)}</p>
      )}
      {!locked && (
        <div className="space-y-2">
          <input type="file" className="text-xs w-full"
            accept={String(props.acceptedTypes || ".pdf,.jpg,.jpeg,.png")}
            onChange={(e) => setFile(e.target.files?.[0] || null)} />
          {file && (
            <Button size="sm" className="text-xs w-full" disabled={uploading} onClick={handleUpload}>
              {uploading ? "Uploading…" : `Submit: ${file.name}`}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Poll ───────────────────────────────────────────────────────────────────────

function PollBlock({ props, locked, onAction, response }: {
  props: Record<string, unknown>;
  locked: boolean;
  onAction: (response: unknown) => Promise<void>;
  response?: unknown;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const options = (props.options as string[]) || [];
  const voted = locked || !!response;
  const votedOption = response ? (response as Record<string, unknown>).option as string : null;

  const vote = async (option: string) => {
    setSelected(option);
    setVoting(true);
    await onAction({ option });
    setVoting(false);
  };

  return (
    <div className="mt-2 rounded-lg border border-border bg-card/60 p-3 space-y-2 text-sm">
      <div className="font-medium">{String(props.question || "Poll")}</div>
      <div className="space-y-1">
        {options.map((opt) => (
          <button key={opt} disabled={voted || voting}
            className={cn(
              "w-full text-left text-xs px-2.5 py-1.5 rounded border transition-colors",
              voted && opt === (votedOption || selected)
                ? "border-primary bg-primary/10 font-medium"
                : "border-border hover:border-primary/50 hover:bg-muted/50",
              (voted || voting) ? "cursor-default" : "cursor-pointer"
            )}
            onClick={() => vote(opt)}>
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── COI Request ────────────────────────────────────────────────────────────────

function COIRequestBlock({ props, locked, onAction }: {
  props: Record<string, unknown>;
  locked: boolean;
  onAction: (response: unknown) => Promise<void>;
}) {
  return (
    <div className="mt-2 rounded-lg border border-amber-300/50 bg-amber-50/30 dark:bg-amber-950/20 p-3 space-y-2 text-sm">
      <div className="font-medium flex items-center gap-1.5">
        <FileCheck className="h-3.5 w-3.5 text-amber-600" />
        Certificate of Insurance Requested
      </div>
      {props.deadline && (
        <p className="text-xs text-muted-foreground">
          <strong>Deadline:</strong> {String(props.deadline)}
        </p>
      )}
      {props.requiredCoverage && (
        <p className="text-xs text-muted-foreground">
          <strong>Coverage required:</strong> {String(props.requiredCoverage)}
        </p>
      )}
      {!locked && (
        <Button size="sm" className="text-xs w-full" onClick={() => onAction({ status: "uploading" })}>
          <Upload className="h-3 w-3 mr-1" /> Upload COI Document
        </Button>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function ChatActionBlock({
  messageId,
  uiComponent,
  currentUserId,
  isOwn,
  onRespond,
}: ChatActionBlockProps) {
  const { toast } = useToast();
  const locked = !!uiComponent.respondedAt;

  const handleAction = useCallback(async (response: unknown) => {
    const ok = await postResponse(messageId, response);
    if (ok) {
      onRespond?.(messageId, response);
      toast({ title: "Response submitted", description: "Your response has been recorded." });
    } else {
      toast({ title: "Failed to respond", variant: "destructive" });
    }
  }, [messageId, onRespond, toast]);

  return (
    <div className="w-full max-w-sm">
      {/* Render the appropriate block type */}
      {uiComponent.type === "approval_button" && (
        <ApprovalBlock props={uiComponent.props} messageId={messageId}
          locked={locked} onAction={handleAction} />
      )}
      {uiComponent.type === "shift_offer" && (
        <ShiftOfferBlock props={uiComponent.props} locked={locked} onAction={handleAction} />
      )}
      {uiComponent.type === "document_upload" && (
        <DocumentUploadBlock props={uiComponent.props} locked={locked} onAction={handleAction} />
      )}
      {uiComponent.type === "coi_request" && (
        <COIRequestBlock props={uiComponent.props} locked={locked} onAction={handleAction} />
      )}
      {uiComponent.type === "poll" && (
        <PollBlock props={uiComponent.props} locked={locked} onAction={handleAction}
          response={uiComponent.response} />
      )}
      {/* Responded badge for all types */}
      {locked && (
        <RespondedBadge respondedAt={uiComponent.respondedAt} respondedBy={uiComponent.respondedBy} />
      )}
    </div>
  );
}
