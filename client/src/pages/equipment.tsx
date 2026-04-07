import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalFooter, UniversalModalContent } from '@/components/ui/universal-modal';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Package, Plus, Wrench, Radio, Car, Shield, Shirt,
  Cpu, AlertTriangle, CheckCircle, Clock, Pencil, AlertCircle,
  Ban, FileWarning, RotateCcw, Search, User, DollarSign
} from "lucide-react";

const pageConfig: CanvasPageConfig = {
  id: "equipment",
  title: "Equipment",
  subtitle: "Track and manage department equipment lifecycle",
  category: "operations",
};

const STATUS_COLORS: Record<string, string> = {
  available: "bg-green-500/10 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800",
  assigned: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  maintenance: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800",
  retired: "bg-muted text-muted-foreground border-border",
  lost: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
};

const CATEGORY_ICONS: Record<string, any> = {
  radio: Radio,
  vehicle: Car,
  weapon: Shield,
  uniform: Shirt,
  tool: Wrench,
  technology: Cpu,
  safety: AlertTriangle,
  other: Package,
};

const CATEGORIES = ["radio", "vehicle", "weapon", "uniform", "tool", "technology", "safety", "other"];
const STATUSES = ["available", "assigned", "maintenance", "retired", "lost"];
const VALID_CONDITIONS = ["new", "excellent", "good", "fair", "poor", "damaged"] as const;

function EquipmentForm({ item, onClose }: { item?: any; onClose: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const workspaceId = (user as any)?.workspaceId;
  const [form, setForm] = useState({
    name: item?.name ?? "",
    serialNumber: item?.serialNumber ?? "",
    category: item?.category ?? "other",
    status: item?.status ?? "available",
    description: item?.description ?? "",
    notes: item?.notes ?? "",
  });

  const mutation = useMutation({
    mutationFn: (data: any) =>
      item
        ? apiRequest("PATCH", `/api/equipment/items/${item.id}`, data)
        : apiRequest("POST", "/api/equipment/items", { ...data, workspaceId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment/items", workspaceId] });
      toast({ title: item ? "Equipment updated" : "Equipment added" });
      onClose();
    },
    onError: () => toast({ title: "Failed to save equipment", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3">
        <div>
          <Label htmlFor="eq-name">Name *</Label>
          <Input
            id="eq-name"
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="e.g. Motorola Radio Unit #12"
            data-testid="input-equipment-name"
          />
        </div>
        <div>
          <Label htmlFor="eq-serial">Serial Number</Label>
          <Input
            id="eq-serial"
            value={form.serialNumber}
            onChange={e => setForm(p => ({ ...p, serialNumber: e.target.value }))}
            placeholder="e.g. SN-2024-001"
            data-testid="input-equipment-serial"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Category</Label>
            <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
              <SelectTrigger data-testid="select-equipment-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => (
                  <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
              <SelectTrigger data-testid="select-equipment-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map(s => (
                  <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="eq-desc">Description</Label>
          <Textarea
            id="eq-desc"
            value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            rows={2}
          />
        </div>
        <div>
          <Label htmlFor="eq-notes">Notes</Label>
          <Textarea
            id="eq-notes"
            value={form.notes}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            rows={2}
          />
        </div>
      </div>
      <UniversalModalFooter className="gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          onClick={() => mutation.mutate(form)}
          disabled={!form.name || mutation.isPending}
          data-testid="button-save-equipment"
        >
          {mutation.isPending ? "Saving…" : item ? "Update" : "Add Equipment"}
        </Button>
      </UniversalModalFooter>
    </div>
  );
}

function EquipmentCard({ item, onEdit, onAssign }: { item: any; onEdit: (item: any) => void; onAssign: (item: any) => void }) {
  const Icon = CATEGORY_ICONS[item.category] || Package;
  const statusClass = STATUS_COLORS[item.status] || "";
  return (
    <Card
      className="hover-elevate cursor-pointer"
      data-testid={`card-equipment-${item.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <p className="font-medium text-sm leading-tight truncate">{item.name}</p>
              <Badge className={`text-xs shrink-0 border ${statusClass}`}>
                {item.status}
              </Badge>
            </div>
            {item.serialNumber && (
              <p className="text-xs text-muted-foreground mt-0.5">S/N: {item.serialNumber}</p>
            )}
            <p className="text-xs text-muted-foreground capitalize mt-0.5">{item.category}</p>
            {item.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            {item.status === "available" && (
              <Button
                size="sm"
                variant="outline"
                onClick={e => { e.stopPropagation(); onAssign(item); }}
                data-testid={`button-assign-equipment-${item.id}`}
              >
                <User className="w-3 h-3 mr-1" />
                Assign
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              onClick={e => { e.stopPropagation(); onEdit(item); }}
              data-testid={`button-edit-equipment-${item.id}`}
              aria-label={`Edit ${item.name}`}
            >
              <Pencil className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReportLostDialog({ assignment, onClose }: { assignment: any; onClose: () => void }) {
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/equipment/report-lost/${assignment.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/equipment/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/equipment/overdue"] });
      toast({ title: "Equipment reported as lost" });
      onClose();
    },
    onError: () => toast({ title: "Failed to report equipment as lost", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Are you sure you want to report this equipment as lost? This will mark the item as lost and update the assignment record.
      </p>
      <p className="text-sm font-medium">{assignment.itemName || "Equipment"}</p>
      <UniversalModalFooter className="gap-2">
        <Button variant="outline" onClick={onClose} data-testid="button-cancel-report-lost">Cancel</Button>
        <Button
          variant="destructive"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          data-testid="button-confirm-report-lost"
        >
          {mutation.isPending ? "Reporting..." : "Report Lost"}
        </Button>
      </UniversalModalFooter>
    </div>
  );
}

function ReportDamageDialog({ assignment, onClose }: { assignment: any; onClose: () => void }) {
  const { toast } = useToast();
  const [damageNotes, setDamageNotes] = useState("");
  const [condition, setCondition] = useState("damaged");

  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/equipment/report-damage/${assignment.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/equipment/items"] });
      toast({ title: "Damage report submitted" });
      onClose();
    },
    onError: () => toast({ title: "Failed to submit damage report", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">{assignment.itemName || "Equipment"}</p>
      <div>
        <Label>Condition</Label>
        <Select value={condition} onValueChange={setCondition}>
          <SelectTrigger data-testid="select-damage-condition">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="damaged">Damaged</SelectItem>
            <SelectItem value="poor">Poor</SelectItem>
            <SelectItem value="fair">Fair</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="damage-notes">Damage Notes *</Label>
        <Textarea
          id="damage-notes"
          value={damageNotes}
          onChange={e => setDamageNotes(e.target.value)}
          rows={3}
          placeholder="Describe the damage..."
          data-testid="input-damage-notes"
        />
      </div>
      <UniversalModalFooter className="gap-2">
        <Button variant="outline" onClick={onClose} data-testid="button-cancel-damage">Cancel</Button>
        <Button
          onClick={() => mutation.mutate({ damageNotes, condition })}
          disabled={!damageNotes || mutation.isPending}
          data-testid="button-submit-damage"
        >
          {mutation.isPending ? "Submitting..." : "Submit Report"}
        </Button>
      </UniversalModalFooter>
    </div>
  );
}

function ReturnWithDeductionDialog({ assignment, onClose }: { assignment: any; onClose: () => void }) {
  const { toast } = useToast();
  const [condition, setCondition] = useState("good");
  const [deductionAmount, setDeductionAmount] = useState("");
  const [damageNotes, setDamageNotes] = useState("");

  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/equipment/return-with-deduction/${assignment.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/equipment/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/equipment/overdue"] });
      toast({ title: "Equipment returned successfully" });
      onClose();
    },
    onError: () => toast({ title: "Failed to process return", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">{assignment.itemName || "Equipment"}</p>
      <div>
        <Label>Return Condition</Label>
        <Select value={condition} onValueChange={setCondition}>
          <SelectTrigger data-testid="select-return-condition">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="good">Good</SelectItem>
            <SelectItem value="fair">Fair</SelectItem>
            <SelectItem value="poor">Poor</SelectItem>
            <SelectItem value="damaged">Damaged</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="deduction-amount">Deduction Amount ($)</Label>
        <Input
          id="deduction-amount"
          type="number"
          min="0"
          step="0.01"
          value={deductionAmount}
          onChange={e => setDeductionAmount(e.target.value)}
          placeholder="0.00"
          data-testid="input-deduction-amount"
        />
      </div>
      <div>
        <Label htmlFor="return-notes">Notes</Label>
        <Textarea
          id="return-notes"
          value={damageNotes}
          onChange={e => setDamageNotes(e.target.value)}
          rows={2}
          placeholder="Any notes about the return..."
          data-testid="input-return-notes"
        />
      </div>
      <UniversalModalFooter className="gap-2">
        <Button variant="outline" onClick={onClose} data-testid="button-cancel-return">Cancel</Button>
        <Button
          onClick={() => mutation.mutate({
            condition,
            deductionAmount: deductionAmount ? parseFloat(deductionAmount) : 0,
            damageNotes,
          })}
          disabled={mutation.isPending}
          data-testid="button-confirm-return"
        >
          {mutation.isPending ? "Processing..." : "Process Return"}
        </Button>
      </UniversalModalFooter>
    </div>
  );
}

function AssignEquipmentDialog({ item, onClose }: { item: { id: string; name: string }; onClose: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const workspaceId = (user as { workspaceId?: string })?.workspaceId;
  const [employeeId, setEmployeeId] = useState("");
  const [conditionAtCheckout, setConditionAtCheckout] = useState<string>("good");
  const [expectedReturnDate, setExpectedReturnDate] = useState("");
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/equipment/assignments", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/equipment/assignments"] });
      toast({ title: "Equipment assigned successfully" });
      onClose();
    },
    onError: () => toast({ title: "Failed to assign equipment", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">{item.name}</p>
      <div>
        <Label htmlFor="assign-employee-id">Officer / Employee ID</Label>
        <Input
          id="assign-employee-id"
          value={employeeId}
          onChange={e => setEmployeeId(e.target.value)}
          placeholder="Enter employee ID..."
          data-testid="input-assign-employee-id"
        />
      </div>
      <div>
        <Label>Condition at Checkout</Label>
        <Select value={conditionAtCheckout} onValueChange={setConditionAtCheckout}>
          <SelectTrigger data-testid="select-checkout-condition">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VALID_CONDITIONS.map(c => (
              <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="assign-return-date">Expected Return Date</Label>
        <Input
          id="assign-return-date"
          type="date"
          value={expectedReturnDate}
          onChange={e => setExpectedReturnDate(e.target.value)}
          data-testid="input-assign-return-date"
        />
      </div>
      <div>
        <Label htmlFor="assign-notes">Notes</Label>
        <Textarea
          id="assign-notes"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          placeholder="Assignment notes..."
          data-testid="input-assign-notes"
        />
      </div>
      <UniversalModalFooter className="gap-2">
        <Button variant="outline" onClick={onClose} data-testid="button-cancel-assign">Cancel</Button>
        <Button
          disabled={!employeeId || mutation.isPending}
          onClick={() => mutation.mutate({
            equipmentItemId: item.id,
            employeeId,
            conditionAtCheckout,
            expectedReturnDate: expectedReturnDate || undefined,
            notes,
            workspaceId,
          })}
          data-testid="button-confirm-assign"
        >
          {mutation.isPending ? "Assigning..." : "Assign Equipment"}
        </Button>
      </UniversalModalFooter>
    </div>
  );
}

function OfficerEquipmentSection({ workspaceId }: { workspaceId: string }) {
  const [officerId, setOfficerId] = useState("");
  const [searchId, setSearchId] = useState("");

  const { data: officerAssignments = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/equipment/officer", searchId],
    queryFn: () =>
      fetch(`/api/equipment/officer/${searchId}`, { credentials: "include" })
        .then(r => r.json())
        .then(d => Array.isArray(d) ? d : []),
    enabled: !!searchId,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          value={officerId}
          onChange={e => setOfficerId(e.target.value)}
          placeholder="Enter officer/employee ID..."
          className="max-w-xs"
          data-testid="input-officer-id"
        />
        <Button
          onClick={() => setSearchId(officerId)}
          disabled={!officerId}
          data-testid="button-search-officer"
        >
          <Search className="w-4 h-4 mr-2" />
          Search
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
        </div>
      )}

      {searchId && !isLoading && officerAssignments.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <User className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No equipment found for this officer.</p>
          </CardContent>
        </Card>
      )}

      {officerAssignments.length > 0 && (
        <div className="space-y-3">
          {officerAssignments.map((a: any) => {
            const isActive = !a.actual_return_date && !a.actualReturnDate;
            return (
              <Card key={a.id} data-testid={`card-officer-assignment-${a.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{a.item_name || a.itemName || "Equipment"}</p>
                      <p className="text-xs text-muted-foreground">
                        Checked out: {new Date(a.checkout_date || a.checkoutDate).toLocaleDateString()}
                      </p>
                      {(a.actual_return_date || a.actualReturnDate) && (
                        <p className="text-xs text-muted-foreground">
                          Returned: {new Date(a.actual_return_date || a.actualReturnDate).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <Badge
                      className={isActive
                        ? "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 border"
                        : "bg-muted text-muted-foreground border-border border"
                      }
                      data-testid={`badge-officer-status-${a.id}`}
                    >
                      {isActive ? "Active" : "Returned"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OverdueEquipmentSection({ workspaceId }: { workspaceId: string }) {
  const { data: overdueItems = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/equipment/overdue", workspaceId],
    queryFn: () =>
      fetch(`/api/equipment/overdue?workspaceId=${workspaceId}`, { credentials: "include" })
        .then(r => r.json())
        .then(d => Array.isArray(d) ? d : []),
    enabled: !!workspaceId,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
      </div>
    );
  }

  if (overdueItems.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <CheckCircle className="w-8 h-8 mx-auto text-green-600 mb-2" />
          <p className="font-medium">No overdue equipment</p>
          <p className="text-sm text-muted-foreground mt-1">All equipment returns are on schedule.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {overdueItems.map((a: any) => {
        const expectedDate = new Date(a.expected_return_date || a.expectedReturnDate);
        const daysOverdue = Math.floor((Date.now() - expectedDate.getTime()) / (1000 * 60 * 60 * 24));
        return (
          <Card key={a.id} data-testid={`card-overdue-${a.id}`} className="border-destructive/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{a.item_name || a.itemName || "Equipment"}</p>
                  <p className="text-xs text-muted-foreground">
                    Assigned to: {a.employee_name || a.employeeName || a.employee_id || a.employeeId}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Due: {expectedDate.toLocaleDateString()}
                  </p>
                </div>
                <Badge
                  className="bg-red-500/10 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800 border"
                  data-testid={`badge-overdue-days-${a.id}`}
                >
                  {daysOverdue} day{daysOverdue !== 1 ? "s" : ""} overdue
                </Badge>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function LowInventoryBanner({ workspaceId }: { workspaceId: string }) {
  const { data: lowInventory = [] } = useQuery<any[]>({
    queryKey: ["/api/equipment/low-inventory", workspaceId],
    queryFn: () =>
      fetch(`/api/equipment/low-inventory?workspaceId=${workspaceId}`, { credentials: "include" })
        .then(r => r.json())
        .then(d => Array.isArray(d) ? d : []),
    enabled: !!workspaceId,
  });

  if (lowInventory.length === 0) return null;

  return (
    <Card className="border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20" data-testid="banner-low-inventory">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-sm text-yellow-800 dark:text-yellow-200">Low Inventory Alert</p>
            <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
              The following categories have low available equipment:
            </p>
            <div className="flex gap-2 mt-2 flex-wrap">
              {lowInventory.map((item: any, idx: number) => (
                <Badge
                  key={idx}
                  variant="secondary"
                  className="text-xs"
                  data-testid={`badge-low-inventory-${item.category || idx}`}
                >
                  {item.category || "Unknown"}: {item.available_count ?? item.availableCount ?? 0} available
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function EquipmentPage() {
  const { user } = useAuth();
  const workspaceId = (user as any)?.workspaceId;
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [reportLostAssignment, setReportLostAssignment] = useState<any>(null);
  const [reportDamageAssignment, setReportDamageAssignment] = useState<any>(null);
  const [returnDeductionAssignment, setReturnDeductionAssignment] = useState<any>(null);
  const [assignItem, setAssignItem] = useState<{ id: string; name: string } | null>(null);

  const { data: items = [], isLoading, isError } = useQuery<any[]>({
    queryKey: ["/api/equipment/items", workspaceId],
    queryFn: () =>
      fetch(`/api/equipment/items?workspaceId=${workspaceId}`, { credentials: "include" })
        .then(r => r.json())
        .then(d => Array.isArray(d) ? d : []),
    enabled: !!workspaceId,
  });

  if (isLoading) {
    return (
      <CanvasHubPage config={pageConfig}>
        <div className="space-y-3 p-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </CanvasHubPage>
    );
  }

  if (isError) return (
    <CanvasHubPage config={pageConfig}>
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <AlertCircle className="h-8 w-8 text-destructive mb-2" />
        <p className="text-sm text-muted-foreground">Failed to load data. Please refresh.</p>
      </div>
    </CanvasHubPage>
  );

  const { data: assignments = [] } = useQuery<any[]>({
    queryKey: ["/api/equipment/assignments", workspaceId],
    queryFn: () =>
      fetch(`/api/equipment/assignments?workspaceId=${workspaceId}`, { credentials: "include" })
        .then(r => r.json())
        .then(d => Array.isArray(d) ? d : []),
    enabled: !!workspaceId,
  });

  const filteredItems = filterStatus === "all" ? items : items.filter(i => i.status === filterStatus);

  const stats = {
    total: items.length,
    available: items.filter(i => i.status === "available").length,
    assigned: items.filter(i => i.status === "assigned").length,
    maintenance: items.filter(i => i.status === "maintenance").length,
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Items", value: stats.total, icon: Package, color: "text-foreground" },
            { label: "Available", value: stats.available, icon: CheckCircle, color: "text-green-600" },
            { label: "Assigned", value: stats.assigned, icon: Clock, color: "text-blue-600" },
            { label: "Maintenance", value: stats.maintenance, icon: Wrench, color: "text-yellow-600" },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                </div>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <LowInventoryBanner workspaceId={workspaceId} />

        <Tabs defaultValue="items">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <TabsList>
              <TabsTrigger value="items" data-testid="tab-equipment-items">Items</TabsTrigger>
              <TabsTrigger value="assignments" data-testid="tab-equipment-assignments">Assignments</TabsTrigger>
              <TabsTrigger value="overdue" data-testid="tab-equipment-overdue">Overdue</TabsTrigger>
              <TabsTrigger value="officer" data-testid="tab-equipment-officer">Officer Lookup</TabsTrigger>
            </TabsList>
            <Button onClick={() => { setEditItem(null); setShowForm(true); }} data-testid="button-add-equipment">
              <Plus className="w-4 h-4 mr-2" />
              Add Equipment
            </Button>
          </div>

          <TabsContent value="items" className="mt-4 space-y-4">
            <div className="flex gap-2 flex-wrap">
              {["all", ...STATUSES].map(s => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    filterStatus === s
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border text-muted-foreground hover-elevate"
                  }`}
                  data-testid={`filter-status-${s}`}
                >
                  {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
              </div>
            ) : filteredItems.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <Package className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                  <p className="font-medium">No equipment found</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {filterStatus === "all" ? "Add your first equipment item to get started." : `No items with status "${filterStatus}".`}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredItems.map(item => (
                  <EquipmentCard
                    key={item.id}
                    item={item}
                    onEdit={i => { setEditItem(i); setShowForm(true); }}
                    onAssign={i => setAssignItem({ id: i.id, name: i.name })}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="assignments" className="mt-4">
            {assignments.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <Clock className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                  <p className="font-medium">No active assignments</p>
                  <p className="text-sm text-muted-foreground mt-1">Equipment assignments will appear here once items are checked out.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {assignments.map((a: any) => {
                  const isActive = !a.actualReturnDate && !a.actual_return_date;
                  return (
                    <Card key={a.id} data-testid={`card-assignment-${a.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{a.itemName || "Equipment"}</p>
                            <p className="text-xs text-muted-foreground">Assigned to: {a.employeeName || a.employeeId}</p>
                            <p className="text-xs text-muted-foreground">
                              Checked out: {new Date(a.checkoutDate || a.checkout_date).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary">{a.condition || "Good"}</Badge>
                            {isActive && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setReturnDeductionAssignment(a)}
                                  data-testid={`button-return-${a.id}`}
                                >
                                  <RotateCcw className="w-3 h-3 mr-1" />
                                  Return
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setReportDamageAssignment(a)}
                                  data-testid={`button-report-damage-${a.id}`}
                                >
                                  <FileWarning className="w-3 h-3 mr-1" />
                                  Damage
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => setReportLostAssignment(a)}
                                  data-testid={`button-report-lost-${a.id}`}
                                >
                                  <Ban className="w-3 h-3 mr-1" />
                                  Lost
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="overdue" className="mt-4">
            <OverdueEquipmentSection workspaceId={workspaceId} />
          </TabsContent>

          <TabsContent value="officer" className="mt-4">
            <OfficerEquipmentSection workspaceId={workspaceId} />
          </TabsContent>
        </Tabs>
      </div>

      <UniversalModal open={showForm} onOpenChange={open => { if (!open) { setShowForm(false); setEditItem(null); } }}>
        <UniversalModalContent className="sm:max-w-md">
          <UniversalModalHeader>
            <UniversalModalTitle>{editItem ? "Edit Equipment" : "Add Equipment"}</UniversalModalTitle>
          </UniversalModalHeader>
          <EquipmentForm item={editItem} onClose={() => { setShowForm(false); setEditItem(null); }} />
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={!!reportLostAssignment} onOpenChange={open => { if (!open) setReportLostAssignment(null); }}>
        <UniversalModalContent className="sm:max-w-md">
          <UniversalModalHeader>
            <UniversalModalTitle>Report Equipment Lost</UniversalModalTitle>
          </UniversalModalHeader>
          {reportLostAssignment && (
            <ReportLostDialog assignment={reportLostAssignment} onClose={() => setReportLostAssignment(null)} />
          )}
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={!!reportDamageAssignment} onOpenChange={open => { if (!open) setReportDamageAssignment(null); }}>
        <UniversalModalContent className="sm:max-w-md">
          <UniversalModalHeader>
            <UniversalModalTitle>Report Equipment Damage</UniversalModalTitle>
          </UniversalModalHeader>
          {reportDamageAssignment && (
            <ReportDamageDialog assignment={reportDamageAssignment} onClose={() => setReportDamageAssignment(null)} />
          )}
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={!!returnDeductionAssignment} onOpenChange={open => { if (!open) setReturnDeductionAssignment(null); }}>
        <UniversalModalContent className="sm:max-w-md">
          <UniversalModalHeader>
            <UniversalModalTitle>Return Equipment with Deduction</UniversalModalTitle>
          </UniversalModalHeader>
          {returnDeductionAssignment && (
            <ReturnWithDeductionDialog assignment={returnDeductionAssignment} onClose={() => setReturnDeductionAssignment(null)} />
          )}
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={!!assignItem} onOpenChange={open => { if (!open) setAssignItem(null); }}>
        <UniversalModalContent className="sm:max-w-md">
          <UniversalModalHeader>
            <UniversalModalTitle>Assign Equipment to Officer</UniversalModalTitle>
          </UniversalModalHeader>
          {assignItem && (
            <AssignEquipmentDialog item={assignItem} onClose={() => setAssignItem(null)} />
          )}
        </UniversalModalContent>
      </UniversalModal>
    </CanvasHubPage>
  );
}
