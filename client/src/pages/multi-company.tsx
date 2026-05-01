import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Building2, 
  Users, 
  UsersRound, 
  ClipboardList, 
  Plus, 
  Send, 
  Trash2,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  FileText
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Link } from "wouter";

interface Subsidiary {
  relationship_id: string;
  relationship_type: string;
  created_at: string;
  workspace_id: string;
  name: string;
  config: any;
}

interface ConsolidatedMetric {
  workspaceId: string;
  workspaceName: string;
  officerCount: number;
  clientCount: number;
  openShiftCount: number;
}

interface OfficerPoolEntry {
  id: string;
  name: string;
  email: string;
  phone: string;
  workspace_name: string;
}

export default function MultiCompanyPage() {
  const { toast } = useToast();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const { data: subsidiaries, isLoading: loadingSubs } = useQuery<Subsidiary[]>({
    queryKey: ["/api/multi-company/subsidiaries"],
  });

  const { data: dashboardMetrics, isLoading: loadingMetrics } = useQuery<ConsolidatedMetric[]>({
    queryKey: ["/api/multi-company/consolidated/dashboard"],
  });

  const { data: officerPool, isLoading: loadingPool } = useQuery<OfficerPoolEntry[]>({
    queryKey: ["/api/multi-company/officer-pool"],
  });

  const addSubsidiaryMutation = useMutation({
    mutationFn: async (values) => {
      await apiRequest("POST", "/api/multi-company/relationships", values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/multi-company/subsidiaries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/multi-company/consolidated/dashboard"] });
      setIsAddModalOpen(false);
      toast({ title: "Subsidiary added successfully" });
    },
    onError: (error) => {
      toast({ title: "Failed to add subsidiary", description: error.message || "Please try again.", variant: "destructive" });
    },
  });

  const removeSubsidiaryMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/multi-company/relationships/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/multi-company/subsidiaries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/multi-company/consolidated/dashboard"] });
      toast({ title: "Subsidiary removed" });
    },
    onError: (error) => {
      toast({ title: "Failed to remove subsidiary", description: error.message || "Please try again.", variant: "destructive" });
    },
  });

  const broadcastMutation = useMutation({
    mutationFn: async (values) => {
      await apiRequest("POST", "/api/multi-company/policy/broadcast", values);
    },
    onSuccess: (data) => {
      toast({ title: "Policy broadcast initiated", description: `Sent to ${data.subsidiaryCount} subsidiaries` });
    },
    onError: (error) => {
      toast({ title: "Failed to broadcast policy", description: error.message || "Please try again.", variant: "destructive" });
    },
  });

  const form = useForm({
    defaultValues: {
      childWorkspaceId: "",
      relationshipType: "subsidiary",
    },
  });

  const broadcastForm = useForm({
    defaultValues: {
      policyType: "safety",
      description: "",
      subsidiaries: subsidiaries?.map(s => s.workspace_id) || [],
    },
  });

  const totalOfficers = dashboardMetrics?.reduce((acc, m) => acc + m.officerCount, 0) || 0;
  const totalClients = dashboardMetrics?.reduce((acc, m) => acc + m.clientCount, 0) || 0;
  const totalOpenShifts = dashboardMetrics?.reduce((acc, m) => acc + m.openShiftCount, 0) || 0;

  return (
    <div className="container mx-auto p-6 space-y-8 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Building2 className="h-8 w-8 text-primary" />
            Multi-Company Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Oversee subsidiaries, franchises, and shared officer pools across your organization network.
          </p>
        </div>
        <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-subsidiary" className="hover-elevate active-elevate-2">
              <Plus className="mr-2 h-4 w-4" />
              Add Subsidiary
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Workspace Relationship</DialogTitle>
              <DialogDescription>
                Link another workspace to your organization as a subsidiary or franchise.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((v) => addSubsidiaryMutation.mutate(v))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="childWorkspaceId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Workspace ID</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter workspace UUID" {...field} data-testid="input-workspace-id" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="relationshipType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Relationship Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-relationship-type">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="subsidiary">Subsidiary</SelectItem>
                          <SelectItem value="franchise">Franchise</SelectItem>
                          <SelectItem value="partner">Partner</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={addSubsidiaryMutation.isPending} data-testid="button-submit-relationship">
                    {addSubsidiaryMutation.isPending ? "Adding..." : "Add Relationship"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
                  {(subsidiaries?.length || 0) > 0 ? "Network linked" : "Network setup in progress"}
                </Badge>
              </div>
              <h2 className="mt-3 text-xl font-semibold text-foreground">Build a real operating network</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                This page becomes most useful after subsidiaries are linked and officer data starts flowing. Until then, we show honest readiness signals and the next real action instead of filler data.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:w-[420px]">
              <div className="rounded-lg border border-border/80 bg-background/80 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Linked workspaces</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{subsidiaries?.length || 0}</p>
                <p className="mt-1 text-xs text-muted-foreground">Subsidiaries, franchises, or partners</p>
              </div>
              <div className="rounded-lg border border-border/80 bg-background/80 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Shared officers</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{officerPool?.length || 0}</p>
                <p className="mt-1 text-xs text-muted-foreground">Visible in the network pool</p>
              </div>
              <div className="rounded-lg border border-border/80 bg-background/80 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Next move</p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {(subsidiaries?.length || 0) === 0 ? "Link a subsidiary workspace" : "Publish shared policy guidance"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Subsidiaries</p>
                <h3 className="text-2xl font-bold" data-testid="text-subsidiary-count">{subsidiaries?.length || 0}</h3>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-primary/10 rounded-lg">
                <UsersRound className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Network Officers</p>
                <h3 className="text-2xl font-bold" data-testid="text-total-officers">{totalOfficers}</h3>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Clients</p>
                <h3 className="text-2xl font-bold" data-testid="text-total-clients">{totalClients}</h3>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-primary/10 rounded-lg">
                <ClipboardList className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Open Shifts</p>
                <h3 className="text-2xl font-bold" data-testid="text-total-open-shifts">{totalOpenShifts}</h3>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Subsidiary Grid */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Subsidiary Performance
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {loadingMetrics ? (
              Array(4).fill(0).map((_, i) => (
                <Card key={i} className="animate-pulse bg-slate-100 h-48" />
              ))
            ) : dashboardMetrics && dashboardMetrics.length > 0 ? (
              dashboardMetrics?.map((metric) => (
                <Card key={metric.workspaceId} className="hover-elevate transition-all border-l-4 border-l-primary" data-testid={`card-subsidiary-${metric.workspaceId}`}>
                  <CardHeader className="flex flex-row items-center justify-between pb-2 gap-2">
                    <CardTitle className="text-lg font-bold">{metric.workspaceName || metric.workspaceId}</CardTitle>
                    <Badge variant="outline" className="capitalize">
                      {subsidiaries?.find(s => s.workspace_id === metric.workspaceId)?.relationship_type || 'Subsidiary'}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded">
                        <p className="text-xs text-muted-foreground">Officers</p>
                        <p className="font-bold">{metric.officerCount}</p>
                      </div>
                      <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded">
                        <p className="text-xs text-muted-foreground">Clients</p>
                        <p className="font-bold">{metric.clientCount}</p>
                      </div>
                      <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded">
                        <p className="text-xs text-muted-foreground">Gaps</p>
                        <p className={`font-bold ${metric.openShiftCount > 0 ? 'text-red-500' : 'text-green-500'}`}>
                          {metric.openShiftCount}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="flex justify-between border-t pt-4">
                    <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => {
                      const rel = subsidiaries?.find(s => s.workspace_id === metric.workspaceId);
                      if (rel) removeSubsidiaryMutation.mutate(rel.relationship_id);
                    }} data-testid={`button-remove-${metric.workspaceId}`}>
                      <Trash2 className="h-4 w-4 mr-1" />
                      Unlink
                    </Button>
                    <Button variant="outline" size="sm" asChild className="hover-elevate">
                      <Link href={`/workspace?id=${metric.workspaceId}`}>
                        <ExternalLink className="h-4 w-4 mr-1" />
                        View
                      </Link>
                    </Button>
                  </CardFooter>
                </Card>
              ))
            ) : (
              <Card className="md:col-span-2 border-dashed border-primary/30 bg-primary/5">
                <CardContent className="py-10 text-center">
                  <TrendingUp className="h-10 w-10 text-primary mx-auto mb-4" />
                  <h3 className="text-lg font-semibold">No subsidiaries linked yet</h3>
                  <p className="text-sm text-muted-foreground max-w-xl mx-auto mt-2">
                    Link a subsidiary, franchise, or partner workspace to see network staffing, client counts, and open shift exposure here.
                  </p>
                  <Button className="mt-4" onClick={() => setIsAddModalOpen(true)} data-testid="button-add-first-subsidiary">
                    <Plus className="mr-2 h-4 w-4" />
                    Add First Subsidiary
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Officer Pool */}
          <div className="pt-4 space-y-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <UsersRound className="h-5 w-5 text-primary" />
              Shared Officer Pool
            </h2>
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Officer Name</TableHead>
                    <TableHead>Subsidiary</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingPool ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-10 text-center">
                        <div className="space-y-2">
                          <p className="font-medium text-foreground">Loading shared officer pool</p>
                          <p className="text-sm text-muted-foreground">
                            Pulling officers from linked workspaces and cross-company access rules.
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : officerPool?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-10">
                        <div className="text-center">
                          <UsersRound className="h-8 w-8 text-primary/70 mx-auto mb-3" />
                          <p className="font-medium">No shared officers available yet</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            Shared coverage appears here after linked subsidiaries have active officers and workspace relationships in place.
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    officerPool?.map((officer) => (
                      <TableRow key={officer.id} data-testid={`row-officer-${officer.id}`}>
                        <TableCell className="font-medium">{officer.name}</TableCell>
                        <TableCell>{officer.workspace_name}</TableCell>
                        <TableCell className="text-xs">
                          {officer.email}<br/>{officer.phone}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" className="h-8 hover-elevate" asChild>
                            <Link href="/schedule">Open Schedule</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          </div>
        </div>

        {/* Policy Broadcast */}
        <div className="space-y-6">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5 text-primary" />
                Network Policy Broadcast
              </CardTitle>
              <CardDescription>
                Push updated policies or safety bulletins to all subsidiary workspaces.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...broadcastForm}>
                <form onSubmit={broadcastForm.handleSubmit((v) => broadcastMutation.mutate(v))} className="space-y-4">
                  <FormField
                    control={broadcastForm.control}
                    name="policyType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Policy Category</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-policy-type">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="safety">Safety Bulletin</SelectItem>
                            <SelectItem value="hr">HR Policy</SelectItem>
                            <SelectItem value="operational">Operational Directive</SelectItem>
                            <SelectItem value="compliance">Compliance Update</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={broadcastForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Message / Description</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Detail the policy change..." 
                            className="min-h-[120px]" 
                            {...field} 
                            data-testid="textarea-policy-description"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <Button 
                    type="submit" 
                    className="w-full hover-elevate active-elevate-2" 
                    disabled={broadcastMutation.isPending || !subsidiaries?.length}
                    data-testid="button-broadcast-policy"
                  >
                    {broadcastMutation.isPending ? "Sending..." : "Broadcast to Network"}
                  </Button>
                  {!(subsidiaries?.length) && (
                    <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                      Link at least one subsidiary before broadcasting shared policies. This keeps the action honest and prevents a dead send button.
                    </div>
                  )}
                </form>
              </Form>
            </CardContent>
            <CardFooter className="bg-slate-50 dark:bg-slate-900 text-xs text-muted-foreground p-4">
              <p>Recipients: {subsidiaries?.length || 0} organizations will be notified.</p>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Recent Network Reports
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 p-4">
                <p className="text-sm font-medium">No network reports generated yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  This panel will show real consolidated reports once report generation is wired for multi-company networks. No sample or placeholder reports are being shown here.
                </p>
                <Button variant="outline" size="sm" className="mt-3" asChild>
                  <Link href="/analytics">
                    Open Analytics
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
