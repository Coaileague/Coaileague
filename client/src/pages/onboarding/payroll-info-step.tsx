import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Building2, DollarSign, AlertCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const payrollInfoSchema = z.object({
  // Bank Account Info
  bankName: z.string().min(1, "Bank name is required"),
  routingNumber: z.string()
    .min(9, "Routing number must be 9 digits")
    .max(9, "Routing number must be 9 digits")
    .regex(/^\d+$/, "Routing number must contain only digits"),
  accountNumber: z.string()
    .min(4, "Account number must be at least 4 digits")
    .max(17, "Account number must be at most 17 digits")
    .regex(/^\d+$/, "Account number must contain only digits"),
  accountType: z.enum(["checking", "savings"], {
    required_error: "Please select an account type",
  }),

  // W-4 Tax Withholding (2024 Form)
  filingStatus: z.enum(["single", "married_filing_jointly", "married_filing_separately", "head_of_household"], {
    required_error: "Please select your filing status",
  }),
  multipleJobs: z.enum(["yes", "no"], {
    required_error: "Please indicate if you have multiple jobs",
  }),
  dependentsAmount: z.string().optional(),
  otherIncome: z.string().optional(),
  deductions: z.string().optional(),
  extraWithholding: z.string().optional(),
});

type PayrollInfoFormData = z.infer<typeof payrollInfoSchema>;

interface PayrollInfoStepProps {
  application: any;
  onNext: (data: PayrollInfoFormData) => void;
  onBack?: () => void;
}

export function PayrollInfoStep({ application, onNext, onBack }: PayrollInfoStepProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<PayrollInfoFormData>({
    resolver: zodResolver(payrollInfoSchema),
    defaultValues: {
      bankName: application?.bankName || "",
      routingNumber: application?.routingNumber || "",
      accountNumber: application?.accountNumber || "",
      accountType: application?.accountType || undefined,
      filingStatus: application?.filingStatus || undefined,
      multipleJobs: application?.multipleJobs || "no",
      dependentsAmount: application?.dependentsAmount || "",
      otherIncome: application?.otherIncome || "",
      deductions: application?.deductions || "",
      extraWithholding: application?.extraWithholding || "",
    },
  });

  const onSubmit = async (data: PayrollInfoFormData) => {
    setIsSubmitting(true);
    try {
      onNext(data);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save payroll information",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <h3 className="text-lg font-semibold mb-2">Payroll & Tax Information</h3>
      <p className="text-sm text-muted-foreground mb-6">
        Set up direct deposit and configure your tax withholding preferences (W-4).
      </p>

      <Alert className="mb-6">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Your banking information is encrypted and securely stored. Tax withholding is calculated based on IRS Form W-4 (2024).
        </AlertDescription>
      </Alert>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Direct Deposit Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle>Direct Deposit</CardTitle>
                  <CardDescription>Your paycheck will be deposited to this account</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="bankName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bank Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g., Chase, Bank of America, Wells Fargo" 
                        data-testid="input-bank-name"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="routingNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Routing Number</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="9 digits" 
                        maxLength={9}
                        data-testid="input-routing-number"
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      Found at the bottom of your check (first 9 digits)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="accountNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account Number</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="4-17 digits" 
                        maxLength={17}
                        data-testid="input-account-number"
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      Found at the bottom of your check (after routing number)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="accountType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-account-type">
                          <SelectValue placeholder="Select account type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="checking">Checking</SelectItem>
                        <SelectItem value="savings">Savings</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* W-4 Tax Withholding Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle>Tax Withholding (W-4)</CardTitle>
                  <CardDescription>Configure federal income tax withholding</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="filingStatus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Filing Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-filing-status">
                          <SelectValue placeholder="Select your filing status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="single">Single or Married filing separately</SelectItem>
                        <SelectItem value="married_filing_jointly">Married filing jointly</SelectItem>
                        <SelectItem value="married_filing_separately">Married filing separately</SelectItem>
                        <SelectItem value="head_of_household">Head of household</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Your filing status determines your tax bracket
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="multipleJobs"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Multiple Jobs or Spouse Works?</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-multiple-jobs">
                          <SelectValue placeholder="Select yes or no" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="no">No</SelectItem>
                        <SelectItem value="yes">Yes (you or spouse has multiple jobs)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Select "Yes" if you work multiple jobs or your spouse works
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dependentsAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dependent Tax Credit (Optional)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="0" 
                        data-testid="input-dependents-amount"
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      $2,000 per qualifying child, $500 per other dependent (see W-4 instructions)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="otherIncome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Other Income (Optional)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="0" 
                        data-testid="input-other-income"
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      Income from interest, dividends, retirement, etc. (not from jobs)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="deductions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Deductions (Optional)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="0" 
                        data-testid="input-deductions"
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      If you expect to itemize deductions beyond the standard deduction
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="extraWithholding"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Extra Withholding (Optional)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="0" 
                        data-testid="input-extra-withholding"
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      Additional tax to withhold from each paycheck
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-between pt-4">
            {onBack && (
              <Button 
                type="button" 
                variant="outline" 
                onClick={onBack}
                disabled={isSubmitting}
                data-testid="button-back"
              >
                Back
              </Button>
            )}
            <Button 
              type="submit" 
              className="ml-auto"
              disabled={isSubmitting}
              data-testid="button-next-payroll"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Continue to Availability"
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
