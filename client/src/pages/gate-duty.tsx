import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Card, CardContent, CardHeader, CardTitle, CardDescription 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter 
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { 
  DoorOpen, Car, Users, ShieldAlert, CheckCircle2, 
  Plus, LogOut, Flag, AlertTriangle, Play 
} from "lucide-react";
import { format } from "date-fns";

export default function GateDutyPage() {
  const { toast } = useToast();
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [isPersonnelModalOpen, setIsPersonnelModalOpen] = useState(false);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);

  // Queries
  const { data: stats } = useQuery<any>({ queryKey: ["/api/gate-duty/stats"] });
  const { data: currentVehicles } = useQuery<any[]>({ queryKey: ["/api/gate-duty/vehicles/current"] });
  const { data: currentPersonnel } = useQuery<any[]>({ queryKey: ["/api/gate-duty/personnel/current"] });
  const { data: allVehicles } = useQuery<any[]>({ queryKey: ["/api/gate-duty/vehicles"] });
  const { data: allPersonnel } = useQuery<any[]>({ queryKey: ["/api/gate-duty/personnel"] });
  const { data: activeShift } = useQuery<any>({ queryKey: ["/api/gate-duty/shift-report"] });

  // Mutations
  const logVehicleMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/gate-duty/vehicles", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gate-duty"] });
      setIsVehicleModalOpen(false);
      toast({ title: "Success", description: "Vehicle entry logged" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to log vehicle", description: error.message || "Please try again.", variant: "destructive" });
    },
  });

  const logPersonnelMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/gate-duty/personnel", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gate-duty"] });
      setIsPersonnelModalOpen(false);
      toast({ title: "Success", description: "Personnel entry logged" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to log personnel", description: error.message || "Please try again.", variant: "destructive" });
    },
  });

  const exitVehicleMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/gate-duty/vehicles/${id}/exit`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gate-duty"] });
      toast({ title: "Success", description: "Vehicle exit logged" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to log vehicle exit", description: error.message || "Please try again.", variant: "destructive" });
    },
  });

  const exitPersonnelMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/gate-duty/personnel/${id}/exit`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gate-duty"] });
      toast({ title: "Success", description: "Personnel exit logged" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to log personnel exit", description: error.message || "Please try again.", variant: "destructive" });
    },
  });

  const flagVehicleMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string, reason: string }) => 
      apiRequest("PATCH", `/api/gate-duty/vehicles/${id}/flag`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gate-duty"] });
      toast({ title: "Vehicle Flagged", description: "The vehicle has been flagged." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to flag vehicle", description: error.message || "Please try again.", variant: "destructive" });
    },
  });

  const startShiftMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/gate-duty/shift-report", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gate-duty/shift-report"] });
      setIsShiftModalOpen(false);
      toast({ title: "Shift Started", description: "Gate duty shift has begun" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to start shift", description: error.message || "Please try again.", variant: "destructive" });
    },
  });

  const closeShiftMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/gate-duty/shift-report/${id}/close`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gate-duty/shift-report"] });
      toast({ title: "Shift Closed", description: "Gate duty shift has ended" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to close shift", description: error.message || "Please try again.", variant: "destructive" });
    },
  });

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6 space-y-6 bg-background">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gate Duty</h1>
          <p className="text-muted-foreground">Access control and entry/exit management</p>
        </div>
        
        <div className="flex gap-2">
          {!activeShift ? (
            <Dialog open={isShiftModalOpen} onOpenChange={setIsShiftModalOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-start-shift">
                  <Play className="mr-2 h-4 w-4" /> Start Shift
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Start Gate Duty Shift</DialogTitle>
                </DialogHeader>
                <form onSubmit={(e: any) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  startShiftMutation.mutate({
                    siteName: formData.get("siteName"),
                    officerName: formData.get("officerName"),
                  });
                }} className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="siteName">Site Name</Label>
                    <Input id="siteName" name="siteName" required data-testid="input-site-name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="officerName">Officer Name</Label>
                    <Input id="officerName" name="officerName" required data-testid="input-officer-name" />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={startShiftMutation.isPending} data-testid="button-confirm-start">
                      Confirm Start
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          ) : (
            <Button 
              variant="destructive" 
              onClick={() => closeShiftMutation.mutate(activeShift.id)}
              disabled={closeShiftMutation.isPending}
              data-testid="button-close-shift"
            >
              <LogOut className="mr-2 h-4 w-4" /> Close Shift
            </Button>
          )}
        </div>
      </div>

      {/* Stats Chips */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vehicles Today</CardTitle>
            <Car className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-vehicles-today">{stats?.vehiclesToday || 0}</div>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Personnel Today</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-personnel-today">{stats?.personnelToday || 0}</div>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Flagged</CardTitle>
            <ShieldAlert className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-flagged-today">{stats?.flaggedToday || 0}</div>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Currently On-Site</CardTitle>
            <DoorOpen className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-current-onsite">{stats?.currentlyOnSite || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="live" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-4">
          <TabsTrigger value="live">Live Board</TabsTrigger>
          <TabsTrigger value="vehicles">Vehicles Log</TabsTrigger>
          <TabsTrigger value="personnel">Personnel Log</TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Currently On-Site: Vehicles</CardTitle>
                <CardDescription>Vehicles that have entered but not yet exited</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plate</TableHead>
                      <TableHead>Driver</TableHead>
                      <TableHead>Entry Time</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentVehicles?.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell className="font-medium">{v.license_plate}</TableCell>
                        <TableCell>{v.driver_name}</TableCell>
                        <TableCell>{format(new Date(v.entry_time), 'HH:mm')}</TableCell>
                        <TableCell className="text-right">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => exitVehicleMutation.mutate(v.id)}
                            disabled={exitVehicleMutation.isPending}
                            data-testid={`button-exit-vehicle-${v.id}`}
                          >
                            Mark Exit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {currentVehicles?.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No vehicles currently on-site</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Currently On-Site: Personnel</CardTitle>
                <CardDescription>Visitors/Personnel currently on premises</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Entry Time</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentPersonnel?.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.person_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{p.person_type}</Badge>
                        </TableCell>
                        <TableCell>{format(new Date(p.entry_time), 'HH:mm')}</TableCell>
                        <TableCell className="text-right">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => exitPersonnelMutation.mutate(p.id)}
                            disabled={exitPersonnelMutation.isPending}
                            data-testid={`button-exit-personnel-${p.id}`}
                          >
                            Mark Exit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {currentPersonnel?.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No personnel currently on-site</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="vehicles" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Vehicle Entry Logs</h2>
            <Dialog open={isVehicleModalOpen} onOpenChange={setIsVehicleModalOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-log-vehicle">
                  <Plus className="mr-2 h-4 w-4" /> Log Vehicle Entry
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Log Vehicle Entry</DialogTitle>
                </DialogHeader>
                <form onSubmit={(e: any) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  logVehicleMutation.mutate({
                    licensePlate: formData.get("licensePlate"),
                    vehicleMake: formData.get("vehicleMake"),
                    vehicleModel: formData.get("vehicleModel"),
                    vehicleColor: formData.get("vehicleColor"),
                    driverName: formData.get("driverName"),
                    purpose: formData.get("purpose"),
                    siteName: activeShift?.site_name || "Main Gate",
                    loggedByName: activeShift?.officer_name || "Duty Officer"
                  });
                }} className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="licensePlate">License Plate *</Label>
                      <Input id="licensePlate" name="licensePlate" required data-testid="input-plate" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="driverName">Driver Name</Label>
                      <Input id="driverName" name="driverName" data-testid="input-driver" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="vehicleMake">Make</Label>
                      <Input id="vehicleMake" name="vehicleMake" data-testid="input-make" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vehicleModel">Model</Label>
                      <Input id="vehicleModel" name="vehicleModel" data-testid="input-model" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vehicleColor">Color</Label>
                      <Input id="vehicleColor" name="vehicleColor" data-testid="input-color" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="purpose">Purpose of Visit</Label>
                    <Input id="purpose" name="purpose" data-testid="input-purpose" />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={logVehicleMutation.isPending} data-testid="button-save-vehicle">
                      Save Entry
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Plate</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Exit</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allVehicles?.map((v) => (
                    <TableRow key={v.id} className={v.is_flagged ? "bg-destructive/10" : ""}>
                      <TableCell>{format(new Date(v.entry_time), 'MMM d, HH:mm')}</TableCell>
                      <TableCell className="font-bold">
                        {v.license_plate}
                        {v.is_flagged && <Badge variant="destructive" className="ml-2">Flagged</Badge>}
                      </TableCell>
                      <TableCell>{v.vehicle_color} {v.vehicle_make} {v.vehicle_model}</TableCell>
                      <TableCell>{v.driver_name}</TableCell>
                      <TableCell>{v.exit_time ? format(new Date(v.exit_time), 'HH:mm') : "---"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {!v.exit_time && (
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={() => exitVehicleMutation.mutate(v.id)}
                              data-testid={`button-exit-v-${v.id}`}
                            >
                              Exit
                            </Button>
                          )}
                          {!v.is_flagged && (
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="text-destructive"
                              onClick={() => {
                                const reason = prompt("Enter flag reason:");
                                if (reason) flagVehicleMutation.mutate({ id: v.id, reason });
                              }}
                              data-testid={`button-flag-v-${v.id}`}
                            >
                              <Flag className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="personnel" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Personnel Entry Logs</h2>
            <Dialog open={isPersonnelModalOpen} onOpenChange={setIsPersonnelModalOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-log-personnel">
                  <Plus className="mr-2 h-4 w-4" /> Log Person Entry
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Log Person Entry</DialogTitle>
                </DialogHeader>
                <form onSubmit={(e: any) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  logPersonnelMutation.mutate({
                    personName: formData.get("personName"),
                    personType: formData.get("personType"),
                    companyName: formData.get("companyName"),
                    purpose: formData.get("purpose"),
                    badgeNumber: formData.get("badgeNumber"),
                    escortRequired: formData.get("escortRequired") === "on",
                    siteName: activeShift?.site_name || "Main Gate",
                    loggedByName: activeShift?.officer_name || "Duty Officer"
                  });
                }} className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="personName">Full Name *</Label>
                      <Input id="personName" name="personName" required data-testid="input-name" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="personType">Type</Label>
                      <Select name="personType" defaultValue="visitor">
                        <SelectTrigger data-testid="select-person-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="visitor">Visitor</SelectItem>
                          <SelectItem value="contractor">Contractor</SelectItem>
                          <SelectItem value="vendor">Vendor</SelectItem>
                          <SelectItem value="delivery">Delivery</SelectItem>
                          <SelectItem value="employee">Employee</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="companyName">Company</Label>
                      <Input id="companyName" name="companyName" data-testid="input-company" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="badgeNumber">Badge Number</Label>
                      <Input id="badgeNumber" name="badgeNumber" data-testid="input-badge" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="purpose">Purpose</Label>
                    <Input id="purpose" name="purpose" data-testid="input-purpose-p" />
                  </div>
                  <div className="flex items-center space-x-2">
                    <input type="checkbox" id="escortRequired" name="escortRequired" className="rounded border-gray-300" data-testid="checkbox-escort" />
                    <Label htmlFor="escortRequired">Escort Required</Label>
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={logPersonnelMutation.isPending} data-testid="button-save-person">
                      Save Entry
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Exit</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allPersonnel?.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{format(new Date(p.entry_time), 'MMM d, HH:mm')}</TableCell>
                      <TableCell className="font-medium">{p.person_name}</TableCell>
                      <TableCell><Badge variant="outline">{p.person_type}</Badge></TableCell>
                      <TableCell>{p.company_name}</TableCell>
                      <TableCell>{p.exit_time ? format(new Date(p.exit_time), 'HH:mm') : "---"}</TableCell>
                      <TableCell className="text-right">
                        {!p.exit_time && (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => exitPersonnelMutation.mutate(p.id)}
                            data-testid={`button-exit-p-${p.id}`}
                          >
                            Exit
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Shift Report Card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="flex flex-row items-center justify-between gap-1">
          <div>
            <CardTitle>Current Shift Status</CardTitle>
            <CardDescription>Gate Duty shift information</CardDescription>
          </div>
          {activeShift ? (
            <Badge className="bg-green-500">ACTIVE</Badge>
          ) : (
            <Badge variant="secondary">NO ACTIVE SHIFT</Badge>
          )}
        </CardHeader>
        <CardContent>
          {activeShift ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Officer:</span>
                <p className="font-medium">{activeShift.officer_name}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Site:</span>
                <p className="font-medium">{activeShift.site_name}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Started:</span>
                <p className="font-medium">{format(new Date(activeShift.shift_start), 'HH:mm')}</p>
              </div>
              <div className="flex items-end justify-end">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => closeShiftMutation.mutate(activeShift.id)}
                  disabled={closeShiftMutation.isPending}
                >
                  End Shift
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center py-4 space-y-2">
              <p className="text-sm text-muted-foreground">No shift currently active. Start one to begin logging.</p>
              <Button size="sm" onClick={() => setIsShiftModalOpen(true)}>
                Start New Shift
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
