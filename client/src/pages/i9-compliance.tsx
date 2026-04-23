import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle2, Clock, FileText } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

export default function I9CompliancePage() {
  const { data: allRecords = [], isLoading: allLoading } = useQuery<any[]>({
    queryKey: ['/api/i9-records'],
  });

  const { data: expiring30 = [], isLoading: expiring30Loading } = useQuery<any[]>({
    queryKey: ['/api/i9-records/expiring?days=30'],
  });

  const { data: expiring7 = [], isLoading: expiring7Loading } = useQuery<any[]>({
    queryKey: ['/api/i9-records/expiring?days=7'],
  });

  const getUrgencyBadge = (expirationDate: string | null) => {
    if (!expirationDate) return null;
    const daysUntilExpiry = differenceInDays(new Date(expirationDate), new Date());
    
    if (daysUntilExpiry <= 7) {
      return <Badge variant="destructive" className="flex items-center gap-1">
        <AlertTriangle className="w-3 h-3" />
        Urgent - {daysUntilExpiry} days
      </Badge>;
    } else if (daysUntilExpiry <= 30) {
      return <Badge variant="outline" className="flex items-center gap-1">
        <Clock className="w-3 h-3" />
        {daysUntilExpiry} days
      </Badge>;
    }
    return <Badge variant="secondary">Valid</Badge>;
  };

  const compliantRecords = allRecords.filter((r: any) => 
    r.status === 'verified' && (!r.expirationDate || differenceInDays(new Date(r.expirationDate), new Date()) > 30)
  );

  const pageConfig: CanvasPageConfig = {
    id: 'i9-compliance',
    title: 'I-9 Compliance Dashboard',
    subtitle: 'Monitor work authorization expiration and re-verification requirements',
    category: 'operations',
  };

  if (allLoading || expiring30Loading || expiring7Loading) {
    return (
      <CanvasHubPage config={pageConfig}>
        <div className="p-6 text-center text-muted-foreground space-y-2">
          <Clock className="h-8 w-8 mx-auto opacity-50 animate-pulse" />
          <p className="font-medium text-foreground">Loading I-9 compliance dashboard</p>
          <p className="text-sm">Checking verified records, expiring authorizations, and urgent re-verification needs.</p>
        </div>
      </CanvasHubPage>
    );
  }

  return (
    <CanvasHubPage config={pageConfig}>
      <div data-testid="page-i9-compliance">
        {expiring7.length > 0 && (
        <Alert variant="destructive" className="mb-6" data-testid="alert-urgent">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Urgent:</strong> {expiring7.length} work authorization(s) expiring within 7 days require immediate re-verification!
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total I-9 Records</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="count-total">{allRecords.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Expiring (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600" data-testid="count-expiring-30">{expiring30.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Urgent (7 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600" data-testid="count-expiring-7">{expiring7.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        {expiring7.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Urgent Re-Verification Required (7 Days)
            </h2>
            <div className="space-y-4">
              {expiring7.map((record: any) => (
                <Card key={record.id} className="border-red-200" data-testid={`card-urgent-${record.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-lg">Employee ID: {record.employeeId}</CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-1">
                          <FileText className="w-3 h-3" />
                          {record.workAuthorizationType || 'Work Authorization'}
                        </CardDescription>
                      </div>
                      {getUrgencyBadge(record.expirationDate)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Expiration Date:</span>
                        <div className="font-medium text-red-600">
                          {record.expirationDate ? format(new Date(record.expirationDate), "MMM dd, yyyy") : 'N/A'}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Document:</span>
                        <div className="font-medium">{record.listADocument || record.listBDocument || 'N/A'}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {expiring30.length > expiring7.length && (
          <div>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-orange-600" />
              Upcoming Expiration (8-30 Days)
            </h2>
            <div className="space-y-4">
              {expiring30.filter((r: any) => !expiring7.some((e: any) => e.id === r.id)).map((record: any) => (
                <Card key={record.id} data-testid={`card-upcoming-${record.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-lg">Employee ID: {record.employeeId}</CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-1">
                          <FileText className="w-3 h-3" />
                          {record.workAuthorizationType || 'Work Authorization'}
                        </CardDescription>
                      </div>
                      {getUrgencyBadge(record.expirationDate)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Expiration Date:</span>
                        <div className="font-medium">
                          {record.expirationDate ? format(new Date(record.expirationDate), "MMM dd, yyyy") : 'N/A'}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Document:</span>
                        <div className="font-medium">{record.listADocument || record.listBDocument || 'N/A'}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        <div>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            Compliant Records ({compliantRecords.length})
          </h2>
          {compliantRecords.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                <div className="space-y-2">
                  <CheckCircle2 className="h-8 w-8 mx-auto opacity-50 text-green-600 dark:text-green-400" />
                  <p className="font-medium text-foreground">No compliant records yet</p>
                  <p className="text-sm">Verified authorizations will appear here once I-9 review is complete.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-6">
                <div className="text-sm text-muted-foreground">
                  {compliantRecords.length} employee(s) have valid I-9 records with no upcoming expiration
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      </div>
    </CanvasHubPage>
  );
}
