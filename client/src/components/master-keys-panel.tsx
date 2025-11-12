import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Key,
  Search,
  Settings,
  DollarSign,
  RotateCcw,
  Tag,
  FileText,
  AlertCircle,
  CheckCircle,
  Building2,
  Users,
  Calendar,
} from "lucide-react";

interface Organization {
  id: string;
  name: string;
  companyName?: string;
  organizationId?: string;
  organizationSerial?: string;
  subscriptionTier: string;
  subscriptionStatus: string;
  maxEmployees: number;
  maxClients: number;
  createdAt: string;
  
  // Feature Toggles
  feature_scheduleos_enabled: boolean;
  feature_timeos_enabled: boolean;
  feature_payrollos_enabled: boolean;
  feature_billos_enabled: boolean;
  feature_hireos_enabled: boolean;
  feature_reportos_enabled: boolean;
  feature_analyticsos_enabled: boolean;
  feature_supportos_enabled: boolean;
  feature_communicationos_enabled: boolean;
  
  // Billing Overrides
  billing_override_type: string | null;
  billing_override_discount_percent: number | null;
  billing_override_custom_price: string | null;
  billing_override_reason: string | null;
  billing_override_expires_at: string | null;
  
  // Admin Data
  admin_notes: string | null;
  admin_flags: string[] | null;
  last_admin_action: string | null;
  last_admin_action_at: string | null;
  
  // Account Status
  isSuspended: boolean;
  isFrozen: boolean;
  isLocked: boolean;
}

export function MasterKeysPanel() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  
  // Feature toggles state
  const [featureToggles, setFeatureToggles] = useState<Record<string, boolean>>({});
  
  // Billing override state
  const [billingOverrideType, setBillingOverrideType] = useState<string>("none");
  const [billingDiscountPercent, setBillingDiscountPercent] = useState<number>(0);
  const [billingCustomPrice, setBillingCustomPrice] = useState<string>("");
  const [billingReason, setBillingReason] = useState<string>("");
  
  // Admin notes state
  const [adminNotes, setAdminNotes] = useState<string>("");
  const [adminFlags, setAdminFlags] = useState<string[]>([]);

  // Fetch organizations with proper query params
  const { data: organizations, isLoading } = useQuery<Organization[]>({
    queryKey: ['/api/platform/master-keys/organizations', searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append('q', searchQuery);
      const url = `/api/platform/master-keys/organizations${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch organizations');
      return response.json();
    },
    refetchOnWindowFocus: false,
  });

  // Update organization mutation
  const updateOrgMutation = useMutation({
    mutationFn: async (data: {
      id: string;
      featureToggles?: Record<string, boolean>;
      billingOverride?: any;
      adminNotes?: string;
      adminFlags?: string[];
      actionDescription: string;
    }) => {
      return apiRequest("PATCH", `/api/platform/master-keys/organizations/${data.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/platform/master-keys/organizations'] });
      toast({
        title: "Success",
        description: "Organization updated successfully",
      });
      setShowDetailsDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update organization",
        variant: "destructive",
      });
    },
  });

  // Reset organization mutation
  const resetOrgMutation = useMutation({
    mutationFn: async (data: { id: string; reason: string }) => {
      return apiRequest("POST", `/api/platform/master-keys/organizations/${data.id}/reset`, { reason: data.reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/platform/master-keys/organizations'] });
      toast({
        title: "Success",
        description: "Organization reset to defaults successfully",
      });
      setShowDetailsDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reset organization",
        variant: "destructive",
      });
    },
  });

  const handleSelectOrg = (org: Organization) => {
    setSelectedOrg(org);
    setShowDetailsDialog(true);
    
    // Load current settings
    setFeatureToggles({
      scheduleos: org.feature_scheduleos_enabled,
      timeos: org.feature_timeos_enabled,
      payrollos: org.feature_payrollos_enabled,
      billos: org.feature_billos_enabled,
      hireos: org.feature_hireos_enabled,
      reportos: org.feature_reportos_enabled,
      analyticsos: org.feature_analyticsos_enabled,
      supportos: org.feature_supportos_enabled,
      communicationos: org.feature_communicationos_enabled,
    });
    
    setBillingOverrideType(org.billing_override_type || "none");
    setBillingDiscountPercent(org.billing_override_discount_percent || 0);
    setBillingCustomPrice(org.billing_override_custom_price || "");
    setBillingReason(org.billing_override_reason || "");
    setAdminNotes(org.admin_notes || "");
    setAdminFlags(org.admin_flags || []);
  };

  const handleSaveChanges = () => {
    if (!selectedOrg) return;

    // Validate billing inputs
    if (billingOverrideType === "discount") {
      if (billingDiscountPercent < 0 || billingDiscountPercent > 100) {
        toast({
          title: "Validation Error",
          description: "Discount percentage must be between 0 and 100",
          variant: "destructive",
        });
        return;
      }
      if (!billingReason.trim()) {
        toast({
          title: "Validation Error",
          description: "Reason is required for billing override",
          variant: "destructive",
        });
        return;
      }
    }

    if (billingOverrideType === "custom") {
      if (!billingCustomPrice || !/^\d+(\.\d{1,2})?$/.test(billingCustomPrice)) {
        toast({
          title: "Validation Error",
          description: "Custom price must be a valid number (e.g., 499.99)",
          variant: "destructive",
        });
        return;
      }
      if (!billingReason.trim()) {
        toast({
          title: "Validation Error",
          description: "Reason is required for billing override",
          variant: "destructive",
        });
        return;
      }
    }

    if (billingOverrideType === "free" && !billingReason.trim()) {
      toast({
        title: "Validation Error",
        description: "Reason is required for free service override",
        variant: "destructive",
      });
      return;
    }

    const billingOverride = billingOverrideType !== "none" ? {
      type: billingOverrideType as 'free' | 'discount' | 'custom',
      discountPercent: billingOverrideType === "discount" ? billingDiscountPercent : undefined,
      customPrice: billingOverrideType === "custom" ? billingCustomPrice : undefined,
      reason: billingReason,
    } : undefined;

    updateOrgMutation.mutate({
      id: selectedOrg.id,
      featureToggles,
      billingOverride,
      adminNotes: adminNotes || undefined,
      adminFlags: adminFlags.length > 0 ? adminFlags : undefined,
      actionDescription: `Master Keys update: ${featureToggles ? 'Features ' : ''}${billingOverride ? 'Billing ' : ''}${adminNotes ? 'Notes' : ''}`.trim(),
    });
  };

  const handleResetOrg = () => {
    if (!selectedOrg) return;
    if (!confirm("Are you sure you want to reset this organization to defaults? This will clear all overrides and unlock the account.")) return;

    resetOrgMutation.mutate({
      id: selectedOrg.id,
      reason: "Manual ROOT reset via Master Keys",
    });
  };

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-br from-blue-900/20 to-indigo-900/20 border-blue-500/30">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <Key className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-white">Master Keys</CardTitle>
                <CardDescription className="text-blue-200/70">
                  ROOT-Only Organization Management
                </CardDescription>
              </div>
            </div>
            <Badge variant="destructive" className="text-xs">
              PRIVILEGED ACCESS
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search organizations by name, ID, or serial..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/50"
              data-testid="input-search-organizations"
            />
          </div>

          {/* Organizations List */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {isLoading && (
              <div className="text-center py-8 text-white/70">Loading...</div>
            )}
            
            {!isLoading && organizations && organizations.length === 0 && (
              <div className="text-center py-8 text-white/70">
                No organizations found
              </div>
            )}

            {organizations?.map((org) => (
              <Card
                key={org.id}
                className="bg-white/5 border-white/10 hover:bg-white/10 transition-colors cursor-pointer"
                onClick={() => handleSelectOrg(org)}
                data-testid={`card-organization-${org.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Building2 className="h-4 w-4 text-blue-400 flex-shrink-0" />
                        <span className="font-semibold text-white truncate">
                          {org.companyName || org.name}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <Badge variant="outline" className="text-xs">
                          {org.organizationId || 'No ID'}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {org.subscriptionTier}
                        </Badge>
                        {org.billing_override_type && (
                          <Badge variant="destructive" className="text-xs">
                            Override: {org.billing_override_type}
                          </Badge>
                        )}
                        {(org.isSuspended || org.isFrozen || org.isLocked) && (
                          <Badge variant="destructive" className="text-xs">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            {org.isSuspended ? 'Suspended' : org.isFrozen ? 'Frozen' : 'Locked'}
                          </Badge>
                        )}
                        {org.admin_flags && org.admin_flags.length > 0 && (
                          org.admin_flags.map(flag => (
                            <Badge key={flag} variant="outline" className="text-xs">
                              <Tag className="h-3 w-3 mr-1" />
                              {flag}
                            </Badge>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-xs text-white/50">
                      <div className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {org.maxEmployees} employees
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(org.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Organization Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-blue-500" />
              Master Keys: {selectedOrg?.companyName || selectedOrg?.name}
            </DialogTitle>
            <DialogDescription>
              Manage features, billing, and settings for this organization
            </DialogDescription>
          </DialogHeader>

          {selectedOrg && (
            <div className="space-y-6">
              {/* Organization Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Organization Information</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <Label className="text-muted-foreground">Organization ID</Label>
                    <div className="font-mono">{selectedOrg.organizationId || 'N/A'}</div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Serial Key</Label>
                    <div className="font-mono">{selectedOrg.organizationSerial || 'N/A'}</div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Subscription Tier</Label>
                    <Badge>{selectedOrg.subscriptionTier}</Badge>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Status</Label>
                    <Badge variant={selectedOrg.subscriptionStatus === 'active' ? 'default' : 'destructive'}>
                      {selectedOrg.subscriptionStatus}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Feature Toggles */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Feature Toggles (OS Modules)
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {Object.entries({
                    scheduleos: 'ScheduleOS™',
                    timeos: 'TimeOS™',
                    payrollos: 'PayrollOS™',
                    billos: 'BillOS™',
                    hireos: 'HireOS™',
                    reportos: 'ReportOS™',
                    analyticsos: 'AnalyticsOS™',
                    supportos: 'SupportOS™',
                    communicationos: 'CommunicationOS™',
                  }).map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between p-3 rounded-lg bg-muted">
                      <Label htmlFor={`toggle-${key}`} className="text-xs">{label}</Label>
                      <Switch
                        id={`toggle-${key}`}
                        checked={featureToggles[key] || false}
                        onCheckedChange={(checked) =>
                          setFeatureToggles(prev => ({ ...prev, [key]: checked }))
                        }
                        data-testid={`switch-${key}`}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Billing Override */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Billing Override
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="billing-type">Override Type</Label>
                    <Select value={billingOverrideType} onValueChange={setBillingOverrideType}>
                      <SelectTrigger id="billing-type" data-testid="select-billing-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Override (Normal Billing)</SelectItem>
                        <SelectItem value="free">Free Service</SelectItem>
                        <SelectItem value="discount">Discount %</SelectItem>
                        <SelectItem value="custom">Custom Price</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {billingOverrideType === "discount" && (
                    <div>
                      <Label htmlFor="discount-percent">Discount Percentage (0-100)</Label>
                      <Input
                        id="discount-percent"
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={billingDiscountPercent}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (val >= 0 && val <= 100) {
                            setBillingDiscountPercent(val);
                          }
                        }}
                        placeholder="e.g., 50 for 50% off"
                        required
                        data-testid="input-discount-percent"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Current: {billingDiscountPercent}% off
                      </p>
                    </div>
                  )}

                  {billingOverrideType === "custom" && (
                    <div>
                      <Label htmlFor="custom-price">Custom Monthly Price ($)</Label>
                      <Input
                        id="custom-price"
                        type="text"
                        value={billingCustomPrice}
                        onChange={(e) => {
                          // Only allow numbers and decimal point
                          const val = e.target.value;
                          if (/^\d*\.?\d{0,2}$/.test(val)) {
                            setBillingCustomPrice(val);
                          }
                        }}
                        placeholder="e.g., 499.99"
                        required
                        pattern="\d+(\.\d{1,2})?"
                        data-testid="input-custom-price"
                      />
                    </div>
                  )}

                  {billingOverrideType !== "none" && (
                    <div>
                      <Label htmlFor="billing-reason">Reason for Override *</Label>
                      <Input
                        id="billing-reason"
                        value={billingReason}
                        onChange={(e) => setBillingReason(e.target.value)}
                        placeholder="e.g., Partner agreement, promotional deal, VIP client"
                        required
                        maxLength={500}
                        data-testid="input-billing-reason"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Required - explain why this override is being applied
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Admin Notes & Flags */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Admin Notes & Flags
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="admin-notes">Private Notes (ROOT-only)</Label>
                    <Textarea
                      id="admin-notes"
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder="Internal notes about this organization..."
                      rows={3}
                      data-testid="textarea-admin-notes"
                    />
                  </div>
                  <div>
                    <Label>Flags (comma-separated)</Label>
                    <Input
                      value={adminFlags.join(', ')}
                      onChange={(e) => setAdminFlags(e.target.value.split(',').map(f => f.trim()).filter(Boolean))}
                      placeholder="e.g., vip, partner, watchlist, delinquent"
                      data-testid="input-admin-flags"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Last Action Log */}
              {selectedOrg.last_admin_action && (
                <Card className="bg-muted/50">
                  <CardContent className="pt-4">
                    <div className="text-xs text-muted-foreground">
                      <strong>Last Admin Action:</strong> {selectedOrg.last_admin_action}
                      <br />
                      <strong>Date:</strong> {selectedOrg.last_admin_action_at ? new Date(selectedOrg.last_admin_action_at).toLocaleString() : 'N/A'}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 justify-end">
                <Button
                  variant="destructive"
                  onClick={handleResetOrg}
                  disabled={resetOrgMutation.isPending}
                  data-testid="button-reset-organization"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset to Defaults
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowDetailsDialog(false)}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveChanges}
                  disabled={updateOrgMutation.isPending || resetOrgMutation.isPending}
                  data-testid="button-save-changes"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {updateOrgMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
