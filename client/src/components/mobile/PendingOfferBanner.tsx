/**
 * Pending Shift Offer Banner — Readiness Section 15
 *
 * Surfaces the worker's open shift offers directly on the mobile
 * dashboard. Before this component existed, offers lived only in SMS +
 * the deep-linked /shifts/offers/:offerId route — a Statewide officer on
 * day one had no in-app surface to discover pending offers.
 *
 * Pairs with GET /api/shifts/offers/my/pending (shiftRoutes.ts).
 */

import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Briefcase, ChevronRight, Clock, MapPin } from "lucide-react";

interface PendingOffer {
  offerId: string;
  location: string;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  officerPayRate?: number;
}

interface PendingOffersResponse {
  offers: PendingOffer[];
  count: number;
}

export function PendingOfferBanner(): JSX.Element | null {
  const [, navigate] = useLocation();
  const { data } = useQuery<PendingOffersResponse>({
    queryKey: ["/api/shifts/offers/my/pending"],
    refetchInterval: 60_000, // quiet refresh each minute
  });

  const offers = data?.offers ?? [];
  if (offers.length === 0) return null;

  return (
    <Card
      className="border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent"
      data-testid="pending-offer-banner"
    >
      <CardContent className="p-3 sm:p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-semibold">
              {offers.length === 1 ? "1 open shift offer" : `${offers.length} open shift offers`}
            </h3>
          </div>
          <Badge variant="secondary" className="text-[11px]">Respond soon</Badge>
        </div>
        <ul className="space-y-2">
          {offers.slice(0, 3).map((offer) => (
            <li
              key={offer.offerId}
              className="flex items-center justify-between gap-2 rounded-md bg-background/60 border px-2.5 py-2"
              data-testid={`pending-offer-${offer.offerId}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-medium truncate">
                  <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{offer.location}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  {offer.date && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {offer.date}
                      {offer.startTime ? ` · ${offer.startTime}` : ""}
                      {offer.endTime ? `–${offer.endTime}` : ""}
                    </span>
                  )}
                  {offer.officerPayRate && (
                    <span>· ${offer.officerPayRate.toFixed(2)}/hr</span>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0"
                onClick={() => navigate(`/shifts/offers/${offer.offerId}`)}
                data-testid={`pending-offer-open-${offer.offerId}`}
                aria-label="Open offer"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
        {offers.length > 3 && (
          <p className="text-xs text-muted-foreground text-right">
            +{offers.length - 3} more offers
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default PendingOfferBanner;
