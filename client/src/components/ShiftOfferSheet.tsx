import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalDescription, UniversalModalContent } from '@/components/ui/universal-modal';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MapPin, Calendar, Clock, Briefcase, DollarSign, CheckCircle, XCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ShiftOffer {
  offerId: string;
  workflowId: string;
  location: string;
  address?: string;
  date: string;
  startTime: string;
  endTime: string;
  positionType: string;
  officerPayRate?: number;
  specialRequirements?: string[];
  status: "pending" | "accepted" | "declined" | "expired";
  workspaceName: string;
}

interface ShiftOfferSheetProps {
  offerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShiftOfferSheet({ offerId, open, onOpenChange }: ShiftOfferSheetProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: offer, isLoading } = useQuery<ShiftOffer>({
    queryKey: ["/api/shifts/offers", offerId],
    enabled: open && !!offerId,
  });

  const acceptMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/shifts/offers/${offerId}/accept`),
    onSuccess: () => {
      toast({ title: "Shift accepted!", description: "You have been assigned to this shift. Full details will follow." });
      queryClient.invalidateQueries({ queryKey: ["/api/shifts/offers", offerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      onOpenChange(false);
    },
    onError: (err) => {
      toast({ title: "Could not accept", description: err.message || "Please try again.", variant: "destructive" });
    },
  });

  const declineMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/shifts/offers/${offerId}/decline`),
    onSuccess: () => {
      toast({ title: "Offer declined", description: "No action needed from your side." });
      queryClient.invalidateQueries({ queryKey: ["/api/shifts/offers", offerId] });
      onOpenChange(false);
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message || "Please try again.", variant: "destructive" });
    },
  });

  const isPending = offer?.status === "pending" || !offer?.status;

  return (
    <UniversalModal open={open} onOpenChange={onOpenChange}>
      <UniversalModalContent side="bottom" className="h-auto overflow-y-auto rounded-t-xl">
        <UniversalModalHeader className="pb-4">
          <UniversalModalTitle className="text-xl">Shift Offer</UniversalModalTitle>
          <UniversalModalDescription>
            {offer?.workspaceName || "Your organization"} has a position available for you
          </UniversalModalDescription>
        </UniversalModalHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            Loading offer details...
          </div>
        )}

        {!isLoading && !offer && (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            Offer not found or has expired.
          </div>
        )}

        {!isLoading && offer && (
          <div className="space-y-5 pb-6">
            <div className="flex items-center gap-2">
              <Badge data-testid="badge-offer-status" variant={
                offer.status === "accepted" ? "default" :
                offer.status === "declined" ? "secondary" :
                offer.status === "expired" ? "outline" : "default"
              }>
                {offer.status === "accepted" ? "Accepted" :
                 offer.status === "declined" ? "Declined" :
                 offer.status === "expired" ? "Expired" : "Open Offer"}
              </Badge>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Briefcase className="mt-0.5 h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm text-muted-foreground">Position</p>
                  <p className="font-medium" data-testid="text-offer-position">{offer.positionType}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm text-muted-foreground">Location</p>
                  <p className="font-medium" data-testid="text-offer-location">{offer.location}</p>
                  {offer.address && (
                    <p className="text-sm text-muted-foreground">{offer.address}</p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Calendar className="mt-0.5 h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm text-muted-foreground">Date</p>
                  <p className="font-medium" data-testid="text-offer-date">{offer.date}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="mt-0.5 h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm text-muted-foreground">Hours</p>
                  <p className="font-medium" data-testid="text-offer-hours">
                    {offer.startTime} – {offer.endTime}
                  </p>
                </div>
              </div>

              {offer.officerPayRate && (
                <div className="flex items-start gap-3">
                  <DollarSign className="mt-0.5 h-5 w-5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm text-muted-foreground">Your Pay Rate</p>
                    <p className="font-medium text-green-600" data-testid="text-offer-pay-rate">
                      ${parseFloat(String(offer.officerPayRate || 0)).toFixed(2)}/hr
                    </p>
                  </div>
                </div>
              )}

              {offer.specialRequirements && offer.specialRequirements.length > 0 && (
                <div className="rounded-md bg-muted p-3">
                  <p className="text-sm font-medium mb-1">Requirements</p>
                  <p className="text-sm text-muted-foreground">{offer.specialRequirements.join(", ")}</p>
                </div>
              )}
            </div>

            {isPending && (
              <>
                <Separator />
                <div className="space-y-3 pt-1">
                  <p className="text-sm text-muted-foreground text-center">
                    Offers are filled first-come, first-served. Accept now to secure your spot.
                  </p>
                  <div className="flex flex-col gap-2">
                    <Button
                      data-testid="button-accept-offer"
                      onClick={() => acceptMutation.mutate()}
                      disabled={acceptMutation.isPending || declineMutation.isPending}
                      className="w-full"
                      size="lg"
                    >
                      <CheckCircle className="mr-2 h-4 w-4" />
                      {acceptMutation.isPending ? "Accepting..." : "Accept Shift"}
                    </Button>
                    <Button
                      data-testid="button-decline-offer"
                      variant="ghost"
                      onClick={() => declineMutation.mutate()}
                      disabled={acceptMutation.isPending || declineMutation.isPending}
                      className="w-full"
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      {declineMutation.isPending ? "Declining..." : "Decline"}
                    </Button>
                  </div>
                </div>
              </>
            )}

            {!isPending && (
              <div className="text-center text-sm text-muted-foreground py-3">
                This offer is no longer open for action.
              </div>
            )}
          </div>
        )}
      </UniversalModalContent>
    </UniversalModal>
  );
}

export function useShiftOfferSheet() {
  const [, setLocation] = useLocation();
  const [offerId, setOfferId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const openOffer = (id: string) => {
    setOfferId(id);
    setOpen(true);
  };

  const closeOffer = () => {
    setOpen(false);
    setOfferId(null);
  };

  return { offerId, open, openOffer, closeOffer };
}
