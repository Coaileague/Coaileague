import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Receipt, DollarSign, TrendingUp, FileText, Download, Landmark, CheckCircle2, ExternalLink } from "lucide-react";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { useIsMobile } from "@/hooks/use-mobile";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface Paycheck {
  id: string;
  payrollRunId: string;
  employeeId: string;
  employeeName: string;
  periodStart: string;
  periodEnd: string;
  regularHours: string;
  overtimeHours: string;
  hourlyRate: string;
  grossPay: string;
  federalTax: string;
  stateTax: string;
  socialSecurity: string;
  medicare: string;
  netPay: string;
  createdAt: string;
}

interface TaxForm {
  id: string;
  formType: string;
  taxYear: number;
  wages: string;
  federalTaxWithheld: string;
  generatedAt: string;
  isActive: boolean;
}

interface PayrollInfo {
  directDepositEnabled: boolean;
  bankAccountType?: string;
  preferredPayoutMethod?: string;
  hasRoutingNumber: boolean;
  hasAccountNumber: boolean;
}

export default function MyPaychecks() {
  const isMobile = useIsMobile();
  const { toast } = useToast();

  const [routingNumber, setRoutingNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountType, setAccountType] = useState("checking");
  const [payoutMethod, setPayoutMethod] = useState("direct_deposit");

  const { data: paychecks = [], isLoading, refetch } = useQuery<Paycheck[]>({
    queryKey: ['/api/payroll/my-paychecks'],
  });

  const { data: taxFormsData, isLoading: taxFormsLoading } = useQuery<{ forms: TaxForm[]; employeeId?: string; employeeName?: string }>({
    queryKey: ['/api/payroll/my-tax-forms'],
  });
  const taxForms = taxFormsData?.forms ?? [];

  const { data: payrollInfo, isLoading: payrollInfoLoading } = useQuery<PayrollInfo>({
    queryKey: ['/api/payroll/my-payroll-info'],
  });

  const totalEarnings = paychecks.reduce((sum, p) => sum + parseFloat(p.netPay || '0'), 0);
  const totalHours = paychecks.reduce((sum, p) => {
    return sum + parseFloat(p.regularHours || '0') + parseFloat(p.overtimeHours || '0');
  }, 0);

  const updateDirectDepositMutation = useMutation({
    mutationFn: async (data: { bankRoutingNumber?: string; bankAccountNumber?: string; bankAccountType?: string; directDepositEnabled?: boolean; preferredPayoutMethod?: string }) =>
      apiRequest("PATCH", "/api/payroll/my-payroll-info", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/my-payroll-info'] });
      toast({ title: "Direct deposit settings saved" });
      setRoutingNumber("");
      setAccountNumber("");
    },
    onError: () => {
      toast({ title: "Failed to save settings", variant: "destructive" });
    },
  });

  const handleDirectDepositSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: Record<string, any> = {
      bankAccountType: accountType,
      preferredPayoutMethod: payoutMethod,
      directDepositEnabled: payoutMethod === "direct_deposit",
    };
    if (routingNumber) data.bankRoutingNumber = routingNumber;
    if (accountNumber) data.bankAccountNumber = accountNumber;
    updateDirectDepositMutation.mutate(data);
  };

  const handleRefresh = async () => { await refetch(); };

  const pageConfig: CanvasPageConfig = {
    id: 'my-paychecks',
    title: 'My Paychecks',
    subtitle: 'View your payment history, tax documents, and direct deposit settings',
    category: 'operations',
    onRefresh: handleRefresh,
    enablePullToRefresh: true,
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6">
        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Earned</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-earned">
                ${totalEarnings.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">From {paychecks.length} paychecks</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-hours">
                {totalHours.toFixed(1)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Across all pay periods</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Latest Pay Rate</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-hourly-rate">
                ${paychecks[0]?.hourlyRate || '0.00'}/hr
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="history">
          <TabsList data-testid="tabs-paychecks">
            <TabsTrigger value="history" data-testid="tab-pay-history">
              <Receipt className="h-4 w-4 mr-2" />
              Pay History
            </TabsTrigger>
            <TabsTrigger value="tax-docs" data-testid="tab-tax-docs">
              <FileText className="h-4 w-4 mr-2" />
              Tax Documents
            </TabsTrigger>
            <TabsTrigger value="direct-deposit" data-testid="tab-direct-deposit">
              <Landmark className="h-4 w-4 mr-2" />
              Direct Deposit
            </TabsTrigger>
          </TabsList>

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>Pay History</CardTitle>
                <CardDescription>Your detailed payment records and tax withholdings</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : paychecks.length === 0 ? (
                  <div className="text-center p-8 text-muted-foreground">
                    No paychecks yet. Your payment history will appear here.
                  </div>
                ) : isMobile ? (
                  <div className="space-y-4">
                    {paychecks.map((paycheck) => {
                      const totalDeductions =
                        parseFloat(paycheck.federalTax) +
                        parseFloat(paycheck.stateTax) +
                        parseFloat(paycheck.socialSecurity) +
                        parseFloat(paycheck.medicare);
                      return (
                        <Card key={paycheck.id} className="border" data-testid={`card-paycheck-${paycheck.id}`}>
                          <CardContent className="p-4 space-y-3">
                            <div className="flex justify-between gap-2 items-start">
                              <div>
                                <div className="font-medium text-sm">
                                  {format(new Date(paycheck.periodStart), 'MMM d')} – {format(new Date(paycheck.periodEnd), 'MMM d, yyyy')}
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  {paycheck.regularHours} reg hrs
                                  {parseFloat(paycheck.overtimeHours || '0') > 0 && ` + ${paycheck.overtimeHours} OT`}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-bold text-lg" data-testid={`text-net-${paycheck.id}`}>
                                  ${paycheck.netPay}
                                </div>
                                <div className="text-xs text-muted-foreground">Net Pay</div>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t">
                              <div><span className="text-muted-foreground">Gross:</span> ${paycheck.grossPay}</div>
                              <div><span className="text-muted-foreground">Deductions:</span> -${totalDeductions.toFixed(2)}</div>
                            </div>
                            <div className="flex justify-between items-center">
                              <div className="text-xs text-muted-foreground">
                                Paid: {format(new Date(paycheck.createdAt), 'MMM d, yyyy')}
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                asChild
                                data-testid={`button-view-stub-${paycheck.id}`}
                              >
                                <a href={`/payroll/pay-stubs/${paycheck.id}`}>
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  View Stub
                                </a>
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Pay Period</TableHead>
                          <TableHead>Hours</TableHead>
                          <TableHead>Gross Pay</TableHead>
                          <TableHead>Deductions</TableHead>
                          <TableHead>Net Pay</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paychecks.map((paycheck) => {
                          const totalDeductions =
                            parseFloat(paycheck.federalTax) +
                            parseFloat(paycheck.stateTax) +
                            parseFloat(paycheck.socialSecurity) +
                            parseFloat(paycheck.medicare);
                          return (
                            <TableRow key={paycheck.id} data-testid={`row-paycheck-${paycheck.id}`}>
                              <TableCell>
                                {format(new Date(paycheck.periodStart), 'MMM d')} – {format(new Date(paycheck.periodEnd), 'MMM d, yyyy')}
                              </TableCell>
                              <TableCell>
                                {paycheck.regularHours} reg
                                {parseFloat(paycheck.overtimeHours || '0') > 0 && (
                                  <div className="text-xs text-muted-foreground">+{paycheck.overtimeHours} OT</div>
                                )}
                              </TableCell>
                              <TableCell>${paycheck.grossPay}</TableCell>
                              <TableCell>
                                <div className="text-sm">
                                  <div className="font-medium">-${totalDeductions.toFixed(2)}</div>
                                  <div className="text-xs text-muted-foreground space-y-0.5">
                                    <div>Fed: ${paycheck.federalTax}</div>
                                    <div>State: ${paycheck.stateTax}</div>
                                    <div>SS: ${paycheck.socialSecurity}</div>
                                    <div>Med: ${paycheck.medicare}</div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="font-bold" data-testid={`text-net-${paycheck.id}`}>
                                  ${paycheck.netPay}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {format(new Date(paycheck.createdAt), 'MMM d, yyyy')}
                              </TableCell>
                              <TableCell>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  asChild
                                  data-testid={`button-view-stub-${paycheck.id}`}
                                >
                                  <a href={`/payroll/pay-stubs/${paycheck.id}`}>
                                    <ExternalLink className="h-3 w-3 mr-1" />
                                    Stub
                                  </a>
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tax-docs">
            <Card>
              <CardHeader>
                <CardTitle>Tax Documents</CardTitle>
                <CardDescription>Download your W-2s, 1099s, and other annual tax forms</CardDescription>
              </CardHeader>
              <CardContent>
                {taxFormsLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : taxForms.length === 0 ? (
                  <div className="text-center p-8 text-muted-foreground">
                    <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">No tax documents yet</p>
                    <p className="text-sm mt-1">
                      W-2 and 1099 forms are generated at year-end. Check back after December 31.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {taxForms.map((form) => (
                      <div
                        key={form.id}
                        className="flex items-center justify-between p-3 border rounded-md"
                        data-testid={`card-tax-form-${form.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <div className="font-medium text-sm">
                              {form.formType === 'w2' ? 'Form W-2' : form.formType === '1099' ? 'Form 1099-NEC' : form.formType.toUpperCase()} &mdash; Tax Year {form.taxYear}
                            </div>
                            {form.wages && (
                              <div className="text-xs text-muted-foreground">
                                Wages: ${parseFloat(form.wages).toFixed(2)}
                                {form.federalTaxWithheld && ` &bull; Federal withheld: $${parseFloat(form.federalTaxWithheld).toFixed(2)}`}
                              </div>
                            )}
                            <div className="text-xs text-muted-foreground">
                              Generated: {format(new Date(form.generatedAt), 'MMM d, yyyy')}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          data-testid={`button-download-form-${form.id}`}
                        >
                          <a href={`/api/payroll/my-tax-forms/${form.id}/download`} download>
                            <Download className="h-3 w-3 mr-1" />
                            Download PDF
                          </a>
                        </Button>
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground mt-4">
                      AI-generated tax documents. Review all figures with your tax professional before filing.
                      CoAIleague is middleware only and is not a CPA or tax preparer.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="direct-deposit">
            <Card>
              <CardHeader>
                <CardTitle>Direct Deposit Settings</CardTitle>
                <CardDescription>
                  Configure your bank account to receive payroll payments directly
                </CardDescription>
              </CardHeader>
              <CardContent>
                {payrollInfoLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-6">
                    {payrollInfo?.hasRoutingNumber && payrollInfo?.hasAccountNumber && (
                      <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <span className="text-sm">
                          Banking information on file.
                          {payrollInfo.directDepositEnabled ? " Direct deposit is enabled." : " Direct deposit is currently disabled."}
                        </span>
                      </div>
                    )}

                    <form onSubmit={handleDirectDepositSubmit} className="space-y-5" data-testid="form-direct-deposit">
                      <div className="space-y-2">
                        <Label htmlFor="payout-method">Payment Method</Label>
                        <Select
                          value={payoutMethod}
                          onValueChange={setPayoutMethod}
                          data-testid="select-payout-method"
                        >
                          <SelectTrigger id="payout-method" data-testid="trigger-payout-method">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="direct_deposit">Direct Deposit (ACH)</SelectItem>
                            <SelectItem value="manual_check">Manual Check</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {payoutMethod === "direct_deposit" && (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="account-type">Account Type</Label>
                            <Select value={accountType} onValueChange={setAccountType}>
                              <SelectTrigger id="account-type" data-testid="trigger-account-type">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="checking">Checking</SelectItem>
                                <SelectItem value="savings">Savings</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="routing-number">
                              Routing Number
                              {payrollInfo?.hasRoutingNumber && (
                                <span className="ml-2 text-xs text-muted-foreground">(on file — enter new to update)</span>
                              )}
                            </Label>
                            <Input
                              id="routing-number"
                              type="text"
                              inputMode="numeric"
                              maxLength={9}
                              placeholder="9-digit ABA routing number"
                              value={routingNumber}
                              onChange={e => setRoutingNumber(e.target.value.replace(/\D/g, ''))}
                              data-testid="input-routing-number"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="account-number">
                              Account Number
                              {payrollInfo?.hasAccountNumber && (
                                <span className="ml-2 text-xs text-muted-foreground">(on file — enter new to update)</span>
                              )}
                            </Label>
                            <Input
                              id="account-number"
                              type="password"
                              placeholder="Bank account number"
                              value={accountNumber}
                              onChange={e => setAccountNumber(e.target.value)}
                              data-testid="input-account-number"
                            />
                          </div>
                        </>
                      )}

                      <Button
                        type="submit"
                        disabled={updateDirectDepositMutation.isPending}
                        data-testid="button-save-direct-deposit"
                      >
                        {updateDirectDepositMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : null}
                        Save Settings
                      </Button>
                    </form>

                    <p className="text-xs text-muted-foreground">
                      Your banking information is encrypted and stored securely. It is only used for payroll disbursement.
                      Contact your manager if you have questions about your payment method.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </CanvasHubPage>
  );
}
