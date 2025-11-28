import { useQuery } from "@tanstack/react-query";
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
import { Loader2, Receipt, DollarSign, TrendingUp } from "lucide-react";
import { CoAIleagueLogo } from "@/components/coailleague-logo";

interface Paycheck {
  id: string;
  payrollRunId: string;
  employeeId: string;
  employeeName: string;
  periodStart: string;
  periodEnd: string;
  regularHours: string; // Database returns as decimal/string
  overtimeHours: string; // Database returns as decimal/string
  hourlyRate: string;
  grossPay: string;
  federalTax: string;
  stateTax: string;
  socialSecurity: string;
  medicare: string;
  netPay: string;
  createdAt: string;
}

export default function MyPaychecks() {
  const { data: paychecks = [], isLoading } = useQuery<Paycheck[]>({
    queryKey: ['/api/payroll/my-paychecks'],
  });

  const totalEarnings = paychecks.reduce((sum, p) => sum + parseFloat(p.netPay || '0'), 0);
  const totalHours = paychecks.reduce((sum, p) => {
    const regular = parseFloat(p.regularHours || '0');
    const overtime = parseFloat(p.overtimeHours || '0');
    return sum + regular + overtime;
  }, 0);

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="text-center space-y-4 mb-8 p-6 border-b">
        <CoAIleagueLogo 
          width={200} 
          height={50} 
          showTagline={true}
          showWordmark={true}
        />
      </div>

      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Receipt className="h-8 w-8" />
          My Paychecks
        </h1>
        <p className="text-muted-foreground mt-1">
          View your payment history and pay stubs
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Earned</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-earned">
              ${totalEarnings.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              From {paychecks.length} paychecks
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-hours">
              {totalHours.toFixed(1)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Across all pay periods
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
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

      <Card>
        <CardHeader>
          <CardTitle>Pay History</CardTitle>
          <CardDescription>
            Your detailed payment records and tax withholdings
          </CardDescription>
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
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pay Period</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Gross Pay</TableHead>
                  <TableHead>Deductions</TableHead>
                  <TableHead>Net Pay</TableHead>
                  <TableHead>Date</TableHead>
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
                        <div>
                          {format(new Date(paycheck.periodStart), 'MMM d')} - {format(new Date(paycheck.periodEnd), 'MMM d, yyyy')}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          {paycheck.regularHours} reg
                          {parseFloat(paycheck.overtimeHours || '0') > 0 && (
                            <div className="text-xs text-muted-foreground">
                              +{paycheck.overtimeHours} OT
                            </div>
                          )}
                        </div>
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
                        <div className="font-bold text-blue-600 dark:text-blue-400" data-testid={`text-net-${paycheck.id}`}>
                          ${paycheck.netPay}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(paycheck.createdAt), 'MMM d, yyyy')}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
