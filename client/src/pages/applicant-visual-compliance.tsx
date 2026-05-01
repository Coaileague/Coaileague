/**
 * Applicant Visual Compliance Upload Page — AI Regulatory Audit Suite Phase 2
 * ============================================================================
 * Applicants and tenants upload visual evidence for each required slot before
 * a regulatory audit. Trinity analyzes each upload in real-time and displays
 * the result (passed / flagged) with reasoning.
 *
 * Required slots: Uniform Front/Back, Vehicle 4 sides, Premises Wall & License.
 * TRINITY.md §H — Mobile-first rendering.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Upload, CheckCircle2, AlertTriangle, Clock, Camera, Car, Building2,
  Shield, Loader2, RefreshCw, Eye,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Slot metadata
interface Slot {
  type: string;
  label: string;
  icon: React.ReactNode;
  hint: string;
}

const SLOT_HINTS: Record<string, string> = {
  uniform_front:    'Face the camera directly. Ensure any text on the uniform is clearly readable.',
  uniform_back:     'Turn to show the full back of the uniform. All text must be legible.',
  vehicle_front:    'Capture the front license plate clearly. The plate must be fully visible and in focus.',
  vehicle_back:     'Capture the rear license plate clearly.',
  vehicle_left:     'Full left-side view of the vehicle. Both doors visible.',
  vehicle_right:    'Full right-side view of the vehicle.',
  premises_wall:    'Photograph the wall where labor law posters are displayed. All 5 required posters must be visible.',
  premises_license: 'Photograph the framed Private Security Bureau license mounted on the office wall.',
};

const SLOT_ICONS: Record<string, React.ReactNode> = {
  uniform_front:    <Shield className="h-5 w-5" />,
  uniform_back:     <Shield className="h-5 w-5" />,
  vehicle_front:    <Car className="h-5 w-5" />,
  vehicle_back:     <Car className="h-5 w-5" />,
  vehicle_left:     <Car className="h-5 w-5" />,
  vehicle_right:    <Car className="h-5 w-5" />,
  premises_wall:    <Building2 className="h-5 w-5" />,
  premises_license: <Building2 className="h-5 w-5" />,
};

function StatusBadgeInline({ status }: { status: string }) {
  if (status === 'passed')  return <Badge className="bg-green-100 text-green-800 border-green-200"><CheckCircle2 className="h-3 w-3 mr-1" />Passed</Badge>;
  if (status === 'flagged') return <Badge className="bg-red-100 text-red-800 border-red-200"><AlertTriangle className="h-3 w-3 mr-1" />Flagged</Badge>;
  return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
}

export default function ApplicantVisualCompliance() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);

  const workspaceId = (user as any)?.workspaceId;

  const { data: slotsData } = useQuery({
    queryKey: ['/api/audit-suite/visual-compliance/slots'],
    queryFn: () => apiRequest('GET', '/api/audit-suite/visual-compliance/slots').then(r => r.json()),
  });

  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['/api/audit-suite/visual-compliance', workspaceId, 'summary'],
    queryFn: () => workspaceId
      ? apiRequest('GET', `/api/audit-suite/visual-compliance/${workspaceId}/summary`).then(r => r.json())
      : null,
    enabled: !!workspaceId,
    refetchInterval: 10000,
  });

  const { data: artifactsData } = useQuery({
    queryKey: ['/api/audit-suite/visual-compliance', workspaceId],
    queryFn: () => workspaceId
      ? apiRequest('GET', `/api/audit-suite/visual-compliance/${workspaceId}`).then(r => r.json())
      : null,
    enabled: !!workspaceId,
    refetchInterval: 10000,
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ slotType, file }: { slotType: string; file: File }) => {
      const form = new FormData();
      form.append('file', file);
      form.append('artifactType', slotType);
      form.append('workspaceId', workspaceId);
      const r = await apiRequest('POST', '/api/audit-suite/visual-compliance/upload', form);
      return r.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/audit-suite/visual-compliance'] });
      if (data.artifact?.status === 'passed') {
        toast({ title: 'Photo accepted', description: 'Trinity verified this photo. ✓', duration: 3000 });
      } else if (data.artifact?.status === 'flagged') {
        toast({ title: 'Photo flagged', description: data.artifact.reasoningText ?? 'Trinity flagged this photo. Please review and re-upload.', variant: 'destructive', duration: 6000 });
      }
    },
    onError: (err) => {
      toast({ title: 'Upload failed', description: err?.message ?? 'Please try again.', variant: 'destructive' });
    },
    onSettled: () => setUploadingSlot(null),
  });

  const handleFileSelect = (slotType: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Images only', description: 'Please upload a JPEG or PNG photo.', variant: 'destructive' });
      return;
    }
    setUploadingSlot(slotType);
    uploadMutation.mutate({ slotType, file });
    e.target.value = ''; // Reset input for re-upload
  };

  const slots: Slot[] = (slotsData?.slots ?? []).map((s) => ({
    type:  s.type,
    label: s.label,
    icon:  SLOT_ICONS[s.type] ?? <Camera className="h-5 w-5" />,
    hint:  SLOT_HINTS[s.type] ?? '',
  }));

  const summary = summaryData?.summary;
  const artifacts: any[] = artifactsData?.artifacts ?? [];

  // Get the latest artifact for each slot type
  const latestByType: Record<string, any> = {};
  for (const a of artifacts) {
    if (!latestByType[a.artifact_type]) latestByType[a.artifact_type] = a;
  }

  const completedCount = summary?.completedSlots?.length ?? 0;
  const totalSlots = slots.length;
  const progressPct = totalSlots > 0 ? Math.round((completedCount / totalSlots) * 100) : 0;
  const allPassed = summary?.flagged === 0 && completedCount === totalSlots;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="p-3 bg-navy-900 rounded-xl bg-[#1a2744]">
            <Camera className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Visual Compliance Evidence</h1>
            <p className="text-slate-500 mt-1">Upload required photos for your regulatory audit. Trinity will analyze each submission in real-time.</p>
          </div>
        </div>

        {/* Progress */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">{completedCount} of {totalSlots} slots completed</span>
              <span className="text-sm font-bold text-[#1a2744]">{progressPct}%</span>
            </div>
            <Progress value={progressPct} className="h-3" />
            {summary && (
              <div className="flex gap-4 mt-3 text-xs text-slate-500">
                <span className="text-green-600 font-medium">✓ {summary.passed} passed</span>
                <span className="text-red-600 font-medium">⚠ {summary.flagged} flagged</span>
                <span className="text-yellow-600 font-medium">○ {summary.pending} pending</span>
              </div>
            )}
            {allPassed && (
              <Alert className="mt-4 border-green-200 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-700 font-medium">
                  All visual compliance checks passed. Your evidence package is complete.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Slots grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {slots.map((slot) => {
            const latest = latestByType[slot.type];
            const isUploading = uploadingSlot === slot.type;

            return (
              <Card key={slot.type} className={['border-2 transition-colors', latest?.status === 'passed'  ? 'border-green-200 bg-green-50/50' :
                latest?.status === 'flagged' ? 'border-red-200 bg-red-50/50' :
                'border-slate-200'].join(' ')}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`p-1.5 rounded-lg ${
                        latest?.status === 'passed'  ? 'bg-green-100 text-green-700' :
                        latest?.status === 'flagged' ? 'bg-red-100 text-red-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {slot.icon}
                      </span>
                      <CardTitle className="text-sm font-semibold text-slate-800">{slot.label}</CardTitle>
                    </div>
                    {latest && <StatusBadgeInline status={latest.status} />}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!latest && (
                    <p className="text-xs text-slate-500">{slot.hint}</p>
                  )}

                  {latest?.status === 'flagged' && (
                    <Alert className="border-red-200 bg-red-50 py-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                      <AlertDescription className="text-xs text-red-700 mt-0.5">
                        {latest.reasoning_text}
                      </AlertDescription>
                    </Alert>
                  )}

                  {latest?.status === 'passed' && (
                    <p className="text-xs text-green-700">{latest.reasoning_text}</p>
                  )}

                  {latest?.ocr_text && (
                    <div className="bg-slate-100 rounded p-2 text-xs font-mono text-slate-700">
                      OCR: {latest.ocr_text}
                    </div>
                  )}

                  <label className="block">
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      className="sr-only"
                      onChange={(e) => handleFileSelect(slot.type, e)}
                      disabled={isUploading}
                    />
                    <Button
                      variant={latest ? 'outline' : 'default'}
                      size="sm"
                      className={`w-full cursor-pointer ${latest ? '' : 'bg-[#1a2744] hover:bg-[#243260] text-white'}`}
                      disabled={isUploading}
                      asChild
                    >
                      <span>
                        {isUploading ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analyzing…</>
                        ) : latest ? (
                          <><RefreshCw className="h-4 w-4 mr-2" />Re-upload</>
                        ) : (
                          <><Upload className="h-4 w-4 mr-2" />Upload Photo</>
                        )}
                      </span>
                    </Button>
                  </label>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="text-xs text-slate-400 text-center">
          Photo metadata (GPS location and timestamp) is automatically extracted for verification purposes.
          All uploads are stored securely in your workspace Document Safe.
        </p>
      </div>
    </div>
  );
}
