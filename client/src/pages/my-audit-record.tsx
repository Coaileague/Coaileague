/**
 * AUTOSCHEDULER AUDIT TRACKER™ - Employee Audit Record View
 * 
 * READ-ONLY view of employee's complete work history for labor law compliance:
 * - Time entries and shifts worked
 * - Performance reviews and ratings
 * - Write-ups and disciplinary actions (from ReportOS™)
 * - Manager notes and feedback
 * - Locked compliance records (7-year retention)
 * 
 * Employees can VIEW but never DELETE these records.
 * This protects both employees and employers in labor law disputes.
 */

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, Calendar, Clock, FileText, Lock, Shield, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

interface AuditData {
  shifts?: any[];
  reviews?: any[];
  writeups?: any[];
  lockedRecords?: any[];
  compliance?: {
    totalHours?: number;
    overtimeHours?: number;
    missedBreaks?: number;
    violations?: number;
  };
}

export default function MyAuditRecord() {
  // Fetch employee's audit data
  const { data: auditData, isLoading } = useQuery<AuditData>({
    queryKey: ['/api/employee/audit-record'],
  });

  const pageConfig: CanvasPageConfig = {
    id: 'my-audit-record',
    title: 'My Audit Record',
    subtitle: 'Complete work history and compliance records (protected for 7 years)',
    category: 'operations',
    headerActions: (
      <Badge variant="outline" className="gap-1">
        <Lock className="w-3 h-3" />
        Read-Only
      </Badge>
    ),
  };

  if (isLoading) {
    return (
      <CanvasHubPage config={pageConfig}>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </CanvasHubPage>
    );
  }

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6">
      <Alert>
        <Shield className="w-4 h-4" />
        <AlertTitle>Your Rights Are Protected</AlertTitle>
        <AlertDescription>
          This audit record is maintained for your protection in labor law compliance, unemployment claims, and wage disputes.
          You can view these records but cannot delete them. If you believe any information is incorrect, you can file a grievance.
        </AlertDescription>
      </Alert>

      {/* Tabs for different record types */}
      <Tabs defaultValue="shifts" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1">
          <TabsTrigger value="shifts" data-testid="tab-shifts">
            <Clock className="w-4 h-4 mr-1" />
            Work History
          </TabsTrigger>
          <TabsTrigger value="reviews" data-testid="tab-reviews">
            <FileText className="w-4 h-4 mr-1" />
            Reviews
          </TabsTrigger>
          <TabsTrigger value="writeups" data-testid="tab-writeups">
            <AlertTriangle className="w-4 h-4 mr-1" />
            Write-Ups
          </TabsTrigger>
          <TabsTrigger value="locked" data-testid="tab-locked">
            <Lock className="w-4 h-4 mr-1" />
            Locked Records
          </TabsTrigger>
          <TabsTrigger value="compliance" data-testid="tab-compliance">
            <Shield className="w-4 h-4 mr-1" />
            Compliance
          </TabsTrigger>
        </TabsList>

        {/* Work History Tab */}
        <TabsContent value="shifts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Shift History</CardTitle>
              <CardDescription>
                All shifts you've worked (tracked for overtime, payday law, and unemployment compliance)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {auditData?.shifts && auditData.shifts.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Start Time</TableHead>
                      <TableHead>End Time</TableHead>
                      <TableHead>Hours</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditData.shifts.map((shift) => (
                      <TableRow key={shift.id} data-testid={`row-shift-${shift.id}`}>
                        <TableCell>{format(new Date(shift.startTime), 'MMM dd, yyyy')}</TableCell>
                        <TableCell>{format(new Date(shift.startTime), 'h:mm a')}</TableCell>
                        <TableCell>{format(new Date(shift.endTime), 'h:mm a')}</TableCell>
                        <TableCell>{shift.hoursWorked || 'N/A'}</TableCell>
                        <TableCell>{shift.clientName || 'N/A'}</TableCell>
                        <TableCell>
                          <Badge variant={shift.status === 'completed' ? 'default' : 'secondary'}>
                            {shift.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  No shift history found
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Reviews Tab */}
        <TabsContent value="reviews" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Performance Reviews</CardTitle>
              <CardDescription>
                All performance evaluations and manager feedback
              </CardDescription>
            </CardHeader>
            <CardContent>
              {auditData?.reviews && auditData.reviews.length > 0 ? (
                <div className="space-y-4">
                  {auditData.reviews.map((review) => (
                    <Card key={review.id} data-testid={`card-review-${review.id}`}>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <CardTitle className="text-base">
                              {review.reviewType} Review
                            </CardTitle>
                            <CardDescription>
                              {review.reviewPeriodStart && review.reviewPeriodEnd
                                ? `${format(new Date(review.reviewPeriodStart), 'MMM yyyy')} - ${format(new Date(review.reviewPeriodEnd), 'MMM yyyy')}`
                                : format(new Date(review.createdAt), 'MMM dd, yyyy')}
                            </CardDescription>
                          </div>
                          <Badge variant="outline">
                            Rating: {review.overallRating || 'N/A'}/5
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {review.reviewerComments && (
                          <div>
                            <p className="text-sm font-medium mb-1">Manager Comments:</p>
                            <p className="text-sm text-muted-foreground">{review.reviewerComments}</p>
                          </div>
                        )}
                        {review.employeeComments && (
                          <div>
                            <p className="text-sm font-medium mb-1">Your Comments:</p>
                            <p className="text-sm text-muted-foreground">{review.employeeComments}</p>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          {format(new Date(review.completedAt || review.createdAt), 'MMM dd, yyyy h:mm a')}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  No performance reviews found
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Write-Ups Tab */}
        <TabsContent value="writeups" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Disciplinary Actions</CardTitle>
              <CardDescription>
                Write-ups and incident reports (you can file a grievance to dispute these)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {auditData?.writeups && auditData.writeups.length > 0 ? (
                <div className="space-y-4">
                  {auditData.writeups.map((writeup) => (
                    <Card key={writeup.id} data-testid={`card-writeup-${writeup.id}`} className="border-l-4 border-l-destructive">
                      <CardHeader>
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div>
                            <CardTitle className="text-base flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4 text-destructive" />
                              {writeup.reportNumber || 'Incident Report'}
                            </CardTitle>
                            <CardDescription>
                              {format(new Date(writeup.submittedAt), 'MMM dd, yyyy h:mm a')}
                            </CardDescription>
                          </div>
                          <Badge variant="destructive">
                            {writeup.status}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {writeup.description && (
                          <div>
                            <p className="text-sm font-medium mb-1">Description:</p>
                            <p className="text-sm text-muted-foreground">{writeup.description}</p>
                          </div>
                        )}
                        {writeup.reviewerNotes && (
                          <div>
                            <p className="text-sm font-medium mb-1">Manager Notes:</p>
                            <p className="text-sm text-muted-foreground">{writeup.reviewerNotes}</p>
                          </div>
                        )}
                        <div className="pt-2">
                          <Badge variant="outline" className="gap-1">
                            <Lock className="w-3 h-3" />
                            Cannot be deleted (audit protection)
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-2" />
                  <p className="text-muted-foreground">
                    No disciplinary actions on record
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Locked Records Tab */}
        <TabsContent value="locked" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Locked Compliance Records</CardTitle>
              <CardDescription>
                Immutable records retained for 7 years (IRS/DOL compliance)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {auditData?.lockedRecords && auditData.lockedRecords.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Record Type</TableHead>
                      <TableHead>Locked Date</TableHead>
                      <TableHead>Retention Period</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Verified</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditData.lockedRecords.map((record) => (
                      <TableRow key={record.id} data-testid={`row-locked-${record.id}`}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Lock className="w-3 h-3" />
                            {record.type || 'Compliance Record'}
                          </div>
                        </TableCell>
                        <TableCell>{format(new Date(record.lockedAt), 'MMM dd, yyyy')}</TableCell>
                        <TableCell>{record.retentionYears || 7} years</TableCell>
                        <TableCell>{format(new Date(record.expiresAt), 'MMM dd, yyyy')}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Verified
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  No locked records found
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Compliance Tab */}
        <TabsContent value="compliance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Compliance Summary</CardTitle>
              <CardDescription>
                Labor law, payday, and unemployment compliance status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Total Work Hours (Last 30 Days)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{auditData?.compliance?.totalHours || 0}</p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Overtime Hours</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{auditData?.compliance?.overtimeHours || 0}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Missed Breaks</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{auditData?.compliance?.missedBreaks || 0}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Compliance Violations</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-destructive">{auditData?.compliance?.violations || 0}</p>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </CanvasHubPage>
  );
}
