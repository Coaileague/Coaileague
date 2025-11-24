import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Trash2, Plus, AlertTriangle, CheckCircle, AlertCircle, Scale } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { garnishmentTypesConfig, priorityConfig, payrollMessages } from "@/config/payrollConfig";

const garnishmentSchema = z.object({
  employeeId: z.string().min(1, "Employee required"),
  payrollEntryId: z.string().min(1, "Payroll entry required"),
  garnishmentType: z.enum(['child_support', 'alimony', 'taxes', 'student_loans', 'court_order', 'other']),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Valid amount required"),
  priority: z.string().regex(/^\d+$/, "Priority must be a number"),
  caseNumber: z.string().optional(),
  description: z.string().optional(),
});

type GarnishmentFormData = z.infer<typeof garnishmentSchema>;

// Extract labels from config
const garnishmentTypes = Object.entries(garnishmentTypesConfig).reduce((acc, [key, config]) => {
  acc[key] = config.label;
  return acc;
}, {} as Record<string, string>);

export default function PayrollGarnishmentsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Fetch payroll entries
  const { data: payrollEntries, isLoading: loadingEntries } = useQuery<any[]>({
    queryKey: ['/api/payroll/entries'],
    enabled: !!user,
  });

  // Fetch employees
  const { data: employees, isLoading: loadingEmployees } = useQuery<any[]>({
    queryKey: ['/api/employees'],
    enabled: !!user,
  });

  // Fetch garnishments
  const { data: garnishments, isLoading: loadingGarnishments, refetch } = useQuery<any[]>({
    queryKey: ['/api/payroll/garnishments'],
    enabled: !!user && !!payrollEntries?.length,
  });

  const form = useForm<GarnishmentFormData>({
    resolver: zodResolver(garnishmentSchema),
    defaultValues: {
      garnishmentType: 'child_support',
      priority: '1',
    },
  });

  const addGarnishmentMutation = useMutation({
    mutationFn: async (data: GarnishmentFormData) => {
      const response = await apiRequest(
        `POST`,
        `/api/payroll/garnishments/${data.payrollEntryId}`,
        {
          employeeId: data.employeeId,
          garnishmentType: data.garnishmentType,
          amount: data.amount,
          priority: parseInt(data.priority),
          caseNumber: data.caseNumber,
          description: data.description,
        }
      );
      return response;
    },
    onSuccess: () => {
      toast({ title: "✓ Garnishment Added", description: payrollMessages.garnishments.addSuccess });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/garnishments'] });
      setDialogOpen(false);
      form.reset();
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "✗ Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteGarnishmentMutation = useMutation({
    mutationFn: async (garnishmentId: string) => {
      return await apiRequest('DELETE', `/api/payroll/garnishments/${garnishmentId}`, {});
    },
    onSuccess: () => {
      toast({ title: "✓ Garnishment Removed", description: payrollMessages.garnishments.deleteConfirm });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/garnishments'] });
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "✗ Error", description: error.message, variant: "destructive" });
    },
  });

  const isLoading = loadingEntries || loadingEmployees || loadingGarnishments;
  const totalGarnishments = garnishments?.reduce((sum, g) => sum + parseFloat(g.amount || 0), 0) || 0;

  // Sort by priority (lower = higher priority)
  const sortedGarnishments = [...(garnishments || [])].sort((a, b) => (a.priority || 999) - (b.priority || 999));

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{payrollMessages.garnishments.title}</h1>
          <p className="text-muted-foreground mt-2">{payrollMessages.garnishments.description}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-add-garnishment">
              <Plus className="w-4 h-4" />
              {payrollMessages.garnishments.addButton}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{payrollMessages.garnishments.addDialogTitle}</DialogTitle>
              <DialogDescription>{payrollMessages.garnishments.addDialogDescription}</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => addGarnishmentMutation.mutate(data))} className="space-y-4">
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
                  name="garnishmentType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Garnishment Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-garnishment-type">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(garnishmentTypes).map(([key, label]) => (
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
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-priority">
                            <SelectValue placeholder="Select priority" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(priorityConfig).map(([key, config]) => (
                            <SelectItem key={key} value={key} data-testid={`option-priority-${key}`}>
                              {key} - {config.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>Lower numbers are deducted first</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="caseNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Case Number (Optional)</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Court case reference" 
                          {...field}
                          data-testid="input-case-number"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={addGarnishmentMutation.isPending}
                  data-testid="button-submit-garnishment"
                >
                  {addGarnishmentMutation.isPending ? "Adding..." : "Add Garnishment"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="w-5 h-5" />
            Active Garnishments
          </CardTitle>
          <CardDescription>
            Total Garnishments: ${totalGarnishments.toFixed(2)} ({sortedGarnishments.length} active)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading garnishments...</div>
          ) : sortedGarnishments.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">No garnishments on file</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-900 dark:text-amber-100">Legal Compliance Notice</p>
                  <p className="text-amber-800 dark:text-amber-200 mt-1">Garnishments are processed in priority order. Failure to comply with court orders may result in penalties.</p>
                </div>
              </div>

              <div className="space-y-3 mt-4">
                {sortedGarnishments.map((garnishment) => (
                  <div 
                    key={garnishment.id} 
                    className="border rounded-lg p-4 hover:bg-muted/50 transition space-y-2"
                    data-testid={`card-garnishment-${garnishment.id}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-semibold flex items-center gap-2">
                          {garnishmentTypes[garnishment.garnishmentType]}
                          {garnishment.priority <= 1 && (
                            <AlertTriangle className="w-4 h-4 text-red-500" />
                          )}
                        </p>
                        {garnishment.caseNumber && (
                          <p className="text-sm text-muted-foreground">Case: {garnishment.caseNumber}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold">${parseFloat(garnishment.amount).toFixed(2)}</p>
                        <Badge variant={garnishment.priority <= 1 ? "destructive" : "secondary"}>
                          Priority {garnishment.priority}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t">
                      <p className="text-xs text-muted-foreground">{priorityConfig[garnishment.priority as keyof typeof priorityConfig]?.label || `Priority ${garnishment.priority}`}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteGarnishmentMutation.mutate(garnishment.id)}
                        disabled={deleteGarnishmentMutation.isPending}
                        data-testid={`button-delete-garnishment-${garnishment.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
