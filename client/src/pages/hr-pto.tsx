import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Clock, CheckCircle2, XCircle, Plus, AlertCircle } from "lucide-react";
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

const ptoSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  requestType: z.enum(['vacation', 'sick', 'personal', 'bereavement', 'other']),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  reason: z.string().min(1, "Reason is required"),
});

type PTOFormData = z.infer<typeof ptoSchema>;

interface PTORequest {
  id: number;
  employeeId: string;
  employeeName: string;
  requestType: string;
  startDate: string;
  endDate: string;
  daysRequested: number;
  status: string;
  reason: string;
  approvedBy: string | null;
  denialReason: string | null;
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
}

export default function HRPTO() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<PTORequest | null>(null);

  const { data: ptoRequests, isLoading } = useQuery<PTORequest[]>({
    queryKey: ['/api/hr/pto'],
  });

  const { data: employees } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: PTOFormData) => {
      return apiRequest('POST', '/api/hr/pto', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hr/pto'] });
      setDialogOpen(false);
      form.reset();
      toast({
        title: "Success",
        description: "PTO request created successfully",
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

  const approveMutation = useMutation({
    mutationFn: async ({ id, approved }: { id: number; approved: boolean }) => {
      return apiRequest('POST', `/api/hr/pto/${id}/approve`, { approved });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hr/pto'] });
      setApproveDialogOpen(false);
      setSelectedRequest(null);
      toast({
        title: "Success",
        description: "PTO request updated successfully",
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

  const form = useForm<PTOFormData>({
    resolver: zodResolver(ptoSchema),
    defaultValues: {
      employeeId: "",
      requestType: "vacation",
      startDate: "",
      endDate: "",
      reason: "",
    },
  });

  const onSubmit = (data: PTOFormData) => {
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

  const pendingCount = ptoRequests?.filter(r => r.status === 'pending').length || 0;
  const approvedCount = ptoRequests?.filter(r => r.status === 'approved').length || 0;
  const totalDaysRequested = ptoRequests?.reduce((sum, r) => sum + r.daysRequested, 0) || 0;

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      approved: "default",
      pending: "secondary",
      denied: "destructive",
    };
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  const getRequestIcon = (type: string) => {
    return <Calendar className="h-4 w-4" />;
  };

  return (
    <ModernLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-1" data-testid="heading-pto">PTO Management</h2>
              <p className="text-sm sm:text-base text-muted-foreground">
                Manage vacation and time-off requests
              </p>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-pto">
                  <Plus className="h-4 w-4 mr-2" />
                  New Request
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create PTO Request</DialogTitle>
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
                      name="requestType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Request Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-request-type">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="vacation">Vacation</SelectItem>
                              <SelectItem value="sick">Sick Leave</SelectItem>
                              <SelectItem value="personal">Personal</SelectItem>
                              <SelectItem value="bereavement">Bereavement</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="startDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Start Date</FormLabel>
                            <FormControl>
                              <Input {...field} type="date" data-testid="input-start-date" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="endDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>End Date</FormLabel>
                            <FormControl>
                              <Input {...field} type="date" data-testid="input-end-date" />
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

                    <div className="flex justify-end gap-3 pt-4">
                      <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-pto">
                        {createMutation.isPending ? "Creating..." : "Create Request"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card data-testid="card-pending">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending Requests</CardTitle>
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-pending-count">{pendingCount}</div>
                <p className="text-xs text-muted-foreground mt-1">Awaiting approval</p>
              </CardContent>
            </Card>

            <Card data-testid="card-approved">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Approved</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-approved-count">{approvedCount}</div>
                <p className="text-xs text-muted-foreground mt-1">This period</p>
              </CardContent>
            </Card>

            <Card data-testid="card-total-days">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Days</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-days">{totalDaysRequested}</div>
                <p className="text-xs text-muted-foreground mt-1">Requested</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>PTO Requests</CardTitle>
            </CardHeader>
            <CardContent>
              {!ptoRequests || ptoRequests.length === 0 ? (
                <div className="text-center py-12">
                  <XCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No PTO requests found</p>
                  <p className="text-sm text-muted-foreground mt-1">Create your first request to get started</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {ptoRequests.map((request) => (
                    <div 
                      key={request.id} 
                      className="flex items-center justify-between gap-4 p-4 rounded-lg border bg-card hover-elevate"
                      data-testid={`pto-${request.id}`}
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className="p-2 rounded-lg bg-primary/10">
                          {getRequestIcon(request.requestType)}
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold">{request.employeeName}</div>
                          <div className="text-sm text-muted-foreground">
                            {request.requestType.charAt(0).toUpperCase() + request.requestType.slice(1)} • {request.daysRequested} day{request.daysRequested !== 1 ? 's' : ''}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {format(new Date(request.startDate), 'MMM d')} - {format(new Date(request.endDate), 'MMM d, yyyy')}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {getStatusBadge(request.status)}
                        {request.status === 'pending' && (
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => approveMutation.mutate({ id: request.id, approved: false })}
                              data-testid={`button-deny-${request.id}`}
                            >
                              Deny
                            </Button>
                            <Button 
                              size="sm"
                              onClick={() => approveMutation.mutate({ id: request.id, approved: true })}
                              data-testid={`button-approve-${request.id}`}
                            >
                              Approve
                            </Button>
                          </div>
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
