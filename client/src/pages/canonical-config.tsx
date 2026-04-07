import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, Plus, Pencil, Trash2, ChevronRight, Circle,
  Database, Filter, RefreshCw, X, Check,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface ConfigGroup {
  id: string;
  group_key: string;
  label: string;
  description: string | null;
  domain: string | null;
  table_name: string | null;
  column_name: string | null;
  is_extendable: boolean;
  is_system: boolean;
  sort_order: number;
  active_value_count: string;
}

interface ConfigValue {
  id: string;
  group_key: string;
  value: string;
  label: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
  workspace_id: string | null;
}

// ── Color swatches ───────────────────────────────────────────────────────────

const PRESET_COLORS = [
  "#22c55e", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444",
  "#06b6d4", "#f97316", "#10b981", "#6b7280", "#94a3b8",
  "#a855f7", "#ec4899", "#14b8a6", "#84cc16", "#1e40af",
];

function ColorSwatch({ color, size = "sm" }: { color?: string | null; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "h-3 w-3" : "h-5 w-5";
  return (
    <span
      className={`inline-block ${sz} rounded-full border border-border flex-shrink-0`}
      style={{ backgroundColor: color || "#94a3b8" }}
    />
  );
}

// ── Domain badge colors ───────────────────────────────────────────────────────

const DOMAIN_COLORS: Record<string, string> = {
  scheduling: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  workforce: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  billing: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  compliance: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  clients: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  ops: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  training: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  trinity: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
  audit: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  auth: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
  comms: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  orgs: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  recruitment: "bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-300",
  time: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
  onboarding: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  support: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300",
};

function DomainPill({ domain }: { domain: string | null }) {
  if (!domain) return null;
  const cls = DOMAIN_COLORS[domain] || "bg-muted text-muted-foreground";
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${cls}`}>
      {domain}
    </span>
  );
}

// ── Add / Edit value dialog ───────────────────────────────────────────────────

interface ValueFormData {
  label: string;
  value: string;
  description: string;
  color: string;
  sortOrder: string;
  isActive: boolean;
}

function ValueDialog({
  open,
  onClose,
  groupKey,
  existing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  groupKey: string;
  existing?: ConfigValue;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const isEdit = !!existing;

  const [form, setForm] = useState<ValueFormData>({
    label: existing?.label || "",
    value: existing?.value || "",
    description: existing?.description || "",
    color: existing?.color || "#3b82f6",
    sortOrder: String(existing?.sort_order ?? 0),
    isActive: existing?.is_active ?? true,
  });

  const set = (k: keyof ValueFormData, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/platform-config/values", data),
    onSuccess: () => {
      toast({ title: "Value created" });
      queryClient.invalidateQueries({ queryKey: ["/api/platform-config/values"] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform-config/groups"] });
      onSaved();
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", `/api/platform-config/values/${existing!.id}`, data),
    onSuccess: () => {
      toast({ title: "Value updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/platform-config/values"] });
      onSaved();
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function handleSubmit() {
    if (!form.label.trim()) return toast({ title: "Label is required", variant: "destructive" });
    if (!isEdit && !form.value.trim()) return toast({ title: "Value key is required", variant: "destructive" });

    if (isEdit) {
      updateMutation.mutate({
        label: form.label,
        description: form.description || null,
        color: form.color || null,
        sortOrder: Number(form.sortOrder) || 0,
        isActive: form.isActive,
      });
    } else {
      createMutation.mutate({
        groupKey,
        value: form.value.trim().toLowerCase().replace(/\s+/g, "_"),
        label: form.label,
        description: form.description || null,
        color: form.color || null,
        sortOrder: Number(form.sortOrder) || 0,
      });
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Value" : "Add Value"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!isEdit && (
            <div className="space-y-1">
              <Label htmlFor="val-key">Value Key <span className="text-destructive">*</span></Label>
              <Input
                id="val-key"
                data-testid="input-value-key"
                value={form.value}
                onChange={(e) => set("value", e.target.value)}
                placeholder="e.g. in_progress (auto-lowercased)"
              />
              <p className="text-xs text-muted-foreground">The raw string stored in the database column.</p>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="val-label">Display Label <span className="text-destructive">*</span></Label>
            <Input
              id="val-label"
              data-testid="input-value-label"
              value={form.label}
              onChange={(e) => set("label", e.target.value)}
              placeholder="e.g. In Progress"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="val-desc">Description</Label>
            <Input
              id="val-desc"
              data-testid="input-value-description"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Optional description for this value"
            />
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  data-testid={`color-swatch-${c.replace("#", "")}`}
                  onClick={() => set("color", c)}
                  className={`h-6 w-6 rounded-full border-2 transition-transform ${
                    form.color === c ? "border-foreground scale-110" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <ColorSwatch color={form.color} size="md" />
              <Input
                data-testid="input-value-color"
                value={form.color}
                onChange={(e) => set("color", e.target.value)}
                placeholder="#3b82f6"
                className="w-32 font-mono text-sm"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="val-sort">Sort Order</Label>
            <Input
              id="val-sort"
              data-testid="input-value-sort-order"
              type="number"
              value={form.sortOrder}
              onChange={(e) => set("sortOrder", e.target.value)}
              className="w-24"
            />
          </div>

          {isEdit && (
            <div className="flex items-center gap-3">
              <Switch
                id="val-active"
                data-testid="switch-value-active"
                checked={form.isActive}
                onCheckedChange={(v) => set("isActive", v)}
              />
              <Label htmlFor="val-active">Active</Label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-value">Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending} data-testid="button-save-value">
            {isPending ? "Saving…" : isEdit ? "Save Changes" : "Add Value"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CanonicalConfigPage() {
  const { toast } = useToast();
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [groupSearch, setGroupSearch] = useState("");
  const [valueSearch, setValueSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editingValue, setEditingValue] = useState<ConfigValue | null>(null);
  const [addingToGroup, setAddingToGroup] = useState<string | null>(null);

  // ── Data fetching ─────────────────────────────────────────────────────────

  const { data: groupsData, isLoading: groupsLoading } = useQuery<{ groups: ConfigGroup[] }>({
    queryKey: ["/api/platform-config/groups"],
  });

  const { data: domainsData } = useQuery<{ domains: string[] }>({
    queryKey: ["/api/platform-config/domains"],
  });

  const { data: valuesData, isLoading: valuesLoading } = useQuery<{ values: ConfigValue[] }>({
    queryKey: ["/api/platform-config/values", selectedGroup, showInactive],
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedGroup) params.set("group", selectedGroup);
      if (showInactive) params.set("includeInactive", "true");
      return fetch(`/api/platform-config/values?${params}`).then((r) => r.json());
    },
    enabled: !!selectedGroup,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/platform-config/values/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform-config/values"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/platform-config/values/${id}`),
    onSuccess: () => {
      toast({ title: "Value removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/platform-config/values"] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform-config/groups"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Derived data ──────────────────────────────────────────────────────────

  const groups = groupsData?.groups || [];
  const domains = domainsData?.domains || [];

  const filteredGroups = useMemo(() => {
    return groups.filter((g) => {
      if (domainFilter !== "all" && g.domain !== domainFilter) return false;
      if (groupSearch) {
        const q = groupSearch.toLowerCase();
        return g.label.toLowerCase().includes(q) || g.group_key.toLowerCase().includes(q);
      }
      return true;
    });
  }, [groups, domainFilter, groupSearch]);

  const groupsByDomain = useMemo(() => {
    const map: Record<string, ConfigGroup[]> = {};
    filteredGroups.forEach((g) => {
      const d = g.domain || "other";
      if (!map[d]) map[d] = [];
      map[d].push(g);
    });
    return map;
  }, [filteredGroups]);

  const currentGroup = groups.find((g) => g.group_key === selectedGroup);

  const filteredValues = useMemo(() => {
    const vals = valuesData?.values || [];
    if (!valueSearch) return vals;
    const q = valueSearch.toLowerCase();
    return vals.filter(
      (v) =>
        v.label.toLowerCase().includes(q) ||
        v.value.toLowerCase().includes(q) ||
        (v.description || "").toLowerCase().includes(q)
    );
  }, [valuesData?.values, valueSearch]);

  // ── Render ────────────────────────────────────────────────────────────────

  const totalGroups = groups.length;
  const totalValues = groups.reduce((acc, g) => acc + Number(g.active_value_count || 0), 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-6 py-4 flex-shrink-0">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold" data-testid="text-page-title">
              Canonical Configuration Values
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Platform-wide and workspace-scoped lookup value catalog — the source of truth for all dropdown options and status fields across every domain.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Database className="h-4 w-4" />
              <span data-testid="text-stats">{totalGroups} groups · {totalValues} active values</span>
            </div>
            <Button
              size="default"
              variant="outline"
              data-testid="button-refresh"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ["/api/platform-config/groups"] });
                queryClient.invalidateQueries({ queryKey: ["/api/platform-config/values"] });
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Body: sidebar + content */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Groups sidebar ─────────────────────────────────────────────── */}
        <aside className="w-72 border-r flex flex-col flex-shrink-0">
          <div className="p-3 border-b space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                data-testid="input-group-search"
                className="pl-8 h-8 text-sm"
                placeholder="Search groups…"
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
              />
            </div>
            <Select value={domainFilter} onValueChange={setDomainFilter}>
              <SelectTrigger className="h-8 text-sm" data-testid="select-domain-filter">
                <Filter className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                <SelectValue placeholder="All domains" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All domains</SelectItem>
                {domains.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ScrollArea className="flex-1">
            {groupsLoading ? (
              <div className="p-3 space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-md" />
                ))}
              </div>
            ) : (
              <div className="p-2">
                {Object.entries(groupsByDomain).sort(([a], [b]) => a.localeCompare(b)).map(([domain, domainGroups]) => (
                  <div key={domain} className="mb-3">
                    <div className="px-2 py-1 flex items-center gap-1.5">
                      <DomainPill domain={domain} />
                    </div>
                    {domainGroups.map((group) => (
                      <button
                        key={group.id}
                        data-testid={`group-item-${group.group_key}`}
                        onClick={() => setSelectedGroup(group.group_key)}
                        className={`w-full text-left px-2.5 py-2 rounded-md text-sm flex items-center justify-between gap-2 hover-elevate transition-colors ${
                          selectedGroup === group.group_key
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-foreground"
                        }`}
                      >
                        <span className="truncate">{group.label}</span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-xs text-muted-foreground">
                            {group.active_value_count}
                          </span>
                          {selectedGroup === group.group_key && (
                            <ChevronRight className="h-3.5 w-3.5 text-primary" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                ))}
                {filteredGroups.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No groups match your search.
                  </p>
                )}
              </div>
            )}
          </ScrollArea>
        </aside>

        {/* ── Values panel ───────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selectedGroup ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <Database className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground font-medium">Select a group from the sidebar</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Each group represents one field or category — choose one to view and edit its canonical values.
              </p>
            </div>
          ) : (
            <>
              {/* Values header */}
              <div className="border-b px-5 py-3 flex items-center justify-between gap-3 flex-wrap flex-shrink-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-semibold text-base" data-testid="text-group-label">
                      {currentGroup?.label}
                    </h2>
                    <DomainPill domain={currentGroup?.domain || null} />
                    {currentGroup?.is_extendable && (
                      <Badge variant="outline" className="text-xs">Extendable</Badge>
                    )}
                  </div>
                  {currentGroup?.table_name && (
                    <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-group-table">
                      {currentGroup.table_name}.{currentGroup.column_name}
                    </p>
                  )}
                  {currentGroup?.description && (
                    <p className="text-xs text-muted-foreground">{currentGroup.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Switch
                      id="show-inactive"
                      data-testid="switch-show-inactive"
                      checked={showInactive}
                      onCheckedChange={setShowInactive}
                    />
                    <Label htmlFor="show-inactive" className="text-xs">Show inactive</Label>
                  </div>

                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      data-testid="input-value-search"
                      className="pl-8 h-8 text-sm w-44"
                      placeholder="Search values…"
                      value={valueSearch}
                      onChange={(e) => setValueSearch(e.target.value)}
                    />
                  </div>

                  <Button
                    size="default"
                    data-testid="button-add-value"
                    onClick={() => setAddingToGroup(selectedGroup)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Value
                  </Button>
                </div>
              </div>

              {/* Values table */}
              <ScrollArea className="flex-1">
                {valuesLoading ? (
                  <div className="p-4 space-y-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full rounded-md" />
                    ))}
                  </div>
                ) : filteredValues.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Circle className="h-10 w-10 text-muted-foreground/30 mb-3" />
                    <p className="text-muted-foreground">
                      {valueSearch ? "No values match your search." : "No values in this group yet."}
                    </p>
                    <Button
                      variant="outline"
                      className="mt-3"
                      data-testid="button-add-first-value"
                      onClick={() => setAddingToGroup(selectedGroup)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add First Value
                    </Button>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background border-b z-10">
                      <tr className="text-xs text-muted-foreground uppercase tracking-wide">
                        <th className="text-left py-2 px-4 font-medium w-8"></th>
                        <th className="text-left py-2 px-4 font-medium">Label</th>
                        <th className="text-left py-2 px-4 font-medium">Value Key</th>
                        <th className="text-left py-2 px-4 font-medium hidden lg:table-cell">Description</th>
                        <th className="text-center py-2 px-4 font-medium">Status</th>
                        <th className="text-center py-2 px-4 font-medium">Scope</th>
                        <th className="text-right py-2 px-4 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredValues.map((val) => (
                        <tr
                          key={val.id}
                          data-testid={`value-row-${val.value}`}
                          className={`hover:bg-muted/40 transition-colors ${!val.is_active ? "opacity-50" : ""}`}
                        >
                          <td className="py-3 px-4">
                            <ColorSwatch color={val.color} />
                          </td>
                          <td className="py-3 px-4 font-medium">{val.label}</td>
                          <td className="py-3 px-4">
                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                              {val.value}
                            </code>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground hidden lg:table-cell max-w-xs truncate">
                            {val.description || "—"}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              data-testid={`toggle-active-${val.id}`}
                              onClick={() =>
                                toggleActiveMutation.mutate({ id: val.id, isActive: !val.is_active })
                              }
                              className="inline-flex items-center gap-1"
                              title={val.is_active ? "Click to deactivate" : "Click to activate"}
                            >
                              {val.is_active ? (
                                <Check className="h-4 w-4 text-green-600" />
                              ) : (
                                <X className="h-4 w-4 text-muted-foreground" />
                              )}
                            </button>
                          </td>
                          <td className="py-3 px-4 text-center">
                            {val.workspace_id ? (
                              <Badge variant="outline" className="text-xs">Workspace</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">Platform</Badge>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                data-testid={`button-edit-value-${val.id}`}
                                onClick={() => setEditingValue(val)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                data-testid={`button-delete-value-${val.id}`}
                                onClick={() => {
                                  if (confirm(`Remove "${val.label}"?`)) deleteMutation.mutate(val.id);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </ScrollArea>
            </>
          )}
        </div>
      </div>

      {/* Dialogs */}
      {(addingToGroup || editingValue) && (
        <ValueDialog
          open={!!(addingToGroup || editingValue)}
          onClose={() => {
            setAddingToGroup(null);
            setEditingValue(null);
          }}
          groupKey={addingToGroup || editingValue?.group_key || ""}
          existing={editingValue || undefined}
          onSaved={() => {
            setAddingToGroup(null);
            setEditingValue(null);
          }}
        />
      )}
    </div>
  );
}
