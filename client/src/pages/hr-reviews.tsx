import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Star, TrendingUp, Users, Plus, XCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { queryClient } from "@/lib/queryClient";
import { apiGet, apiPost } from "@/lib/apiClient";
import { queryKeys } from "@/config/queryKeys";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const reviewSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  reviewType: z.enum(['annual', 'probation', 'mid_year', 'project']),
  reviewPeriodStart: z.string().min(1, "Start date is required"),
  reviewPeriodEnd: z.string().min(1, "End date is required"),
  communicationRating: z.string().min(1),
  teamworkRating: z.string().min(1),
  qualityRating: z.string().min(1),
  productivityRating: z.string().min(1),
  attendanceRating: z.string().min(1),
  overallRating: z.string().min(1),
  strengths: z.string().min(1, "Strengths are required"),
  areasForImprovement: z.string().min(1, "Areas for improvement are required"),
  goals: z.string().optional(),
  salaryAdjustmentRecommendation: z.string().optional(),
});

type ReviewFormData = z.infer<typeof reviewSchema>;

const disputeSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters").max(200, "Title too long"),
  reason: z.string().min(20, "Reason must be at least 20 characters").max(5000, "Reason too long"),
  requestedOutcome: z.string().max(1000, "Requested outcome too long").optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
});

type DisputeFormData = z.infer<typeof disputeSchema>;

interface Review {
  id: number;
  employeeId: string;
  employeeName: string;
  reviewType: string;
  reviewDate: string;
  overallRating: number;
  communicationRating: number;
  teamworkRating: number;
  qualityRating: number;
  strengths: string;
  areasForImprovement: string;
  salaryAdjustmentRecommendation: string | null;
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
}

export default function HRReviews() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [disputeDialogOpen, setDisputeDialogOpen] = useState(false);
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);

  const { data: reviews, isLoading } = useQuery<Review[]>({
    queryKey: queryKeys.reviews.all,
    queryFn: () => apiGet('reviews.list'),
  });

  const { data: employees } = useQuery<Employee[]>({
    queryKey: queryKeys.employees.all,
    queryFn: () => apiGet('employees.list'),
  });

  const createMutation = useMutation({
    mutationFn: async (data: ReviewFormData) => {
      return apiPost('reviews.create', {
        ...data,
        communicationRating: parseInt(data.communicationRating),
        teamworkRating: parseInt(data.teamworkRating),
        qualityRating: parseInt(data.qualityRating),
        productivityRating: parseInt(data.productivityRating),
        attendanceRating: parseInt(data.attendanceRating),
        overallRating: parseInt(data.overallRating),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reviews.all });
      setDialogOpen(false);
      form.reset();
      toast({
        title: "Success",
        description: "Performance review created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const form = useForm<ReviewFormData>({
    resolver: zodResolver(reviewSchema),
    defaultValues: {
      employeeId: "",
      reviewType: "annual",
      reviewPeriodStart: "",
      reviewPeriodEnd: "",
      communicationRating: "3",
      teamworkRating: "3",
      qualityRating: "3",
      productivityRating: "3",
      attendanceRating: "3",
      overallRating: "3",
      strengths: "",
      areasForImprovement: "",
      goals: "",
      salaryAdjustmentRecommendation: "",
    },
  });

  const onSubmit = (data: ReviewFormData) => {
    createMutation.mutate(data);
  };

  // Dispute filing mutation
  const fileDisputeMutation = useMutation({
    mutationFn: async (data: DisputeFormData) => {
      if (!selectedReview) throw new Error("No review selected");
      return apiPost('grievances.file', {
        ...data,
        disputeType: 'performance_review',
        targetType: 'performance_reviews',
        targetId: selectedReview.id.toString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.grievances.all });
      setDisputeDialogOpen(false);
      disputeForm.reset();
      setSelectedReview(null);
      toast({
        title: "Success",
        description: "Dispute filed successfully. Support will review your case.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const disputeForm = useForm<DisputeFormData>({
    resolver: zodResolver(disputeSchema),
    defaultValues: {
      title: "",
      reason: "",
      requestedOutcome: "",
      priority: "normal",
    },
  });

  const onDisputeSubmit = (data: DisputeFormData) => {
    fileDisputeMutation.mutate(data);
  };

  const handleOpenDisputeDialog = (review: Review) => {
    setSelectedReview(review);
    disputeForm.setValue('title', `Dispute: ${review.reviewType} review for ${review.employeeName}`);
    setDisputeDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full h-full overflow-auto">
        <div className="flex justify-center items-center h-full">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  const avgRating = reviews?.length 
    ? (reviews.reduce((sum, r) => sum + r.overallRating, 0) / reviews.length).toFixed(1)
    : "0.0";

  const getRatingStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star 
        key={i} 
        className={`h-4 w-4 ${i < rating ? 'fill-yellow-500 text-yellow-500' : 'text-gray-300'}`}
      />
    ));
  };

  const getReviewTypeBadge = (type: string) => {
    const variants: Record<string, "default" | "secondary" | "outline"> = {
      annual: "default",
      probation: "secondary",
      mid_year: "outline",
      project: "outline",
    };
    return <Badge variant={variants[type] || "outline"}>{type.replace('_', ' ')}</Badge>;
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full h-full overflow-auto">
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-1" data-testid="heading-reviews">Performance Reviews</h2>
              <p className="text-sm sm:text-base text-muted-foreground">
                Track employee performance and career development
              </p>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-review">
                  <Plus className="h-4 w-4 mr-2" />
                  New Review
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create Performance Review</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="employeeId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Employee</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-employee">
                                  <SelectValue placeholder="Select employee" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {employees?.map((emp) => (
                                  <SelectItem key={emp.id} value={emp.id}>
                                    {emp.firstName} {emp.lastName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="reviewType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Review Type</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-review-type">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="annual">Annual</SelectItem>
                                <SelectItem value="probation">Probation</SelectItem>
                                <SelectItem value="mid_year">Mid-Year</SelectItem>
                                <SelectItem value="project">Project</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="reviewPeriodStart"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Period Start</FormLabel>
                            <FormControl>
                              <Input {...field} type="date" data-testid="input-period-start" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="reviewPeriodEnd"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Period End</FormLabel>
                            <FormControl>
                              <Input {...field} type="date" data-testid="input-period-end" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="border rounded-lg p-4 space-y-3">
                      <h4 className="font-semibold">Performance Ratings (1-5)</h4>
                      <div className="grid grid-cols-3 gap-4">
                        {['communication', 'teamwork', 'quality', 'productivity', 'attendance', 'overall'].map((field) => (
                          <FormField
                            key={field}
                            control={form.control}
                            name={`${field}Rating` as any}
                            render={({ field: formField }) => (
                              <FormItem>
                                <FormLabel className="capitalize">{field}</FormLabel>
                                <Select onValueChange={formField.onChange} value={formField.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid={`select-${field}-rating`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {[1, 2, 3, 4, 5].map((num) => (
                                      <SelectItem key={num} value={num.toString()}>{num}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        ))}
                      </div>
                    </div>

                    <FormField
                      control={form.control}
                      name="strengths"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Strengths</FormLabel>
                          <FormControl>
                            <Textarea {...field} rows={3} data-testid="input-strengths" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="areasForImprovement"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Areas for Improvement</FormLabel>
                          <FormControl>
                            <Textarea {...field} rows={3} data-testid="input-areas-improvement" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="goals"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Goals (Optional)</FormLabel>
                          <FormControl>
                            <Textarea {...field} rows={2} data-testid="input-goals" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="salaryAdjustmentRecommendation"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Salary Adjustment Recommendation (Optional)</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="e.g., 5% increase" data-testid="input-salary-adjustment" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-end gap-3 pt-4">
                      <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-review">
                        {createMutation.isPending ? "Creating..." : "Create Review"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>

            {/* Dispute Filing Dialog */}
            <Dialog open={disputeDialogOpen} onOpenChange={setDisputeDialogOpen}>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>File Dispute - Performance Review</DialogTitle>
                  <DialogDescription>
                    Explain why you believe this review is inaccurate or unfair. Support will investigate and respond.
                  </DialogDescription>
                </DialogHeader>
                <Form {...disputeForm}>
                  <form onSubmit={disputeForm.handleSubmit(onDisputeSubmit)} className="space-y-4">
                    {selectedReview && (
                      <div className="bg-muted p-4 rounded-lg">
                        <p className="text-sm font-medium">Disputing review for: {selectedReview.employeeName}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {selectedReview.reviewType} review from {format(new Date(selectedReview.reviewDate), 'MMM d, yyyy')}
                        </p>
                      </div>
                    )}

                    <FormField
                      control={disputeForm.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Dispute Title</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Brief summary of your dispute" data-testid="input-dispute-title" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={disputeForm.control}
                      name="reason"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Detailed Reason (minimum 20 characters)</FormLabel>
                          <FormControl>
                            <Textarea 
                              {...field} 
                              rows={6} 
                              placeholder="Explain in detail why this review is inaccurate or unfair. Include specific examples and data if available."
                              data-testid="input-dispute-reason"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={disputeForm.control}
                      name="requestedOutcome"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Requested Outcome (Optional)</FormLabel>
                          <FormControl>
                            <Textarea 
                              {...field} 
                              rows={3} 
                              placeholder="What resolution would you like? (e.g., 'Change rating from 2 to 4', 'Remove this review')"
                              data-testid="input-dispute-outcome"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={disputeForm.control}
                      name="priority"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Priority</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-dispute-priority">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="low">Low</SelectItem>
                              <SelectItem value="normal">Normal</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                              <SelectItem value="urgent">Urgent</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-end gap-3 pt-4">
                      <Button type="button" variant="outline" onClick={() => {
                        setDisputeDialogOpen(false);
                        setSelectedReview(null);
                        disputeForm.reset();
                      }}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={fileDisputeMutation.isPending} data-testid="button-submit-dispute">
                        {fileDisputeMutation.isPending ? "Filing..." : "File Dispute"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card data-testid="card-total-reviews">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Reviews</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-reviews">{reviews?.length || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Completed</p>
              </CardContent>
            </Card>

            <Card data-testid="card-avg-rating">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Average Rating</CardTitle>
                <Star className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-avg-rating">{avgRating}</div>
                <div className="flex gap-0.5 mt-1">{getRatingStars(Math.round(parseFloat(avgRating)))}</div>
              </CardContent>
            </Card>

            <Card data-testid="card-salary-recommendations">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Salary Recommendations</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-recommendations">
                  {reviews?.filter(r => r.salaryAdjustmentRecommendation).length || 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Pending approval</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent Reviews</CardTitle>
            </CardHeader>
            <CardContent>
              {!reviews || reviews.length === 0 ? (
                <div className="text-center py-12">
                  <XCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No performance reviews found</p>
                  <p className="text-sm text-muted-foreground mt-1">Create your first review to get started</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {reviews.map((review) => (
                    <div 
                      key={review.id} 
                      className="flex items-center justify-between gap-4 p-4 rounded-lg border bg-card hover-elevate"
                      data-testid={`review-${review.id}`}
                    >
                      <div className="flex-1">
                        <div className="font-semibold">{review.employeeName}</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {format(new Date(review.reviewDate), 'MMM d, yyyy')}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 line-clamp-1">
                          {review.strengths}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex gap-0.5">
                          {getRatingStars(review.overallRating)}
                        </div>
                        {getReviewTypeBadge(review.reviewType)}
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleOpenDisputeDialog(review)}
                          data-testid={`button-dispute-review-${review.id}`}
                        >
                          <AlertTriangle className="h-4 w-4 mr-2" />
                          Dispute
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
