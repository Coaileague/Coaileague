/**
 * AUTOSCHEDULER AUDIT TRACKER™ - File Grievance/Dispute
 * 
 * Employees can file grievances against:
 * - Write-ups/disciplinary actions
 * - Performance reviews
 * - Labor law violations
 * - Payday/wage disputes
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch, AnyResponse } from "@/lib/apiError";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { queryKeys } from "@/config/queryKeys";
import { navConfig } from "@/config/navigationConfig";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, FileText, Send } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useLocation } from "wouter";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

const fileGrievanceSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters").max(200),
  disputeType: z.enum(['performance_review', 'report_submission', 'labor_law_violation', 'payday_dispute']),
  targetId: z.string().optional(),
  reason: z.string().min(20, "Reason must be at least 20 characters").max(5000),
  requestedOutcome: z.string().max(1000).optional(),
  complianceCategory: z.enum(['labor_law', 'payday_law', 'unemployment', 'flsa', 'osha', 'none']).default('none'),
});

type FileGrievanceForm = z.infer<typeof fileGrievanceSchema>;

export default function FileGrievance() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  const { data: disputeableItems } = useQuery({
    queryKey: ['/api/disputes/my-disputes'],
    queryFn: () => apiFetch('/api/disputes/my-disputes', AnyResponse),
  });

  const form = useForm<FileGrievanceForm>({
    resolver: zodResolver(fileGrievanceSchema),
    defaultValues: {
      title: '',
      disputeType: 'report_submission',
      targetId: '',
      reason: '',
      requestedOutcome: '',
      complianceCategory: 'none',
    },
  });

  const fileGrievanceMutation = useMutation({
    mutationFn: async (data: FileGrievanceForm) => {
      const res = await apiRequest('POST', '/api/disputes', data);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Grievance Filed Successfully",
        description: "Your grievance has been submitted for review. You will be notified of the decision.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/disputes/my-disputes'] });
      setSubmittedId(data.id);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error Filing Grievance",
        description: error.message || "Failed to file grievance",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FileGrievanceForm) => {
    fileGrievanceMutation.mutate(data);
  };

  const submittedPageConfig: CanvasPageConfig = {
    id: 'file-grievance-submitted',
    title: 'Grievance Filed',
    subtitle: 'Your grievance has been submitted',
    category: 'operations',
  };

  const pageConfig: CanvasPageConfig = {
    id: 'file-grievance',
    title: 'File a Grievance',
    subtitle: 'Submit a formal complaint or dispute for review',
    category: 'operations',
  };

  if (submittedId) {
    return (
      <CanvasHubPage config={submittedPageConfig}>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <p>Your grievance has been submitted for review. You can track its status in the disputes page.</p>
            <div className="flex gap-2">
              <Button onClick={() => setLocation(navConfig.misc.disputes)} data-testid="button-view-disputes">
                View My Disputes
              </Button>
              <Button variant="outline" onClick={() => setSubmittedId(null)} data-testid="button-file-another">
                File Another Grievance
              </Button>
            </div>
          </CardContent>
        </Card>
      </CanvasHubPage>
    );
  }

  return (
    <CanvasHubPage config={pageConfig}>
      {/* Info Alert */}
      <Alert>
        <AlertCircle className="w-4 h-4" />
        <AlertTitle>Your Rights</AlertTitle>
        <AlertDescription>
          You have the right to dispute any disciplinary action, performance review, or workplace violation.
          Your grievance will be reviewed by management and you'll receive a decision within 14 business days.
        </AlertDescription>
      </Alert>

      {/* Grievance Form */}
      <Card>
        <CardHeader>
          <CardTitle>Grievance Details</CardTitle>
          <CardDescription>
            Provide clear, specific information about your grievance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Title */}
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Grievance Title *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="e.g., Unfair write-up for attendance"
                        data-testid="input-title"
                      />
                    </FormControl>
                    <FormDescription>
                      Brief summary of what you're disputing
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Dispute Type */}
              <FormField
                control={form.control}
                name="disputeType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type of Grievance *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-dispute-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="report_submission">Write-Up / Disciplinary Action</SelectItem>
                        <SelectItem value="performance_review">Performance Review</SelectItem>
                        <SelectItem value="labor_law_violation">Labor Law Violation</SelectItem>
                        <SelectItem value="payday_dispute">Payday / Wage Dispute</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      What are you filing a grievance about?
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Compliance Category */}
              <FormField
                control={form.control}
                name="complianceCategory"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Compliance Category (if applicable)</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-compliance-category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">Not a compliance issue</SelectItem>
                        <SelectItem value="labor_law">General Labor Law</SelectItem>
                        <SelectItem value="payday_law">Payday / Wage Law</SelectItem>
                        <SelectItem value="unemployment">Unemployment Related</SelectItem>
                        <SelectItem value="flsa">FLSA (Overtime / Minimum Wage)</SelectItem>
                        <SelectItem value="osha">OSHA (Safety Violation)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Select if this involves a specific labor law compliance issue
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Reason */}
              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Detailed Reason *</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Explain why you believe this action was unfair or incorrect. Include specific dates, times, and factual details."
                        rows={6}
                        data-testid="textarea-reason"
                      />
                    </FormControl>
                    <FormDescription>
                      Minimum 20 characters. Be specific and factual.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Requested Outcome */}
              <FormField
                control={form.control}
                name="requestedOutcome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Requested Outcome</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="e.g., Remove the write-up from my record, change performance rating to 4, compensate for unpaid overtime"
                        rows={3}
                        data-testid="textarea-outcome"
                      />
                    </FormControl>
                    <FormDescription>
                      What would you like to happen as a result of this grievance?
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Submit Button */}
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocation('/my-audit-record')}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={fileGrievanceMutation.isPending}
                  data-testid="button-submit-grievance"
                  className="gap-1"
                >
                  <Send className="w-4 h-4" />
                  {fileGrievanceMutation.isPending ? 'Filing...' : 'File Grievance'}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </CanvasHubPage>
  );
}
