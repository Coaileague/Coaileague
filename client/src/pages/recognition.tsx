import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Award, Users, Star, Calendar, Check, X, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { apiFetch, AnyResponse } from "@/lib/apiError";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";

const nominationSchema = z.object({
  nomineeId: z.string().min(1, "Please select an officer"),
  awardType: z.string().min(1, "Please select an award type"),
  reason: z.string().min(10, "Reason must be at least 10 characters"),
});

type NominationFormValues = z.infer<typeof nominationSchema>;

export default function RecognitionPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isNominateModalOpen, setIsNominateModalOpen] = useState(false);
  const employeeId = (user as any)?.employeeId as string | undefined;

  const { data: awards, isLoading: isLoadingAwards } = useQuery<any[]>({
    queryKey: ["/api/recognition/wall"],
  });

  const { data: nominations, isLoading: isLoadingNominations } = useQuery<any[]>({
    queryKey: ["/api/recognition/pending"],
  });

  const { data: milestones, isLoading: isLoadingMilestones } = useQuery<any[]>({
    queryKey: ["/api/recognition/milestones"],
  });

  const { data: employees } = useQuery<any[]>({
    queryKey: ["/api/employees"],
  });

  const { data: myAwards, isLoading: isLoadingMyAwards } = useQuery<any[]>({
    queryKey: ["/api/recognition/officer", employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const response = await apiFetch(`/api/recognition/officer/${employeeId}`, AnyResponse);
      return Array.isArray(response) ? response : [];
    },
  });

  const nominateMutation = useMutation({
    mutationFn: async (values: NominationFormValues) => {
      const res = await apiRequest("POST", "/api/recognition/nominations", values);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recognition/pending"] });
      toast({ title: "Nomination submitted", description: "Your nomination has been sent for review." });
      setIsNominateModalOpen(false);
    },
    onError: (error) => {
      toast({ title: "Failed to submit nomination", description: error.message || "Please try again.", variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/recognition/nominations/${id}/approve`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recognition/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recognition/wall"] });
      toast({ title: "Nomination approved", description: "The officer has been recognized." });
    },
    onError: (error) => {
      toast({ title: "Failed to approve nomination", description: error.message || "Please try again.", variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await apiRequest("PATCH", `/api/recognition/nominations/${id}/reject`, { reason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recognition/pending"] });
      toast({ title: "Nomination rejected" });
    },
    onError: (error) => {
      toast({ title: "Failed to reject nomination", description: error.message || "Please try again.", variant: "destructive" });
    },
  });

  const form = useForm<NominationFormValues>({
    resolver: zodResolver(nominationSchema),
    defaultValues: {
      nomineeId: "",
      awardType: "",
      reason: "",
    },
  });

  const onSubmit = (values: NominationFormValues) => {
    nominateMutation.mutate(values);
  };

  const getEmployeeDisplayName = (employee) => {
    if (!employee) return "Unknown Officer";
    const fullName = [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim();
    return fullName || employee.fullName || employee.fullLegalName || employee.name || employee.email || employee.id || "Unknown Officer";
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-primary">Recognition & Awards</h1>
          <p className="text-muted-foreground">Celebrate excellence and build a culture of appreciation.</p>
        </div>
        <Dialog open={isNominateModalOpen} onOpenChange={setIsNominateModalOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-nominate">
              <Plus className="mr-2 h-4 w-4" /> Nominate Officer
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nominate an Officer</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="nomineeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Officer</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select an officer" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {employees?.map((emp) => (
                            <SelectItem key={emp.id} value={emp.id}>
                              {getEmployeeDisplayName(emp)}
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
                  name="awardType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Award Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select award type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="officer_of_month">Officer of the Month</SelectItem>
                          <SelectItem value="perfect_attendance">Perfect Attendance</SelectItem>
                          <SelectItem value="client_commendation">Client Commendation</SelectItem>
                          <SelectItem value="life_saver">Life Saver</SelectItem>
                          <SelectItem value="above_and_beyond">Above and Beyond</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reason for Nomination</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="Describe why this officer deserves recognition..." />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={nominateMutation.isPending} data-testid="button-submit-nomination">
                    Submit Nomination
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="wall" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-4">
          <TabsTrigger value="wall">Wall</TabsTrigger>
          <TabsTrigger value="nominations">Pending</TabsTrigger>
          <TabsTrigger value="my">My Awards</TabsTrigger>
          <TabsTrigger value="milestones">Milestones</TabsTrigger>
        </TabsList>

        <TabsContent value="wall" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {awards?.map((award) => (
              <Card key={award.id} className="hover-elevate">
                <CardHeader className="flex flex-row items-center gap-4 space-y-0">
                  <Avatar>
                    <AvatarImage src={award.avatar_url} />
                    <AvatarFallback>{award.officer_name?.substring(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <CardTitle className="text-lg">{award.officer_name}</CardTitle>
                    <Badge variant="secondary" className="w-fit mt-1">
                      {award.award_type.replace(/_/g, " ").toUpperCase()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground italic">"{award.reason}"</p>
                  <div className="mt-4 flex items-center text-xs text-muted-foreground">
                    <Calendar className="mr-1 h-3 w-3" />
                    {format(new Date(award.created_at), "MMM d, yyyy")}
                  </div>
                </CardContent>
              </Card>
            ))}
            {awards?.length === 0 && (
              <div className="col-span-full py-12 text-center text-muted-foreground">
                No awards published yet. Be the first to nominate someone!
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="nominations" className="mt-6">
          <div className="space-y-4">
            {nominations?.map((nom) => (
              <Card key={nom.id} className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 gap-4">
                <div className="flex items-center gap-4">
                  <div className="bg-primary/10 p-3 rounded-full">
                    <Trophy className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{nom.nominee_name}</h3>
                    <div className="flex gap-2 items-center">
                      <Badge variant="outline">{nom.award_type.replace(/_/g, " ")}</Badge>
                      <span className="text-xs text-muted-foreground">Nominated by {nom.nominator_name}</span>
                    </div>
                    <p className="text-sm mt-2 text-muted-foreground">{nom.reason}</p>
                  </div>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1 md:flex-none border-green-500 text-green-500 hover:bg-green-50"
                    onClick={() => approveMutation.mutate(nom.id)}
                    disabled={approveMutation.isPending}
                    data-testid={`button-approve-${nom.id}`}
                  >
                    <Check className="mr-1 h-4 w-4" /> Approve
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1 md:flex-none border-red-500 text-red-500 hover:bg-red-50"
                    onClick={() => {
                      const reason = prompt("Reason for rejection:");
                      if (reason !== null) rejectMutation.mutate({ id: nom.id, reason });
                    }}
                    disabled={rejectMutation.isPending}
                    data-testid={`button-reject-${nom.id}`}
                  >
                    <X className="mr-1 h-4 w-4" /> Reject
                  </Button>
                </div>
              </Card>
            ))}
            {nominations?.length === 0 && (
              <div className="py-12 text-center text-muted-foreground">
                No pending nominations.
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="my" className="mt-6">
          {!employeeId ? (
            <div className="py-12 text-center text-muted-foreground">
              This account does not have an employee profile linked yet, so personal awards cannot be shown here.
            </div>
          ) : isLoadingMyAwards ? (
            <div className="py-12 text-center text-muted-foreground">
              Loading your awards...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myAwards?.map((award) => (
                <Card key={award.id} className="hover-elevate">
                  <CardHeader className="flex flex-row items-center gap-4 space-y-0">
                    <Avatar>
                      <AvatarImage src={award.avatar_url} />
                      <AvatarFallback>{award.officer_name?.substring(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <CardTitle className="text-lg">{award.officer_name}</CardTitle>
                      <Badge variant="secondary" className="w-fit mt-1">
                        {award.award_type.replace(/_/g, " ").toUpperCase()}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground italic">"{award.reason}"</p>
                    <div className="mt-4 flex items-center text-xs text-muted-foreground">
                      <Calendar className="mr-1 h-3 w-3" />
                      {format(new Date(award.created_at), "MMM d, yyyy")}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {myAwards?.length === 0 && (
                <div className="col-span-full py-12 text-center text-muted-foreground">
                  No awards have been assigned to your employee profile yet.
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="milestones" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {milestones?.map((m) => (
              <Card key={m.id}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Star className="h-5 w-5 text-yellow-500" />
                    {m.name}
                  </CardTitle>
                  <CardDescription>
                    Work Anniversary: {format(new Date(m.hire_date), "MMMM d")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Badge variant="secondary">
                    {m.years_at_company} {m.years_at_company === 1 ? 'Year' : 'Years'} of Service
                  </Badge>
                </CardContent>
              </Card>
            ))}
            {milestones?.length === 0 && (
              <div className="col-span-full py-12 text-center text-muted-foreground">
                No upcoming anniversaries in the next 30 days.
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
