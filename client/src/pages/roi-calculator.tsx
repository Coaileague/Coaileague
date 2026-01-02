import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Calculator, 
  DollarSign, 
  Users, 
  Clock, 
  TrendingDown, 
  CheckCircle2, 
  ArrowRight, 
  Building2, 
  Shield,
  Brain,
  Zap,
  BarChart3,
  Star,
} from "lucide-react";

const roiFormSchema = z.object({
  numberOfGuards: z.coerce.number().min(1, "Enter at least 1 guard"),
  averageHoursPerWeek: z.coerce.number().min(1).max(80, "Maximum 80 hours"),
  currentOvertimePercent: z.coerce.number().min(0).max(100),
  averageHourlyRate: z.coerce.number().min(10).max(100),
});

const leadFormSchema = z.object({
  companyName: z.string().min(1, "Company name required"),
  contactName: z.string().min(1, "Your name required"),
  contactEmail: z.string().email("Valid email required"),
  contactPhone: z.string().optional(),
  contactTitle: z.string().optional(),
  industry: z.string().default("security"),
});

type ROIFormData = z.infer<typeof roiFormSchema>;
type LeadFormData = z.infer<typeof leadFormSchema>;

interface ROIResults {
  estimatedAnnualSavings: number;
  estimatedOvertimeReduction: number;
  estimatedSchedulingTimeReduction: number;
  payrollProcessingSavings: number;
  compliancePenaltyAvoidance: number;
}

function calculateROI(data: ROIFormData): ROIResults {
  const { numberOfGuards, averageHoursPerWeek, currentOvertimePercent, averageHourlyRate } = data;
  
  const annualHours = numberOfGuards * averageHoursPerWeek * 52;
  const currentOvertimeHours = annualHours * (currentOvertimePercent / 100);
  const overtimeRate = averageHourlyRate * 1.5;
  
  const currentOvertimeCost = currentOvertimeHours * overtimeRate;
  const projectedOvertimeReduction = 0.35;
  const estimatedOvertimeSavings = currentOvertimeCost * projectedOvertimeReduction;
  
  const managerHoursPerWeekScheduling = Math.ceil(numberOfGuards / 15) * 8;
  const schedulingTimeSavings = managerHoursPerWeekScheduling * 52 * 0.6 * 35;
  
  const payrollProcessingSavings = numberOfGuards * 2 * 12;
  const compliancePenaltyAvoidance = numberOfGuards * 50;
  
  return {
    estimatedAnnualSavings: Math.round(
      estimatedOvertimeSavings + 
      schedulingTimeSavings + 
      payrollProcessingSavings + 
      compliancePenaltyAvoidance
    ),
    estimatedOvertimeReduction: Math.round(currentOvertimeCost * projectedOvertimeReduction),
    estimatedSchedulingTimeReduction: Math.round(schedulingTimeSavings),
    payrollProcessingSavings: Math.round(payrollProcessingSavings),
    compliancePenaltyAvoidance: Math.round(compliancePenaltyAvoidance),
  };
}

export default function ROICalculator() {
  const [step, setStep] = useState<'calculate' | 'results' | 'contact'>('calculate');
  const [roiResults, setRoiResults] = useState<ROIResults | null>(null);
  const [roiInputs, setRoiInputs] = useState<ROIFormData | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  const statsQuery = useQuery({
    queryKey: ['/api/public/leads/stats'],
  });

  const roiForm = useForm<ROIFormData>({
    resolver: zodResolver(roiFormSchema),
    defaultValues: {
      numberOfGuards: 25,
      averageHoursPerWeek: 40,
      currentOvertimePercent: 15,
      averageHourlyRate: 18,
    },
  });

  const leadForm = useForm<LeadFormData>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: {
      industry: "security",
    },
  });

  const leadMutation = useMutation({
    mutationFn: async (data: LeadFormData & { roiData?: ROIResults & ROIFormData }) => {
      return apiRequest('/api/public/leads', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      setSubmitted(true);
      toast({ title: "Thank you! We'll contact you within 24 hours." });
    },
    onError: () => {
      toast({ title: "Something went wrong. Please try again.", variant: "destructive" });
    },
  });

  const onCalculate = (data: ROIFormData) => {
    const results = calculateROI(data);
    setRoiResults(results);
    setRoiInputs(data);
    setStep('results');
  };

  const onSubmitLead = (data: LeadFormData) => {
    const submitData = {
      ...data,
      estimatedEmployees: roiInputs?.numberOfGuards,
      roiData: roiResults && roiInputs ? {
        ...roiInputs,
        ...roiResults,
      } : undefined,
    };
    leadMutation.mutate(submitData);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value);
  };

  const stats = statsQuery.data as { totalCompanies: string; totalGuardsManaged: string; averageSavings: string; satisfactionRate: string } | undefined;

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg text-center">
          <CardContent className="pt-12 pb-8">
            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Thank You!</h2>
            <p className="text-muted-foreground mb-6">
              Our team will contact you within 24 hours to discuss how CoAIleague 
              can help you save {roiResults ? formatCurrency(roiResults.estimatedAnnualSavings) : 'thousands'} annually.
            </p>
            <div className="bg-primary/10 rounded-lg p-4 text-sm">
              <p className="font-medium text-primary">Your Estimated Annual Savings</p>
              <p className="text-3xl font-bold text-primary mt-1">
                {roiResults ? formatCurrency(roiResults.estimatedAnnualSavings) : '--'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-4 py-8 md:py-16">
        <div className="text-center mb-12">
          <Badge variant="outline" className="mb-4 text-primary border-primary/30">
            <Brain className="w-3 h-3 mr-1" />
            AI-Powered Workforce Management
          </Badge>
          <h1 className="text-3xl md:text-5xl font-bold text-white mb-4">
            Calculate Your ROI with CoAIleague
          </h1>
          <p className="text-lg text-slate-300 max-w-2xl mx-auto">
            See how much your security company could save with AI-powered scheduling, 
            GPS time tracking, and automated compliance management.
          </p>
        </div>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12 max-w-4xl mx-auto">
            <div className="bg-white/5 backdrop-blur rounded-lg p-4 text-center border border-white/10">
              <Building2 className="w-6 h-6 text-primary mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{stats.totalCompanies}</p>
              <p className="text-sm text-slate-400">Companies</p>
            </div>
            <div className="bg-white/5 backdrop-blur rounded-lg p-4 text-center border border-white/10">
              <Users className="w-6 h-6 text-primary mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{stats.totalGuardsManaged}</p>
              <p className="text-sm text-slate-400">Guards Managed</p>
            </div>
            <div className="bg-white/5 backdrop-blur rounded-lg p-4 text-center border border-white/10">
              <TrendingDown className="w-6 h-6 text-green-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{stats.averageSavings}</p>
              <p className="text-sm text-slate-400">Avg. Savings</p>
            </div>
            <div className="bg-white/5 backdrop-blur rounded-lg p-4 text-center border border-white/10">
              <Star className="w-6 h-6 text-yellow-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{stats.satisfactionRate}</p>
              <p className="text-sm text-slate-400">Satisfaction</p>
            </div>
          </div>
        )}

        <div className="max-w-5xl mx-auto">
          {step === 'calculate' && (
            <Card className="bg-white/95 dark:bg-slate-900/95 backdrop-blur">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Calculator className="w-6 h-6 text-primary" />
                  <CardTitle>Enter Your Current Operations</CardTitle>
                </div>
                <CardDescription>
                  Tell us about your workforce to see your potential savings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...roiForm}>
                  <form onSubmit={roiForm.handleSubmit(onCalculate)} className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                      <FormField
                        control={roiForm.control}
                        name="numberOfGuards"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center gap-2">
                              <Users className="w-4 h-4" />
                              Number of Guards/Employees
                            </FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                placeholder="25" 
                                {...field}
                                data-testid="input-guards"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={roiForm.control}
                        name="averageHoursPerWeek"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center gap-2">
                              <Clock className="w-4 h-4" />
                              Average Hours per Week
                            </FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                placeholder="40" 
                                {...field}
                                data-testid="input-hours"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={roiForm.control}
                        name="currentOvertimePercent"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center gap-2">
                              <TrendingDown className="w-4 h-4" />
                              Current Overtime % of Hours
                            </FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                placeholder="15" 
                                {...field}
                                data-testid="input-overtime"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={roiForm.control}
                        name="averageHourlyRate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center gap-2">
                              <DollarSign className="w-4 h-4" />
                              Average Hourly Rate ($)
                            </FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                placeholder="18" 
                                {...field}
                                data-testid="input-rate"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <Button type="submit" size="lg" className="w-full" data-testid="button-calculate">
                      <Calculator className="w-4 h-4 mr-2" />
                      Calculate My Savings
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          )}

          {step === 'results' && roiResults && (
            <div className="space-y-6">
              <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800">
                <CardHeader className="text-center pb-2">
                  <CardTitle className="text-lg text-muted-foreground">Your Estimated Annual Savings</CardTitle>
                  <p className="text-5xl md:text-6xl font-bold text-green-600 dark:text-green-400">
                    {formatCurrency(roiResults.estimatedAnnualSavings)}
                  </p>
                </CardHeader>
              </Card>

              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center shrink-0">
                        <TrendingDown className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Overtime Reduction</p>
                        <p className="text-2xl font-bold">{formatCurrency(roiResults.estimatedOvertimeReduction)}</p>
                        <p className="text-xs text-muted-foreground mt-1">35% reduction through AI scheduling</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center shrink-0">
                        <Clock className="w-6 h-6 text-purple-600" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Scheduling Time Saved</p>
                        <p className="text-2xl font-bold">{formatCurrency(roiResults.estimatedSchedulingTimeReduction)}</p>
                        <p className="text-xs text-muted-foreground mt-1">60% less time on manual scheduling</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center shrink-0">
                        <Zap className="w-6 h-6 text-orange-600" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Payroll Automation</p>
                        <p className="text-2xl font-bold">{formatCurrency(roiResults.payrollProcessingSavings)}</p>
                        <p className="text-xs text-muted-foreground mt-1">Automated timesheet processing</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center shrink-0">
                        <Shield className="w-6 h-6 text-red-600" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Compliance Protection</p>
                        <p className="text-2xl font-bold">{formatCurrency(roiResults.compliancePenaltyAvoidance)}</p>
                        <p className="text-xs text-muted-foreground mt-1">50-state labor law automation</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="flex gap-4 justify-center">
                <Button variant="outline" onClick={() => setStep('calculate')} data-testid="button-recalculate">
                  Recalculate
                </Button>
                <Button size="lg" onClick={() => setStep('contact')} data-testid="button-get-demo">
                  Get Your Free Assessment
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {step === 'contact' && (
            <Card className="bg-white/95 dark:bg-slate-900/95 backdrop-blur max-w-lg mx-auto">
              <CardHeader>
                <CardTitle>Get Your Free Assessment</CardTitle>
                <CardDescription>
                  Our team will analyze your operations and show you exactly how to 
                  save {roiResults ? formatCurrency(roiResults.estimatedAnnualSavings) : 'thousands'} annually.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...leadForm}>
                  <form onSubmit={leadForm.handleSubmit(onSubmitLead)} className="space-y-4">
                    <FormField
                      control={leadForm.control}
                      name="companyName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company Name</FormLabel>
                          <FormControl>
                            <Input placeholder="ABC Security Services" {...field} data-testid="input-company" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={leadForm.control}
                      name="contactName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Your Name</FormLabel>
                          <FormControl>
                            <Input placeholder="John Smith" {...field} data-testid="input-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={leadForm.control}
                      name="contactEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email Address</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="john@abcsecurity.com" {...field} data-testid="input-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={leadForm.control}
                      name="contactPhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone (Optional)</FormLabel>
                          <FormControl>
                            <Input type="tel" placeholder="(555) 123-4567" {...field} data-testid="input-phone" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={leadForm.control}
                      name="industry"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Industry</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-industry">
                                <SelectValue placeholder="Select industry" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="security">Security Services</SelectItem>
                              <SelectItem value="healthcare">Healthcare</SelectItem>
                              <SelectItem value="cleaning">Cleaning/Janitorial</SelectItem>
                              <SelectItem value="construction">Construction</SelectItem>
                              <SelectItem value="property_management">Property Management</SelectItem>
                              <SelectItem value="events">Event Staffing</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button 
                      type="submit" 
                      size="lg" 
                      className="w-full" 
                      disabled={leadMutation.isPending}
                      data-testid="button-submit-lead"
                    >
                      {leadMutation.isPending ? 'Submitting...' : 'Get My Free Assessment'}
                    </Button>
                  </form>
                </Form>
              </CardContent>
              <CardFooter className="justify-center">
                <Button variant="link" onClick={() => setStep('results')} className="text-sm">
                  Back to Results
                </Button>
              </CardFooter>
            </Card>
          )}
        </div>

        <div className="mt-16 max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-white text-center mb-8">Why Security Companies Choose CoAIleague</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-white/5 backdrop-blur rounded-xl p-6 border border-white/10">
              <Brain className="w-10 h-10 text-primary mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">AI-Powered Scheduling</h3>
              <p className="text-slate-400 text-sm">
                Trinity AI creates optimal schedules in seconds, matching the right guards to the right sites.
              </p>
            </div>
            <div className="bg-white/5 backdrop-blur rounded-xl p-6 border border-white/10">
              <BarChart3 className="w-10 h-10 text-primary mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">GPS Time Tracking</h3>
              <p className="text-slate-400 text-sm">
                Geofenced clock-in/out with real-time verification. No more buddy punching or timesheet fraud.
              </p>
            </div>
            <div className="bg-white/5 backdrop-blur rounded-xl p-6 border border-white/10">
              <Shield className="w-10 h-10 text-primary mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">50-State Compliance</h3>
              <p className="text-slate-400 text-sm">
                Automatic break scheduling, certification tracking, and labor law compliance for all 50 states.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
