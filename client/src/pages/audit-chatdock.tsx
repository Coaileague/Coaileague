/**
 * Audit Chatdock Page — AI Regulatory Audit Suite Phase 4
 * ========================================================
 * Secure chat session tied to a specific audit_record_id between the
 * Auditor and the Tenant Owner, with Trinity as an active co-pilot.
 *
 * Features:
 *   - Trinity generates audit packet PDFs on request
 *   - HITL approval gate: owner previews, approves, or requests modifications
 *   - Natural-language revision loop for PDF modifications
 *   - "Approve & Send" releases the document to the public chat
 *
 * TRINITY.md §H — mobile-first; TRINITY.md §S — Trinity is one brain.
 */

import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  FileText, Send, CheckCircle2, XCircle, Eye, Loader2,
  Bot, Shield, MessageSquare, RefreshCw, Lock, Unlock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AuditChatdock() {
  const { auditId } = useParams<{ auditId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const workspaceId = (user as any)?.workspaceId;

  const [modifyText, setModifyText] = useState('');
  const [showModifyFor, setShowModifyFor] = useState<string | null>(null);

  // Gate check
  const { data: safeStatus } = useQuery({
    queryKey: ['/api/audit-suite/audits', auditId, 'safe-status'],
    queryFn: () => apiRequest('GET', `/api/audit-suite/audits/${auditId}/safe-status?workspaceId=${workspaceId}`).then(r => r.json()),
    enabled: !!auditId && !!workspaceId,
  });

  // Drafts list
  const { data: draftsData, isLoading: draftsLoading } = useQuery({
    queryKey: ['/api/audit-suite/audits', auditId, 'packets'],
    queryFn: () => apiRequest('GET', `/api/audit-suite/audits/${auditId}/packets?workspaceId=${workspaceId}`).then(r => r.json()),
    enabled: !!auditId && !!workspaceId,
    refetchInterval: 8000,
  });

  const generateMutation = useMutation({
    mutationFn: () => apiRequest('POST', `/api/audit-suite/audits/${auditId}/generate-packet`, { workspaceId }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/audit-suite/audits', auditId, 'packets'] });
      toast({ title: 'Audit packet ready for review', description: 'Trinity has compiled your audit packet. Please review and approve before sending.' });
    },
    onError: (err) => toast({ title: 'Generation failed', description: err?.message, variant: 'destructive' }),
  });

  const approveMutation = useMutation({
    mutationFn: (draftId: string) =>
      apiRequest('POST', `/api/audit-suite/audits/${auditId}/packets/${draftId}/approve`).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/audit-suite/audits', auditId, 'packets'] });
      toast({ title: 'Document released', description: 'The audit packet has been sent to the auditor.' });
    },
    onError: (err) => toast({ title: 'Approval failed', description: err?.message, variant: 'destructive' }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ draftId, instructions }: { draftId: string; instructions: string }) =>
      apiRequest('POST', `/api/audit-suite/audits/${auditId}/packets/${draftId}/reject`, {
        modifyInstructions: instructions,
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/audit-suite/audits', auditId, 'packets'] });
      setShowModifyFor(null);
      setModifyText('');
      toast({ title: 'Revision requested', description: 'Trinity is generating a revised packet based on your instructions.' });
    },
    onError: (err) => toast({ title: 'Revision failed', description: err?.message, variant: 'destructive' }),
  });

  const drafts: any[] = draftsData?.drafts ?? [];
  const pendingDraft = drafts.find(d => d.status === 'pending_owner_review');
  const sentDrafts   = drafts.filter(d => d.sent_to_auditor);

  if (!safeStatus?.unlocked) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <Lock className="h-12 w-12 text-slate-400 mx-auto" />
            <h2 className="text-xl font-semibold text-slate-800">Document Safe Locked</h2>
            <p className="text-slate-500 text-sm">
              The Audit Chatdock will be accessible once the auditor submits and Trinity verifies their state authorization paperwork.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="p-3 bg-[#1a2744] rounded-xl">
            <MessageSquare className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Audit Chatdock</h1>
            <p className="text-slate-500 text-sm mt-1">
              Secure channel for audit communications. Trinity is your co-pilot.
            </p>
          </div>
          <Badge className="ml-auto bg-green-100 text-green-800 border-green-200">
            <Unlock className="h-3 w-3 mr-1" /> Safe Unlocked
          </Badge>
        </div>

        {/* Trinity Message Panel */}
        <Card className="border-[#1a2744]/20 bg-[#1a2744]/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-[#1a2744]">
              <Bot className="h-4 w-4" /> Trinity — Audit Co-Pilot
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-700">
              I am managing this audit session. I can compile an audit packet containing your business
              information, guard cards, shift schedules, and visual compliance results. You must review
              and approve any document before it is released to the auditor.
            </p>
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              className="bg-[#1a2744] hover:bg-[#243260] text-white"
            >
              {generateMutation.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Compiling Packet…</>
                : <><FileText className="h-4 w-4 mr-2" />Generate Audit Packet</>
              }
            </Button>
          </CardContent>
        </Card>

        {/* Pending HITL approval */}
        {pendingDraft && (
          <Card className="border-amber-200 bg-amber-50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2 text-amber-800">
                <Shield className="h-4 w-4" /> Document Awaiting Your Approval
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-amber-700">
                Trinity has compiled an audit packet. <strong>Review before sending.</strong> This document
                will NOT reach the auditor until you click "Approve &amp; Send."
              </p>
              <div className="bg-white rounded-lg p-3 text-sm text-slate-600 border border-amber-200">
                <strong>Draft ID:</strong> {pendingDraft.id}<br />
                <strong>Generated:</strong> {new Date(pendingDraft.created_at).toLocaleString()}
              </div>

              {/* Modification instructions */}
              {showModifyFor === pendingDraft.id ? (
                <div className="space-y-3">
                  <Textarea
                    placeholder='e.g. "Remove page 3" or "Scrub all social security numbers" or "Remove John Smith from guard cards"'
                    value={modifyText}
                    onChange={e => setModifyText(e.target.value)}
                    rows={3}
                    className="bg-white"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => rejectMutation.mutate({ draftId: pendingDraft.id, instructions: modifyText })}
                      disabled={rejectMutation.isPending || !modifyText.trim()}
                      className="bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      {rejectMutation.isPending
                        ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Regenerating…</>
                        : <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Send to Trinity for Revision</>
                      }
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setShowModifyFor(null); setModifyText(''); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="border-slate-300">
                    <Eye className="h-3.5 w-3.5 mr-1.5" />Preview
                  </Button>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => approveMutation.mutate(pendingDraft.id)}
                    disabled={approveMutation.isPending}
                  >
                    {approveMutation.isPending
                      ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Sending…</>
                      : <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Approve &amp; Send</>
                    }
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-300 text-amber-700"
                    onClick={() => setShowModifyFor(pendingDraft.id)}
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1.5" />Reject / Modify
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Previously sent documents */}
        {sentDrafts.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Send className="h-4 w-4" /> Documents Released to Auditor
            </h3>
            {sentDrafts.map((d) => (
              <Card key={d.id} className="border-green-200">
                <CardContent className="pt-4 pb-4 flex items-center justify-between">
                  <div className="text-sm text-slate-700">
                    <p className="font-medium">Audit Packet</p>
                    <p className="text-slate-500 text-xs">Sent: {new Date(d.sent_at).toLocaleString()}</p>
                  </div>
                  <Badge className="bg-green-100 text-green-800 border-green-200">
                    <CheckCircle2 className="h-3 w-3 mr-1" />Sent
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Separator />
        <p className="text-xs text-slate-400 text-center">
          All communications in this chatdock are logged and tied to Audit ID: {auditId}.
          Trinity acts as your advocate — no documents leave this session without your explicit approval.
        </p>
      </div>
    </div>
  );
}
