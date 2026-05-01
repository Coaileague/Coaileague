/**
 * MobilePayStubSheet — mobile-first pay stub viewer.
 *
 * Replaces the desktop two-column Card layout on small screens with a
 * scrollable bottom sheet that shows:
 *   - Period header (pay period start–end + pay date)
 *   - Net pay hero number (huge, eye-friendly)
 *   - Earnings breakdown card
 *   - Deductions breakdown card
 *   - Employer-side costs card (collapsed by default)
 *   - View PDF + Download buttons backed by /api/pay-stubs/:id/pdf
 *
 * Honors iOS safe area + keyboard inset so action buttons are never
 * clipped under the home-indicator gesture bar.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Loader2, Eye, Download, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";

interface PayStub {
  id: string;
  workspaceId: string;
  payrollRunId: string;
  employeeId: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  payDate: string;
  grossPay: string;
  totalDeductions: string;
  netPay: string;
  status: string;
  deductionsBreakdown?: {
    federal_tax?: string;
    state_tax?: string;
    social_security?: string;
    medicare?: string;
    health_insurance?: string;
    dental?: string;
    vision?: string;
    retirement_401k?: string;
    other?: Record<string, string>;
  };
  earningsBreakdown?: {
    regular_hours?: string;
    regular_rate?: string;
    regular_pay?: string;
    overtime_hours?: string;
    overtime_rate?: string;
    overtime_pay?: string;
    holiday_hours?: string;
    holiday_pay?: string;
    bonuses?: string;
  };
  employerCosts?: {
    employer_fica?: string;
    employer_medicare?: string;
    employer_futa?: string;
    employer_suta?: string;
    workers_comp?: string;
    health_contribution?: string;
  };
}

interface MobilePayStubSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payStubId: string | null;
}

function money(v: string | number | undefined): string {
  if (v === undefined || v === null) return "$0.00";
  const n = parseFloat(String(v));
  return isNaN(n) ? "$0.00" : `$${n.toFixed(2)}`;
}

function Row({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between items-baseline py-1.5 text-sm">
      <span className={muted ? "text-muted-foreground" : "text-foreground"}>{label}</span>
      <span className={muted ? "text-foreground" : "font-semibold"}>{value}</span>
    </div>
  );
}

function CardBox({
  title,
  children,
  collapsible,
}: {
  title: string;
  children: React.ReactNode;
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(!collapsible);
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => collapsible && setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 text-left"
        style={{ minHeight: 44 }}
        data-testid={`mobile-paystub-section-${title.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        {collapsible && (open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
      </button>
      {open && <div className="px-3 py-2 divide-y divide-border/60">{children}</div>}
    </div>
  );
}

export function MobilePayStubSheet({ open, onOpenChange, payStubId }: MobilePayStubSheetProps) {
  const { data: stub, isLoading, isError } = useQuery<PayStub>({
    queryKey: ["/api/pay-stubs", payStubId],
    queryFn: () => fetch(`/api/pay-stubs/${payStubId}`).then((r) => {
      if (!r.ok) throw new Error("Not found");
      return r.json();
    }),
    enabled: !!open && !!payStubId,
  });

  const periodLabel = useMemo(() => {
    if (!stub) return "";
    const s = format(new Date(stub.payPeriodStart), "MMM d");
    const e = format(new Date(stub.payPeriodEnd), "MMM d, yyyy");
    return `${s} – ${e}`;
  }, [stub]);

  const openPdf = (mode: "preview" | "download") => {
    if (!stub) return;
    if (mode === "preview") {
      window.open(`/api/pay-stubs/${stub.id}/pdf?disposition=inline`, "_blank", "noopener,noreferrer");
    } else {
      const a = document.createElement("a");
      a.href = `/api/pay-stubs/${stub.id}/pdf`;
      a.rel = "noopener noreferrer";
      a.click();
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[100dvh] flex flex-col p-0 gap-0"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <SheetHeader className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3">
          <SheetTitle className="text-base">Pay Stub</SheetTitle>
          <p className="text-xs text-muted-foreground" data-testid="mobile-paystub-period">
            {periodLabel}
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground" data-testid="mobile-paystub-loading">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading pay stub…</span>
            </div>
          ) : isError || !stub ? (
            <div className="flex flex-col items-center justify-center py-16 text-destructive text-sm" data-testid="mobile-paystub-error">
              Pay stub not available
            </div>
          ) : (
            <>
              <div className="text-center py-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Net Pay</p>
                <p className="text-4xl font-bold tabular-nums" data-testid="mobile-paystub-net">
                  {money(stub.netPay)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Pay date: {format(new Date(stub.payDate), "MMM d, yyyy")}
                </p>
              </div>

              <CardBox title="Earnings">
                <Row label="Regular hours" value={stub.earningsBreakdown?.regular_hours ?? "0"} muted />
                <Row label="Regular pay" value={money(stub.earningsBreakdown?.regular_pay)} />
                {stub.earningsBreakdown?.overtime_hours && parseFloat(stub.earningsBreakdown.overtime_hours) > 0 && (
                  <>
                    <Row label="Overtime hours" value={stub.earningsBreakdown.overtime_hours} muted />
                    <Row label="Overtime pay" value={money(stub.earningsBreakdown.overtime_pay)} />
                  </>
                )}
                {stub.earningsBreakdown?.holiday_pay && parseFloat(stub.earningsBreakdown.holiday_pay) > 0 && (
                  <Row label="Holiday pay" value={money(stub.earningsBreakdown.holiday_pay)} />
                )}
                {stub.earningsBreakdown?.bonuses && parseFloat(stub.earningsBreakdown.bonuses) > 0 && (
                  <Row label="Bonuses" value={money(stub.earningsBreakdown.bonuses)} />
                )}
                <Row label="Gross pay" value={money(stub.grossPay)} />
              </CardBox>

              <CardBox title="Deductions">
                {stub.deductionsBreakdown?.federal_tax && (
                  <Row label="Federal tax" value={money(stub.deductionsBreakdown.federal_tax)} />
                )}
                {stub.deductionsBreakdown?.state_tax && (
                  <Row label="State tax" value={money(stub.deductionsBreakdown.state_tax)} />
                )}
                {stub.deductionsBreakdown?.social_security && (
                  <Row label="Social Security" value={money(stub.deductionsBreakdown.social_security)} />
                )}
                {stub.deductionsBreakdown?.medicare && (
                  <Row label="Medicare" value={money(stub.deductionsBreakdown.medicare)} />
                )}
                {stub.deductionsBreakdown?.health_insurance && parseFloat(stub.deductionsBreakdown.health_insurance) > 0 && (
                  <Row label="Health insurance" value={money(stub.deductionsBreakdown.health_insurance)} />
                )}
                {stub.deductionsBreakdown?.retirement_401k && parseFloat(stub.deductionsBreakdown.retirement_401k) > 0 && (
                  <Row label="401(k)" value={money(stub.deductionsBreakdown.retirement_401k)} />
                )}
                <Row label="Total deductions" value={money(stub.totalDeductions)} />
              </CardBox>

              {stub.employerCosts && (
                <CardBox title="Employer Contributions" collapsible>
                  {stub.employerCosts.employer_fica && (
                    <Row label="Employer FICA" value={money(stub.employerCosts.employer_fica)} />
                  )}
                  {stub.employerCosts.employer_medicare && (
                    <Row label="Employer Medicare" value={money(stub.employerCosts.employer_medicare)} />
                  )}
                  {stub.employerCosts.employer_futa && (
                    <Row label="FUTA" value={money(stub.employerCosts.employer_futa)} />
                  )}
                  {stub.employerCosts.employer_suta && (
                    <Row label="SUTA" value={money(stub.employerCosts.employer_suta)} />
                  )}
                  {stub.employerCosts.workers_comp && (
                    <Row label="Workers' comp" value={money(stub.employerCosts.workers_comp)} />
                  )}
                </CardBox>
              )}
            </>
          )}
        </div>

        {stub && (
          <div
            className="border-t border-border bg-background px-4 py-3 grid grid-cols-2 gap-2"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
          >
            <Button
              type="button"
              variant="default"
              onClick={() => openPdf("preview")}
              data-testid="mobile-paystub-action-view"
            >
              <Eye className="w-4 h-4 mr-2" />
              View PDF
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => openPdf("download")}
              data-testid="mobile-paystub-action-download"
            >
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
