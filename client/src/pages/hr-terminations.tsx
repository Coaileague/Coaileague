import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserX, AlertTriangle, CheckSquare, Plus, XCircle } from "lucide-react";
import ModernLayout from "@/components/ModernLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const terminationSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  terminationType: z.enum(['voluntary', 'involuntary', 'retirement', 'layoff']),
  terminationDate: z.string().min(1, "Termination date is required"),
  reason: z.string().min(1, "Reason is required"),
  exitInterviewNotes: z.string().optional(),
  finalPayAmount: z.string().optional(),
  assetsToRecover: z.string().optional(),
});

type TerminationFormData = z.infer<typeof terminationSchema>;

interface Termination {
  id: number;
  employeeId: string;
  employeeName: string;
  terminationType: string;
  terminationDate: string;
  reason: string;
  status: string;
  exitInterviewNotes: string | null;
  finalPayAmount: number | null;
  assetsToRecover: string | null;
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
}

export default function HRTerminations() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: terminations, isLoading } = useQuery<Termination[]>({
    queryKey: ['/api/hr/terminations'],
  });

  const { data: employees } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: TerminationFormData) => {
      return apiRequest('POST', '/api/hr/terminations', {
        ...data,
        finalPayAmount: data.finalPayAmount ? parseFloat(data.finalPayAmount) : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hr/terminations'] });
      setDialogOpen(false);
      form.reset();
      toast({
        title: "Success",
        description: "Termination record created successfully",
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

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      return apiRequest('PATCH', `/api/hr/terminations/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hr/terminations'] });
      toast({
        title: "Success",
        description: "Status updated successfully",
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

  const form = useForm<TerminationFormData>({
    resolver: zodResolver(terminationSchema),
    defaultValues: {
      employeeId: "",
      terminationType: "voluntary",
      terminationDate: "",
      reason: "",
      exitInterviewNotes: "",
      finalPayAmount: "",
      assetsToRecover: "",
    },
  });

  const onSubmit = (data: TerminationFormData) => {
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

  const initiatedCount = terminations?.filter(t => t.status === 'initiated').length || 0;
  const processingCount = terminations?.filter(t => t.status === 'processing').length || 0;
  const completedCount = terminations?.filter(t => t.status === 'completed').length || 0;

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      initiated: "secondary",
      processing: "outline",
      completed: "default",
    };
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  const getTypeBadge = (type: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      voluntary: "default",
      involuntary: "destructive",
      retirement: "secondary",
      layoff: "outline",
    };
    return <Badge variant={variants[type] || "outline"}>{type}</Badge>;
  };

  return (
    <ModernLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-1" data-testid="heading-terminations">Employee Terminations</h2>
              <p className="text-sm sm:text-base text-muted-foreground">
                Manage offboarding and exit processes
              </p>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-termination">
                  <Plus className="h-4 w-4 mr-2" />
                  New Termination
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create Termination Record</DialogTitle>
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

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="terminationType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Termination Type</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-termination-type">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="voluntary">Voluntary</SelectItem>
                                <SelectItem value="involuntary">Involuntary</SelectItem>
                                <SelectItem value="retirement">Retirement</SelectItem>
                                <SelectItem value="layoff">Layoff</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="terminationDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Termination Date</FormLabel>
                            <FormControl>
                              <Input {...field} type="date" data-testid="input-termination-date" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="reason"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Reason</FormLabel>
                          <FormControl>
                            <Textarea {...field} rows={3} data-testid="input-reason" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="exitInterviewNotes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Exit Interview Notes (Optional)</FormLabel>
                          <FormControl>
                            <Textarea {...field} rows={3} data-testid="input-exit-notes" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="finalPayAmount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Final Pay Amount (Optional)</FormLabel>
                            <FormControl>
                              <Input {...field} type="number" step="0.01" placeholder="0.00" data-testid="input-final-pay" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="assetsToRecover"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Assets to Recover (Optional)</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Laptop, keys, badge" data-testid="input-assets" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                      <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-termination">
                        {createMutation.isPending ? "Creating..." : "Create Termination"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card data-testid="card-initiated">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Initiated</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-initiated-count">{initiatedCount}</div>
                <p className="text-xs text-muted-foreground mt-1">New terminations</p>
              </CardContent>
            </Card>

            <Card data-testid="card-processing">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Processing</CardTitle>
                <CheckSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-processing-count">{processingCount}</div>
                <p className="text-xs text-muted-foreground mt-1">In progress</p>
              </CardContent>
            </Card>

            <Card data-testid="card-completed">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Completed</CardTitle>
                <UserX className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-completed-count">{completedCount}</div>
                <p className="text-xs text-muted-foreground mt-1">Offboarded</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Termination Records</CardTitle>
            </CardHeader>
            <CardContent>
              {!terminations || terminations.length === 0 ? (
                <div className="text-center py-12">
                  <XCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No termination records found</p>
                  <p className="text-sm text-muted-foreground mt-1">Create your first record to get started</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {terminations.map((termination) => (
                    <div 
                      key={termination.id} 
                      className="flex items-center justify-between gap-4 p-4 rounded-lg border bg-card hover-elevate"
                      data-testid={`termination-${termination.id}`}
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className="p-2 rounded-lg bg-destructive/10">
                          <UserX className="h-4 w-4 text-destructive" />
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold">{termination.employeeName}</div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {format(new Date(termination.terminationDate), 'MMM d, yyyy')}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1 line-clamp-1">
                            {termination.reason}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex gap-2">
                          {getTypeBadge(termination.terminationType)}
                          {getStatusBadge(termination.status)}
                        </div>
                        {termination.status !== 'completed' && (
                          <Select 
                            value={termination.status}
                            onValueChange={(value) => updateStatusMutation.mutate({ id: termination.id, status: value })}
                          >
                            <SelectTrigger className="w-32" data-testid={`select-status-${termination.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="initiated">Initiated</SelectItem>
                              <SelectItem value="processing">Processing</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
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
