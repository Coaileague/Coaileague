import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  ShieldAlert, Plus, Search, ClipboardCheck, ClipboardList,
  ArrowRightLeft, Calendar, Hash, Crosshair, User,
} from "lucide-react";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

interface Weapon {
  id: string;
  serialNumber: string;
  type: string;
  make: string;
  model: string;
  caliber: string;
  status: string;
  condition: string;
  assignedEmployeeId?: string | null;
  assignedEmployeeName?: string;
  nextInspectionDue?: string | null;
  notes?: string;
  createdAt: string;
}

interface WeaponCheckout {
  id: string;
  weaponId: string;
  employeeId: string;
  employeeName?: string;
  weaponSerial?: string;
  weaponMakeModel?: string;
  checkoutSignature: string;
  conditionAtCheckout: string;
  checkedOutAt: string;
  checkedInAt?: string | null;
  checkinSignature?: string;
  conditionAtCheckin?: string;
}

const EMPTY_WEAPON = {
  serialNumber: "",
  type: "handgun",
  make: "",
  model: "",
  caliber: "",
  condition: "good",
  notes: "",
};

function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "available": return "default";
    case "checked_out": return "secondary";
    case "maintenance": return "outline";
    case "retired": return "destructive";
    default: return "outline";
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "available": return "Available";
    case "checked_out": return "Checked Out";
    case "maintenance": return "Maintenance";
    case "retired": return "Retired";
    default: return status;
  }
}

function getConditionVariant(condition: string): "default" | "secondary" | "destructive" | "outline" {
  switch (condition) {
    case "excellent": return "default";
    case "good": return "secondary";
    case "fair": return "outline";
    case "poor": return "destructive";
    default: return "outline";
  }
}

export default function ArmoryManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("inventory");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showCheckoutDialog, setShowCheckoutDialog] = useState(false);
  const [showCheckinDialog, setShowCheckinDialog] = useState(false);
  const [selectedWeapon, setSelectedWeapon] = useState<Weapon | null>(null);
  const [weaponForm, setWeaponForm] = useState(EMPTY_WEAPON);
  const [checkoutForm, setCheckoutForm] = useState({
    employeeId: "",
    checkoutSignature: "",
    conditionAtCheckout: "good",
  });
  const [checkinForm, setCheckinForm] = useState({
    checkinSignature: "",
    conditionAtCheckin: "good",
  });

  const { data: weapons, isLoading } = useQuery<Weapon[]>({
    queryKey: ["/api/enterprise-features/weapons"],
  });

  const { data: checkouts } = useQuery<WeaponCheckout[]>({
    queryKey: ["/api/enterprise-features/weapons/checkouts"],
  });

  const { data: employees = [] } = useQuery<{ data: any[] }, Error, any[]>({
    queryKey: ["/api/employees"],
    select: (res) => res?.data ?? [],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_WEAPON) => {
      const { type, ...rest } = data;
      return await apiRequest("POST", "/api/enterprise-features/weapons", { ...rest, weaponType: type });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise-features/weapons"] });
      toast({ title: "Weapon Added", description: "New weapon has been added to the armory." });
      setShowAddDialog(false);
      setWeaponForm(EMPTY_WEAPON);
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message || "Failed to add weapon", variant: "destructive" });
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async (data: { weaponId: string; employeeId: string; checkoutSignature: string; conditionAtCheckout: string }) => {
      return await apiRequest("POST", `/api/enterprise-features/weapons/${data.weaponId}/checkout`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise-features/weapons"] });
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise-features/weapons/checkouts"] });
      toast({ title: "Weapon Checked Out", description: "Weapon has been checked out successfully." });
      setShowCheckoutDialog(false);
      setSelectedWeapon(null);
      setCheckoutForm({ employeeId: "", checkoutSignature: "", conditionAtCheckout: "good" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message || "Failed to checkout weapon", variant: "destructive" });
    },
  });

  const checkinMutation = useMutation({
    mutationFn: async (data: { weaponId: string; checkinSignature: string; conditionAtCheckin: string }) => {
      return await apiRequest("POST", `/api/enterprise-features/weapons/${data.weaponId}/checkin`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise-features/weapons"] });
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise-features/weapons/checkouts"] });
      toast({ title: "Weapon Checked In", description: "Weapon has been returned to the armory." });
      setShowCheckinDialog(false);
      setSelectedWeapon(null);
      setCheckinForm({ checkinSignature: "", conditionAtCheckin: "good" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message || "Failed to checkin weapon", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/enterprise-features/weapons/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise-features/weapons"] });
      toast({ title: "Weapon Removed", description: "Weapon has been removed from the armory." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message || "Failed to remove weapon", variant: "destructive" });
    },
  });

  const filteredWeapons = weapons?.filter((w) =>
    `${w.serialNumber} ${w.type} ${w.make} ${w.model}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeCheckouts = checkouts?.filter((c) => !c.checkedInAt) || [];

  const handleCheckout = (weapon: Weapon) => {
    setSelectedWeapon(weapon);
    setShowCheckoutDialog(true);
  };

  const handleCheckin = (weapon: Weapon) => {
    setSelectedWeapon(weapon);
    setShowCheckinDialog(true);
  };

  const pageConfig: CanvasPageConfig = {
    id: "armory-management",
    title: "Armory Management",
    subtitle: "Track weapons inventory, checkouts, and inspections",
    category: "operations" as any,
    showHeader: true,
    headerActions: (
      <Button onClick={() => setShowAddDialog(true)} data-testid="button-add-weapon">
        <Plus className="h-4 w-4 mr-2" />
        Add Weapon
      </Button>
    ),
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <Tabs value={activeTab} onValueChange={setActiveTab} data-testid="tabs-armory">
        <TabsList>
          <TabsTrigger value="inventory" data-testid="tab-inventory">
            <ShieldAlert className="h-4 w-4 mr-1" />
            Inventory
          </TabsTrigger>
          <TabsTrigger value="checkouts" data-testid="tab-checkouts">
            <ArrowRightLeft className="h-4 w-4 mr-1" />
            Active Checkouts
            {activeCheckouts.length > 0 && (
              <Badge variant="secondary" className="ml-1">{activeCheckouts.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="space-y-4 mt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by serial number, type, make, or model..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-weapon-search"
            />
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading armory...</div>
          ) : filteredWeapons && filteredWeapons.length > 0 ? (
            <div className="space-y-3">
              {filteredWeapons.map((weapon) => (
                <Card key={weapon.id} data-testid={`card-weapon-${weapon.id}`}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">
                            {weapon.make} {weapon.model}
                          </span>
                          <Badge variant={getStatusVariant(weapon.status)}>
                            {getStatusLabel(weapon.status)}
                          </Badge>
                          <Badge variant={getConditionVariant(weapon.condition)}>
                            {weapon.condition}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1 flex-wrap">
                            <Hash className="h-3 w-3" />
                            {weapon.serialNumber}
                          </span>
                          <span className="flex items-center gap-1 flex-wrap">
                            <Crosshair className="h-3 w-3" />
                            {weapon.caliber || "N/A"}
                          </span>
                          <span className="capitalize">{weapon.type}</span>
                          {weapon.assignedEmployeeName && (
                            <span className="flex items-center gap-1 flex-wrap">
                              <User className="h-3 w-3" />
                              {weapon.assignedEmployeeName}
                            </span>
                          )}
                          {weapon.nextInspectionDue && (
                            <span className="flex items-center gap-1 flex-wrap">
                              <Calendar className="h-3 w-3" />
                              Inspection: {new Date(weapon.nextInspectionDue).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap shrink-0">
                        {weapon.status === "available" && (
                          <Button
                            size="sm"
                            onClick={() => handleCheckout(weapon)}
                            data-testid={`button-checkout-${weapon.id}`}
                          >
                            <ClipboardCheck className="h-4 w-4 mr-1" />
                            Checkout
                          </Button>
                        )}
                        {weapon.status === "checked_out" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCheckin(weapon)}
                            data-testid={`button-checkin-${weapon.id}`}
                          >
                            <ClipboardList className="h-4 w-4 mr-1" />
                            Check In
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              <ShieldAlert className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">No Weapons Found</p>
              <p className="text-sm mt-1 mb-4">
                {searchQuery ? "Try a different search term" : "Add your first weapon to get started"}
              </p>
              {!searchQuery && (
                <Button size="sm" onClick={() => setShowAddDialog(true)} data-testid="button-empty-add-weapon">
                  Add First Weapon
                </Button>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="checkouts" className="space-y-4 mt-4">
          {activeCheckouts.length > 0 ? (
            <div className="space-y-3">
              {activeCheckouts.map((checkout) => {
                const weapon = weapons?.find((w) => w.id === checkout.weaponId);
                return (
                  <Card key={checkout.id} data-testid={`card-checkout-${checkout.id}`}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="space-y-1">
                          <p className="font-medium">
                            {weapon ? `${weapon.make} ${weapon.model}` : checkout.weaponMakeModel || "Unknown"}
                          </p>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1 flex-wrap">
                              <Hash className="h-3 w-3" />
                              {weapon?.serialNumber || checkout.weaponSerial || "N/A"}
                            </span>
                            <span className="flex items-center gap-1 flex-wrap">
                              <User className="h-3 w-3" />
                              {checkout.employeeName || checkout.employeeId}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                            <span>
                              Checked out: {new Date(checkout.checkedOutAt).toLocaleString()}
                            </span>
                            <Badge variant={getConditionVariant(checkout.conditionAtCheckout)}>
                              {checkout.conditionAtCheckout}
                            </Badge>
                          </div>
                        </div>
                        <div className="shrink-0">
                          {weapon && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCheckin(weapon)}
                              data-testid={`button-checkin-checkout-${checkout.id}`}
                            >
                              <ClipboardList className="h-4 w-4 mr-1" />
                              Check In
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              <ArrowRightLeft className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">No Active Checkouts</p>
              <p className="text-sm mt-1">All weapons are currently in the armory</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <UniversalModal open={showAddDialog} onOpenChange={setShowAddDialog}>
        <UniversalModalContent className="sm:max-w-lg">
          <UniversalModalHeader>
            <UniversalModalTitle className="flex items-center gap-2 flex-wrap">
              <ShieldAlert className="h-5 w-5" />
              Add Weapon
            </UniversalModalTitle>
            <UniversalModalDescription>Add a new weapon to the armory inventory</UniversalModalDescription>
          </UniversalModalHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="serialNumber">Serial Number</Label>
              <Input
                id="serialNumber"
                placeholder="SN-12345678"
                value={weaponForm.serialNumber}
                onChange={(e) => setWeaponForm({ ...weaponForm, serialNumber: e.target.value })}
                data-testid="input-weapon-serial"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="weaponType">Type</Label>
                <Select
                  value={weaponForm.type}
                  onValueChange={(v) => setWeaponForm({ ...weaponForm, type: v })}
                >
                  <SelectTrigger id="weaponType" data-testid="select-weapon-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="handgun">Handgun</SelectItem>
                    <SelectItem value="rifle">Rifle</SelectItem>
                    <SelectItem value="shotgun">Shotgun</SelectItem>
                    <SelectItem value="taser">Taser</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="caliber">Caliber</Label>
                <Input
                  id="caliber"
                  placeholder="9mm"
                  value={weaponForm.caliber}
                  onChange={(e) => setWeaponForm({ ...weaponForm, caliber: e.target.value })}
                  data-testid="input-weapon-caliber"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="weaponMake">Make</Label>
                <Input
                  id="weaponMake"
                  placeholder="Glock"
                  value={weaponForm.make}
                  onChange={(e) => setWeaponForm({ ...weaponForm, make: e.target.value })}
                  data-testid="input-weapon-make"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weaponModel">Model</Label>
                <Input
                  id="weaponModel"
                  placeholder="G19"
                  value={weaponForm.model}
                  onChange={(e) => setWeaponForm({ ...weaponForm, model: e.target.value })}
                  data-testid="input-weapon-model"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="weaponCondition">Condition</Label>
              <Select
                value={weaponForm.condition}
                onValueChange={(v) => setWeaponForm({ ...weaponForm, condition: v })}
              >
                <SelectTrigger id="weaponCondition" data-testid="select-weapon-condition">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="excellent">Excellent</SelectItem>
                  <SelectItem value="good">Good</SelectItem>
                  <SelectItem value="fair">Fair</SelectItem>
                  <SelectItem value="poor">Poor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)} data-testid="button-cancel-weapon">
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate(weaponForm)}
              disabled={createMutation.isPending || !weaponForm.serialNumber || !weaponForm.make}
              data-testid="button-save-weapon"
            >
              <Plus className="h-4 w-4 mr-2" />
              {createMutation.isPending ? "Adding..." : "Add Weapon"}
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={showCheckoutDialog} onOpenChange={setShowCheckoutDialog}>
        <UniversalModalContent className="sm:max-w-md">
          <UniversalModalHeader>
            <UniversalModalTitle className="flex items-center gap-2 flex-wrap">
              <ClipboardCheck className="h-5 w-5" />
              Checkout Weapon
            </UniversalModalTitle>
            <UniversalModalDescription>
              {selectedWeapon && `${selectedWeapon.make} ${selectedWeapon.model} - ${selectedWeapon.serialNumber}`}
            </UniversalModalDescription>
          </UniversalModalHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="checkoutEmployee">Assign to Employee</Label>
              <Select
                value={checkoutForm.employeeId}
                onValueChange={(v) => setCheckoutForm({ ...checkoutForm, employeeId: v })}
              >
                <SelectTrigger id="checkoutEmployee" data-testid="select-checkout-employee">
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees?.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="checkoutCondition">Condition at Checkout</Label>
              <Select
                value={checkoutForm.conditionAtCheckout}
                onValueChange={(v) => setCheckoutForm({ ...checkoutForm, conditionAtCheckout: v })}
              >
                <SelectTrigger id="checkoutCondition" data-testid="select-checkout-condition">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="excellent">Excellent</SelectItem>
                  <SelectItem value="good">Good</SelectItem>
                  <SelectItem value="fair">Fair</SelectItem>
                  <SelectItem value="poor">Poor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="checkoutSignature">Signature (type full name)</Label>
              <Input
                id="checkoutSignature"
                placeholder="John Doe"
                value={checkoutForm.checkoutSignature}
                onChange={(e) => setCheckoutForm({ ...checkoutForm, checkoutSignature: e.target.value })}
                data-testid="input-checkout-signature"
              />
            </div>
          </div>
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setShowCheckoutDialog(false)} data-testid="button-cancel-checkout">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedWeapon) {
                  checkoutMutation.mutate({
                    weaponId: selectedWeapon.id,
                    ...checkoutForm,
                  });
                }
              }}
              disabled={
                checkoutMutation.isPending ||
                !checkoutForm.employeeId ||
                !checkoutForm.checkoutSignature
              }
              data-testid="button-confirm-checkout"
            >
              {checkoutMutation.isPending ? "Processing..." : "Confirm Checkout"}
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={showCheckinDialog} onOpenChange={setShowCheckinDialog}>
        <UniversalModalContent className="sm:max-w-md">
          <UniversalModalHeader>
            <UniversalModalTitle className="flex items-center gap-2 flex-wrap">
              <ClipboardList className="h-5 w-5" />
              Check In Weapon
            </UniversalModalTitle>
            <UniversalModalDescription>
              {selectedWeapon && `${selectedWeapon.make} ${selectedWeapon.model} - ${selectedWeapon.serialNumber}`}
            </UniversalModalDescription>
          </UniversalModalHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="checkinCondition">Condition at Check-in</Label>
              <Select
                value={checkinForm.conditionAtCheckin}
                onValueChange={(v) => setCheckinForm({ ...checkinForm, conditionAtCheckin: v })}
              >
                <SelectTrigger id="checkinCondition" data-testid="select-checkin-condition">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="excellent">Excellent</SelectItem>
                  <SelectItem value="good">Good</SelectItem>
                  <SelectItem value="fair">Fair</SelectItem>
                  <SelectItem value="poor">Poor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="checkinSignature">Signature (type full name)</Label>
              <Input
                id="checkinSignature"
                placeholder="John Doe"
                value={checkinForm.checkinSignature}
                onChange={(e) => setCheckinForm({ ...checkinForm, checkinSignature: e.target.value })}
                data-testid="input-checkin-signature"
              />
            </div>
          </div>
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setShowCheckinDialog(false)} data-testid="button-cancel-checkin">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedWeapon) {
                  checkinMutation.mutate({
                    weaponId: selectedWeapon.id,
                    ...checkinForm,
                  });
                }
              }}
              disabled={checkinMutation.isPending || !checkinForm.checkinSignature}
              data-testid="button-confirm-checkin"
            >
              {checkinMutation.isPending ? "Processing..." : "Confirm Check-in"}
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>
    </CanvasHubPage>
  );
}
