import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { HeartPulse, AlertTriangle, Play, Square, RefreshCcw, ShieldAlert, Settings, User } from "lucide-react";
import { format } from "date-fns";

export default function WellnessPage() {
  const { toast } = useToast();
  const [isStartDialogOpen, setIsStartDialogOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [interval, setInterval] = useState("30");

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ["/api/wellness/config"],
  });

  const { data: sessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ["/api/wellness/sessions"],
  });

  const { data: overdue, isLoading: overdueLoading } = useQuery({
    queryKey: ["/api/wellness/overdue"],
  });

  const startSessionMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/wellness/sessions", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wellness/sessions"] });
      setIsStartDialogOpen(false);
      setEmployeeId("");
      toast({ title: "Session started", description: "Lone worker safety session is now active." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to start session", description: error.message || "Please try again.", variant: "destructive" });
    },
  });

  const checkinMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/wellness/sessions/\${id}/checkin`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wellness/sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wellness/overdue"] });
      toast({ title: "Check-in successful" });
    },
    onError: (error: any) => {
      toast({ title: "Check-in failed", description: error.message || "Please try again.", variant: "destructive" });
    },
  });

  const sosMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/wellness/sessions/\${id}/sos`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "SOS Triggered", variant: "destructive" });
    },
    onError: (error: any) => {
      toast({ title: "SOS failed to send", description: error.message || "Please try again.", variant: "destructive" });
    },
  });

  const endSessionMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/wellness/sessions/\${id}/end`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wellness/sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wellness/overdue"] });
      toast({ title: "Session ended" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to end session", description: error.message || "Please try again.", variant: "destructive" });
    },
  });

  const activeCount = sessions?.length || 0;
  const overdueCount = overdue?.length || 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <HeartPulse className="h-8 w-8 text-primary" />
          Lone Worker Safety
        </h1>
        <Dialog open={isStartDialogOpen} onOpenChange={setIsStartDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-start-session">
              <Play className="mr-2 h-4 w-4" /> Start Session
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Start Lone Worker Session</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="employee">Employee ID</Label>
                <Input
                  id="employee"
                  data-testid="input-employee-id"
                  placeholder="Enter employee ID"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="interval">Check-in Interval</Label>
                <Select value={interval} onValueChange={setInterval}>
                  <SelectTrigger data-testid="select-interval">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 Minutes</SelectItem>
                    <SelectItem value="30">30 Minutes</SelectItem>
                    <SelectItem value="45">45 Minutes</SelectItem>
                    <SelectItem value="60">60 Minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                data-testid="button-confirm-start"
                onClick={() => startSessionMutation.mutate({ employeeId, checkInIntervalMinutes: parseInt(interval) })}
                disabled={!employeeId || startSessionMutation.isPending}
              >
                {startSessionMutation.isPending ? "Starting..." : "Start Session"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
            <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
            <HeartPulse className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-active-sessions">{activeCount}</div>
          </CardContent>
        </Card>
        <Card className={`hover-elevate \${overdueCount > 0 ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-900/10' : ''}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
            <CardTitle className="text-sm font-medium">Overdue Check-ins</CardTitle>
            <AlertTriangle className={`h-4 w-4 \${overdueCount > 0 ? 'text-amber-500' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold \${overdueCount > 0 ? 'text-amber-500' : ''}`} data-testid="text-overdue-checkins">
              {overdueCount}
            </div>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
            <CardTitle className="text-sm font-medium">SOS Alerts (24h)</CardTitle>
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-sos-alerts">0</div>
          </CardContent>
        </Card>
      </div>

      {overdueCount > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            Overdue Alerts
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {overdue?.map((session: any) => (
              <Card key={session.id} className="border-amber-200 bg-amber-50/30 dark:border-amber-900/30 dark:bg-amber-950/20">
                <CardContent className="pt-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="font-bold text-lg" data-testid={`text-overdue-name-\${session.id}`}>{session.employee_name || 'Unknown Officer'}</div>
                      <div className="text-sm text-muted-foreground">ID: {session.employee_id}</div>
                    </div>
                    <Badge variant="destructive">OVERDUE</Badge>
                  </div>
                  <div className="text-sm mb-4">
                    Due: {format(new Date(session.next_check_in_due), "p")}
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      className="flex-1" 
                      data-testid={`button-checkin-\${session.id}`}
                      onClick={() => checkinMutation.mutate(session.id)}
                    >
                      <RefreshCcw className="mr-2 h-4 w-4" /> Check In
                    </Button>
                    <Button 
                      size="sm" 
                      variant="destructive" 
                      className="flex-1"
                      data-testid={`button-sos-\${session.id}`}
                      onClick={() => sosMutation.mutate(session.id)}
                    >
                      <ShieldAlert className="mr-2 h-4 w-4" /> SOS
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Card className="hover-elevate">
        <CardHeader className="flex flex-row items-center justify-between gap-1">
          <div>
            <CardTitle>Active Safety Sessions</CardTitle>
            <CardDescription>Real-time status of lone workers in the field</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Officer</TableHead>
                <TableHead>Started At</TableHead>
                <TableHead>Last Check-in</TableHead>
                <TableHead>Next Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessionsLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center">Loading sessions...</TableCell></TableRow>
              ) : sessions?.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No active sessions</TableCell></TableRow>
              ) : (
                sessions?.map((session: any) => {
                  const isOverdue = new Date(session.next_check_in_due) < new Date();
                  return (
                    <TableRow key={session.id} data-testid={`row-session-\${session.id}`}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          {session.employee_name || 'Unknown'}
                        </div>
                      </TableCell>
                      <TableCell>{format(new Date(session.created_at), "p")}</TableCell>
                      <TableCell>{session.last_check_in ? format(new Date(session.last_check_in), "p") : "N/A"}</TableCell>
                      <TableCell>{format(new Date(session.next_check_in_due), "p")}</TableCell>
                      <TableCell>
                        <Badge variant={isOverdue ? "destructive" : "outline"} className={!isOverdue ? "text-green-600 border-green-200 bg-green-50" : ""}>
                          {isOverdue ? "Overdue" : "On Time"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            data-testid={`button-row-checkin-\${session.id}`}
                            onClick={() => checkinMutation.mutate(session.id)}
                          >
                            <RefreshCcw className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="text-destructive hover:text-destructive"
                            data-testid={`button-row-end-\${session.id}`}
                            onClick={() => endSessionMutation.mutate(session.id)}
                          >
                            <Square className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="hover-elevate">
        <CardHeader className="flex flex-row items-center justify-between gap-1">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle>Safety Configuration</CardTitle>
              <CardDescription>Global workspace settings for wellness checks</CardDescription>
            </div>
          </div>
          <Button variant="outline" size="sm" data-testid="button-edit-config">Edit</Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <Label className="text-muted-foreground">Default Interval</Label>
              <div className="text-lg font-medium" data-testid="text-config-interval">{config?.default_interval_minutes || 30} Minutes</div>
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground">Escalation Threshold</Label>
              <div className="text-lg font-medium" data-testid="text-config-threshold">{config?.escalation_threshold_minutes || 15} Minutes</div>
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground">Supervisor Notifications</Label>
              <div className="text-lg font-medium" data-testid="text-config-notify">{config?.supervisor_notification_enabled !== false ? "Enabled" : "Disabled"}</div>
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground">Emergency Contact Protocol</Label>
              <div className="text-lg font-medium" data-testid="text-config-emergency">{config?.emergency_contact_enabled ? "Enabled" : "Disabled"}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
