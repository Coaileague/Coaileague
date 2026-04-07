import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UniversalModal, UniversalModalDescription, UniversalModalHeader, UniversalModalTitle, UniversalModalFooter, UniversalModalContent } from '@/components/ui/universal-modal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Car, Plus, Search, Fuel, Gauge, Shield, Calendar,
  Wrench, ArrowLeft, Trash2, Edit, MapPin,
} from "lucide-react";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  vin: string;
  licensePlate: string;
  color: string;
  fuelType: string;
  currentMileage: number;
  status: string;
  assignedEmployeeId?: string | null;
  assignedEmployeeName?: string;
  insuranceExpiry?: string | null;
  createdAt: string;
}

interface MileageLog {
  id: string;
  vehicleId: string;
  mileage: number;
  logDate: string;
  notes?: string;
}

interface MaintenanceRecord {
  id: string;
  vehicleId: string;
  type: string;
  description: string;
  cost: number;
  performedAt: string;
  performedBy?: string;
}

const EMPTY_VEHICLE = {
  make: "",
  model: "",
  year: new Date().getFullYear(),
  vin: "",
  licensePlate: "",
  color: "",
  fuelType: "gasoline",
  currentMileage: 0,
};

function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "available": return "default";
    case "assigned": return "secondary";
    case "maintenance": return "outline";
    case "retired": return "destructive";
    case "out_of_service":
    case "in_shop":
      return "outline";
    default: return "outline";
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "available": return "Available";
    case "assigned": return "Assigned";
    case "maintenance": return "Maintenance";
    case "retired": return "Retired";
    case "out_of_service": return "Out of Service";
    case "in_shop": return "In Shop";
    default: return status;
  }
}

export default function FleetManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [vehicleForm, setVehicleForm] = useState(EMPTY_VEHICLE);

  const { data: vehicles, isLoading } = useQuery<Vehicle[]>({
    queryKey: ["/api/enterprise-features/vehicles"],
  });

  const { data: mileageLogs } = useQuery<MileageLog[]>({
    queryKey: ["/api/enterprise-features/vehicles", selectedVehicle?.id, "mileage"],
    enabled: !!selectedVehicle,
  });

  const { data: maintenanceRecords } = useQuery<MaintenanceRecord[]>({
    queryKey: ["/api/enterprise-features/vehicles", selectedVehicle?.id, "maintenance"],
    enabled: !!selectedVehicle,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_VEHICLE) => {
      return await apiRequest("POST", "/api/enterprise-features/vehicles", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise-features/vehicles"] });
      toast({ title: "Vehicle Added", description: "New vehicle has been added to the fleet." });
      setShowAddDialog(false);
      setVehicleForm(EMPTY_VEHICLE);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to add vehicle", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/enterprise-features/vehicles/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise-features/vehicles"] });
      toast({ title: "Vehicle Removed", description: "Vehicle has been removed from the fleet." });
      setSelectedVehicle(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to remove vehicle", variant: "destructive" });
    },
  });

  const filteredVehicles = vehicles?.filter((v) =>
    `${v.make} ${v.model} ${v.licensePlate}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreate = () => {
    createMutation.mutate(vehicleForm);
  };

  const pageConfig: CanvasPageConfig = {
    id: "fleet-management",
    title: "Fleet Management",
    subtitle: "Track and manage your organization's vehicles, mileage, and maintenance",
    category: "operations" as any,
    showHeader: true,
    headerActions: (
      <Button onClick={() => setShowAddDialog(true)} data-testid="button-add-vehicle">
        <Plus className="h-4 w-4 mr-2" />
        Add Vehicle
      </Button>
    ),
  };

  if (selectedVehicle) {
    return (
      <CanvasHubPage config={{ ...pageConfig, showHeader: false }}>
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <Button variant="ghost" size="icon" onClick={() => setSelectedVehicle(null)} data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold">
                  {selectedVehicle.year} {selectedVehicle.make} {selectedVehicle.model}
                </h1>
                <p className="text-sm text-muted-foreground">{selectedVehicle.licensePlate}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={getStatusVariant(selectedVehicle.status)}>
                {getStatusLabel(selectedVehicle.status)}
              </Badge>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="icon"
                    disabled={deleteMutation.isPending}
                    data-testid="button-delete-vehicle"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove Vehicle?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to remove this {selectedVehicle.year} {selectedVehicle.make} {selectedVehicle.model} from the fleet? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={() => deleteMutation.mutate(selectedVehicle.id)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Remove Vehicle
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <Gauge className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Mileage</span>
                </div>
                <p className="text-lg font-semibold mt-1" data-testid="text-mileage">
                  {selectedVehicle.currentMileage?.toLocaleString() || 0} mi
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <Fuel className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Fuel Type</span>
                </div>
                <p className="text-lg font-semibold mt-1 capitalize" data-testid="text-fuel-type">
                  {selectedVehicle.fuelType}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">VIN</span>
                </div>
                <p className="text-sm font-mono font-semibold mt-1 truncate" data-testid="text-vin">
                  {selectedVehicle.vin || "N/A"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Insurance</span>
                </div>
                <p className="text-sm font-semibold mt-1" data-testid="text-insurance">
                  {selectedVehicle.insuranceExpiry
                    ? new Date(selectedVehicle.insuranceExpiry).toLocaleDateString()
                    : "Not set"}
                </p>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="mileage" data-testid="tabs-vehicle-detail">
            <TabsList>
              <TabsTrigger value="mileage" data-testid="tab-mileage">Mileage Logs</TabsTrigger>
              <TabsTrigger value="maintenance" data-testid="tab-maintenance">Maintenance Records</TabsTrigger>
            </TabsList>
            <TabsContent value="mileage" className="space-y-3 mt-4">
              {mileageLogs && mileageLogs.length > 0 ? (
                mileageLogs.map((log) => (
                  <Card key={log.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div>
                          <p className="font-medium" data-testid={`text-mileage-log-${log.id}`}>
                            {log.mileage.toLocaleString()} miles
                          </p>
                          {log.notes && (
                            <p className="text-sm text-muted-foreground">{log.notes}</p>
                          )}
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {new Date(log.logDate).toLocaleDateString()}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Gauge className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>No mileage logs recorded</p>
                </div>
              )}
            </TabsContent>
            <TabsContent value="maintenance" className="space-y-3 mt-4">
              {maintenanceRecords && maintenanceRecords.length > 0 ? (
                maintenanceRecords.map((record) => (
                  <Card key={record.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div>
                          <p className="font-medium" data-testid={`text-maintenance-${record.id}`}>
                            {record.type}
                          </p>
                          <p className="text-sm text-muted-foreground">{record.description}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">${record.cost?.toFixed(2)}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(record.performedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Wrench className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>No maintenance records</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </CanvasHubPage>
    );
  }

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by make, model, or license plate..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-vehicle-search"
          />
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-md" />
            ))}
          </div>
        ) : vehicles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed rounded-lg">
            <Car className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No vehicles yet</h3>
            <p className="text-muted-foreground mb-4">Add your first vehicle to get started</p>
            <Button onClick={() => setShowAddDialog(true)} data-testid="button-add-first-vehicle">Add Vehicle</Button>
          </div>
        ) : filteredVehicles && filteredVehicles.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredVehicles.map((vehicle) => (
              <Card
                key={vehicle.id}
                className="hover-elevate cursor-pointer"
                onClick={() => setSelectedVehicle(vehicle)}
                data-testid={`card-vehicle-${vehicle.id}`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-base">
                      {vehicle.year} {vehicle.make} {vehicle.model}
                    </CardTitle>
                    <Badge variant={getStatusVariant(vehicle.status)}>
                      {getStatusLabel(vehicle.status)}
                    </Badge>
                  </div>
                  {vehicle.color && (
                    <CardDescription className="capitalize">{vehicle.color}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm text-muted-foreground">License Plate</span>
                    <span className="text-sm font-mono font-medium" data-testid={`text-plate-${vehicle.id}`}>
                      {vehicle.licensePlate || "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm text-muted-foreground flex items-center gap-1 flex-wrap">
                      <Gauge className="h-3 w-3" /> Mileage
                    </span>
                    <span className="text-sm font-medium">
                      {vehicle.currentMileage?.toLocaleString() || 0} mi
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm text-muted-foreground flex items-center gap-1 flex-wrap">
                      <Fuel className="h-3 w-3" /> Fuel
                    </span>
                    <span className="text-sm font-medium capitalize">{vehicle.fuelType}</span>
                  </div>
                  {vehicle.insuranceExpiry && (
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-sm text-muted-foreground flex items-center gap-1 flex-wrap">
                        <Calendar className="h-3 w-3" /> Insurance
                      </span>
                      <span className="text-sm font-medium">
                        {new Date(vehicle.insuranceExpiry).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {vehicle.assignedEmployeeName && (
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-sm text-muted-foreground">Assigned</span>
                      <span className="text-sm font-medium">{vehicle.assignedEmployeeName}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            <Car className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg font-medium">No Vehicles Found</p>
            <p className="text-sm mt-1">
              {searchQuery ? "Try a different search term" : "Add your first vehicle to get started"}
            </p>
          </div>
        )}
      </div>

      <UniversalModal open={showAddDialog} onOpenChange={setShowAddDialog}>
        <UniversalModalContent className="sm:max-w-lg">
          <UniversalModalHeader>
            <UniversalModalTitle className="flex items-center gap-2 flex-wrap">
              <Car className="h-5 w-5" />
              Add Vehicle
            </UniversalModalTitle>
            <UniversalModalDescription>Add a new vehicle to your fleet</UniversalModalDescription>
          </UniversalModalHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="make">Make</Label>
                <Input
                  id="make"
                  placeholder="Toyota"
                  value={vehicleForm.make}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, make: e.target.value })}
                  data-testid="input-vehicle-make"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                <Input
                  id="model"
                  placeholder="Camry"
                  value={vehicleForm.model}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })}
                  data-testid="input-vehicle-model"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="year">Year</Label>
                <Input
                  id="year"
                  type="number"
                  value={vehicleForm.year}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, year: parseInt(e.target.value) || 0 })}
                  data-testid="input-vehicle-year"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="color">Color</Label>
                <Input
                  id="color"
                  placeholder="White"
                  value={vehicleForm.color}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, color: e.target.value })}
                  data-testid="input-vehicle-color"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="vin">VIN</Label>
              <Input
                id="vin"
                placeholder="1HGBH41JXMN109186"
                value={vehicleForm.vin}
                onChange={(e) => setVehicleForm({ ...vehicleForm, vin: e.target.value })}
                data-testid="input-vehicle-vin"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="licensePlate">License Plate</Label>
                <Input
                  id="licensePlate"
                  placeholder="ABC-1234"
                  value={vehicleForm.licensePlate}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, licensePlate: e.target.value })}
                  data-testid="input-vehicle-plate"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fuelType">Fuel Type</Label>
                <Select
                  value={vehicleForm.fuelType}
                  onValueChange={(v) => setVehicleForm({ ...vehicleForm, fuelType: v })}
                >
                  <SelectTrigger id="fuelType" data-testid="select-fuel-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gasoline">Gasoline</SelectItem>
                    <SelectItem value="diesel">Diesel</SelectItem>
                    <SelectItem value="electric">Electric</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                    <SelectItem value="propane">Propane</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="currentMileage">Current Mileage</Label>
              <Input
                id="currentMileage"
                type="number"
                value={vehicleForm.currentMileage}
                onChange={(e) => setVehicleForm({ ...vehicleForm, currentMileage: parseInt(e.target.value) || 0 })}
                data-testid="input-vehicle-mileage"
              />
            </div>
          </div>
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)} data-testid="button-cancel-vehicle">
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !vehicleForm.make || !vehicleForm.model}
              data-testid="button-save-vehicle"
            >
              <Plus className="h-4 w-4 mr-2" />
              {createMutation.isPending ? "Adding..." : "Add Vehicle"}
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>
    </CanvasHubPage>
  );
}
