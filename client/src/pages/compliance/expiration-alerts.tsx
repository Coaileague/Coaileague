import { secureFetch } from "@/lib/csrf";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  AlertTriangle, 
  Clock, 
  XCircle, 
  Calendar, 
  User, 
  FileText,
  ChevronRight,
  Bell
} from "lucide-react";

interface ExpiringDocument {
  document: {
    id: string;
    fileName: string;
    fileType: string;
    expirationDate: string;
  };
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  daysUntilExpiry: number;
  isUrgent: boolean;
}

interface ExpiredDocument {
  document: {
    id: string;
    fileName: string;
    fileType: string;
    expirationDate: string;
  };
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  daysOverdue: number;
}

interface ExpirationData {
  success: boolean;
  expiring: ExpiringDocument[];
  expired: ExpiredDocument[];
  summary: {
    expiringCount: number;
    expiredCount: number;
    urgentCount: number;
  };
}

export default function ExpirationAlerts() {
  const [, navigate] = useLocation();
  const [filterDays, setFilterDays] = useState<7 | 30 | 90>(90);

  const { data, isLoading, isError, refetch } = useQuery<ExpirationData>({
    queryKey: ['/api/security-compliance/records/expiring', filterDays],
    queryFn: async () => {
      const response = await secureFetch(`/api/security-compliance/records/expiring?days=${filterDays}`);
      if (!response.ok) throw new Error('Failed to fetch');
      return response.json();
    },
  });

  const expiring = data?.expiring || [];
  const expired = data?.expired || [];
  const summary = data?.summary || { expiringCount: 0, expiredCount: 0, urgentCount: 0 };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getUrgencyBadge = (days: number) => {
    if (days <= 7) {
      return <Badge variant="destructive">Expires in {days} days</Badge>;
    } else if (days <= 30) {
      return <Badge className="bg-orange-500">Expires in {days} days</Badge>;
    } else {
      return <Badge variant="secondary">Expires in {days} days</Badge>;
    }
  };

  const pageConfig: CanvasPageConfig = {
    id: 'compliance-expiration-alerts',
    title: 'Expiration Alerts',
    subtitle: 'Track expiring licenses and documents',
    category: 'operations',
    maxWidth: '6xl',
    backButton: true,
    onBack: () => navigate('/security-compliance'),
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card data-testid="card-urgent-count">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <div>
                  <p className="text-lg sm:text-2xl font-bold text-red-600">{summary.urgentCount}</p>
                  <p className="text-sm text-muted-foreground">Urgent (7 days)</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card data-testid="card-expiring-count">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-orange-500" />
                <div>
                  <p className="text-lg sm:text-2xl font-bold text-orange-600">{summary.expiringCount}</p>
                  <p className="text-sm text-muted-foreground">Expiring (90 days)</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card data-testid="card-expired-count">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-600" />
                <div>
                  <p className="text-lg sm:text-2xl font-bold text-red-700">{summary.expiredCount}</p>
                  <p className="text-sm text-muted-foreground">Already Expired</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {summary.urgentCount > 0 && (
          <Alert variant="destructive" data-testid="alert-urgent">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Urgent Action Required</AlertTitle>
            <AlertDescription>
              {summary.urgentCount} document(s) will expire within the next 7 days. 
              Immediate renewal is required to maintain compliance.
            </AlertDescription>
          </Alert>
        )}

        <Tabs value={String(filterDays)} onValueChange={(v) => setFilterDays(Number(v) as 7 | 30 | 90)}>
          <TabsList className="w-full sm:w-auto overflow-x-auto">
            <TabsTrigger value="7" data-testid="tab-7-days">
              <AlertTriangle className="h-4 w-4 mr-1" />
              7 Days
            </TabsTrigger>
            <TabsTrigger value="30" data-testid="tab-30-days">
              <Clock className="h-4 w-4 mr-1" />
              30 Days
            </TabsTrigger>
            <TabsTrigger value="90" data-testid="tab-90-days">
              <Calendar className="h-4 w-4 mr-1" />
              90 Days
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {expired.length > 0 && (
          <Card data-testid="card-expired-documents">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <XCircle className="h-5 w-5" />
                Expired Documents
              </CardTitle>
              <CardDescription>These documents have already expired and require immediate attention</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {expired.map((item) => (
                  <div
                    key={item.document.id}
                    className="flex items-center justify-between gap-2 p-4 border border-red-200 bg-red-50 dark:bg-red-950/20 rounded-lg cursor-pointer hover-elevate"
                    onClick={() => item.employee && navigate(`/security-compliance/employee/${item.employee.id}`)}
                    data-testid={`expired-doc-${item.document.id}`}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center shrink-0">
                        <User className="h-5 w-5 text-red-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {item.employee ? `${item.employee.firstName} ${item.employee.lastName}` : 'Unknown'}
                        </p>
                        <p className="text-sm text-muted-foreground flex items-center gap-1 truncate">
                          <FileText className="h-3 w-3 shrink-0" />
                          <span className="truncate">{item.document.fileName}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge variant="destructive">
                        {item.daysOverdue} days overdue
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        Expired {formatDate(item.document.expirationDate)}
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card data-testid="card-expiring-documents">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Expiring Soon
            </CardTitle>
            <CardDescription>Documents expiring within the next {filterDays} days</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-10 text-center text-muted-foreground space-y-2">
                <Clock className="h-10 w-10 mx-auto opacity-50 animate-pulse" />
                <div className="font-medium text-foreground">Checking expiring documents</div>
                <p className="text-sm text-muted-foreground">
                  Reviewing license and credential deadlines for the next {filterDays} days.
                </p>
              </div>
            ) : isError ? (
              <div className="py-10 text-center space-y-3">
                <AlertTriangle className="h-10 w-10 mx-auto text-destructive" />
                <div>
                  <p className="font-medium text-destructive">Couldn&apos;t load expiration alerts</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Retry to refresh compliance deadlines and renewal reminders.
                  </p>
                </div>
                <Button variant="outline" onClick={() => refetch()}>
                  <Clock className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </div>
            ) : expiring.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Bell className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="font-medium text-foreground">No documents expiring soon</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Everyone is currently clear for the next {filterDays} days.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {expiring.map((item) => (
                  <div
                    key={item.document.id}
                    className={`flex items-center justify-between gap-2 p-4 border rounded-lg cursor-pointer hover-elevate ${
                      item.isUrgent ? 'border-red-200 bg-red-50/50 dark:bg-red-950/10' : ''
                    }`}
                    onClick={() => item.employee && navigate(`/security-compliance/employee/${item.employee.id}`)}
                    data-testid={`expiring-doc-${item.document.id}`}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                        item.isUrgent ? 'bg-red-100 dark:bg-red-900' : 'bg-muted'
                      }`}>
                        <User className={`h-5 w-5 ${item.isUrgent ? 'text-red-600' : ''}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {item.employee ? `${item.employee.firstName} ${item.employee.lastName}` : 'Unknown'}
                        </p>
                        <p className="text-sm text-muted-foreground flex items-center gap-1 truncate">
                          <FileText className="h-3 w-3 shrink-0" />
                          <span className="truncate">{item.document.fileName}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {getUrgencyBadge(item.daysUntilExpiry)}
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(item.document.expirationDate)}
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </CanvasHubPage>
  );
}
