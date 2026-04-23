import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UniversalModal, UniversalModalDescription, UniversalModalHeader, UniversalModalTitle, UniversalModalTrigger, UniversalModalContent } from '@/components/ui/universal-modal';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Trash2, Plus, DollarSign, CheckCircle, AlertCircle } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { deductionTypesConfig, payrollMessages } from "@/config/payrollConfig";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { Skeleton } from "@/components/ui/skeleton";

const deductionSchema = z.object({
  employeeId: z.string().min(1, "Employee required"),
  payrollEntryId: z.string().min(1, "Payroll entry required"),
  deductionType: z.enum(['health_insurance', 'dental', 'vision', 'ira', '401k', 'hsa', 'fsa', 'other']),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Valid amount required"),
  isPreTax: z.boolean().default(true),
  description: z.string().optional(),
});

type DeductionFormData = z.infer<typeof deductionSchema>;

export default function PayrollDeductionsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Fetch payroll entries
  const { data: payrollEntries, isLoading: loadingEntries } = useQuery<any[]>({
    queryKey: ['/api/payroll/entries'],
    enabled: !!user,
  });

  // Fetch employees
  const { data: employees = [], isLoading: loadingEmployees } = useQuery<{ data: any[] }, Error, any[]>({
    queryKey: ['/api/employees'],
    select: (res) => res?.data ?? [],
    enabled: !!user,
  });

  // Fetch deductions for current payroll entries
  const { data: deductions, isLoading: loadingDeductions, refetch } = useQuery<any[]>({
    queryKey: ['/api/payroll/deductions'],
    enabled: !!user && !!payrollEntries?.length,
  });

  const form = useForm<DeductionFormData>({
    resolver: zodResolver(deductionSchema),
    defaultValues: {
      deductionType: 'health_insurance',
      isPreTax: true,
    },
  });

  const addDeductionMutation = useMutation({
    mutationFn: async (data: DeductionFormData) => {
      const response = await apiRequest(
        `POST`,
        `/api/payroll/deductions/${data.payrollEntryId}`,
        {
          employeeId: data.employeeId,
          deductionType: data.deductionType,
          amount: data.amount,
          isPreTax: data.isPreTax,
          description: data.description,
        }
      );
      return response;
    },
    onSuccess: () => {
      toast({ title: "✓ Deduction Added", description: payrollMessages.deductions.addSuccess });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/deductions'] });
      setDialogOpen(false);
      form.reset();
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "✗ Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteDeductionMutation = useMutation({
    mutationFn: async (deductionId: string) => {
      return await apiRequest('DELETE', `/api/payroll/deductions/${deductionId}`, {});
    },
    onSuccess: () => {
      toast({ title: "✓ Deduction Removed", description: payrollMessages.deductions.deleteConfirm });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/deductions'] });
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "✗ Error", description: error.message, variant: "destructive" });
    },
  });

  const isLoading = loadingEntries || loadingEmployees || loadingDeductions;

  // Extract labels from config
  const deductionTypes = Object.entries(deductionTypesConfig).reduce((acc, [key, config]) => {
    acc[key] = config.label;
    return acc;
  }, {} as Record<string, string>);

  const totalDeductions = deductions?.reduce((sum, d) => sum + parseFloat(d.amount || 0), 0) || 0;

  const actionButton = (
    <UniversalModal open={dialogOpen} onOpenChange={setDialogOpen}>
      <UniversalModalTrigger asChild>
        <Button className="gap-2" data-testid="button-add-deduction">
          <Plus className="w-4 h-4" />
          {payrollMessages.deductions.addButton}
        </Button>
      </UniversalModalTrigger>
          <UniversalModalContent size="md">
            <UniversalModalHeader>
              <UniversalModalTitle>{payrollMessages.deductions.addDialogTitle}</UniversalModalTitle>
              <UniversalModalDescription>{payrollMessages.deductions.addDialogDescription}</UniversalModalDescription>
            </UniversalModalHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => addDeductionMutation.mutate(data))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="payrollEntryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payroll Entry</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-payroll-entry">
                            <SelectValue placeholder="Select payroll entry" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {payrollEntries?.map((entry) => (
                            <SelectItem key={entry.id} value={entry.id} data-testid={`option-entry-${entry.id}`}>
                              Entry {entry.id?.slice(0, 8)}
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
                  name="employeeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Employee</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-employee">
                            <SelectValue placeholder="Select employee" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {employees?.map((emp) => (
                            <SelectItem key={emp.id} value={emp.id} data-testid={`option-emp-${emp.id}`}>
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
                  name="deductionType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Deduction Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-deduction-type">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(deductionTypes).map(([key, label]) => (
                            <SelectItem key={key} value={key} data-testid={`option-type-${key}`}>
                              {label}
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
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount</FormLabel>
                      <FormControl>
                        <Input 
                          type="text" 
                          placeholder="0.00" 
                          {...field}
                          data-testid="input-amount"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isPreTax"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between gap-2 rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel>{payrollMessages.deductions.preTaxLabel}</FormLabel>
                        <FormDescription>{payrollMessages.deductions.preTaxDescription}</FormDescription>
                      </div>
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-pretax"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={addDeductionMutation.isPending}
                  data-testid="button-submit-deduction"
                >
                  {addDeductionMutation.isPending ? "Adding..." : "Add Deduction"}
                </Button>
              </form>
            </Form>
          </UniversalModalContent>
        </UniversalModal>
  );

  const pageConfig: CanvasPageConfig = {
    id: 'payroll-deductions',
    title: payrollMessages.deductions.title,
    subtitle: payrollMessages.deductions.description,
    category: 'operations',
    headerActions: actionButton,
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList className="w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="all" data-testid="tab-all">All Deductions</TabsTrigger>
          <TabsTrigger value="pretax" data-testid="tab-pretax">Pre-Tax</TabsTrigger>
          <TabsTrigger value="posttax" data-testid="tab-posttax">Post-Tax</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                All Deductions
              </CardTitle>
              <CardDescription>Total Deductions: ${totalDeductions.toFixed(2)}</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2 py-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="space-y-1.5 flex-1">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-5 w-16 rounded-full" />
                        <Skeleton className="h-8 w-8 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : deductions?.length === 0 ? (
                <div className="text-center py-8">
                  <AlertCircle className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">{payrollMessages.deductions.noDeductions}</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-2">
                    {deductions?.map((deduction) => (
                      <div key={deduction.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition mobile-flex-col mobile-p-3 mobile-gap-2" data-testid={`card-deduction-${deduction.id}`}>
                        <div className="flex-1 mobile-w-full">
                          <p className="font-medium mobile-text-sm">{deductionTypes[deduction.deductionType]}</p>
                          <p className="text-sm text-muted-foreground">${parseFloat(deduction.amount).toFixed(2)}</p>
                        </div>
                        <div className="flex items-center gap-2 mobile-w-full mobile-justify-between">
                          <Badge variant={deduction.isPreTax ? "default" : "secondary"}>
                            {deduction.isPreTax ? "Pre-Tax" : "Post-Tax"}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteDeductionMutation.mutate(deduction.id)}
                            disabled={deleteDeductionMutation.isPending}
                            data-testid={`button-delete-deduction-${deduction.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pretax">
          <Card>
            <CardContent className="pt-6">
              {isLoading ? (
                <div className="space-y-2 py-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="space-y-1.5 flex-1">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                      <Skeleton className="h-8 w-8 rounded" />
                    </div>
                  ))}
                </div>
              ) : deductions?.filter(d => d.isPreTax)?.length === 0 ? (
                <div className="text-center py-8">
                  <AlertCircle className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No pre-tax deductions</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-2">
                    {deductions?.filter(d => d.isPreTax)?.map((deduction) => (
                      <div key={deduction.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition mobile-flex-col mobile-p-3 mobile-gap-2">
                        <div className="flex-1 mobile-w-full">
                          <p className="font-medium mobile-text-sm">{deductionTypes[deduction.deductionType]}</p>
                          <p className="text-sm text-muted-foreground">${parseFloat(deduction.amount).toFixed(2)}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteDeductionMutation.mutate(deduction.id)}
                          disabled={deleteDeductionMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="posttax">
          <Card>
            <CardContent className="pt-6">
              {isLoading ? (
                <div className="space-y-2 py-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="space-y-1.5 flex-1">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                      <Skeleton className="h-8 w-8 rounded" />
                    </div>
                  ))}
                </div>
              ) : deductions?.filter(d => !d.isPreTax)?.length === 0 ? (
                <div className="text-center py-8">
                  <AlertCircle className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No post-tax deductions</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-2">
                    {deductions?.filter(d => !d.isPreTax)?.map((deduction) => (
                      <div key={deduction.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition mobile-flex-col mobile-p-3 mobile-gap-2">
                        <div className="flex-1 mobile-w-full">
                          <p className="font-medium mobile-text-sm">{deductionTypes[deduction.deductionType]}</p>
                          <p className="text-sm text-muted-foreground">${parseFloat(deduction.amount).toFixed(2)}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteDeductionMutation.mutate(deduction.id)}
                          disabled={deleteDeductionMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </CanvasHubPage>
  );
}
