/** ORPHANED: This page is not wired to any route in App.tsx.
 *  Kept for reference — wire to a route (e.g. /client-status) or remove in a future cleanup pass. */
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle2, Clock, AlertCircle, Building2, Calendar, MapPin, Users, ArrowRight, Search } from "lucide-react";
import { Link } from "wouter";

interface ClientStatusLookupProps {
  tempCode?: string;
}

interface StatusData {
  success: boolean;
  message?: string;
  prospect?: {
    tempCode: string;
    companyName?: string;
    contactName?: string;
    email: string;
    accessStatus: string;
    totalRequests: number;
    totalShiftsFilled: number;
    createdAt: string;
  };
  workspace?: {
    name: string;
    orgCode?: string;
  };
  requests?: Array<{
    referenceNumber?: string;
    subject?: string;
    status: string;
    createdAt: string;
  }>;
  shifts?: Array<{
    location?: string;
    date?: string;
    time?: string;
    status: string;
    positionsNeeded?: number;
    positionsFilled?: number;
  }>;
  signupUrl?: string;
}

export default function ClientStatusLookup({ tempCode: initialTempCode }: ClientStatusLookupProps) {
  const [searchCode, setSearchCode] = useState(initialTempCode || "");
  const [activeCode, setActiveCode] = useState(initialTempCode || "");

  useEffect(() => {
    if (initialTempCode && activeCode !== initialTempCode) {
      setActiveCode(initialTempCode);
      setSearchCode(initialTempCode);
      apiRequest('POST', `/api/client-status/${initialTempCode}/clicked`).catch(() => {});
    }
  }, [initialTempCode, activeCode]);

  const { data, isLoading, error, refetch } = useQuery<StatusData>({
    queryKey: ['/api/client-status', activeCode],
    enabled: !!activeCode && activeCode.length >= 8,
  });

  const handleSearch = () => {
    if (searchCode.length >= 8) {
      setActiveCode(searchCode.toUpperCase());
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed':
      case 'assigned':
      case 'approved':
        return <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-0"><CheckCircle2 className="h-3 w-3 mr-1" />Completed</Badge>;
      case 'processing':
      case 'pending':
      case 'awaiting_approval':
        return <Badge className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-0"><Clock className="h-3 w-3 mr-1" />In Progress</Badge>;
      case 'failed':
      case 'rejected':
        return <Badge className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-0"><AlertCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Request Status Portal</h1>
          <p className="text-muted-foreground">Check the status of your staffing requests</p>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Enter Your Access Code
            </CardTitle>
            <CardDescription>
              Your access code was included in the confirmation email you received
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                data-testid="input-access-code"
                placeholder="e.g., SPS-TEMP-A1B2"
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="font-mono text-lg tracking-wider"
              />
              <Button 
                data-testid="button-search-status"
                onClick={handleSearch}
                disabled={searchCode.length < 8}
              >
                <Search className="h-4 w-4 mr-2" />
                Search
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Loading status...</span>
          </div>
        )}

        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                <span>Unable to find status for this code. Please check and try again.</span>
              </div>
            </CardContent>
          </Card>
        )}

        {data?.success && data.prospect && (
          <>
            <Card className="mb-6">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-6 w-6 text-primary" />
                    <div>
                      <CardTitle data-testid="text-company-name">
                        {data.prospect.companyName || data.prospect.contactName || 'Your Account'}
                      </CardTitle>
                      <CardDescription data-testid="text-workspace-name">
                        Serviced by {data.workspace?.name || 'Our Team'}
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-sm">
                    {data.prospect.tempCode}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-3 bg-muted/50 rounded-lg">
                    <div className="text-2xl font-bold text-primary" data-testid="text-total-requests">
                      {data.prospect.totalRequests || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">Total Requests</div>
                  </div>
                  <div className="text-center p-3 bg-muted/50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600" data-testid="text-shifts-filled">
                      {data.prospect.totalShiftsFilled || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">Shifts Filled</div>
                  </div>
                  <div className="text-center p-3 bg-muted/50 rounded-lg">
                    <div className="text-sm font-medium">
                      {getStatusBadge(data.prospect.accessStatus)}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">Account Status</div>
                  </div>
                  <div className="text-center p-3 bg-muted/50 rounded-lg">
                    <div className="text-sm font-medium">{formatDate(data.prospect.createdAt)}</div>
                    <div className="text-sm text-muted-foreground">Member Since</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {data.requests && data.requests.length > 0 && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="text-lg">Recent Requests</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {data.requests.map((req, idx) => (
                      <div 
                        key={idx} 
                        className="flex items-center justify-between gap-2 p-3 bg-muted/30 rounded-lg"
                        data-testid={`request-item-${idx}`}
                      >
                        <div>
                          <div className="font-medium">{req.subject || 'Staffing Request'}</div>
                          <div className="text-sm text-muted-foreground">
                            {req.referenceNumber} - {formatDate(req.createdAt)}
                          </div>
                        </div>
                        {getStatusBadge(req.status)}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {data.shifts && data.shifts.length > 0 && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="text-lg">Scheduled Shifts</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {data.shifts.map((shift, idx) => (
                      <div 
                        key={idx} 
                        className="p-4 bg-muted/30 rounded-lg"
                        data-testid={`shift-item-${idx}`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{shift.location || 'Location TBD'}</span>
                          </div>
                          {getStatusBadge(shift.status)}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {shift.date ? formatDate(shift.date) : 'Date TBD'}
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {shift.time || 'Time TBD'}
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            {shift.positionsFilled || 0} / {shift.positionsNeeded || 0} filled
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {data.signupUrl && data.prospect.accessStatus === 'temp' && (
              <Card className="border-primary/50 bg-primary/5">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="font-semibold mb-1">Ready to get full access?</h3>
                      <p className="text-sm text-muted-foreground">
                        Create an account to view invoices, reports, and manage your requests
                      </p>
                    </div>
                    <Button data-testid="button-create-account" asChild>
                      <a href={data.signupUrl}>
                        Create Account
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {!activeCode && !isLoading && (
          <div className="text-center py-12 text-muted-foreground">
            <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Enter your access code above to view your request status</p>
          </div>
        )}

        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>Need help? Contact your service provider directly.</p>
          <Link href="/" className="text-primary hover:underline">
            Return to Homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
