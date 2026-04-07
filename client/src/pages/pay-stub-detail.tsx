import { useQuery } from "@tanstack/react-query";
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';
import { useParams } from "wouter";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Printer, Building2, User, ChevronLeft } from "lucide-react";
import { Separator } from "@/components/ui/separator";

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

function formatMoney(val: string | number | undefined): string {
  if (val === undefined || val === null) return "$0.00";
  const num = parseFloat(String(val));
  return isNaN(num) ? "$0.00" : `$${num.toFixed(2)}`;
}

function LineRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between py-1.5 text-sm ${bold ? "font-semibold" : ""}`}>
      <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export default function PayStubDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: stub, isLoading, isError } = useQuery<PayStub>({
    queryKey: ["/api/pay-stubs", id],
    queryFn: () => fetch(`/api/pay-stubs/${id}`).then(r => {
      if (!r.ok) throw new Error("Not found");
      return r.json();
    }),
    enabled: !!id,
  });

  const handlePrint = () => window.print();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !stub) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3">
        <p className="text-muted-foreground">Pay stub not found or access denied.</p>
        <Button variant="outline" onClick={() => window.history.back()} data-testid="button-back">
          Go Back
        </Button>
      </div>
    );
  }

  const eb = stub.earningsBreakdown || {};
  const db2 = stub.deductionsBreakdown || {};
  const gross = parseFloat(stub.grossPay || "0");
  const net = parseFloat(stub.netPay || "0");
  const totalDed = parseFloat(stub.totalDeductions || "0");

  const regularPay = parseFloat(eb.regular_pay || "0");
  const overtimePay = parseFloat(eb.overtime_pay || "0");
  const holidayPay = parseFloat(eb.holiday_pay || "0");
  const bonuses = parseFloat(eb.bonuses || "0");

  const federalTax = parseFloat(db2.federal_tax || "0");
  const stateTax = parseFloat(db2.state_tax || "0");
  const socialSecurity = parseFloat(db2.social_security || "0");
  const medicare = parseFloat(db2.medicare || "0");
  const health = parseFloat(db2.health_insurance || "0");
  const dental = parseFloat(db2.dental || "0");
  const vision = parseFloat(db2.vision || "0");
  const retirement = parseFloat(db2.retirement_401k || "0");

  const pageConfig: CanvasPageConfig = {
    id: 'pay-stub-detail',
    title: 'Pay Stub',
    category: 'operations',
    showHeader: false,
    maxWidth: '4xl',
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => window.history.back()}
        data-testid="button-back-paystub"
        className="mb-4 gap-1"
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </Button>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-paystub-title">Pay Stub</h1>
          <p className="text-sm text-muted-foreground">
            Pay Period: {format(new Date(stub.payPeriodStart), "MMM d")} &ndash; {format(new Date(stub.payPeriodEnd), "MMM d, yyyy")}
          </p>
        </div>
        <Button variant="outline" onClick={handlePrint} data-testid="button-print">
          <Printer className="h-4 w-4 mr-2" />
          Print
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Employer
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground" data-testid="text-employer-info">
            CoAIleague Platform
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="h-4 w-4" />
              Pay Date
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm" data-testid="text-pay-date">
            {format(new Date(stub.payDate), "MMMM d, yyyy")}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Earnings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {regularPay > 0 && (
            <LineRow
              label={`Regular (${eb.regular_hours || "0"} hrs @ ${formatMoney(eb.regular_rate)}/hr)`}
              value={formatMoney(eb.regular_pay)}
            />
          )}
          {overtimePay > 0 && (
            <LineRow
              label={`Overtime (${eb.overtime_hours || "0"} hrs @ ${formatMoney(eb.overtime_rate)}/hr)`}
              value={formatMoney(eb.overtime_pay)}
            />
          )}
          {holidayPay > 0 && (
            <LineRow
              label={`Holiday (${eb.holiday_hours || "0"} hrs)`}
              value={formatMoney(eb.holiday_pay)}
            />
          )}
          {bonuses > 0 && <LineRow label="Bonus" value={formatMoney(eb.bonuses)} />}
          {regularPay === 0 && overtimePay === 0 && holidayPay === 0 && bonuses === 0 && (
            <LineRow label="Gross Pay" value={formatMoney(stub.grossPay)} />
          )}
          <Separator className="my-2" />
          <LineRow label="Gross Pay" value={formatMoney(stub.grossPay)} bold />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Deductions &amp; Taxes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {federalTax > 0 && <LineRow label="Federal Income Tax" value={`-${formatMoney(db2.federal_tax)}`} />}
          {stateTax > 0 && <LineRow label="State Income Tax" value={`-${formatMoney(db2.state_tax)}`} />}
          {socialSecurity > 0 && <LineRow label="Social Security (6.2%)" value={`-${formatMoney(db2.social_security)}`} />}
          {medicare > 0 && <LineRow label="Medicare (1.45%)" value={`-${formatMoney(db2.medicare)}`} />}
          {health > 0 && <LineRow label="Health Insurance" value={`-${formatMoney(db2.health_insurance)}`} />}
          {dental > 0 && <LineRow label="Dental" value={`-${formatMoney(db2.dental)}`} />}
          {vision > 0 && <LineRow label="Vision" value={`-${formatMoney(db2.vision)}`} />}
          {retirement > 0 && <LineRow label="401(k) Contribution" value={`-${formatMoney(db2.retirement_401k)}`} />}
          {Object.entries(db2.other || {}).map(([key, val]) => (
            <LineRow key={key} label={key} value={`-${formatMoney(val)}`} />
          ))}
          {totalDed === 0 && federalTax === 0 && socialSecurity === 0 && (
            <LineRow label="Total Deductions" value={`-${formatMoney(stub.totalDeductions)}`} />
          )}
          <Separator className="my-2" />
          <LineRow
            label="Total Deductions"
            value={`-${formatMoney(stub.totalDeductions)}`}
            bold
          />
        </CardContent>
      </Card>

      <Card className="border-2">
        <CardContent className="pt-4">
          <div className="flex justify-between items-center">
            <span className="text-lg font-bold">Net Pay</span>
            <span className="text-2xl font-bold" data-testid="text-net-pay">
              {formatMoney(stub.netPay)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {format(new Date(stub.payDate), "MMMM d, yyyy")} &bull; Status: {stub.status}
          </p>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        AI-generated by CoAIleague middleware. Verify all figures with your employer. Not a CPA or financial institution.
      </p>
    </CanvasHubPage>
  );
}
