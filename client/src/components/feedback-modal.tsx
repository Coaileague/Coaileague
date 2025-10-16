/**
 * Post-Ticket Feedback Modal
 * Star rating + text feedback for training and testimonials
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Star } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface FeedbackModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  onSubmitSuccess?: () => void;
}

export function FeedbackModal({
  open,
  onOpenChange,
  conversationId,
  onSubmitSuccess,
}: FeedbackModalProps) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const { toast } = useToast();

  const submitFeedbackMutation = useMutation({
    mutationFn: async (data: { conversationId: string; rating: number; feedback?: string }) => {
      return await apiRequest("POST", "/api/helpdesk/feedback", data);
    },
    onSuccess: () => {
      toast({
        title: "Thank you for your feedback!",
        description: "Your feedback helps us improve our support service.",
      });
      onOpenChange(false);
      onSubmitSuccess?.();
      // Reset form
      setRating(0);
      setFeedback("");
    },
    onError: () => {
      toast({
        title: "Failed to submit feedback",
        description: "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (rating === 0) {
      toast({
        title: "Please select a rating",
        description: "Star rating is required.",
        variant: "destructive",
      });
      return;
    }

    submitFeedbackMutation.mutate({
      conversationId,
      rating,
      feedback: feedback.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="feedback-modal">
        <DialogHeader>
          <DialogTitle>How was your support experience?</DialogTitle>
          <DialogDescription>
            Your feedback helps us train our team and improve service quality.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Star Rating */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  className="transition-transform hover:scale-110"
                  data-testid={`star-${star}`}
                >
                  <Star
                    className={`w-10 h-10 ${
                      star <= (hoveredRating || rating)
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-gray-300 dark:text-gray-600"
                    }`}
                  />
                </button>
              ))}
            </div>
            {rating > 0 && (
              <p className="text-sm text-muted-foreground font-medium">
                {rating === 5 && "Excellent"}
                {rating === 4 && "Great"}
                {rating === 3 && "Good"}
                {rating === 2 && "Could be better"}
                {rating === 1 && "Needs improvement"}
              </p>
            )}
          </div>

          {/* Feedback Text */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Additional Comments <span className="text-muted-foreground">(Optional)</span>
            </label>
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Tell us more about your experience..."
              className="min-h-[100px] resize-none"
              maxLength={500}
              data-testid="feedback-textarea"
            />
            <p className="text-xs text-muted-foreground text-right">
              {feedback.length}/500
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-feedback"
          >
            Skip
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={rating === 0 || submitFeedbackMutation.isPending}
            data-testid="button-submit-feedback"
          >
            {submitFeedbackMutation.isPending ? "Submitting..." : "Submit Feedback"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
