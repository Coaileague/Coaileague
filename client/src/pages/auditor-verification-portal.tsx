/**
 * Auditor Verification Portal — AI Regulatory Audit Suite Phase 3
 * ===============================================================
 * The auditor uploads their state authorization paperwork here.
 * Trinity verifies the document before the Document Safe is unlocked.
 * Once unlocked, the auditor is redirected to the Audit Chatdock.
 *
 * Also displays the cure-period countdown for the Tenant Owner view.
 * Phase 6: shows live timer + condition summary when verdict = PASS_WITH_CONDITIONS.
 *
 * TRINITY.md §H — mobile-first. TRINITY.md §S — Trinity singular.
 */

import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  Upload, Lock, Unlock, CheckCircle2, AlertTriangle, Loader2,
  Clock, Shield, FileText, Timer, Bot,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function CureCountdown({ cureStatus }: { cureStatus: any }) {
  if (!cureStatus) return null;

  const { daysRemaining, hoursRemaining, isExpired, status, conditionsText, cureDays, deadlineAt } = cureStatus;
  const pctUsed = Math.max(0, Math.min(100, ((cureDays * 24 - hoursRemaining) / (cureDays * 24)) * 100));

  const urgencyColor =
    hoursRemaining <= 24 ? 'text-red-600 bg-red-50 border-red-200' :
    hoursRemaining <= 72 ? 'text-orange-600 bg-orange-50 border-orange-200' :
    'text-amber-600 bg-amber-50 border-amber-200';

  if (isExpired || status === 'expired') {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-5 pb-5 text-center">
          <AlertTriangle className="h-8 w-8 text-red-600 mx-auto mb-2" />
          <p className="font-bold text-red-800">Cure Period Expired</p>
          <p className="text-sm text-red-600 mt-1">This audit has been automatically converted to FAIL.</p>
        </CardContent>
      </Card>
    );
  }

  if (status === 'cured') {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="pt-5 pb-5 text-center">
          <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-2" />
          <p className="font-bold text-green-800">Corrections Verified</p>
          <p className="text-sm text-green-600 mt-1">Trinity has verified your corrections. This audit is now PASS.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`border ${urgencyColor}`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Timer className="h-4 w-4" /> Cure Period Countdown
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center">
          <p className="text-3xl font-bold">
            {daysRemaining > 0 ? `${daysRemaining}d ${hoursRemaining % 24}h` : `${hoursRemaining}h`}
          </p>
          <p className="text-sm text-slate-500 mt-1">remaining until deadline</p>
          <p className="text-xs text-slate-400">Deadline: {new Date(deadlineAt).toLocaleString()}</p>
        </div>
        <Progress value={pctUsed} className="h-2" />
        {conditionsText && (
          <div className="bg-white rounded-lg p-3 border">
            <p className="text-xs font-semibold text-slate-600 mb-1">Conditions to cure:</p>
            <p className="text-sm text-slate-700">{conditionsText}</p>
          </div>
        )}
        <p className="text-xs text-slate-500">
          Upload your corrective documentation in the Audit Chatdock for Trinity to verify.
          Trinity will send reminders at 7 days, 72 hours, and 24 hours before the deadline.
        </p>
      </CardContent>
    </Card>
  );
}

export default function AuditorVerificationPortal() {
  const { auditId } = useParams<{ auditId: string }>();
  const [, navigate]  = useLocation();
  const { user }     = useAuth();
  const { toast }    = useToast();
  const queryClient  = useQueryClient();
  const workspaceId  = (user as any)?.workspaceId;

  const [paperworkFile, setPaperworkFile] = useState<File | null>(null);

  const { data: safeStatus } = useQuery({
    queryKey: ['/api/audit-suite/audits', auditId, 'safe-status'],
    queryFn: () => apiRequest('GET', `/api/audit-suite/audits/${auditId}/safe-status?workspaceId=${workspaceId}`).then(r => r.json()),
    enabled: !!auditId && !!workspaceId,
    refetchInterval: 15000,
  });

  const { data: cureData } = useQuery({
    queryKey: ['/api/audit-suite/audits', auditId, 'cure-status'],
    queryFn: () => apiRequest('GET', `/api/audit-suite/audits/${auditId}/cure-status?workspaceId=${workspaceId}`).then(r => r.json()),
    enabled: !!auditId && !!workspaceId,
    refetchInterval: 60000,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!paperworkFile) throw new Error('Please select a file');
      const form = new FormData();
      form.append('paperwork', paperworkFile);
      form.append('workspaceId', workspaceId ?? '');
      const r = await apiRequest('POST', `/api/audit-suite/audits/${auditId}/submit-paperwork`, form);
      return r.json();
    },
    onSuccess: (data) => {
      if (data.verified) {
        queryClient.invalidateQueries({ queryKey: ['/api/audit-suite/audits', auditId, 'safe-status'] });
        toast({ title: 'Paperwork verified', description: 'Trinity has verified your authorization. The Document Safe is now unlocked.', duration: 5000 });
        setTimeout(() => navigate(`/audit-chatdock/${auditId}`), 1500);
      } else {
        toast({ title: 'Verification failed', description: data.reasoning ?? 'Trinity could not verify this document. Please re-submit.', variant: 'destructive', duration: 8000 });
      }
    },
    onError: (err: any) => toast({ title: 'Submission failed', description: err?.message, variant: 'destructive' }),
  });

  const isUnlocked = safeStatus?.unlocked;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-xl ${isUnlocked ? 'bg-green-600' : 'bg-[#1a2744]'}`}>
            {isUnlocked ? <Unlock className="h-7 w-7 text-white" /> : <Lock className="h-7 w-7 text-white" />}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {isUnlocked ? 'Document Safe Unlocked' : 'Auditor Verification Gate'}
            </h1>
            <p className="text-slate-500 text-sm mt-1">Audit ID: {auditId}</p>
          </div>
        </div>

        {/* Gate status */}
        {isUnlocked ? (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-700">
              Your state authorization paperwork has been verified by Trinity. The Document Safe is unlocked.
              You may now access the Audit Chatdock.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert className="border-amber-200 bg-amber-50">
            <Shield className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-700">
              The Document Safe is locked. Trinity must verify your state regulatory authorization
              before you can access the tenant's compliance files.
            </AlertDescription>
          </Alert>
        )}

        {/* Trinity explanation */}
        <Card className="border-[#1a2744]/20 bg-[#1a2744]/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-[#1a2744]">
              <Bot className="h-4 w-4" /> Trinity — Zero-Trust Verification
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-700 space-y-2">
            <p>
              I verify all auditor credentials before granting access. Your document must:
            </p>
            <ul className="list-disc list-inside text-slate-600 space-y-1">
              <li>Be issued by a recognized state regulatory agency</li>
              <li>Contain an authorization date within the last 90 days</li>
              <li>Reference the specific license or business being audited</li>
              <li>Bear official agency letterhead, seal, or signature block</li>
            </ul>
            <p className="text-xs text-slate-500 mt-2">
              Accepted formats: JPEG, PNG, PDF (max 25 MB)
            </p>
          </CardContent>
        </Card>

        {/* Upload paperwork */}
        {!isUnlocked && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-[#1a2744]" /> Upload State Authorization Paperwork
              </CardTitle>
              <CardDescription>
                Upload your official regulatory audit authorization document.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:border-[#1a2744]/50 transition-colors"
                onClick={() => document.getElementById('paperwork-input')?.click()}
              >
                <input
                  id="paperwork-input"
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  className="sr-only"
                  onChange={e => setPaperworkFile(e.target.files?.[0] ?? null)}
                />
                {paperworkFile ? (
                  <div className="space-y-2">
                    <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
                    <p className="font-medium text-slate-700">{paperworkFile.name}</p>
                    <p className="text-xs text-slate-500">{(paperworkFile.size / 1024).toFixed(0)} KB</p>
                  </div>
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-slate-400 mx-auto mb-3" />
                    <p className="text-slate-600 font-medium">Drop file here or click to browse</p>
                    <p className="text-slate-400 text-sm mt-1">JPEG, PNG, or PDF • Max 25 MB</p>
                  </>
                )}
              </div>

              <Button
                className="w-full bg-[#1a2744] hover:bg-[#243260] text-white"
                onClick={() => submitMutation.mutate()}
                disabled={!paperworkFile || submitMutation.isPending}
              >
                {submitMutation.isPending
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Trinity is verifying…</>
                  : <><Shield className="h-4 w-4 mr-2" />Submit for Trinity Verification</>
                }
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Proceed to chatdock */}
        {isUnlocked && (
          <Button
            className="w-full bg-green-600 hover:bg-green-700 text-white"
            onClick={() => navigate(`/audit-chatdock/${auditId}`)}
          >
            Open Audit Chatdock →
          </Button>
        )}

        {/* Cure period countdown (visible to tenant owner) */}
        {cureData?.cureStatus && (
          <CureCountdown cureStatus={cureData.cureStatus} />
        )}

        <p className="text-xs text-slate-400 text-center">
          All verification events are logged in the immutable Audit Access Log.
          The Tenant Owner receives an immediate alert when access is granted.
        </p>
      </div>
    </div>
  );
}
