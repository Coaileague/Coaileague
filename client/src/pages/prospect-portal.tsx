import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Building2,
  Calendar,
  MapPin,
  Users,
  ArrowRight,
  FileText,
  Shield,
  Star,
  ClipboardList,
  DollarSign,
  UserCheck,
  FileSignature,
  Sparkles,
  ShieldCheck,
  Zap,
  BarChart3,
  Lock,
} from "lucide-react";
import { Link } from "wouter";

interface ProspectPortalProps {
  tempCode: string;
}

interface ShiftData {
  location?: string;
  shiftDate?: string;
  startTime?: string;
  endTime?: string;
  payRate?: string | number;
  status: string;
  assignedEmployeeName?: string;
}

interface StaffingRequest {
  email: {
    subject: string;
    status: string;
    createdAt: string;
  };
  shifts: ShiftData[];
}

interface ContractDocument {
  id: string | number;
  subject: string;
  status: string;
  createdAt: string;
}

interface SubscriptionInfo {
  canSubscribe: boolean;
  signupUrl: string;
  benefits: string[];
}

interface PortalData {
  success: boolean;
  message?: string;
  prospect?: {
    tempCode: string;
    email: string;
    companyName?: string;
    contactName?: string;
    totalRequests: number;
    totalShiftsFilled: number;
    accessStatus: string;
  };
  workspace?: {
    name: string;
    orgCode?: string;
  };
  staffingRequests?: StaffingRequest[];
  contractDocuments?: ContractDocument[];
  subscription?: SubscriptionInfo;
}

export default function ProspectPortal({ tempCode }: ProspectPortalProps) {
  const [activeTab, setActiveTab] = useState("requests");

  useEffect(() => {
    if (tempCode) {
      apiRequest("POST", `/api/client-status/${tempCode}/clicked`).catch(() => {});
    }
  }, [tempCode]);

  const { data, isLoading, error } = useQuery<PortalData>({
    queryKey: ["/api/client-status", tempCode],
    queryFn: async () => {
      const res = await fetch(`/api/client-status/${tempCode}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || (res.status === 403 ? "Access denied" : res.status === 404 ? "Code not found" : "Unable to load portal"));
      }
      return res.json();
    },
    enabled: !!tempCode,
    retry: false,
  });

  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (time?: string) => {
    if (!time) return "";
    return time;
  };

  const getRequestStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case "processed":
        return (
          <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 border-0">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Processed
          </Badge>
        );
      case "routed_to_human":
        return (
          <Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-0">
            <Users className="h-3 w-3 mr-1" />
            Under Review
          </Badge>
        );
      case "contract_pending_review":
        return (
          <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-0">
            <FileSignature className="h-3 w-3 mr-1" />
            Contract Pending
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-0">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getShiftStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case "assigned":
        return (
          <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 border-0">
            <UserCheck className="h-3 w-3 mr-1" />
            Assigned
          </Badge>
        );
      case "open":
        return (
          <Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-0">
            <Clock className="h-3 w-3 mr-1" />
            Open
          </Badge>
        );
      case "filled":
        return (
          <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 border-0">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Filled
          </Badge>
        );
      case "cancelled":
        return (
          <Badge className="bg-red-500/10 text-red-700 dark:text-red-400 border-0">
            <AlertCircle className="h-3 w-3 mr-1" />
            Cancelled
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getContractStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case "signed":
      case "completed":
        return (
          <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 border-0">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Signed
          </Badge>
        );
      case "pending_review":
      case "pending":
        return (
          <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-0">
            <Clock className="h-3 w-3 mr-1" />
            Pending Review
          </Badge>
        );
      case "sent":
        return (
          <Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-0">
            <FileText className="h-3 w-3 mr-1" />
            Sent
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (!tempCode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-xs">
          <CardHeader className="text-center">
            <CardTitle className="text-destructive flex items-center justify-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Missing Access Code
            </CardTitle>
            <CardDescription>
              Please use the link from your confirmation email to access the portal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full"
              asChild
              data-testid="button-go-home"
            >
              <Link href="/">Return to Homepage</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loading-spinner" />
          <p className="text-muted-foreground">Loading your portal...</p>
        </div>
      </div>
    );
  }

  if (error || !data?.success) {
    const errorMessage = (error as Error)?.message || data?.message || "Unable to load portal";
    const isAccessDenied = errorMessage.includes("Access denied") || errorMessage.includes("expired");
    const isNotFound = errorMessage.includes("not found");

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-xs">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
              {isAccessDenied ? (
                <Lock className="h-6 w-6 text-destructive" />
              ) : (
                <AlertCircle className="h-6 w-6 text-destructive" />
              )}
            </div>
            <CardTitle data-testid="text-error-title">
              {isAccessDenied ? "Access Denied" : isNotFound ? "Code Not Found" : "Unable to Load"}
            </CardTitle>
            <CardDescription data-testid="text-error-message">
              {isAccessDenied
                ? "This access code has expired or is no longer valid."
                : isNotFound
                ? "The access code you provided was not found in our system."
                : errorMessage}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" className="w-full" asChild data-testid="button-go-home">
              <Link href="/">Return to Homepage</Link>
            </Button>
            <Button variant="ghost" className="w-full" asChild data-testid="button-login">
              <Link href="/login">Already have an account? Log in</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const prospect = data.prospect!;
  const workspace = data.workspace;
  const staffingRequests = data.staffingRequests || [];
  const contractDocuments = data.contractDocuments || [];
  const subscription = data.subscription;

  const pendingRequests = staffingRequests.filter(
    (r) => r.email.status !== "processed"
  ).length;

  const activeContracts = contractDocuments.filter(
    (d) => d.status?.toLowerCase() !== "signed" && d.status?.toLowerCase() !== "completed"
  ).length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex flex-col">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 max-w-6xl">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-semibold truncate" data-testid="text-workspace-name">
                  {workspace?.name || "Service Provider"}
                </h1>
                <p className="text-xs text-muted-foreground truncate" data-testid="text-company-name">
                  {prospect.companyName || prospect.contactName || prospect.email}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="font-mono text-xs" data-testid="badge-access-code">
                {prospect.tempCode}
              </Badge>
              {subscription?.canSubscribe && (
                <Button size="sm" asChild data-testid="button-subscribe-header">
                  <a href={subscription.signupUrl}>
                    <Star className="h-4 w-4 mr-1.5" />
                    Become a Subscriber
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-6 max-w-6xl">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-2">
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Total Requests</span>
              </div>
              <div className="text-2xl font-bold" data-testid="stat-total-requests">
                {prospect.totalRequests || 0}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-xs text-muted-foreground">Shifts Filled</span>
              </div>
              <div className="text-2xl font-bold text-green-600" data-testid="stat-shifts-filled">
                {prospect.totalShiftsFilled || 0}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-amber-600" />
                <span className="text-xs text-muted-foreground">Pending</span>
              </div>
              <div className="text-2xl font-bold text-amber-600" data-testid="stat-pending-requests">
                {pendingRequests}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-2">
                <FileSignature className="h-4 w-4 text-blue-600" />
                <span className="text-xs text-muted-foreground">Active Contracts</span>
              </div>
              <div className="text-2xl font-bold text-blue-600" data-testid="stat-active-contracts">
                {activeContracts}
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-3 lg:w-auto lg:inline-grid" data-testid="tabs-portal">
            <TabsTrigger value="requests" data-testid="tab-requests">
              <ClipboardList className="h-4 w-4 mr-1.5" />
              Staffing Requests
            </TabsTrigger>
            <TabsTrigger value="contracts" data-testid="tab-contracts">
              <FileText className="h-4 w-4 mr-1.5" />
              Contracts
            </TabsTrigger>
            {subscription?.canSubscribe && (
              <TabsTrigger value="subscribe" data-testid="tab-subscribe">
                <Star className="h-4 w-4 mr-1.5" />
                Subscribe
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="requests" className="mt-6 space-y-4">
            {staffingRequests.length === 0 ? (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center">
                    <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">No staffing requests found</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Requests submitted via email will appear here once processed.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              staffingRequests.map((request, idx) => (
                <Card key={idx} data-testid={`card-request-${idx}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base truncate" data-testid={`text-request-subject-${idx}`}>
                          {request.email.subject || "Staffing Request"}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          <Calendar className="h-3.5 w-3.5 inline mr-1" />
                          {formatDate(request.email.createdAt)}
                        </CardDescription>
                      </div>
                      <div data-testid={`badge-request-status-${idx}`}>
                        {getRequestStatusBadge(request.email.status)}
                      </div>
                    </div>
                  </CardHeader>
                  {request.shifts && request.shifts.length > 0 && (
                    <CardContent className="pt-0">
                      <Separator className="mb-3" />
                      <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wide">
                        Extracted Shifts
                      </p>
                      <div className="space-y-2">
                        {request.shifts.map((shift, shiftIdx) => (
                          <div
                            key={shiftIdx}
                            className="p-3 bg-muted/40 rounded-md"
                            data-testid={`card-shift-${idx}-${shiftIdx}`}
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="text-sm font-medium truncate">
                                  {shift.location || "Location TBD"}
                                </span>
                              </div>
                              <div data-testid={`badge-shift-status-${idx}-${shiftIdx}`}>
                                {getShiftStatusBadge(shift.status)}
                              </div>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                              {shift.shiftDate && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {formatDate(shift.shiftDate)}
                                </span>
                              )}
                              {(shift.startTime || shift.endTime) && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatTime(shift.startTime)}
                                  {shift.endTime ? ` - ${formatTime(shift.endTime)}` : ""}
                                </span>
                              )}
                              {shift.payRate && (
                                <span className="flex items-center gap-1">
                                  <DollarSign className="h-3 w-3" />
                                  {typeof shift.payRate === "number"
                                    ? `$${shift.payRate.toFixed(2)}/hr`
                                    : shift.payRate}
                                </span>
                              )}
                            </div>
                            {shift.status?.toLowerCase() === "assigned" && shift.assignedEmployeeName && (
                              <div className="mt-2 flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400">
                                <UserCheck className="h-3.5 w-3.5" />
                                <span>Assigned to {shift.assignedEmployeeName}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="contracts" className="mt-6 space-y-4">
            {contractDocuments.length === 0 ? (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center">
                    <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">No contract documents yet</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Contract documents will appear here when they are generated.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-start gap-3">
                      <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Trinity AI Recommendation</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Please review each contract carefully before signing. If you have questions about
                          any terms, contact your service provider directly. Signed contracts will be stored
                          securely in your portal.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                {contractDocuments.map((doc) => (
                  <Card key={doc.id} data-testid={`card-contract-${doc.id}`}>
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center shrink-0">
                            <FileSignature className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate" data-testid={`text-contract-subject-${doc.id}`}>
                              {doc.subject}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Received {formatDate(doc.createdAt)}
                            </p>
                          </div>
                        </div>
                        <div data-testid={`badge-contract-status-${doc.id}`}>
                          {getContractStatusBadge(doc.status)}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </>
            )}
          </TabsContent>

          {subscription?.canSubscribe && (
            <TabsContent value="subscribe" className="mt-6">
              <Card>
                <CardHeader className="text-center pb-2">
                  <div className="mx-auto mb-3 h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                    <Star className="h-7 w-7 text-primary" />
                  </div>
                  <CardTitle className="text-xl" data-testid="text-subscribe-title">
                    Unlock Full Platform Access
                  </CardTitle>
                  <CardDescription className="max-w-lg mx-auto">
                    Upgrade to a subscriber account to manage schedules, view reports, access
                    invoices, and streamline your security staffing operations.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-4">
                  {subscription.benefits && subscription.benefits.length > 0 && (
                    <div className="grid gap-3 sm:grid-cols-2 mb-6 max-w-2xl mx-auto">
                      {subscription.benefits.map((benefit, idx) => {
                        const icons = [ShieldCheck, Zap, BarChart3, Users, Calendar, FileText, Star, CheckCircle2];
                        const Icon = icons[idx % icons.length];
                        return (
                          <div
                            key={idx}
                            className="flex items-start gap-3 p-3 rounded-md bg-muted/40"
                            data-testid={`benefit-item-${idx}`}
                          >
                            <Icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                            <span className="text-sm">{benefit}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="text-center">
                    <Button size="lg" asChild data-testid="button-subscribe-cta">
                      <a href={subscription.signupUrl}>
                        Get Started
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </a>
                    </Button>
                    <p className="text-xs text-muted-foreground mt-3">
                      No commitment required. Cancel anytime.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </main>

      <footer className="border-t bg-background mt-auto">
        <div className="container mx-auto px-4 py-4 max-w-6xl">
          <div className="flex items-center justify-between gap-4 flex-wrap text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              <span>Powered by {workspace?.name || "Your Service Provider"}</span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/" className="hover:text-foreground transition-colors" data-testid="link-home">
                Home
              </Link>
              <Link href="/login" className="hover:text-foreground transition-colors" data-testid="link-login">
                Log In
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
