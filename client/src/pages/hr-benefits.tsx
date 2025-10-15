import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Heart, DollarSign, Calendar, Shield, Plus, CheckCircle2, XCircle } from "lucide-react";
import ModernLayout from "@/components/ModernLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";

const benefitSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  benefitType: z.enum(['health_insurance', '401k', 'pto', 'life_insurance', 'dental', 'vision']),
  provider: z.string().min(1, "Provider is required"),
  enrollmentStatus: z.enum(['enrolled', 'pending', 'declined', 'terminated']),
  coverage: z.string().min(1, "Coverage is required"),
  employeeContribution: z.string().min(1, "Employee contribution is required"),
  employerContribution: z.string().min(1, "Employer contribution is required"),
});

type BenefitFormData = z.infer<typeof benefitSchema>;

interface Benefit {
  id: number;
  employeeId: string;
  employeeName: string;
  benefitType: string;
  provider: string;
  enrollmentStatus: string;
  coverage: string;
  employeeContribution: number;
  employerContribution: number;
  enrollmentDate: string | null;
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
}

export default function HRBenefits() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: benefits, isLoading } = useQuery<Benefit[]>({
    queryKey: ['/api/hr/benefits'],
  });

  const { data: employees } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: BenefitFormData) => {
      return apiRequest('POST', '/api/hr/benefits', {
        ...data,
        employeeContribution: parseFloat(data.employeeContribution),
        employerContribution: parseFloat(data.employerContribution),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hr/benefits'] });
      setDialogOpen(false);
      toast({
        title: "Success",
        description: "Benefit enrollment created successfully",
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

  const form = useForm<BenefitFormData>({
    resolver: zodResolver(benefitSchema),
    defaultValues: {
      employeeId: "",
      benefitType: "health_insurance",
      provider: "",
      enrollmentStatus: "pending",
      coverage: "",
      employeeContribution: "0",
      employerContribution: "0",
    },
  });

  const onSubmit = (data: BenefitFormData) => {
    createMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <ModernLayout>
        <div className="flex justify-center items-center h-full">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </ModernLayout>
    );
  }

  const totalEmployerCost = benefits?.reduce((sum, b) => sum + (b.employerContribution || 0), 0) || 0;
  const totalEmployeeCost = benefits?.reduce((sum, b) => sum + (b.employeeContribution || 0), 0) || 0;
  const enrolledCount = benefits?.filter(b => b.enrollmentStatus === 'enrolled').length || 0;

  const getBenefitIcon = (type: string) => {
    switch (type) {
      case 'health_insurance': return <Heart className="h-4 w-4" />;
      case '401k': return <DollarSign className="h-4 w-4" />;
      case 'pto': return <Calendar className="h-4 w-4" />;
      default: return <Shield className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      enrolled: "default",
      pending: "secondary",
      declined: "destructive",
      terminated: "outline",
    };
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  return (
    <ModernLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-1" data-testid="heading-benefits">Employee Benefits</h2>
              <p className="text-sm sm:text-base text-muted-foreground">
                Manage employee benefit enrollments and contributions
              </p>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-benefit">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Benefit
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create Benefit Enrollment</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                      name="benefitType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Benefit Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-benefit-type">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="health_insurance">Health Insurance</SelectItem>
                              <SelectItem value="401k">401(k)</SelectItem>
                              <SelectItem value="pto">PTO</SelectItem>
                              <SelectItem value="life_insurance">Life Insurance</SelectItem>
                              <SelectItem value="dental">Dental</SelectItem>
                              <SelectItem value="vision">Vision</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="provider"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Provider</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="e.g., Blue Cross" data-testid="input-provider" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="coverage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Coverage</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="e.g., Individual, Family" data-testid="input-coverage" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="employeeContribution"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Employee Contribution ($)</FormLabel>
                            <FormControl>
                              <Input {...field} type="number" step="0.01" data-testid="input-employee-contribution" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="employerContribution"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Employer Contribution ($)</FormLabel>
                            <FormControl>
                              <Input {...field} type="number" step="0.01" data-testid="input-employer-contribution" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="enrollmentStatus"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-status">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="enrolled">Enrolled</SelectItem>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="declined">Declined</SelectItem>
                              <SelectItem value="terminated">Terminated</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-end gap-3 pt-4">
                      <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-benefit">
                        {createMutation.isPending ? "Creating..." : "Create Benefit"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card data-testid="card-enrolled">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Enrolled Employees</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-enrolled-count">{enrolledCount}</div>
                <p className="text-xs text-muted-foreground mt-1">Active enrollments</p>
              </CardContent>
            </Card>

            <Card data-testid="card-employer-cost">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Employer Cost</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-employer-cost">
                  ${totalEmployerCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Monthly contribution</p>
              </CardContent>
            </Card>

            <Card data-testid="card-employee-cost">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Employee Cost</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-employee-cost">
                  ${totalEmployeeCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Total deductions</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Benefit Enrollments</CardTitle>
            </CardHeader>
            <CardContent>
              {!benefits || benefits.length === 0 ? (
                <div className="text-center py-12">
                  <XCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No benefit enrollments found</p>
                  <p className="text-sm text-muted-foreground mt-1">Create your first enrollment to get started</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {benefits.map((benefit) => (
                    <div 
                      key={benefit.id} 
                      className="flex items-center justify-between gap-4 p-4 rounded-lg border bg-card hover-elevate"
                      data-testid={`benefit-${benefit.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-2 rounded-lg bg-primary/10">
                          {getBenefitIcon(benefit.benefitType)}
                        </div>
                        <div>
                          <div className="font-semibold">{benefit.employeeName}</div>
                          <div className="text-sm text-muted-foreground">
                            {benefit.benefitType.replace('_', ' ')} • {benefit.provider}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-sm font-medium">
                            Employer: ${benefit.employerContribution.toFixed(2)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Employee: ${benefit.employeeContribution.toFixed(2)}
                          </div>
                        </div>
                        {getStatusBadge(benefit.enrollmentStatus)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ModernLayout>
  );
}
