import { useState } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  MapPin,
  Calendar,
  Clock,
  DollarSign,
  Building2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Shield,
  Star,
  Timer,
} from "lucide-react";

interface OfferData {
  success: boolean;
  offer: {
    id: string;
    status: string;
    matchScore: string | null;
    matchReasoning: string | null;
    isExpired: boolean;
    isAcceptable: boolean;
    expiresAt: string;
    createdAt: string;
  };
  shift: {
    location: string | null;
    date: string | null;
    startTime: string | null;
    endTime: string | null;
    payRate: string | null;
    clientName: string | null;
    requirements: Record<string, any> | null;
    status: string | null;
  } | null;
  employee: {
    firstName: string;
    lastName: string;
  } | null;
  workspace: string;
}

function formatTime(time: string | null) {
  if (!time) return "TBD";
  const [hours, minutes] = time.split(":");
  const h = parseInt(hours);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "TBD";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getStatusBadge(status: string, isExpired: boolean) {
  if (isExpired && status === "pending_response") {
    return <Badge variant="destructive" data-testid="badge-status"><Timer className="h-3 w-3 mr-1" />Expired</Badge>;
  }
  switch (status) {
    case "pending_response":
      return <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-0" data-testid="badge-status"><Clock className="h-3 w-3 mr-1" />Awaiting Response</Badge>;
    case "accepted":
      return <Badge className="bg-emerald-500/10 text-emerald-600 border-0" data-testid="badge-status"><CheckCircle2 className="h-3 w-3 mr-1" />Accepted</Badge>;
    case "declined":
      return <Badge variant="secondary" data-testid="badge-status"><XCircle className="h-3 w-3 mr-1" />Declined</Badge>;
    case "expired":
      return <Badge variant="destructive" data-testid="badge-status"><Timer className="h-3 w-3 mr-1" />Expired</Badge>;
    case "withdrawn":
      return <Badge variant="secondary" data-testid="badge-status"><AlertTriangle className="h-3 w-3 mr-1" />Withdrawn</Badge>;
    default:
      return <Badge variant="outline" data-testid="badge-status">{status}</Badge>;
  }
}

export default function AcceptOffer() {
  const [, params] = useRoute("/accept-offer/:offerId");
  const offerId = params?.offerId;
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const [declineReason, setDeclineReason] = useState("");
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [actionComplete, setActionComplete] = useState<"accepted" | "declined" | null>(null);

  const { data, isLoading, error } = useQuery<OfferData>({
    queryKey: ["/api/enterprise/public/offer", offerId, token],
    queryFn: async () => {
      const res = await fetch(`/api/enterprise/public/offer/${offerId}?token=${encodeURIComponent(token)}`);
      if (!res.ok) throw new Error("Failed to load offer");
      return res.json();
    },
    enabled: !!offerId && !!token,
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/enterprise/public/offer/${offerId}/accept`, {
        token,
      });
      return res.json();
    },
    onSuccess: () => setActionComplete("accepted"),
  });

  const declineMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/enterprise/public/offer/${offerId}/decline`, {
        token,
        reason: declineReason || undefined,
      });
      return res.json();
    },
    onSuccess: () => setActionComplete("declined"),
  });

  const handleAccept = () => {
    if (!data?.offer) return;
    acceptMutation.mutate();
  };

  const handleDecline = () => {
    if (!data?.offer) return;
    declineMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4" data-testid="loading-state">
        <Card className="w-full max-w-lg">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Loading offer details...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4" data-testid="error-state">
        <Card className="w-full max-w-lg">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <AlertTriangle className="h-12 w-12 text-destructive" />
            <h2 className="text-xl font-semibold">Invalid Link</h2>
            <p className="text-muted-foreground text-center">
              This offer link is incomplete. Please use the full link from your email.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !data?.success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4" data-testid="error-state">
        <Card className="w-full max-w-lg">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <AlertTriangle className="h-12 w-12 text-destructive" />
            <h2 className="text-xl font-semibold">Offer Not Found</h2>
            <p className="text-muted-foreground text-center">
              This offer link may be invalid or has expired. Please check your email for the correct link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { offer, shift, employee, workspace } = data;

  if (actionComplete) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4" data-testid="success-state">
        <Card className="w-full max-w-lg">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            {actionComplete === "accepted" ? (
              <>
                <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                </div>
                <h2 className="text-xl font-semibold" data-testid="text-success-title">Offer Accepted!</h2>
                <p className="text-muted-foreground text-center max-w-sm" data-testid="text-success-message">
                  You have successfully accepted this shift. Your supervisor will be notified and you will receive confirmation details shortly.
                </p>
              </>
            ) : (
              <>
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                  <XCircle className="h-8 w-8 text-muted-foreground" />
                </div>
                <h2 className="text-xl font-semibold" data-testid="text-decline-title">Offer Declined</h2>
                <p className="text-muted-foreground text-center max-w-sm" data-testid="text-decline-message">
                  Thank you for your response. The offer has been declined and the next available employee will be contacted.
                </p>
              </>
            )}
            {shift && (
              <div className="mt-4 p-4 rounded-md bg-muted/50 w-full text-center">
                <p className="text-sm text-muted-foreground">
                  {shift.clientName && <span className="font-medium">{shift.clientName}</span>}
                  {shift.date && <span> - {formatDate(shift.date)}</span>}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const timeUntilExpiry = new Date(offer.expiresAt).getTime() - Date.now();
  const hoursLeft = Math.max(0, Math.floor(timeUntilExpiry / (1000 * 60 * 60)));
  const minutesLeft = Math.max(0, Math.floor((timeUntilExpiry % (1000 * 60 * 60)) / (1000 * 60)));

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4" data-testid="offer-page">
      <div className="w-full max-w-lg space-y-4">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Shift Offer</h1>
          <p className="text-muted-foreground" data-testid="text-workspace-name">{workspace}</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                {shift?.clientName || "Shift Assignment"}
              </CardTitle>
              {getStatusBadge(offer.status, offer.isExpired)}
            </div>
            {employee && (
              <CardDescription data-testid="text-employee-name">
                For: {employee.firstName} {employee.lastName}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {shift && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {shift.date && (
                  <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50" data-testid="info-date">
                    <Calendar className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm text-muted-foreground">Date</p>
                      <p className="font-medium">{formatDate(shift.date)}</p>
                    </div>
                  </div>
                )}
                {(shift.startTime || shift.endTime) && (
                  <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50" data-testid="info-time">
                    <Clock className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm text-muted-foreground">Time</p>
                      <p className="font-medium">{formatTime(shift.startTime)} - {formatTime(shift.endTime)}</p>
                    </div>
                  </div>
                )}
                {shift.location && (
                  <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50" data-testid="info-location">
                    <MapPin className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm text-muted-foreground">Location</p>
                      <p className="font-medium">{shift.location}</p>
                    </div>
                  </div>
                )}
                {shift.payRate && (
                  <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50" data-testid="info-pay">
                    <DollarSign className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm text-muted-foreground">Pay Rate</p>
                      <p className="font-medium">${parseFloat(shift.payRate).toFixed(2)}/hr</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {shift?.requirements && Object.keys(shift.requirements).length > 0 && (
              <div className="p-3 rounded-md bg-muted/50" data-testid="info-requirements">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">Requirements</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {shift.requirements.armed && <Badge variant="secondary">Armed</Badge>}
                  {shift.requirements.unarmed && <Badge variant="secondary">Unarmed</Badge>}
                  {shift.requirements.certifications?.map((cert: string) => (
                    <Badge key={cert} variant="secondary">{cert}</Badge>
                  ))}
                  {shift.requirements.dressCode && <Badge variant="outline">{shift.requirements.dressCode}</Badge>}
                </div>
                {shift.requirements.specialInstructions && (
                  <p className="text-sm text-muted-foreground mt-2">{shift.requirements.specialInstructions}</p>
                )}
              </div>
            )}

            {offer.matchScore && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50" data-testid="info-match">
                <Star className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                <span className="text-sm">Match Score: <span className="font-medium">{(parseFloat(offer.matchScore) * 100).toFixed(0)}%</span></span>
              </div>
            )}

            {offer.isAcceptable && !offer.isExpired && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="info-expiry">
                <Timer className="h-4 w-4" />
                <span>
                  Expires in {hoursLeft > 0 ? `${hoursLeft}h ` : ""}{minutesLeft}m
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {offer.isAcceptable && (
          <Card data-testid="card-actions">
            <CardContent className="pt-6 space-y-3">
              {!showDeclineForm ? (
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    className="flex-1"
                    onClick={handleAccept}
                    disabled={acceptMutation.isPending || declineMutation.isPending}
                    data-testid="button-accept"
                  >
                    {acceptMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                    )}
                    Accept Shift
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowDeclineForm(true)}
                    disabled={acceptMutation.isPending || declineMutation.isPending}
                    data-testid="button-decline"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Decline
                  </Button>
                </div>
              ) : (
                <div className="space-y-3" data-testid="decline-form">
                  <p className="text-sm text-muted-foreground">Reason for declining (optional):</p>
                  <Textarea
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    placeholder="Let us know why you're declining..."
                    className="resize-none"
                    data-testid="input-decline-reason"
                  />
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={handleDecline}
                      disabled={declineMutation.isPending}
                      data-testid="button-confirm-decline"
                    >
                      {declineMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <XCircle className="h-4 w-4 mr-2" />
                      )}
                      Confirm Decline
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setShowDeclineForm(false)}
                      disabled={declineMutation.isPending}
                      data-testid="button-cancel-decline"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {(acceptMutation.isError || declineMutation.isError) && (
                <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm" data-testid="text-error">
                  <AlertTriangle className="h-4 w-4 inline mr-2" />
                  {(acceptMutation.error as Error)?.message || (declineMutation.error as Error)?.message || "Something went wrong. Please try again."}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!offer.isAcceptable && (
          <Card data-testid="card-unavailable">
            <CardContent className="py-6 text-center">
              <p className="text-muted-foreground">
                {offer.isExpired
                  ? "This offer has expired and can no longer be accepted."
                  : offer.status === "accepted"
                  ? "This offer has already been accepted."
                  : offer.status === "declined"
                  ? "This offer has been declined."
                  : "This offer is no longer available."}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
