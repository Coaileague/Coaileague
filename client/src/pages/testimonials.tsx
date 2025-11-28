/**
 * Testimonials Showcase Page
 * 4-5 star reviews for marketing and publicity
 */

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Star, Quote } from "lucide-react";
import type { ChatConversation } from "@shared/schema";

export default function Testimonials() {
  const { data: testimonials, isLoading } = useQuery<ChatConversation[]>({
    queryKey: ['/api/helpdesk/testimonials'],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading testimonials...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Hero Section */}
      <div className="container mx-auto px-6 py-16 text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-4" data-testid="page-title">
          What Our Customers Say
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Real feedback from satisfied customers who experienced our world-class support
        </p>
      </div>

      {/* Testimonials Grid */}
      <div className="container mx-auto px-6 pb-16">
        {testimonials && testimonials.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
            {testimonials.map((testimonial) => (
              <Card
                key={testimonial.id}
                className="hover-elevate transition-all duration-300"
                data-testid={`testimonial-${testimonial.id}`}
              >
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex gap-0.5">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`w-4 h-4 ${
                            i < (testimonial.rating || 0)
                              ? "fill-yellow-400 text-yellow-400"
                              : "text-gray-300"
                          }`}
                        />
                      ))}
                    </div>
                    <Quote className="w-6 h-6 text-muted-foreground opacity-50" />
                  </div>

                  <p className="text-sm leading-relaxed mb-4 min-h-[80px]">
                    "{testimonial.feedback}"
                  </p>

                  <div className="border-t pt-4">
                    <p className="font-semibold text-sm">
                      {testimonial.customerName || 'Verified Customer'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {testimonial.closedAt
                        ? new Date(testimonial.closedAt).toLocaleDateString('en-US', {
                            month: 'long',
                            year: 'numeric',
                          })
                        : 'Recent Customer'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-muted-foreground text-lg">
              No testimonials available yet. Check back soon!
            </p>
          </div>
        )}
      </div>

      {/* CTA Section */}
      <div className="container mx-auto px-6 py-16 text-center">
        <Card className="max-w-2xl mx-auto bg-gradient-to-r from-blue-900 to-slate-900 text-white border-0">
          <CardContent className="pt-8 pb-8">
            <h2 className="text-2xl font-bold mb-4">
              Experience Elite Support
            </h2>
            <p className="mb-6 text-blue-100">
              Join thousands of satisfied customers who trust CoAIleague™ for their business needs
            </p>
            <button className="px-8 py-3 bg-white text-blue-900 font-semibold rounded-lg hover:bg-blue-50 transition-colors">
              Get Started Today
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
