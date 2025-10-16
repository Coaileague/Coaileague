/**
 * Admin Ticket Reviews Dashboard
 * For training and quality assurance
 */

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, MessageSquare, Calendar, User } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ChatConversation } from "@shared/schema";

export default function AdminTicketReviews() {
  const { data: reviews, isLoading } = useQuery<ChatConversation[]>({
    queryKey: ['/api/helpdesk/reviews'],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Loading reviews...</p>
      </div>
    );
  }

  const reviewsWithRating = reviews?.filter(r => r.rating !== null) || [];
  const avgRating = reviewsWithRating.length > 0
    ? (reviewsWithRating.reduce((sum, r) => sum + (r.rating || 0), 0) / reviewsWithRating.length).toFixed(1)
    : "N/A";

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2" data-testid="page-title">
          Support Ticket Reviews
        </h1>
        <p className="text-muted-foreground">
          Quality assurance and training material from closed tickets
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Reviews
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{reviewsWithRating.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Average Rating
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-3xl font-bold">{avgRating}</span>
              <Star className="w-6 h-6 fill-yellow-400 text-yellow-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              5-Star Reviews
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {reviewsWithRating.filter(r => r.rating === 5).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reviews List */}
      <Card>
        <CardHeader>
          <CardTitle>All Closed Tickets with Reviews</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px]">
            <div className="space-y-4">
              {reviews && reviews.length > 0 ? (
                reviews.map((review) => (
                  <Card key={review.id} className="hover-elevate" data-testid={`review-${review.id}`}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">{review.customerName || 'Anonymous'}</span>
                        </div>
                        {review.rating && (
                          <div className="flex items-center gap-1">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                className={`w-4 h-4 ${
                                  i < review.rating!
                                    ? "fill-yellow-400 text-yellow-400"
                                    : "text-gray-300"
                                }`}
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {review.closedAt ? new Date(review.closedAt).toLocaleDateString() : 'N/A'}
                        </div>
                        <Badge variant={review.status === 'closed' ? 'secondary' : 'default'}>
                          {review.status}
                        </Badge>
                      </div>

                      {review.feedback && (
                        <div className="bg-muted/50 rounded-md p-3 mt-3">
                          <div className="flex items-start gap-2">
                            <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <p className="text-sm">{review.feedback}</p>
                          </div>
                        </div>
                      )}

                      {!review.rating && (
                        <p className="text-sm text-muted-foreground italic">
                          No rating or feedback provided
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No closed tickets found
                </p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
