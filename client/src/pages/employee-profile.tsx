import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { User, Phone, Mail, MapPin, Lock, Unlock, Shield, FileText, CheckCircle, Building2, DollarSign, Calendar, Navigation, Loader2, Settings, Users, MessageSquare, AlertTriangle, Star, Clock, RefreshCw, X, Globe } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CanonicalIdBadge } from "@/components/CanonicalIdBadge";

export default function EmployeeProfile() {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [, setLocation] = useLocation();
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [smsConsent, setSmsConsent] = useState(false);
  const [preferredLanguage, setPreferredLanguage] = useState<'en' | 'es'>('en');

  // Email change dialog state
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [newEmailInput, setNewEmailInput] = useState('');

  // Handle email_change result from URL params (after confirmation link redirect)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const emailChange = params.get('email_change');
    if (emailChange === 'success') {
      toast({ title: "Email Updated", description: "Your email address has been successfully changed." });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      // Remove the query param from URL without triggering a reload
      const url = new URL(window.location.href);
      url.searchParams.delete('email_change');
      window.history.replaceState({}, '', url.toString());
    } else if (emailChange === 'error' || emailChange === 'invalid') {
      const msg = params.get('msg');
      toast({
        variant: "destructive",
        title: "Email Change Failed",
        description: msg || "The email change link is invalid or expired. Please try again.",
      });
      const url = new URL(window.location.href);
      url.searchParams.delete('email_change');
      url.searchParams.delete('msg');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  // Fetch current user
  const { data: currentUser } = useQuery<any>({
    queryKey: ['/api/auth/me'],
  });

  // Fetch employee profile
  const { data: employee, isLoading } = useQuery<any>({
    queryKey: ['/api/employees/me'],
    enabled: !!currentUser,
  });

  // Fetch locked documents
  const { data: lockedDocuments } = useQuery<any[]>({
    queryKey: ['/api/hireos/documents/me'],
    enabled: !!employee,
  });

  // Manager assignment — eligible managers in the same workspace
  const workspaceId = employee?.workspaceId || currentUser?.user?.currentWorkspaceId;
  const { data: managers } = useQuery<any[]>({
    queryKey: ['/api/employees', workspaceId, 'managers'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/employees?workspaceId=${workspaceId}&role=manager`);
      const json = await res.json();
      return (json.data || json || []).filter((m) =>
        ['manager', 'department_manager', 'supervisor', 'org_owner', 'co_owner'].includes(m.workspaceRole)
      );
    },
    enabled: !!workspaceId,
  });

  const { data: currentAssignment, refetch: refetchAssignment } = useQuery<any[]>({
    queryKey: ['/api/hr/manager-assignments/employee', employee?.id],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/hr/manager-assignments/employee/${employee?.id}`);
      return res.json();
    },
    enabled: !!employee?.id,
  });

  const assignManagerMutation = useMutation({
    mutationFn: async (managerId: string) => {
      const res = await apiRequest('POST', '/api/hr/manager-assignments', {
        managerId,
        employeeId: employee?.id,
        workspaceId,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to assign manager');
      }
      return res.json();
    },
    onSuccess: () => {
      refetchAssignment();
      toast({ title: 'Manager assigned successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const [contactInfo, setContactInfo] = useState({
    phone: '',
    address: '',
    addressLine2: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'US',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelation: '',
  });

  // CRITICAL FIX: Load contact info when employee data loads (useEffect to prevent infinite render)
  useEffect(() => {
    if (employee && !isEditingContact) {
      setContactInfo({
        phone: employee.phone || '',
        address: employee.address || '',
        addressLine2: employee.addressLine2 || '',
        city: employee.city || '',
        state: employee.state || '',
        zipCode: employee.zipCode || '',
        country: employee.country || 'US',
        emergencyContactName: employee.emergencyContactName || '',
        emergencyContactPhone: employee.emergencyContactPhone || '',
        emergencyContactRelation: employee.emergencyContactRelation || '',
      });
      setSmsConsent(!!employee.smsConsent);
    }
  }, [employee, isEditingContact]);

  // Sync preferred language from user profile
  useEffect(() => {
    const lang = (currentUser as any)?.user?.preferredLanguage;
    if (lang === 'en' || lang === 'es') {
      setPreferredLanguage(lang);
    }
  }, [(currentUser as any)?.user?.preferredLanguage]);

  // Language preference mutation
  const updateLanguageMutation = useMutation({
    mutationFn: async (lang: 'en' | 'es') => {
      return await apiRequest('PATCH', '/api/auth/language-preference', { preferredLanguage: lang });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      toast({ title: "Language Updated", description: "Your language preference has been saved." });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Update Failed", description: "Unable to save language preference. Please try again." });
    },
  });

  // Update contact info mutation
  const updateContactMutation = useMutation({
    mutationFn: async (data) => {
      return await apiRequest('PATCH', '/api/employees/me/contact-info', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/employees/me'] });
      setIsEditingContact(false);
      toast({
        title: "Contact Info Updated",
        description: "Your contact information has been successfully updated",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: "Unable to update contact information. Please try again.",
      });
    },
  });

  // Request email change mutation
  const requestEmailChangeMutation = useMutation({
    mutationFn: async (newEmail: string) => {
      return await apiRequest('POST', '/api/auth/request-email-change', { newEmail });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      setShowEmailDialog(false);
      setNewEmailInput('');
      toast({
        title: "Verification Email Sent",
        description: "Check your new inbox and click the link to confirm the change.",
      });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        title: "Request Failed",
        description: err?.message || "Unable to request email change. Please try again.",
      });
    },
  });

  // Cancel email change mutation
  const cancelEmailChangeMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/auth/cancel-email-change', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      toast({ title: "Email Change Cancelled", description: "Your email address remains unchanged." });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Could not cancel the email change. Please try again." });
    },
  });

  // Resend verification email mutation
  const resendEmailChangeMutation = useMutation({
    mutationFn: async () => {
      const pendingEmail = currentUser?.user?.pendingEmail;
      if (!pendingEmail) throw new Error('No pending email');
      return await apiRequest('POST', '/api/auth/request-email-change', { newEmail: pendingEmail });
    },
    onSuccess: () => {
      toast({ title: "Verification Resent", description: "A new verification link has been sent to your new email address." });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Resend Failed", description: "Could not resend the verification email. Please try again." });
    },
  });

  const handleSaveContact = () => {
    updateContactMutation.mutate(contactInfo);
  };

  const handleCancelEdit = () => {
    setIsEditingContact(false);
    if (employee) {
      setContactInfo({
        phone: employee.phone || '',
        address: employee.address || '',
        addressLine2: employee.addressLine2 || '',
        city: employee.city || '',
        state: employee.state || '',
        zipCode: employee.zipCode || '',
        country: employee.country || 'US',
        emergencyContactName: employee.emergencyContactName || '',
        emergencyContactPhone: employee.emergencyContactPhone || '',
        emergencyContactRelation: employee.emergencyContactRelation || '',
      });
    }
  };

  const pendingEmail = currentUser?.user?.pendingEmail || null;

  const handleRequestEmailChange = () => {
    const trimmed = newEmailInput.trim();
    if (!trimmed) return;
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(trimmed)) {
      toast({ variant: "destructive", title: "Invalid Email", description: "Please enter a valid email address." });
      return;
    }
    requestEmailChangeMutation.mutate(trimmed);
  };

  const loadingConfig: CanvasPageConfig = {
    id: 'employee-profile',
    title: 'Employee Profile',
    subtitle: 'Loading your profile...',
    category: 'operations',
    maxWidth: '5xl',
  };

  const errorConfig: CanvasPageConfig = {
    id: 'employee-profile',
    title: 'Employee Profile',
    subtitle: 'Profile setup required',
    category: 'operations',
    maxWidth: '5xl',
  };

  const pageConfig: CanvasPageConfig = {
    id: 'employee-profile',
    title: 'Employee Profile',
    subtitle: 'Manage your personal information and view locked records',
    category: 'operations',
    maxWidth: '5xl',
  };

  if (isLoading) {
    return (
      <CanvasHubPage config={loadingConfig}>
        <div className="flex justify-center items-center py-12" data-testid="page-employee-profile-loading">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </CanvasHubPage>
    );
  }

  if (!employee) {
    return (
      <CanvasHubPage config={errorConfig}>
        <div data-testid="page-employee-profile-error">
          <Alert className="mb-4" data-testid="alert-no-employee-profile">
            <User className="h-4 w-4" />
            <AlertDescription data-testid="text-no-employee-description">
              <strong data-testid="text-no-employee-title">No employee profile found.</strong> As an organization owner or manager, you can manage your account from Settings. 
              If you need to be added as an employee for time tracking and scheduling, please contact your administrator or add yourself through the Employees section.
            </AlertDescription>
          </Alert>
          <div className="flex gap-3 mt-4">
            <Button variant="default" onClick={() => setLocation('/settings')} data-testid="button-go-to-settings">
              <Settings className="mr-2 h-4 w-4" />
              Go to Settings
            </Button>
            <Button variant="outline" onClick={() => setLocation('/employees')} data-testid="button-go-to-employees">
              <Users className="mr-2 h-4 w-4" />
              Manage Employees
            </Button>
          </div>
        </div>
      </CanvasHubPage>
    );
  }

  const lockedDocumentTypes = lockedDocuments?.filter((doc) => doc.isImmutable) || [];

  return (
    <CanvasHubPage config={pageConfig}>
      <div data-testid="page-employee-profile">
      <div className="mb-4">
        <Link href="/employees">
          <Button variant="ghost" size="sm" className="gap-2">
            <Users className="h-4 w-4" />
            Back to Employees
          </Button>
        </Link>
      </div>
      <Alert className="mb-6">
        <Shield className="h-4 w-4" />
        <AlertDescription>
          <strong>Document Security:</strong> Update contact info anytime. Legal documents (I-9, W-4, signatures) are permanently locked for compliance and audit trail purposes.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:gap-6">
        {/* Basic Employee Info (Read-Only) */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5 text-destructive" />
                  Employee Identity (Locked)
                </CardTitle>
                <CardDescription>These fields cannot be changed after onboarding</CardDescription>
              </div>
              <Badge variant="secondary">
                <Lock className="h-3 w-3 mr-1" />
                Immutable
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">First Name</Label>
                <div className="flex items-center gap-2 mt-1">
                  <p className="font-medium">{employee.firstName}</p>
                  <Lock className="h-3 w-3 text-muted-foreground" />
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">Last Name</Label>
                <div className="flex items-center gap-2 mt-1">
                  <p className="font-medium">{employee.lastName}</p>
                  <Lock className="h-3 w-3 text-muted-foreground" />
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">Employee Number</Label>
                <div className="flex items-center gap-2 mt-1">
                  <CanonicalIdBadge id={employee.employeeNumber} label="" />
                  <Lock className="h-3 w-3 text-muted-foreground" />
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">Role</Label>
                <div className="flex items-center gap-2 mt-1">
                  <p className="font-medium">{employee.role || 'N/A'}</p>
                  <Lock className="h-3 w-3 text-muted-foreground" />
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">Worker Classification</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={employee.workerType === 'contractor' ? 'outline' : 'secondary'}>
                    {employee.workerType === 'contractor' ? '1099 Contractor' : 'W-2 Employee'}
                  </Badge>
                  <Lock className="h-3 w-3 text-muted-foreground" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Security & Compliance Status (Read-Only — managed by supervisor) */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  Security &amp; Scheduling Status
                </CardTitle>
                <CardDescription>Officer classification, licensing, and Trinity scheduling attributes</CardDescription>
              </div>
              <Badge variant="secondary">
                <Lock className="h-3 w-3 mr-1" />
                Managed by Supervisor
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label className="text-muted-foreground">Authority Level</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Star className="h-4 w-4 text-muted-foreground" />
                  <p className="font-medium capitalize">{employee.organizationalTitle || 'Staff'}</p>
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">Armed Status</Label>
                <div className="mt-1">
                  <Badge variant={employee.isArmed ? 'default' : 'outline'}>
                    <Shield className="h-3 w-3 mr-1" />
                    {employee.isArmed ? 'Armed Officer' : 'Unarmed Officer'}
                  </Badge>
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">Armed License</Label>
                <div className="mt-1">
                  <Badge variant={employee.armedLicenseVerified ? 'default' : 'secondary'}>
                    {employee.armedLicenseVerified ? (
                      <><CheckCircle className="h-3 w-3 mr-1" />Verified</>
                    ) : (
                      <><AlertTriangle className="h-3 w-3 mr-1" />Not Verified</>
                    )}
                  </Badge>
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">Guard Card / PSB License</Label>
                <div className="mt-1 space-y-1">
                  <Badge variant={employee.guardCardVerified ? 'default' : 'secondary'}>
                    {employee.guardCardVerified ? (
                      <><CheckCircle className="h-3 w-3 mr-1" />Verified</>
                    ) : (
                      <><AlertTriangle className="h-3 w-3 mr-1" />Not Verified</>
                    )}
                  </Badge>
                  {employee.guardCardNumber && (
                    <p className="text-sm font-mono text-foreground">{employee.guardCardNumber}</p>
                  )}
                  {employee.guardCardExpiryDate && (
                    <p className="text-xs text-muted-foreground">
                      Expires: {new Date(employee.guardCardExpiryDate).toLocaleDateString()}
                      {new Date(employee.guardCardExpiryDate) < new Date() && (
                        <span className="ml-1 text-red-500 font-medium">(EXPIRED)</span>
                      )}
                    </p>
                  )}
                  {employee.licenseType && (
                    <p className="text-xs text-muted-foreground capitalize">
                      {employee.licenseType === 'level2_unarmed' ? 'Level II — Unarmed' :
                       employee.licenseType === 'level3_armed' ? 'Level III — Armed' :
                       employee.licenseType === 'level4_ppo' ? 'Level IV — PPO' :
                       employee.licenseType}
                    </p>
                  )}
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">Max Travel Radius</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Navigation className="h-4 w-4 text-muted-foreground" />
                  <p className="font-medium">{employee.travelRadiusMiles ?? 25} miles</p>
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">Scheduling Score</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Star className="h-4 w-4 text-muted-foreground" />
                  <p className="font-medium">{employee.schedulingScore ?? 75} / 100</p>
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">Availability Mode</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <p className="font-medium capitalize">{(employee.availabilityMode || 'always_available').replace(/_/g, ' ')}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* QuickBooks Integration & Payroll Info (Read-Only) */}
        {(employee.quickbooksEmployeeId || employee.quickbooksVendorId || employee.payType || employee.hireDate) && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-blue-600" />
                    QuickBooks Integration & Payroll
                  </CardTitle>
                  <CardDescription>Synced from QuickBooks for accurate payroll processing</CardDescription>
                </div>
                <Badge variant="secondary">
                  <Lock className="h-3 w-3 mr-1" />
                  System Managed
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {employee.quickbooksEmployeeId && (
                  <div>
                    <Label className="text-muted-foreground">QuickBooks Employee ID</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium font-mono">{employee.quickbooksEmployeeId}</p>
                    </div>
                  </div>
                )}
                {employee.quickbooksVendorId && (
                  <div>
                    <Label className="text-muted-foreground">QuickBooks Vendor ID</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium font-mono">{employee.quickbooksVendorId}</p>
                      <Badge variant="outline" className="text-xs">1099</Badge>
                    </div>
                  </div>
                )}
                {employee.businessName && (
                  <div>
                    <Label className="text-muted-foreground">Business Name</Label>
                    <p className="font-medium mt-1">{employee.businessName}</p>
                  </div>
                )}
                {employee.payType && (
                  <div>
                    <Label className="text-muted-foreground">Pay Type</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium capitalize">{employee.payType}</p>
                    </div>
                  </div>
                )}
                {employee.payAmount && (
                  <div>
                    <Label className="text-muted-foreground">Pay Amount</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium">${parseFloat(employee.payAmount).toFixed(2)}</p>
                    </div>
                  </div>
                )}
                {employee.payFrequency && (
                  <div>
                    <Label className="text-muted-foreground">Pay Frequency</Label>
                    <p className="font-medium mt-1 capitalize">{employee.payFrequency}</p>
                  </div>
                )}
                {employee.hourlyRate && (
                  <div>
                    <Label className="text-muted-foreground">Hourly Rate</Label>
                    <p className="font-medium mt-1">${parseFloat(employee.hourlyRate).toFixed(2)}/hr</p>
                  </div>
                )}
                {employee.overtimeRate && (
                  <div>
                    <Label className="text-muted-foreground">Overtime Rate</Label>
                    <p className="font-medium mt-1">${parseFloat(employee.overtimeRate).toFixed(2)}/hr</p>
                  </div>
                )}
                {employee.doubletimeRate && (
                  <div>
                    <Label className="text-muted-foreground">Double Time Rate</Label>
                    <p className="font-medium mt-1">${parseFloat(employee.doubletimeRate).toFixed(2)}/hr</p>
                  </div>
                )}
                {employee.hireDate && (
                  <div>
                    <Label className="text-muted-foreground">Hire Date</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium">{new Date(employee.hireDate).toLocaleDateString()}</p>
                    </div>
                  </div>
                )}
                {employee.terminationDate && (
                  <div>
                    <Label className="text-muted-foreground">Termination Date</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium text-destructive">{new Date(employee.terminationDate).toLocaleDateString()}</p>
                    </div>
                  </div>
                )}
              </div>
              {(employee.latitude && employee.longitude) && (
                <>
                  <Separator className="my-4" />
                  <div>
                    <Label className="text-muted-foreground flex items-center gap-2">
                      <Navigation className="h-4 w-4" />
                      GPS Location (Trinity Auto-Scheduling)
                    </Label>
                    <p className="font-medium mt-1 text-sm font-mono">
                      {parseFloat(employee.latitude).toFixed(6)}, {parseFloat(employee.longitude).toFixed(6)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Used for optimized driving distance calculations in Trinity scheduling
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Manager Assignment */}
        {employee && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-600" />
                Reporting Manager
              </CardTitle>
              <CardDescription>Assign a direct supervisor for this employee</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Assigned Manager</Label>
                <div className="flex items-center gap-2">
                  <Select
                    value={currentAssignment?.[0]?.managerId || ''}
                    onValueChange={(managerId) => assignManagerMutation.mutate(managerId)}
                    disabled={assignManagerMutation.isPending}
                  >
                    <SelectTrigger className="w-full" data-testid="select-assigned-manager">
                      <SelectValue placeholder="No manager assigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No manager</SelectItem>
                      {(managers || []).map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.firstName} {m.lastName}
                          {m.organizationalTitle ? ` — ${m.organizationalTitle}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {assignManagerMutation.isPending && (
                    <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground flex-shrink-0" />
                  )}
                </div>
                {currentAssignment?.[0]?.managerName && (
                  <p className="text-xs text-muted-foreground">
                    Currently reporting to: {currentAssignment[0].managerName}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Contact Information (Editable) */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Unlock className="h-5 w-5 text-blue-600" />
                  Contact Information (Editable)
                </CardTitle>
                <CardDescription>Keep your contact information up to date</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  <Unlock className="h-3 w-3 mr-1" />
                  Editable
                </Badge>
                {!isEditingContact && (
                  <Button onClick={() => setIsEditingContact(true)} data-testid="button-edit-contact">
                    Edit
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Phone Number</Label>
                  {isEditingContact ? (
                    <>
                      <Input
                        value={contactInfo.phone}
                        onChange={(e) => setContactInfo({ ...contactInfo, phone: e.target.value })}
                        placeholder="Enter phone number"
                        data-testid="input-phone"
                      />
                      <div className="rounded-md border border-border bg-muted/40 p-3 space-y-1.5 mt-2">
                        <div className="flex items-start gap-2.5">
                          <Checkbox
                            id="sms-consent"
                            checked={smsConsent}
                            onCheckedChange={(v) => setSmsConsent(v === true)}
                            data-testid="checkbox-sms-consent"
                          />
                          <label htmlFor="sms-consent" className="text-xs text-foreground/90 leading-snug cursor-pointer">
                            <strong>I agree to receive text messages (SMS) from CoAIleague</strong> including shift assignments,
                            schedule reminders, clock-in/clock-out confirmations, and urgent workforce alerts on behalf of my employer.
                            Msg &amp; data rates may apply. Reply STOP to unsubscribe.{" "}
                            <Link href="/sms-consent" className="underline hover:text-foreground">Learn more</Link>.
                          </label>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-1.5 mt-1">
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <p className="font-medium">{employee.phone || 'Not provided'}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          SMS alerts: {smsConsent ? <span className="text-green-600 dark:text-green-400 font-medium">Opted in</span> : <span>Not opted in</span>}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <Label>Email Address</Label>
                  <div className="mt-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                      <p className="font-medium" data-testid="text-current-email">{currentUser?.user?.email || employee.email || 'Not provided'}</p>
                    </div>
                    {pendingEmail ? (
                      <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2" data-testid="pending-email-notice">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
                          <p className="text-sm font-medium">Pending change to:</p>
                          <p className="text-sm font-mono text-foreground" data-testid="text-pending-email">{pendingEmail}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          A verification link was sent to <strong>{pendingEmail}</strong>. Click the link in that email to confirm.
                        </p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => resendEmailChangeMutation.mutate()}
                            disabled={resendEmailChangeMutation.isPending}
                            data-testid="button-resend-email-change"
                          >
                            {resendEmailChangeMutation.isPending ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3 mr-1" />
                            )}
                            Resend Link
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => cancelEmailChangeMutation.mutate()}
                            disabled={cancelEmailChangeMutation.isPending}
                            data-testid="button-cancel-email-change"
                          >
                            {cancelEmailChangeMutation.isPending ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <X className="h-3 w-3 mr-1" />
                            )}
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setNewEmailInput(''); setShowEmailDialog(true); }}
                        data-testid="button-change-email"
                      >
                        <Mail className="h-3 w-3 mr-1" />
                        Change Email
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Street Address</Label>
                  {isEditingContact ? (
                    <Input
                      value={contactInfo.address}
                      onChange={(e) => setContactInfo({ ...contactInfo, address: e.target.value })}
                      placeholder="123 Main St"
                      data-testid="input-address"
                    />
                  ) : (
                    <div className="flex items-center gap-2 mt-1">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium">{employee.address || 'Not provided'}</p>
                    </div>
                  )}
                </div>
                <div>
                  <Label>Address Line 2</Label>
                  {isEditingContact ? (
                    <Input
                      value={contactInfo.addressLine2}
                      onChange={(e) => setContactInfo({ ...contactInfo, addressLine2: e.target.value })}
                      placeholder="Apt 4B, Suite 100, etc."
                      data-testid="input-address-line2"
                    />
                  ) : (
                    <p className="font-medium mt-1">{employee.addressLine2 || 'N/A'}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label>City</Label>
                  {isEditingContact ? (
                    <Input
                      value={contactInfo.city}
                      onChange={(e) => setContactInfo({ ...contactInfo, city: e.target.value })}
                      placeholder="New York"
                      data-testid="input-city"
                    />
                  ) : (
                    <p className="font-medium mt-1">{employee.city || 'N/A'}</p>
                  )}
                </div>
                <div>
                  <Label>State</Label>
                  {isEditingContact ? (
                    <Input
                      value={contactInfo.state}
                      onChange={(e) => setContactInfo({ ...contactInfo, state: e.target.value })}
                      placeholder="NY"
                      maxLength={2}
                      data-testid="input-state"
                    />
                  ) : (
                    <p className="font-medium mt-1">{employee.state || 'N/A'}</p>
                  )}
                </div>
                <div>
                  <Label>ZIP Code</Label>
                  {isEditingContact ? (
                    <Input
                      value={contactInfo.zipCode}
                      onChange={(e) => setContactInfo({ ...contactInfo, zipCode: e.target.value })}
                      placeholder="10001"
                      data-testid="input-zip"
                    />
                  ) : (
                    <p className="font-medium mt-1">{employee.zipCode || 'N/A'}</p>
                  )}
                </div>
                <div>
                  <Label>Country</Label>
                  {isEditingContact ? (
                    <Input
                      value={contactInfo.country}
                      onChange={(e) => setContactInfo({ ...contactInfo, country: e.target.value })}
                      placeholder="US"
                      data-testid="input-country"
                    />
                  ) : (
                    <p className="font-medium mt-1">{employee.country || 'US'}</p>
                  )}
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Emergency Contact Name</Label>
                  {isEditingContact ? (
                    <Input
                      value={contactInfo.emergencyContactName}
                      onChange={(e) => setContactInfo({ ...contactInfo, emergencyContactName: e.target.value })}
                      placeholder="Enter contact name"
                      data-testid="input-emergency-name"
                    />
                  ) : (
                    <p className="font-medium mt-1">{employee.emergencyContactName || 'Not provided'}</p>
                  )}
                </div>
                <div>
                  <Label>Emergency Contact Phone</Label>
                  {isEditingContact ? (
                    <Input
                      value={contactInfo.emergencyContactPhone}
                      onChange={(e) => setContactInfo({ ...contactInfo, emergencyContactPhone: e.target.value })}
                      placeholder="Enter phone number"
                      data-testid="input-emergency-phone"
                    />
                  ) : (
                    <p className="font-medium mt-1">{employee.emergencyContactPhone || 'Not provided'}</p>
                  )}
                </div>
                <div>
                  <Label>Relationship</Label>
                  {isEditingContact ? (
                    <Input
                      value={contactInfo.emergencyContactRelation}
                      onChange={(e) => setContactInfo({ ...contactInfo, emergencyContactRelation: e.target.value })}
                      placeholder="e.g. Spouse, Parent"
                      data-testid="input-emergency-relation"
                    />
                  ) : (
                    <p className="font-medium mt-1">{employee.emergencyContactRelation || 'Not provided'}</p>
                  )}
                </div>
              </div>

              {isEditingContact && (
                <div className="flex gap-2 pt-4">
                  <Button
                    onClick={handleSaveContact}
                    disabled={updateContactMutation.isPending}
                    data-testid="button-save-contact"
                  >
                    {updateContactMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleCancelEdit}
                    disabled={updateContactMutation.isPending}
                    data-testid="button-cancel-edit"
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Language Preference */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-primary" />
                  Language Preference
                </CardTitle>
                <CardDescription>Choose your preferred language for notifications, HelpAI, and the mobile interface</CardDescription>
              </div>
              <Badge variant="outline">
                <Globe className="h-3 w-3 mr-1" />
                Bilingual
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                <div className="space-y-2">
                  <Label htmlFor="language-select">Interface Language</Label>
                  <Select
                    value={preferredLanguage}
                    onValueChange={(val) => setPreferredLanguage(val as 'en' | 'es')}
                  >
                    <SelectTrigger id="language-select" data-testid="select-language">
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en" data-testid="option-english">English</SelectItem>
                      <SelectItem value="es" data-testid="option-spanish">Español (Spanish)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    SMS notifications, HelpAI, and shift alerts will be sent in your chosen language.
                  </p>
                </div>
                <div>
                  <Button
                    onClick={() => updateLanguageMutation.mutate(preferredLanguage)}
                    disabled={updateLanguageMutation.isPending || preferredLanguage === ((currentUser as any)?.user?.preferredLanguage ?? 'en')}
                    data-testid="button-save-language"
                  >
                    {updateLanguageMutation.isPending ? (
                      <><Loader2 className="h-3 w-3 mr-2 animate-spin" />Saving...</>
                    ) : (
                      'Save Language'
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Locked Documents */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-destructive" />
                  Permanently Locked Documents
                </CardTitle>
                <CardDescription>Legal documents cannot be modified after approval</CardDescription>
              </div>
              <Badge variant="destructive">
                <Lock className="h-3 w-3 mr-1" />
                Immutable
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {lockedDocumentTypes.length > 0 ? (
              <div className="space-y-3">
                {lockedDocumentTypes.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between gap-2 p-3 bg-muted rounded-lg" data-testid={`locked-doc-${doc.id}`}>
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium">{doc.documentName}</p>
                        <p className="text-xs text-muted-foreground">
                          Approved on {new Date(doc.approvedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-blue-600" />
                      <Badge variant="secondary">
                        <Lock className="h-3 w-3 mr-1" />
                        Locked
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Lock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No locked documents yet</p>
                <p className="text-sm mt-1">Legal documents will appear here after approval</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </div>

      {/* Email Change Dialog */}
      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent data-testid="dialog-email-change">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Change Email Address
            </DialogTitle>
            <DialogDescription>
              Enter your new email address. A verification link will be sent there. Your current email remains active until you click the link.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="new-email-input">New Email Address</Label>
              <Input
                id="new-email-input"
                type="email"
                value={newEmailInput}
                onChange={(e) => setNewEmailInput(e.target.value)}
                placeholder="you@example.com"
                onKeyDown={(e) => { if (e.key === 'Enter') handleRequestEmailChange(); }}
                data-testid="input-new-email"
              />
            </div>
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription className="text-xs">
                For security, you must verify ownership of the new address before it takes effect. Check the inbox for <strong>{newEmailInput || 'your new email'}</strong> after submitting.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { setShowEmailDialog(false); setNewEmailInput(''); }}
              disabled={requestEmailChangeMutation.isPending}
              data-testid="button-cancel-email-dialog"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRequestEmailChange}
              disabled={requestEmailChangeMutation.isPending || !newEmailInput.trim()}
              data-testid="button-submit-email-change"
            >
              {requestEmailChangeMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                'Send Verification Link'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CanvasHubPage>
  );
}
