import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Link } from "wouter";
import {
  CheckCircle, XCircle, Clock, Calendar, Edit, Receipt,
  AlertTriangle, FileText, TrendingUp, Users, DollarSign
} from "lucide-react";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

function QueueLoadingState({ label }: { label: string }) {
  return (
    <div className="text-center py-8 text-muted-foreground space-y-2">
      <Clock className="h-8 w-8 mx-auto opacity-50 animate-pulse" />
      <p className="text-sm font-medium text-foreground">Loading {label}</p>
      <p className="text-xs text-muted-foreground">Pulling the latest manager approvals for this queue.</p>
    </div>
  );
}

export default function ManagerDashboard() {
  const { user } = useAuth();

  // Fetch all pending approvals
  const { data: pendingTimeOff, isLoading: loadingTimeOff } = useQuery<any[]>({
    queryKey: ['/api/time-off-requests/pending'],
  });

  const { data: pendingTimesheetEdits, isLoading: loadingTimesheetEdits } = useQuery<any[]>({
    queryKey: ['/api/timesheet-edit-requests/pending'],
  });

  const { data: pendingShifts, isLoading: loadingShifts } = useQuery<any[]>({
    queryKey: ['/api/shift-actions/pending'],
  });

  const { data: pendingExpenses, isLoading: loadingExpenses } = useQuery<any[]>({
    queryKey: ['/api/expenses/pending-approval'],
  });

  const { data: expiringI9, isLoading: loadingI9 } = useQuery<any[]>({
    queryKey: ['/api/i9-records/expiring'],
  });

  const totalPending = (
    (pendingTimeOff?.length || 0) +
    (pendingTimesheetEdits?.length || 0) +
    (pendingShifts?.length || 0) +
    (pendingExpenses?.length || 0) +
    (expiringI9?.length || 0)
  );

  const isLoading = loadingTimeOff || loadingTimesheetEdits || loadingShifts || loadingExpenses || loadingI9;

  const pageConfig: CanvasPageConfig = {
    id: 'manager-dashboard',
    title: 'Manager Approval Dashboard',
    subtitle: 'Review and approve pending requests from your team',
    category: 'operations',
  };

  return (
    <CanvasHubPage config={pageConfig}>
      {/* Summary Cards */}
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm text-muted-foreground">Time-Off</p>
                <p className="text-2xl font-bold">{pendingTimeOff?.length || 0}</p>
              </div>
              <Calendar className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm text-muted-foreground">Timesheet Edits</p>
                <p className="text-2xl font-bold">{pendingTimesheetEdits?.length || 0}</p>
              </div>
              <Edit className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm text-muted-foreground">Shift Actions</p>
                <p className="text-2xl font-bold">{pendingShifts?.length || 0}</p>
              </div>
              <Clock className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm text-muted-foreground">Expenses</p>
                <p className="text-2xl font-bold">{pendingExpenses?.length || 0}</p>
              </div>
              <DollarSign className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm text-muted-foreground">I-9 Alerts</p>
                <p className="text-2xl font-bold">{expiringI9?.length || 0}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Approval Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Time-Off Requests */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-500" />
              Time-Off Requests
              {pendingTimeOff && pendingTimeOff.length > 0 && (
                <Badge variant="default">{pendingTimeOff.length}</Badge>
              )}
            </CardTitle>
            <CardDescription>Pending vacation and sick leave requests</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              {isLoading ? (
                <QueueLoadingState label="time-off requests" />
              ) : pendingTimeOff && pendingTimeOff.length > 0 ? (
                <div className="space-y-2">
                  {pendingTimeOff.slice(0, 5).map((request: any) => (
                    <div key={request.id} className="p-3 border rounded-lg hover-elevate">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{request.employeeName || 'Employee'}</p>
                          <p className="text-xs text-muted-foreground">
                            {request.startDate} - {request.endDate} ({request.requestType})
                          </p>
                        </div>
                        <Badge variant="secondary" className="ml-2">{request.days}d</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No pending requests</p>
                </div>
              )}
            </ScrollArea>
            {pendingTimeOff && pendingTimeOff.length > 0 && (
              <Button asChild className="w-full mt-4" variant="outline">
                <Link href="/leaders-hub">View All Requests</Link>
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Timesheet Edit Requests */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5 text-blue-500" />
              Timesheet Edits
              {pendingTimesheetEdits && pendingTimesheetEdits.length > 0 && (
                <Badge variant="default">{pendingTimesheetEdits.length}</Badge>
              )}
            </CardTitle>
            <CardDescription>Employee timesheet correction requests</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              {isLoading ? (
                <QueueLoadingState label="timesheet edits" />
              ) : pendingTimesheetEdits && pendingTimesheetEdits.length > 0 ? (
                <div className="space-y-2">
                  {pendingTimesheetEdits.slice(0, 5).map((request: any) => (
                    <div key={request.id} className="p-3 border rounded-lg hover-elevate">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{request.employeeName || 'Employee'}</p>
                          <p className="text-xs text-muted-foreground">{request.editType || 'Time correction'}</p>
                        </div>
                        <Badge variant="secondary" className="ml-2">{request.date}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No pending edits</p>
                </div>
              )}
            </ScrollArea>
            {pendingTimesheetEdits && pendingTimesheetEdits.length > 0 && (
              <Button asChild className="w-full mt-4" variant="outline">
                <Link href="/leaders-hub">View All Edits</Link>
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Shift Action Requests */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-purple-500" />
              Shift Actions
              {pendingShifts && pendingShifts.length > 0 && (
                <Badge variant="default">{pendingShifts.length}</Badge>
              )}
            </CardTitle>
            <CardDescription>Shift accept/deny/switch requests</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              {isLoading ? (
                <QueueLoadingState label="shift actions" />
              ) : pendingShifts && pendingShifts.length > 0 ? (
                <div className="space-y-2">
                  {pendingShifts.slice(0, 5).map((request: any) => (
                    <div key={request.id} className="p-3 border rounded-lg hover-elevate">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{request.employeeName || 'Employee'}</p>
                          <p className="text-xs text-muted-foreground">{request.actionType || 'Shift action'}</p>
                        </div>
                        <Badge variant="secondary" className="ml-2">{request.date}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No pending shifts</p>
                </div>
              )}
            </ScrollArea>
            {pendingShifts && pendingShifts.length > 0 && (
              <Button asChild className="w-full mt-4" variant="outline">
                <Link href="/leaders-hub">View All Shifts</Link>
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Expense Approvals */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-orange-500" />
              Expense Approvals
              {pendingExpenses && pendingExpenses.length > 0 && (
                <Badge variant="default">{pendingExpenses.length}</Badge>
              )}
            </CardTitle>
            <CardDescription>Employee expense reimbursement requests</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              {isLoading ? (
                <QueueLoadingState label="expense approvals" />
              ) : pendingExpenses && pendingExpenses.length > 0 ? (
                <div className="space-y-2">
                  {pendingExpenses.slice(0, 5).map((expense: any) => (
                    <div key={expense.id} className="p-3 border rounded-lg hover-elevate">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{expense.employeeName || 'Employee'}</p>
                          <p className="text-xs text-muted-foreground">{expense.category}</p>
                        </div>
                        <Badge variant="secondary" className="ml-2">${expense.amount}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No pending expenses</p>
                </div>
              )}
            </ScrollArea>
            {pendingExpenses && pendingExpenses.length > 0 && (
              <Button asChild className="w-full mt-4" variant="outline">
                <Link href="/expense-approvals">Review Expenses</Link>
              </Button>
            )}
          </CardContent>
        </Card>

        {/* I-9 Compliance Alerts */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              I-9 Compliance Alerts
              {expiringI9 && expiringI9.length > 0 && (
                <Badge variant="destructive">{expiringI9.length}</Badge>
              )}
            </CardTitle>
            <CardDescription>Work authorization expiring soon - action required</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              {isLoading ? (
                <QueueLoadingState label="I-9 compliance alerts" />
              ) : expiringI9 && expiringI9.length > 0 ? (
                <div className="space-y-2">
                  {expiringI9.slice(0, 10).map((record: any) => (
                    <div key={record.id} className="p-3 border border-red-200 rounded-lg hover-elevate bg-red-50/50 dark:bg-red-950/20">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{record.employeeName || 'Employee'}</p>
                          <p className="text-xs text-muted-foreground">
                            Document Type: {record.documentType} · Expires: {record.expirationDate}
                          </p>
                        </div>
                        <Badge variant="destructive" className="ml-2">
                          {record.daysUntilExpiration}d
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No expiring authorizations</p>
                </div>
              )}
            </ScrollArea>
            {expiringI9 && expiringI9.length > 0 && (
              <Button asChild className="w-full mt-4" variant="outline">
                <Link href="/i9-compliance">Review I-9 Records</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
      </div>
    </CanvasHubPage>
  );
}
