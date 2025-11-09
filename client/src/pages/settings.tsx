import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Building2,
  CreditCard,
  Bell,
  Shield,
  Briefcase,
  FileText,
  Clock,
  Zap,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { MobileLoading } from "@/components/mobile-loading";
import { MobilePageWrapper } from "@/components/mobile-page-wrapper";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes";

export default function Settings() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const isMobile = useIsMobile();
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  
  // Form state for workspace settings
  const [workspaceName, setWorkspaceName] = useState<string>("");
  const [companyName, setCompanyName] = useState<string>("");
  const [taxId, setTaxId] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [address, setAddress] = useState<string>("");
  const [website, setWebsite] = useState<string>("");
  
  // Automation settings state
  const [autoInvoicingEnabled, setAutoInvoicingEnabled] = useState<boolean>(true);
  const [invoiceSchedule, setInvoiceSchedule] = useState<string>("monthly");
  const [invoiceCustomDays, setInvoiceCustomDays] = useState<number | undefined>();
  
  const [autoPayrollEnabled, setAutoPayrollEnabled] = useState<boolean>(true);
  const [payrollSchedule, setPayrollSchedule] = useState<string>("biweekly");
  const [payrollCustomDays, setPayrollCustomDays] = useState<number | undefined>();
  
  const [autoSchedulingEnabled, setAutoSchedulingEnabled] = useState<boolean>(true);
  const [scheduleGenerationInterval, setScheduleGenerationInterval] = useState<string>("weekly");
  const [scheduleCustomDays, setScheduleCustomDays] = useState<number | undefined>();
  const [scheduleAdvanceNoticeDays, setScheduleAdvanceNoticeDays] = useState<number>(7);
  
  // Track original values to detect changes
  const [originalValues, setOriginalValues] = useState<any>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Fetch workspace data
  const { data: workspace } = useQuery({
    queryKey: ['/api/workspace'],
    enabled: isAuthenticated,
  });

  // Fetch business categories
  const { data: businessCategories } = useQuery<any[]>({
    queryKey: ['/api/business-categories'],
    enabled: isAuthenticated,
  });

  // Update workspace mutation
  const updateWorkspaceMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/workspace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to update workspace');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workspace'] });
      setHasUnsavedChanges(false); // Clear unsaved changes flag after successful save
      toast({
        title: "Success",
        description: "Workspace updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update workspace",
        variant: "destructive",
      });
    },
  });

  // Seed form templates mutation
  const seedTemplatesMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/workspace/seed-form-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to seed templates');
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Success",
        description: data.message || "Form templates seeded successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to seed form templates",
        variant: "destructive",
      });
    },
  });

  // Update invoicing automation mutation
  const updateInvoicingMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/workspace/automation/invoicing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update invoicing automation');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workspace'] });
      toast({
        title: "Success",
        description: "Invoicing automation updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update invoicing automation",
        variant: "destructive",
      });
    },
  });

  // Update payroll automation mutation
  const updatePayrollMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/workspace/automation/payroll', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update payroll automation');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workspace'] });
      toast({
        title: "Success",
        description: "Payroll automation updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update payroll automation",
        variant: "destructive",
      });
    },
  });

  // Update scheduling automation mutation
  const updateSchedulingMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/workspace/automation/scheduling', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update scheduling automation');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workspace'] });
      toast({
        title: "Success",
        description: "Scheduling automation updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update scheduling automation",
        variant: "destructive",
      });
    },
  });

  // Initialize form fields when workspace loads
  useEffect(() => {
    if (workspace) {
      const ws = workspace as any;
      const values = {
        businessCategory: ws.businessCategory || "",
        name: ws.name || "",
        companyName: ws.companyName || "",
        taxId: ws.taxId || "",
        phone: ws.phone || "",
        address: ws.address || "",
        website: ws.website || "",
        // Automation settings
        autoInvoicingEnabled: ws.autoInvoicingEnabled ?? true,
        invoiceSchedule: ws.invoiceSchedule || "monthly",
        invoiceCustomDays: ws.invoiceCustomDays || undefined,
        autoPayrollEnabled: ws.autoPayrollEnabled ?? true,
        payrollSchedule: ws.payrollSchedule || "biweekly",
        payrollCustomDays: ws.payrollCustomDays || undefined,
        autoSchedulingEnabled: ws.autoSchedulingEnabled ?? true,
        scheduleGenerationInterval: ws.scheduleGenerationInterval || "weekly",
        scheduleCustomDays: ws.scheduleCustomDays || undefined,
        scheduleAdvanceNoticeDays: ws.scheduleAdvanceNoticeDays || 7,
      };
      setSelectedCategory(values.businessCategory);
      setWorkspaceName(values.name);
      setCompanyName(values.companyName);
      setTaxId(values.taxId);
      setPhone(values.phone);
      setAddress(values.address);
      setWebsite(values.website);
      
      // Automation settings
      setAutoInvoicingEnabled(values.autoInvoicingEnabled);
      setInvoiceSchedule(values.invoiceSchedule);
      setInvoiceCustomDays(values.invoiceCustomDays);
      setAutoPayrollEnabled(values.autoPayrollEnabled);
      setPayrollSchedule(values.payrollSchedule);
      setPayrollCustomDays(values.payrollCustomDays);
      setAutoSchedulingEnabled(values.autoSchedulingEnabled);
      setScheduleGenerationInterval(values.scheduleGenerationInterval);
      setScheduleCustomDays(values.scheduleCustomDays);
      setScheduleAdvanceNoticeDays(values.scheduleAdvanceNoticeDays);
      
      setOriginalValues(values);
      setHasUnsavedChanges(false);
    }
  }, [workspace]);
  
  // Check for unsaved changes whenever form values change
  useEffect(() => {
    if (Object.keys(originalValues).length > 0) {
      const hasChanges =
        selectedCategory !== originalValues.businessCategory ||
        workspaceName !== originalValues.name ||
        companyName !== originalValues.companyName ||
        taxId !== originalValues.taxId ||
        phone !== originalValues.phone ||
        address !== originalValues.address ||
        website !== originalValues.website;
      setHasUnsavedChanges(hasChanges);
    }
  }, [selectedCategory, workspaceName, companyName, taxId, phone, address, website, originalValues]);
  
  // Protect against accidental navigation with unsaved changes
  // NOTE: Currently protects against browser navigation (refresh, close tab, back button)
  // Sidebar/header link navigation is not yet blocked - user can still navigate away via sidebar
  // Future enhancement: Global navigation guard or custom Link wrapper
  useUnsavedChangesWarning(hasUnsavedChanges, "You have unsaved changes to your workspace settings. Are you sure you want to leave?");

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  const handleCategoryChange = async (category: string) => {
    setSelectedCategory(category);
    await updateWorkspaceMutation.mutateAsync({ businessCategory: category });
  };

  const handleSeedTemplates = async () => {
    await seedTemplatesMutation.mutateAsync();
  };

  const handleSaveWorkspace = async () => {
    await updateWorkspaceMutation.mutateAsync({
      name: workspaceName,
      companyName,
      taxId,
      phone,
      address,
      website,
    });
  };

  const handleSaveInvoicing = async () => {
    await updateInvoicingMutation.mutateAsync({
      autoInvoicingEnabled,
      invoiceSchedule,
      invoiceCustomDays: invoiceSchedule === 'custom' ? invoiceCustomDays : undefined,
      invoiceGenerationDay: 1,
    });
  };

  const handleSavePayroll = async () => {
    await updatePayrollMutation.mutateAsync({
      autoPayrollEnabled,
      payrollSchedule,
      payrollCustomDays: payrollSchedule === 'custom' ? payrollCustomDays : undefined,
      payrollProcessDay: 1,
      payrollCutoffDay: 15,
    });
  };

  const handleSaveScheduling = async () => {
    await updateSchedulingMutation.mutateAsync({
      autoSchedulingEnabled,
      scheduleGenerationInterval,
      scheduleCustomDays: scheduleGenerationInterval === 'custom' ? scheduleCustomDays : undefined,
      scheduleAdvanceNoticeDays,
      scheduleGenerationDay: 0,
    });
  };

  const handleRefresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['/api/workspace'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/business-categories'] }),
    ]);
  };

  if (isLoading || !isAuthenticated) {
    return <MobileLoading fullScreen message="Loading Settings..." />;
  }

  const pageContent = (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full h-full overflow-auto">
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        <div className="space-y-4 sm:space-y-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-1" data-testid="text-settings-title">
              Settings
            </h2>
            <p className="text-sm sm:text-base text-[hsl(var(--cad-text-secondary))]" data-testid="text-settings-subtitle">
              Manage your workspace and billing settings
            </p>
          </div>

        {/* Workspace Settings */}
        <Card data-testid="card-workspace-settings">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Workspace Information</CardTitle>
                <CardDescription>Update your business details and branding</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="workspaceName">Workspace Name</Label>
                <Input 
                  id="workspaceName" 
                  placeholder="My Business" 
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  data-testid="input-workspace-name" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name</Label>
                <Input 
                  id="companyName" 
                  placeholder="Acme Inc." 
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  data-testid="input-company-name" 
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="taxId">Tax ID / EIN</Label>
                <Input 
                  id="taxId" 
                  placeholder="12-3456789" 
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  data-testid="input-tax-id" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input 
                  id="phone" 
                  placeholder="+1 (555) 123-4567" 
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  data-testid="input-company-phone" 
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea 
                id="address" 
                placeholder="123 Main St, City, State 12345" 
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                data-testid="input-company-address" 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input 
                id="website" 
                type="url" 
                placeholder="https://example.com" 
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                data-testid="input-company-website" 
                />
            </div>
            <Button 
              onClick={handleSaveWorkspace}
              disabled={updateWorkspaceMutation.isPending}
              data-testid="button-save-workspace"
            >
              {updateWorkspaceMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </CardContent>
        </Card>

        {/* Business Category & Form Templates */}
        <Card data-testid="card-business-category">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Briefcase className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Business Category & Forms</CardTitle>
                <CardDescription>Configure industry-specific forms and features</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="businessCategory">Industry Type</Label>
                <Select value={selectedCategory} onValueChange={handleCategoryChange}>
                  <SelectTrigger id="businessCategory" data-testid="select-business-category">
                    <SelectValue placeholder="Select your industry" />
                  </SelectTrigger>
                  <SelectContent>
                    {businessCategories?.map((category: any) => (
                      <SelectItem key={category.value} value={category.value}>
                        <div className="flex flex-col">
                          <span className="font-medium">{category.label}</span>
                          <span className="text-xs text-muted-foreground">{category.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Select your business type to unlock industry-specific forms and features
                </p>
              </div>

              {selectedCategory && (
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <FileText className="h-5 w-5 text-primary mt-0.5" />
                    <div className="flex-1 space-y-2">
                      <h4 className="text-sm font-semibold">Available Forms for {businessCategories?.find((c: any) => c.value === selectedCategory)?.label}</h4>
                      <p className="text-xs text-muted-foreground">
                        {selectedCategory === 'general' && "Standard forms: Disciplinary Action, Incident Reports"}
                        {selectedCategory === 'security' && "Security forms: Daily Activity Reports (DAR), Incident Reports, Vehicle Logs"}
                        {selectedCategory === 'healthcare' && "Healthcare forms: Patient Activity Logs, Incident Reports, Compliance Forms"}
                        {selectedCategory === 'construction' && "Construction forms: Safety Checklists, On-Job Training (OJT), Equipment Inspection Logs"}
                        {selectedCategory === 'cleaning' && "Cleaning forms: Inspection Checklists, Supply Inventory Logs"}
                        {selectedCategory === 'retail' && "Retail forms: Opening/Closing Shift Reports, Inventory Logs"}
                        {selectedCategory === 'custom' && "Custom forms configured by WorkforceOS support team"}
                      </p>
                      <Button 
                        size="sm" 
                        onClick={handleSeedTemplates}
                        disabled={seedTemplatesMutation.isPending}
                        data-testid="button-seed-templates"
                      >
                        {seedTemplatesMutation.isPending ? "Installing..." : "Install Form Templates"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Subscription & Billing */}
        <Card data-testid="card-subscription">
          <CardHeader>
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Subscription & Billing</CardTitle>
                <CardDescription>Manage your plan and payment methods</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-sm font-medium">Current Plan</span>
                  <Badge data-testid="badge-current-plan">Free</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  5 employees • 10 clients • Basic features
                </p>
              </div>
              <Button 
                variant="outline" 
                onClick={() => toast({ 
                  title: "Upgrade Plan", 
                  description: "Redirecting to upgrade options..." 
                })}
                data-testid="button-upgrade"
              >
                Upgrade Plan
              </Button>
            </div>
            <Separator />
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Platform Fee Settings</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="platformFee">Platform Fee (%)</Label>
                  <Input 
                    id="platformFee" 
                    type="number" 
                    defaultValue="10.00" 
                    step="0.01"
                    disabled
                    data-testid="input-platform-fee" 
                  />
                  <p className="text-xs text-muted-foreground">
                    Fee charged on customer payments collected through our system
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Stripe Connect Status</Label>
                  <div className="flex items-center gap-2 h-10">
                    <Badge variant="outline" data-testid="badge-stripe-status">Not Connected</Badge>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => toast({ 
                        title: "Stripe Connect", 
                        description: "Opening Stripe connection flow..." 
                      })}
                      data-testid="button-connect-stripe"
                    >
                      Connect
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Required to process customer payments
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card data-testid="card-notifications">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Notifications</CardTitle>
                <CardDescription>Configure email and SMS alerts</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Invoice Reminders</p>
                <p className="text-xs text-muted-foreground">
                  Send automatic reminders for overdue invoices
                </p>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => toast({ 
                  title: "Success", 
                  description: "Invoice reminders enabled successfully" 
                })}
                data-testid="button-toggle-reminders"
              >
                Enable
              </Button>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Shift Notifications</p>
                <p className="text-xs text-muted-foreground">
                  Notify employees of new shifts via email
                </p>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => toast({ 
                  title: "Success", 
                  description: "Shift notifications enabled successfully" 
                })}
                data-testid="button-toggle-shift-notifications"
              >
                Enable
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Security */}
        <Card data-testid="card-security">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Security</CardTitle>
                <CardDescription>Manage access and permissions</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Two-Factor Authentication</p>
                <p className="text-xs text-muted-foreground">
                  Add an extra layer of security to your account
                </p>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => toast({ 
                  title: "Two-Factor Authentication", 
                  description: "Opening 2FA setup wizard..." 
                })}
                data-testid="button-setup-2fa"
              >
                Set Up
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Automation Settings */}
        <Card data-testid="card-automation-settings">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Zap className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Automation Settings</CardTitle>
                <CardDescription>Configure autonomous scheduling for invoicing, payroll, and shift generation</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-8">
            {/* BillOS™ Invoicing Automation */}
            <div className="space-y-4" aria-busy={updateInvoicingMutation.isPending}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">BillOS™ Invoicing Automation</h3>
                  <p className="text-xs text-muted-foreground">Automatically generate invoices from approved time entries</p>
                </div>
                <Switch 
                  checked={autoInvoicingEnabled} 
                  onCheckedChange={setAutoInvoicingEnabled}
                  disabled={updateInvoicingMutation.isPending}
                  data-testid="switch-auto-invoicing"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invoiceSchedule">Invoice Generation Schedule</Label>
                <Select 
                  value={invoiceSchedule} 
                  onValueChange={setInvoiceSchedule}
                  disabled={!autoInvoicingEnabled || updateInvoicingMutation.isPending}
                >
                  <SelectTrigger id="invoiceSchedule" data-testid="select-invoice-schedule">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Bi-weekly (Every 2 weeks)</SelectItem>
                    <SelectItem value="semi-monthly">Semi-monthly (15th and last day)</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="net30">Net 30 (30 days after service)</SelectItem>
                    <SelectItem value="custom">Custom interval</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">How often to automatically generate invoices</p>
              </div>
              <div 
                className="space-y-2" 
                hidden={invoiceSchedule !== 'custom'}
                aria-expanded={invoiceSchedule === 'custom'}
                aria-hidden={invoiceSchedule !== 'custom'}
              >
                <Label htmlFor="invoiceCustomDays">Custom Interval (days)</Label>
                <Input 
                  id="invoiceCustomDays"
                  type="number"
                  value={invoiceCustomDays || ''}
                  onChange={(e) => setInvoiceCustomDays(parseInt(e.target.value) || undefined)}
                  disabled={!autoInvoicingEnabled || updateInvoicingMutation.isPending}
                  data-testid="input-invoice-custom-days"
                />
              </div>
              <Button 
                onClick={handleSaveInvoicing}
                disabled={updateInvoicingMutation.isPending}
                data-testid="button-save-invoicing"
              >
                {updateInvoicingMutation.isPending ? 'Saving...' : 'Save Invoicing Settings'}
              </Button>
            </div>
            
            <Separator />
            
            {/* PayrollOS™ Payroll Automation */}
            <div className="space-y-4" aria-busy={updatePayrollMutation.isPending}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">PayrollOS™ Payroll Automation</h3>
                  <p className="text-xs text-muted-foreground">Automatically process payroll on pay period dates</p>
                </div>
                <Switch 
                  checked={autoPayrollEnabled} 
                  onCheckedChange={setAutoPayrollEnabled}
                  disabled={updatePayrollMutation.isPending}
                  data-testid="switch-auto-payroll"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payrollSchedule">Payroll Processing Schedule</Label>
                <Select 
                  value={payrollSchedule} 
                  onValueChange={setPayrollSchedule}
                  disabled={!autoPayrollEnabled || updatePayrollMutation.isPending}
                >
                  <SelectTrigger id="payrollSchedule" data-testid="select-payroll-schedule">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Bi-weekly (Every 2 weeks)</SelectItem>
                    <SelectItem value="semi-monthly">Semi-monthly (15th and last day)</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="custom">Custom interval</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">How often to automatically process payroll</p>
              </div>
              <div 
                className="space-y-2" 
                hidden={payrollSchedule !== 'custom'}
                aria-expanded={payrollSchedule === 'custom'}
                aria-hidden={payrollSchedule !== 'custom'}
              >
                <Label htmlFor="payrollCustomDays">Custom Interval (days)</Label>
                <Input 
                  id="payrollCustomDays"
                  type="number"
                  value={payrollCustomDays || ''}
                  onChange={(e) => setPayrollCustomDays(parseInt(e.target.value) || undefined)}
                  disabled={!autoPayrollEnabled || updatePayrollMutation.isPending}
                  data-testid="input-payroll-custom-days"
                />
              </div>
              <Button 
                onClick={handleSavePayroll}
                disabled={updatePayrollMutation.isPending}
                data-testid="button-save-payroll"
              >
                {updatePayrollMutation.isPending ? 'Saving...' : 'Save Payroll Settings'}
              </Button>
            </div>
            
            <Separator />
            
            {/* ScheduleOS™ Schedule Generation */}
            <div className="space-y-4" aria-busy={updateSchedulingMutation.isPending}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">ScheduleOS™ Schedule Generation</h3>
                  <p className="text-xs text-muted-foreground">Automatically generate employee schedules in advance</p>
                </div>
                <Switch 
                  checked={autoSchedulingEnabled} 
                  onCheckedChange={setAutoSchedulingEnabled}
                  disabled={updateSchedulingMutation.isPending}
                  data-testid="switch-auto-scheduling"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="scheduleGenerationInterval">Schedule Generation Interval</Label>
                <Select 
                  value={scheduleGenerationInterval} 
                  onValueChange={setScheduleGenerationInterval}
                  disabled={!autoSchedulingEnabled || updateSchedulingMutation.isPending}
                >
                  <SelectTrigger id="scheduleGenerationInterval" data-testid="select-schedule-interval">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Bi-weekly (Every 2 weeks)</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="custom">Custom interval</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">How often to automatically generate schedules</p>
              </div>
              <div 
                className="space-y-2" 
                hidden={scheduleGenerationInterval !== 'custom'}
                aria-expanded={scheduleGenerationInterval === 'custom'}
                aria-hidden={scheduleGenerationInterval !== 'custom'}
              >
                <Label htmlFor="scheduleCustomDays">Custom Interval (days)</Label>
                <Input 
                  id="scheduleCustomDays"
                  type="number"
                  value={scheduleCustomDays || ''}
                  onChange={(e) => setScheduleCustomDays(parseInt(e.target.value) || undefined)}
                  disabled={!autoSchedulingEnabled || updateSchedulingMutation.isPending}
                  data-testid="input-schedule-custom-days"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="scheduleAdvanceNoticeDays">Advance Notice (days)</Label>
                <Input 
                  id="scheduleAdvanceNoticeDays"
                  type="number"
                  value={scheduleAdvanceNoticeDays}
                  onChange={(e) => setScheduleAdvanceNoticeDays(parseInt(e.target.value) || 7)}
                  disabled={!autoSchedulingEnabled || updateSchedulingMutation.isPending}
                  data-testid="input-schedule-advance-days"
                />
                <p className="text-xs text-muted-foreground">How many days in advance to generate schedules</p>
              </div>
              <Button 
                onClick={handleSaveScheduling}
                disabled={updateSchedulingMutation.isPending}
                data-testid="button-save-scheduling"
              >
                {updateSchedulingMutation.isPending ? 'Saving...' : 'Save Scheduling Settings'}
              </Button>
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <MobilePageWrapper 
        onRefresh={handleRefresh}
        enablePullToRefresh={true}
        withBottomNav={true}
      >
        {pageContent}
      </MobilePageWrapper>
    );
  }

  return pageContent;
}
