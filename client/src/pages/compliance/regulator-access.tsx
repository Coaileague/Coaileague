import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { UniversalModal, UniversalModalDescription, UniversalModalHeader, UniversalModalTitle, UniversalModalFooter, UniversalModalContent } from '@/components/ui/universal-modal';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Eye,
  Shield,
  Key,
  UserCheck,
  Clock,
  XCircle,
  Copy,
  Building2,
  Plus,
  Loader2,
  AlertTriangle,
  Ban,
} from 'lucide-react';;
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface RegulatorAccess {
  id: string;
  regulator_name: string;
  regulator_email: string;
  regulator_title: string | null;
  regulator_badge_number: string | null;
  regulator_organization: string | null;
  access_level: string;
  state_code: string;
  state_name: string;
  regulatory_body_acronym: string;
  expires_at: string;
  access_count: number;
  last_accessed_at: string | null;
  is_revoked: boolean;
  created_at: string;
}

interface ComplianceState {
  id: string;
  stateCode: string;
  stateName: string;
  regulatoryBodyAcronym: string;
}

export default function RegulatorAccessManagement() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [selectedAccess, setSelectedAccess] = useState<RegulatorAccess | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [newAccessToken, setNewAccessToken] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    stateId: "",
    regulatorName: "",
    regulatorEmail: "",
    regulatorTitle: "",
    regulatorBadgeNumber: "",
    regulatorOrganization: "",
    accessLevel: "view_only",
    expiresInDays: 30,
    canViewAllEmployees: true,
    canExportDocuments: false,
    canGeneratePackets: false
  });

  const { data, isLoading } = useQuery<{ success: boolean; regulatorAccess: RegulatorAccess[] }>({
    queryKey: ['/api/security-compliance/regulator'],
  });

  const { data: statesData } = useQuery<{ success: boolean; states: ComplianceState[] }>({
    queryKey: ['/api/security-compliance/states'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return await apiRequest('POST', '/api/security-compliance/regulator', data);
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/security-compliance/regulator'] });
      setNewAccessToken(response.portalUrl);
      toast({
        title: "Access Granted",
        description: "Regulator portal access has been created",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to Create Access",
        description: error.message || "Unable to create regulator access",
      });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      return await apiRequest('POST', `/api/security-compliance/regulator/${id}/revoke`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/security-compliance/regulator'] });
      setRevokeDialogOpen(false);
      setSelectedAccess(null);
      setRevokeReason("");
      toast({
        title: "Access Revoked",
        description: "Regulator access has been revoked",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Revoke Failed",
        description: error.message || "Unable to revoke access",
      });
    },
  });

  const regulatorAccess = data?.regulatorAccess || [];
  const states = statesData?.states || [];
  const activeAccess = regulatorAccess.filter(a => !a.is_revoked && new Date(a.expires_at) > new Date());
  const expiredOrRevoked = regulatorAccess.filter(a => a.is_revoked || new Date(a.expires_at) <= new Date());

  const handleCreate = () => {
    if (!formData.stateId || !formData.regulatorName || !formData.regulatorEmail) {
      toast({
        variant: "destructive",
        title: "Missing Information",
        description: "Please fill in all required fields",
      });
      return;
    }
    createMutation.mutate(formData);
  };

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(window.location.origin + url);
    toast({
      title: "Link Copied",
      description: "Portal link copied to clipboard",
    });
  };

  const resetForm = () => {
    setFormData({
      stateId: "",
      regulatorName: "",
      regulatorEmail: "",
      regulatorTitle: "",
      regulatorBadgeNumber: "",
      regulatorOrganization: "",
      accessLevel: "view_only",
      expiresInDays: 30,
      canViewAllEmployees: true,
      canExportDocuments: false,
      canGeneratePackets: false
    });
    setNewAccessToken(null);
    setCreateDialogOpen(false);
  };

  if (isLoading) {
    const loadingConfig: CanvasPageConfig = {
      id: 'regulator-access-loading',
      title: 'Regulator Access',
      subtitle: 'Loading active regulator sessions and secure portal links',
      category: 'operations',
      backButton: true,
      onBack: () => navigate('/security-compliance'),
    };
    return (
      <CanvasHubPage config={loadingConfig}>
        <div className="flex flex-col justify-center items-center py-12 text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <div>
            <p className="font-medium text-foreground">Loading regulator access records</p>
            <p className="text-sm text-muted-foreground">
              Checking live portal access, expiration windows, and historical revocations.
            </p>
          </div>
        </div>
      </CanvasHubPage>
    );
  }

  const pageConfig: CanvasPageConfig = {
    id: 'regulator-access',
    title: 'Regulator Portal Access',
    subtitle: 'Manage secure access for state regulators',
    category: 'operations',
    maxWidth: '6xl',
    backButton: true,
    onBack: () => navigate('/security-compliance'),
    headerActions: (
      <Button onClick={() => setCreateDialogOpen(true)} data-testid="btn-grant-access">
        Grant Access
      </Button>
    ),
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6" data-testid="regulator-access-page">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card data-testid="stat-active-access">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Active Access</CardTitle>
              <Key className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold text-green-600">{activeAccess.length}</div>
              <p className="text-xs text-muted-foreground">Current regulator sessions</p>
            </CardContent>
          </Card>

          <Card data-testid="stat-total-access">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Total Access Granted</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold">{regulatorAccess.length}</div>
              <p className="text-xs text-muted-foreground">All time</p>
            </CardContent>
          </Card>

          <Card data-testid="stat-revoked-expired">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Revoked/Expired</CardTitle>
              <XCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold">{expiredOrRevoked.length}</div>
              <p className="text-xs text-muted-foreground">No longer active</p>
            </CardContent>
          </Card>
        </div>

        <Card data-testid="card-active-access">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Active Regulator Access
            </CardTitle>
            <CardDescription>Current active portal access for state regulators</CardDescription>
          </CardHeader>
          <CardContent>
            {activeAccess.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="font-medium text-foreground">No active regulator access</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Grant access when a state regulator needs a temporary read-only portal session.
                </p>
                <Button 
                  className="mt-4" 
                  onClick={() => setCreateDialogOpen(true)}
                  data-testid="button-grant-first"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Grant First Access
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {activeAccess.map((access) => (
                  <div 
                    key={access.id} 
                    className="flex items-center justify-between gap-2 p-4 border rounded-lg"
                    data-testid={`access-${access.id}`}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <UserCheck className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{access.regulator_name}</p>
                        <p className="text-sm text-muted-foreground truncate">{access.regulator_email}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant="outline">
                            <Building2 className="w-3 h-3 mr-1" />
                            {access.state_code} - {access.regulatory_body_acronym}
                          </Badge>
                          <Badge variant="secondary">
                            {access.access_level}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right text-sm">
                        <p className="text-muted-foreground">Expires: {new Date(access.expires_at).toLocaleDateString()}</p>
                        <p className="text-muted-foreground">Views: {access.access_count}</p>
                      </div>
                      <Button 
                        size="sm" 
                        variant="destructive"
                        onClick={() => {
                          setSelectedAccess(access);
                          setRevokeDialogOpen(true);
                        }}
                        data-testid={`button-revoke-${access.id}`}
                      >
                        <Ban className="h-4 w-4 mr-1" />
                        Revoke
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {expiredOrRevoked.length > 0 && (
          <Card data-testid="card-expired-access">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Expired/Revoked Access
              </CardTitle>
              <CardDescription>Historical regulator access records</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {expiredOrRevoked.map((access) => (
                  <div 
                    key={access.id} 
                    className="flex items-center justify-between gap-2 p-3 border rounded-lg opacity-60"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{access.regulator_name}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {access.state_code} - {access.is_revoked ? 'Revoked' : 'Expired'}
                      </p>
                    </div>
                    <Badge variant="secondary">
                      {access.is_revoked ? (
                        <><XCircle className="w-3 h-3 mr-1" /> Revoked</>
                      ) : (
                        <><Clock className="w-3 h-3 mr-1" /> Expired</>
                      )}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <UniversalModal open={createDialogOpen} onOpenChange={(open) => { if (!open) resetForm(); else setCreateDialogOpen(true); }}>
          <UniversalModalContent size="default">
            <UniversalModalHeader>
              <UniversalModalTitle>Grant Regulator Access</UniversalModalTitle>
              <UniversalModalDescription>
                Create secure portal access for a state regulator
              </UniversalModalDescription>
            </UniversalModalHeader>
            
            {newAccessToken ? (
              <div className="space-y-4">
                <Alert>
                  <Key className="h-4 w-4" />
                  <AlertTitle>Access Created Successfully</AlertTitle>
                  <AlertDescription>
                    Share this secure link with the regulator. This link will only be shown once.
                  </AlertDescription>
                </Alert>
                <div className="p-4 bg-muted rounded-lg">
                  <code className="text-sm break-all">{window.location.origin}{newAccessToken}</code>
                </div>
                <Button onClick={() => handleCopyLink(newAccessToken)} className="w-full">
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Link
                </Button>
                <Button variant="outline" onClick={resetForm} className="w-full">
                  Done
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>State *</Label>
                    <Select value={formData.stateId} onValueChange={(v) => setFormData({...formData, stateId: v})}>
                      <SelectTrigger data-testid="select-state">
                        <SelectValue placeholder="Select state" />
                      </SelectTrigger>
                      <SelectContent>
                        {states.map((state) => (
                          <SelectItem key={state.id} value={state.id}>
                            {state.stateCode} - {state.stateName} ({state.regulatoryBodyAcronym})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Regulator Name *</Label>
                      <Input 
                        value={formData.regulatorName}
                        onChange={(e) => setFormData({...formData, regulatorName: e.target.value})}
                        placeholder="John Smith"
                        data-testid="input-regulator-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email *</Label>
                      <Input 
                        type="email"
                        value={formData.regulatorEmail}
                        onChange={(e) => setFormData({...formData, regulatorEmail: e.target.value})}
                        placeholder="regulator@state.gov"
                        data-testid="input-regulator-email"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Title</Label>
                      <Input 
                        value={formData.regulatorTitle}
                        onChange={(e) => setFormData({...formData, regulatorTitle: e.target.value})}
                        placeholder="Compliance Officer"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Badge Number</Label>
                      <Input 
                        value={formData.regulatorBadgeNumber}
                        onChange={(e) => setFormData({...formData, regulatorBadgeNumber: e.target.value})}
                        placeholder="12345"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Organization</Label>
                    <Input 
                      value={formData.regulatorOrganization}
                      onChange={(e) => setFormData({...formData, regulatorOrganization: e.target.value})}
                      placeholder="Texas Private Security Board"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Access Expires In</Label>
                    <Select 
                      value={String(formData.expiresInDays)} 
                      onValueChange={(v) => setFormData({...formData, expiresInDays: parseInt(v)})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">7 Days</SelectItem>
                        <SelectItem value="14">14 Days</SelectItem>
                        <SelectItem value="30">30 Days</SelectItem>
                        <SelectItem value="60">60 Days</SelectItem>
                        <SelectItem value="90">90 Days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label>View All Employees</Label>
                      <Switch 
                        checked={formData.canViewAllEmployees}
                        onCheckedChange={(v) => setFormData({...formData, canViewAllEmployees: v})}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <Label>Export Documents</Label>
                      <Switch 
                        checked={formData.canExportDocuments}
                        onCheckedChange={(v) => setFormData({...formData, canExportDocuments: v})}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <Label>Generate PDF Packets</Label>
                      <Switch 
                        checked={formData.canGeneratePackets}
                        onCheckedChange={(v) => setFormData({...formData, canGeneratePackets: v})}
                      />
                    </div>
                  </div>
                </div>
                <UniversalModalFooter>
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleCreate}
                    disabled={createMutation.isPending}
                    data-testid="button-submit-create"
                  >
                    {createMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</>
                    ) : (
                      <><Key className="h-4 w-4 mr-2" /> Grant Access</>
                    )}
                  </Button>
                </UniversalModalFooter>
              </>
            )}
          </UniversalModalContent>
        </UniversalModal>

        <UniversalModal open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
          <UniversalModalContent size="sm">
            <UniversalModalHeader>
              <UniversalModalTitle>Revoke Access</UniversalModalTitle>
              <UniversalModalDescription>
                This will immediately revoke access for {selectedAccess?.regulator_name}
              </UniversalModalDescription>
            </UniversalModalHeader>
            <div className="space-y-4">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Warning</AlertTitle>
                <AlertDescription>
                  This action cannot be undone. The regulator will no longer be able to access the portal.
                </AlertDescription>
              </Alert>
              <div className="space-y-2">
                <Label>Reason for Revocation</Label>
                <Input 
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  placeholder="Enter reason..."
                  data-testid="input-revoke-reason"
                />
              </div>
            </div>
            <UniversalModalFooter>
              <Button variant="outline" onClick={() => setRevokeDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                variant="destructive"
                onClick={() => selectedAccess && revokeMutation.mutate({ id: selectedAccess.id, reason: revokeReason })}
                disabled={revokeMutation.isPending}
                data-testid="button-confirm-revoke"
              >
                {revokeMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Revoking...</>
                ) : (
                  <><Ban className="h-4 w-4 mr-2" /> Revoke Access</>
                )}
              </Button>
            </UniversalModalFooter>
          </UniversalModalContent>
        </UniversalModal>
      </div>
    </CanvasHubPage>
  );
}
