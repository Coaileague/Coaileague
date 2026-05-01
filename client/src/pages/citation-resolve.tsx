/**
 * Citation Resolution Page — AI Regulatory Audit Suite Phase 5
 * ============================================================
 * Tenant owner resolves a FAIL citation by:
 *   1. Reviewing the fine amount and state violation PDF.
 *   2. Mailing payment to Texas DPS via certified mail + money order.
 *   3. Uploading (a) photo of money order and (b) certified mail tracking #.
 *   4. Trinity verifies the amount matches the fine → status → Pending State Clearance.
 *
 * A disabled "Pay Instantly via CoAIleague (Coming Soon)" button is rendered
 * mapped to a commented-out Stripe intent function.
 *
 * TRINITY.md §H — mobile-first. TRINITY.md §S — Trinity is one brain.
 */

import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle, Upload, CheckCircle2, Clock, FileText, CreditCard,
  Loader2, Mail, DollarSign, Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function CitationStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    issued:                { label: 'Citation Issued',       cls: 'bg-red-100 text-red-800 border-red-200' },
    pending_state_clearance: { label: 'Pending State Clearance', cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    resolved:              { label: 'Resolved',              cls: 'bg-green-100 text-green-800 border-green-200' },
  };
  const cfg = map[status] ?? { label: status, cls: 'bg-slate-100 text-slate-800 border-slate-200' };
  return <Badge className={cfg.cls}>{cfg.label}</Badge>;
}

export default function CitationResolve() {
  const { citationId } = useParams<{ citationId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const workspaceId = (user as any)?.workspaceId;

  const [moneyOrderFile, setMoneyOrderFile]   = useState<File | null>(null);
  const [trackingNumber, setTrackingNumber]   = useState('');

  // We need the auditId to fetch the citation; accept it from query params or derive it
  const { data: citationData, isLoading } = useQuery({
    queryKey: ['/api/audit-suite/citations', citationId],
    queryFn: async () => {
      // The citation route is /audits/:auditId/citation — fetch via workspace ledger
      const r = await apiRequest('GET', `/${workspaceId}/ledger`);
      const data = await r.json();
      const entry = (data.ledger ?? []).find((l) => l.citation_id === citationId);
      return entry;
    },
    enabled: !!citationId && !!workspaceId,
  });

  const paymentMutation = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      if (moneyOrderFile) form.append('moneyOrder', moneyOrderFile);
      if (trackingNumber) form.append('certifiedMailTracking', trackingNumber);
      const r = await apiRequest('POST', `/api/audit-suite/citations/${citationId}/payment-proof`, form);
      return r.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/audit-suite/citations', citationId] });
      if (data.success) {
        toast({
          title: data.amountVerified ? 'Payment verified by Trinity' : 'Proof uploaded',
          description: data.message,
          duration: 8000,
        });
      } else {
        toast({ title: 'Verification needed', description: data.message, variant: 'destructive', duration: 8000 });
      }
    },
    onError: (err) => toast({ title: 'Upload failed', description: err?.message, variant: 'destructive' }),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const citation = citationData;
  const fineAmount = citation?.fine_amount ? parseFloat(citation.fine_amount) : 0;
  const isPendingClearance = citation?.citation_status === 'pending_state_clearance';
  const isResolved = citation?.citation_status === 'resolved';

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="p-3 bg-red-600 rounded-xl">
            <AlertTriangle className="h-7 w-7 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-slate-900">Resolve Compliance Citation</h1>
            <p className="text-slate-500 text-sm mt-1">Citation ID: {citationId}</p>
          </div>
          {citation && <CitationStatusBadge status={citation.citation_status ?? 'issued'} />}
        </div>

        {/* Citation summary */}
        {citation && (
          <Card className="border-red-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-red-800">
                <FileText className="h-4 w-4" /> Citation Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-slate-500">Fine Amount</span>
                  <p className="font-bold text-xl text-red-700">${fineAmount.toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-slate-500">Issued By</span>
                  <p className="font-medium text-slate-800">{citation.auditor_name ?? 'State Auditor'}</p>
                  <p className="text-xs text-slate-500">{citation.agency_name}</p>
                </div>
              </div>
              {citation.conditions_text && (
                <div>
                  <span className="text-slate-500">Violations cited:</span>
                  <p className="text-slate-700 mt-1">{citation.conditions_text}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {isPendingClearance && (
          <Alert className="border-yellow-200 bg-yellow-50">
            <Clock className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-700">
              Your payment proof has been submitted and is pending confirmation from Texas DPS. No further action is required at this time.
            </AlertDescription>
          </Alert>
        )}

        {isResolved && (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-700 font-medium">
              This citation has been fully resolved. Your compliance record has been updated.
            </AlertDescription>
          </Alert>
        )}

        {!isPendingClearance && !isResolved && (
          <>
            {/* Instructions */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Mail className="h-4 w-4 text-[#1a2744]" /> How to Resolve This Citation
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-3 text-slate-700">
                <ol className="list-decimal list-inside space-y-2">
                  <li>Purchase a <strong>Money Order</strong> for exactly <strong>${fineAmount.toFixed(2)}</strong></li>
                  <li>Mail the money order to <strong>Texas Department of Public Safety, Private Security Bureau</strong> via <strong>USPS Certified Mail</strong></li>
                  <li>Keep the certified mail receipt with the tracking number</li>
                  <li>Upload proof below: a photo of the money order AND your tracking number</li>
                </ol>
                <Alert className="border-blue-200 bg-blue-50">
                  <Info className="h-3.5 w-3.5 text-blue-600" />
                  <AlertDescription className="text-blue-700 text-xs">
                    Trinity will verify that the money order amount matches the fine before updating your status.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>

            {/* Upload form */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Upload className="h-4 w-4 text-[#1a2744]" /> Upload Proof of Payment
                </CardTitle>
                <CardDescription>Both fields strengthen your record. Trinity verifies the money order amount.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="moneyOrder">Money Order Photo (JPEG or PNG)</Label>
                  <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center cursor-pointer hover:border-[#1a2744]/40 transition-colors">
                    <label htmlFor="moneyOrder" className="cursor-pointer">
                      <input
                        id="moneyOrder"
                        type="file"
                        accept="image/jpeg,image/png"
                        className="sr-only"
                        onChange={e => setMoneyOrderFile(e.target.files?.[0] ?? null)}
                      />
                      {moneyOrderFile ? (
                        <p className="text-sm text-green-700 font-medium flex items-center justify-center gap-2">
                          <CheckCircle2 className="h-4 w-4" />{moneyOrderFile.name}
                        </p>
                      ) : (
                        <>
                          <Upload className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                          <p className="text-sm text-slate-500">Click to upload money order photo</p>
                        </>
                      )}
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tracking">USPS Certified Mail Tracking Number</Label>
                  <Input
                    id="tracking"
                    placeholder="e.g. 9400 1000 0000 0000 0000 00"
                    value={trackingNumber}
                    onChange={e => setTrackingNumber(e.target.value)}
                  />
                </div>

                <Button
                  className="w-full bg-[#1a2744] hover:bg-[#243260] text-white"
                  onClick={() => paymentMutation.mutate()}
                  disabled={paymentMutation.isPending || (!moneyOrderFile && !trackingNumber.trim())}
                >
                  {paymentMutation.isPending
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Trinity is verifying…</>
                    : <><CheckCircle2 className="h-4 w-4 mr-2" />Submit Proof of Payment</>
                  }
                </Button>
              </CardContent>
            </Card>

            {/* Coming soon Stripe */}
            <div className="text-center">
              <Button disabled variant="outline" className="opacity-50 cursor-not-allowed w-full md:w-auto">
                <CreditCard className="h-4 w-4 mr-2" />
                Pay Instantly via CoAIleague (Coming Soon)
              </Button>
              {/* Stripe intent function placeholder:
                  async function handleStripePayment() {
                    // const intent = await createStripePaymentIntent({ citationId, amount: fineAmount, workspaceId });
                    // await stripe.confirmPayment({ elements, confirmParams: { return_url: window.location.href } });
                  }
              */}
              <p className="text-xs text-slate-400 mt-2">Direct electronic payment to state agencies — coming in a future release.</p>
            </div>
          </>
        )}

        <Separator />
        <p className="text-xs text-slate-400 text-center">
          All payment records are stored in your CoAIleague Document Safe.
          Trinity verifies submitted amounts but does not contact Texas DPS directly — you must mail payment independently.
        </p>
      </div>
    </div>
  );
}
