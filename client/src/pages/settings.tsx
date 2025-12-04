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
  Phone,
  Mail,
  MessageSquare,
  Check,
  AlertCircle,
  Calendar,
  Download,
  Upload,
  Link2,
  Copy,
  RefreshCw,
  Trash2,
  ExternalLink,
  Scale,
  Coffee,
  AlertTriangle,
  MapPin,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useIsMobile } from "@/hooks/use-mobile";
import { WorkspaceLayout } from "@/components/workspace-layout";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes";
import { SettingsCardSkeleton, PageHeaderSkeleton } from "@/components/loading-indicators/skeletons";

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
  
  // Break compliance settings state
  const [laborLawJurisdiction, setLaborLawJurisdiction] = useState<string>("US-FEDERAL");
  const [autoBreakSchedulingEnabled, setAutoBreakSchedulingEnabled] = useState<boolean>(true);
  const [breakComplianceAlerts, setBreakComplianceAlerts] = useState<boolean>(true);
  
  // Notification preferences state
  const [enableEmail, setEnableEmail] = useState<boolean>(true);
  const [enableSms, setEnableSms] = useState<boolean>(false);
  const [enablePush, setEnablePush] = useState<boolean>(true);
  const [enableShiftReminders, setEnableShiftReminders] = useState<boolean>(true);
  const [shiftReminderTiming, setShiftReminderTiming] = useState<string>('1hour');
  const [shiftReminderCustomMinutes, setShiftReminderCustomMinutes] = useState<number>(60);
  const [shiftReminderChannels, setShiftReminderChannels] = useState<string[]>(['email', 'push']);
  const [smsPhoneNumber, setSmsPhoneNumber] = useState<string>('');
  const [smsVerified, setSmsVerified] = useState<boolean>(false);
  const [testingSmS, setTestingSms] = useState<boolean>(false);
  
  // Digest and quiet hours state
  const [digestFrequency, setDigestFrequency] = useState<string>('realtime');
  const [enableAiSummarization, setEnableAiSummarization] = useState<boolean>(true);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState<boolean>(false);
  const [quietHoursStart, setQuietHoursStart] = useState<number>(22);
  const [quietHoursEnd, setQuietHoursEnd] = useState<number>(7);
  
  // Notification cleanup/retention state
  const [autoCleanupEnabled, setAutoCleanupEnabled] = useState<boolean>(true);
  const [retentionDays, setRetentionDays] = useState<number>(30);
  const [autoArchiveRead, setAutoArchiveRead] = useState<boolean>(true);
  
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

  // Fetch notification preferences
  const { data: notificationPrefs, isLoading: prefsLoading } = useQuery<any>({
    queryKey: ['/api/notifications/preferences'],
    enabled: isAuthenticated,
  });

  // Fetch SMS status
  const { data: smsStatus } = useQuery<any>({
    queryKey: ['/api/notifications/sms-status'],
    enabled: isAuthenticated,
  });

  // Fetch reminder options
  const { data: reminderOptions } = useQuery<any>({
    queryKey: ['/api/notifications/reminder-options'],
    enabled: isAuthenticated,
  });

  // Fetch labor law rules for jurisdiction selector
  const { data: laborLawRulesResponse } = useQuery<{ success: boolean; data: any[] }>({
    queryKey: ['/api/breaks/rules'],
    enabled: isAuthenticated,
  });
  const laborLawRules = laborLawRulesResponse?.data || [];

  // Fetch current workspace jurisdiction rules
  const { data: workspaceBreakRules } = useQuery<any>({
    queryKey: ['/api/breaks/rules/workspace'],
    enabled: isAuthenticated,
  });

  // Update break compliance settings mutation
  const updateBreakComplianceMutation = useMutation({
    mutationFn: async (data: { 
      laborLawJurisdiction: string; 
      autoBreakSchedulingEnabled: boolean; 
      breakComplianceAlerts: boolean; 
    }) => {
      const response = await fetch('/api/breaks/jurisdiction', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update break compliance settings');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workspace'] });
      queryClient.invalidateQueries({ queryKey: ['/api/breaks/rules/workspace'] });
      toast({
        title: "Success",
        description: "Break compliance settings updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update break compliance settings",
        variant: "destructive",
      });
    },
  });

  // Update notification preferences mutation
  const updateNotificationPrefsMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to update notification preferences');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/preferences'] });
      toast({
        title: "Success",
        description: "Notification preferences updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update notification preferences",
        variant: "destructive",
      });
    },
  });

  // Test SMS mutation
  const testSmsMutation = useMutation({
    mutationFn: async (phoneNumber: string) => {
      const response = await fetch('/api/notifications/test-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to send test SMS');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Test SMS sent successfully! Check your phone.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send test SMS",
        variant: "destructive",
      });
    },
  });

  // Verify phone number mutation
  const verifyPhoneMutation = useMutation({
    mutationFn: async (phoneNumber: string) => {
      const response = await fetch('/api/notifications/verify-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to verify phone number');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/preferences'] });
      setSmsVerified(true);
      toast({
        title: "Success",
        description: "Phone number verified successfully",
      });
    },
  });

  // Load notification preferences when data is available
  useEffect(() => {
    if (notificationPrefs) {
      setEnableEmail(notificationPrefs.enableEmail ?? true);
      setEnableSms(notificationPrefs.enableSms ?? false);
      setEnablePush(notificationPrefs.enablePush ?? true);
      setEnableShiftReminders(notificationPrefs.enableShiftReminders ?? true);
      setShiftReminderTiming(notificationPrefs.shiftReminderTiming ?? '1hour');
      setShiftReminderCustomMinutes(notificationPrefs.shiftReminderCustomMinutes ?? 60);
      setShiftReminderChannels(notificationPrefs.shiftReminderChannels ?? ['email', 'push']);
      setSmsPhoneNumber(notificationPrefs.smsPhoneNumber ?? '');
      setSmsVerified(notificationPrefs.smsVerified ?? false);
      // Digest and quiet hours
      setDigestFrequency(notificationPrefs.digestFrequency ?? 'realtime');
      setEnableAiSummarization(notificationPrefs.enableAiSummarization ?? true);
      setQuietHoursEnabled(notificationPrefs.quietHoursStart !== null && notificationPrefs.quietHoursStart !== undefined);
      setQuietHoursStart(notificationPrefs.quietHoursStart ?? 22);
      setQuietHoursEnd(notificationPrefs.quietHoursEnd ?? 7);
      // Cleanup settings
      setAutoCleanupEnabled(notificationPrefs.autoCleanupEnabled ?? true);
      setRetentionDays(notificationPrefs.retentionDays ?? 30);
      setAutoArchiveRead(notificationPrefs.autoArchiveRead ?? true);
    }
  }, [notificationPrefs]);

  // Helper to format quiet hours range for display
  const formatQuietHoursRange = () => {
    if (!quietHoursEnabled) return '';
    const formatHour = (h: number) => h === 0 ? '12:00 AM' : h < 12 ? `${h}:00 AM` : h === 12 ? '12:00 PM' : `${h - 12}:00 PM`;
    const startStr = formatHour(quietHoursStart);
    const endStr = formatHour(quietHoursEnd);
    if (quietHoursStart > quietHoursEnd) {
      return `${startStr} to ${endStr} (overnight)`;
    }
    return `${startStr} to ${endStr}`;
  };

  // Handle notification preferences save
  const handleSaveNotificationPrefs = () => {
    // Validate quiet hours before saving
    if (quietHoursEnabled) {
      const validStart = typeof quietHoursStart === 'number' && quietHoursStart >= 0 && quietHoursStart <= 23;
      const validEnd = typeof quietHoursEnd === 'number' && quietHoursEnd >= 0 && quietHoursEnd <= 23;
      
      if (!validStart || !validEnd) {
        toast({
          title: "Invalid Quiet Hours",
          description: "Please select valid hours between 12:00 AM and 11:00 PM",
          variant: "destructive",
        });
        return;
      }
      if (quietHoursStart === quietHoursEnd) {
        toast({
          title: "Invalid Quiet Hours",
          description: "Start and end times cannot be the same. Please adjust your quiet hours.",
          variant: "destructive",
        });
        return;
      }
      // Note: start > end is valid for overnight periods (e.g., 10 PM to 7 AM)
    }
    
    updateNotificationPrefsMutation.mutate({
      enableEmail,
      enableSms,
      enablePush,
      enableShiftReminders,
      shiftReminderTiming,
      shiftReminderCustomMinutes: shiftReminderTiming === 'custom' ? shiftReminderCustomMinutes : null,
      shiftReminderChannels,
      smsPhoneNumber: enableSms ? smsPhoneNumber : null,
      // Digest and quiet hours
      digestFrequency,
      enableAiSummarization,
      quietHoursStart: quietHoursEnabled ? quietHoursStart : null,
      quietHoursEnd: quietHoursEnabled ? quietHoursEnd : null,
      // Cleanup settings
      autoCleanupEnabled,
      retentionDays: autoCleanupEnabled ? retentionDays : null,
      autoArchiveRead,
    }, {
      onSuccess: () => {
        setHasUnsavedChanges(false);
      }
    });
  };

  // Handle test SMS
  const handleTestSms = () => {
    if (!smsPhoneNumber) {
      toast({
        title: "Error",
        description: "Please enter a phone number first",
        variant: "destructive",
      });
      return;
    }
    setTestingSms(true);
    testSmsMutation.mutate(smsPhoneNumber, {
      onSettled: () => setTestingSms(false),
    });
  };

  // Toggle channel in array
  const toggleChannel = (channel: string) => {
    if (shiftReminderChannels.includes(channel)) {
      if (shiftReminderChannels.length > 1) {
        setShiftReminderChannels(shiftReminderChannels.filter(c => c !== channel));
      }
    } else {
      setShiftReminderChannels([...shiftReminderChannels, channel]);
    }
  };

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
        // Break compliance settings
        laborLawJurisdiction: ws.laborLawJurisdiction || "US-FEDERAL",
        autoBreakSchedulingEnabled: ws.autoBreakSchedulingEnabled ?? true,
        breakComplianceAlerts: ws.breakComplianceAlerts ?? true,
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
      
      // Break compliance settings
      setLaborLawJurisdiction(values.laborLawJurisdiction);
      setAutoBreakSchedulingEnabled(values.autoBreakSchedulingEnabled);
      setBreakComplianceAlerts(values.breakComplianceAlerts);
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

  const handleSaveBreakCompliance = async () => {
    await updateBreakComplianceMutation.mutateAsync({
      laborLawJurisdiction,
      autoBreakSchedulingEnabled,
      breakComplianceAlerts,
    });
  };

  const handleRefresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['/api/workspace'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/business-categories'] }),
    ]);
  };

  const pageContent = isLoading ? (
    <div className="space-y-4 sm:space-y-6">
      <PageHeaderSkeleton />
      <SettingsCardSkeleton count={4} />
    </div>
  ) : (
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
          <CardContent className="space-y-6 mobile-compact-p">
            <div className="grid gap-4 md:grid-cols-2 mobile-cols-1">
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
            <div className="grid gap-4 md:grid-cols-2 mobile-cols-1">
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
                        {selectedCategory === 'custom' && "Custom forms configured by CoAIleague™ support team"}
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
            <div className="flex items-center justify-between mobile-flex-col mobile-gap-3">
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
              <div className="grid gap-4 md:grid-cols-2 mobile-cols-1">
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
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>Configure how you receive notifications via email, SMS, and in-app</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 mobile-compact-p">
            {/* Notification Channels */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Notification Channels</h3>
              <div className="flex items-center justify-between mobile-flex-col mobile-gap-3">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Email Notifications</p>
                    <p className="text-xs text-muted-foreground">Receive notifications via email</p>
                  </div>
                </div>
                <Switch 
                  checked={enableEmail} 
                  onCheckedChange={setEnableEmail}
                  data-testid="switch-enable-email"
                />
              </div>
              <div className="flex items-center justify-between mobile-flex-col mobile-gap-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">In-App Notifications</p>
                    <p className="text-xs text-muted-foreground">Receive push notifications in the app</p>
                  </div>
                </div>
                <Switch 
                  checked={enablePush} 
                  onCheckedChange={setEnablePush}
                  data-testid="switch-enable-push"
                />
              </div>
              <div className="flex items-center justify-between mobile-flex-col mobile-gap-3">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">SMS Notifications</p>
                    <p className="text-xs text-muted-foreground">
                      Receive text messages for important alerts
                      {!smsStatus?.configured && (
                        <span className="ml-2 text-yellow-600">(Twilio not configured)</span>
                      )}
                    </p>
                  </div>
                </div>
                <Switch 
                  checked={enableSms} 
                  onCheckedChange={setEnableSms}
                  disabled={!smsStatus?.configured}
                  data-testid="switch-enable-sms"
                />
              </div>
              
              {/* SMS Phone Number */}
              {enableSms && smsStatus?.configured && (
                <div className="space-y-2 pl-6">
                  <Label htmlFor="smsPhoneNumber">Phone Number for SMS</Label>
                  <div className="flex gap-2">
                    <Input 
                      id="smsPhoneNumber"
                      type="tel"
                      placeholder="+1 (555) 123-4567"
                      value={smsPhoneNumber}
                      onChange={(e) => setSmsPhoneNumber(e.target.value)}
                      className="flex-1"
                      data-testid="input-sms-phone"
                    />
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={handleTestSms}
                      disabled={testingSmS || !smsPhoneNumber}
                      data-testid="button-test-sms"
                    >
                      {testingSmS ? 'Sending...' : 'Test SMS'}
                    </Button>
                  </div>
                  {smsVerified ? (
                    <div className="flex items-center gap-1 text-xs text-green-600">
                      <Check className="h-3 w-3" /> Phone verified
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Send a test message to verify your phone number
                    </p>
                  )}
                </div>
              )}
            </div>

            <Separator />
            
            {/* Shift Reminders */}
            <div className="space-y-4">
              <div className="flex items-center justify-between mobile-flex-col mobile-gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Shift Reminders</h3>
                  <p className="text-xs text-muted-foreground">Get reminded before your shifts start</p>
                </div>
                <Switch 
                  checked={enableShiftReminders} 
                  onCheckedChange={setEnableShiftReminders}
                  data-testid="switch-enable-shift-reminders"
                />
              </div>
              
              {enableShiftReminders && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="shiftReminderTiming">Reminder Timing</Label>
                    <Select 
                      value={shiftReminderTiming} 
                      onValueChange={setShiftReminderTiming}
                    >
                      <SelectTrigger id="shiftReminderTiming" data-testid="select-reminder-timing">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {reminderOptions?.timingOptions?.map((option: any) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        )) || (
                          <>
                            <SelectItem value="15min">15 minutes before</SelectItem>
                            <SelectItem value="30min">30 minutes before</SelectItem>
                            <SelectItem value="1hour">1 hour before</SelectItem>
                            <SelectItem value="2hours">2 hours before</SelectItem>
                            <SelectItem value="4hours">4 hours before</SelectItem>
                            <SelectItem value="12hours">12 hours before</SelectItem>
                            <SelectItem value="24hours">24 hours before</SelectItem>
                            <SelectItem value="48hours">48 hours before</SelectItem>
                            <SelectItem value="custom">Custom</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {shiftReminderTiming === 'custom' && (
                    <div className="space-y-2">
                      <Label htmlFor="customMinutes">Custom Minutes Before</Label>
                      <Input 
                        id="customMinutes"
                        type="number"
                        min={5}
                        max={10080}
                        value={shiftReminderCustomMinutes}
                        onChange={(e) => setShiftReminderCustomMinutes(parseInt(e.target.value) || 60)}
                        data-testid="input-custom-minutes"
                      />
                      <p className="text-xs text-muted-foreground">
                        Enter minutes (5 min to 7 days)
                      </p>
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <Label>Reminder Channels</Label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant={shiftReminderChannels.includes('push') ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => toggleChannel('push')}
                        disabled={!enablePush}
                        data-testid="button-channel-push"
                      >
                        <MessageSquare className="h-4 w-4 mr-1" />
                        In-App
                      </Button>
                      <Button
                        variant={shiftReminderChannels.includes('email') ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => toggleChannel('email')}
                        disabled={!enableEmail}
                        data-testid="button-channel-email"
                      >
                        <Mail className="h-4 w-4 mr-1" />
                        Email
                      </Button>
                      <Button
                        variant={shiftReminderChannels.includes('sms') ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => toggleChannel('sms')}
                        disabled={!enableSms || !smsStatus?.configured}
                        data-testid="button-channel-sms"
                      >
                        <Phone className="h-4 w-4 mr-1" />
                        SMS
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Select which channels to use for shift reminders
                    </p>
                  </div>
                </>
              )}
            </div>

            <Separator />
            
            {/* Notification Digest Settings */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold">Notification Digest</h3>
                <p className="text-xs text-muted-foreground">Choose how often to receive notification summaries</p>
              </div>
              
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="digestFrequency">Digest Frequency</Label>
                  <Select 
                    value={digestFrequency} 
                    onValueChange={(value) => {
                      setDigestFrequency(value);
                      setHasUnsavedChanges(true);
                    }}
                  >
                    <SelectTrigger id="digestFrequency" data-testid="select-digest-frequency">
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="realtime" data-testid="option-digest-realtime">Real-time (Immediate)</SelectItem>
                      <SelectItem value="15min" data-testid="option-digest-15min">Every 15 minutes</SelectItem>
                      <SelectItem value="1hour" data-testid="option-digest-1hour">Every hour</SelectItem>
                      <SelectItem value="4hours" data-testid="option-digest-4hours">Every 4 hours</SelectItem>
                      <SelectItem value="daily" data-testid="option-digest-daily">Daily digest</SelectItem>
                      <SelectItem value="never" data-testid="option-digest-never">Never (Disable digests)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {digestFrequency === 'realtime' ? 'Receive notifications immediately as they happen' :
                     digestFrequency === 'never' ? 'Notifications will be available in-app only' :
                     'Notifications will be batched and summarized'}
                  </p>
                </div>
                
                {digestFrequency !== 'realtime' && digestFrequency !== 'never' && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">AI Summarization</p>
                        <p className="text-xs text-muted-foreground">Use AI to create smart notification summaries</p>
                      </div>
                    </div>
                    <Switch 
                      checked={enableAiSummarization} 
                      onCheckedChange={(checked) => {
                        setEnableAiSummarization(checked);
                        setHasUnsavedChanges(true);
                      }}
                      data-testid="switch-ai-summarization"
                    />
                  </div>
                )}
              </div>
            </div>

            <Separator />
            
            {/* Quiet Hours */}
            <div className="space-y-4">
              <div className="flex items-center justify-between mobile-flex-col mobile-gap-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <h3 className="text-sm font-semibold">Quiet Hours</h3>
                    <p className="text-xs text-muted-foreground">Pause notifications during specific hours</p>
                  </div>
                </div>
                <Switch 
                  checked={quietHoursEnabled} 
                  onCheckedChange={(checked) => {
                    setQuietHoursEnabled(checked);
                    setHasUnsavedChanges(true);
                  }}
                  data-testid="switch-quiet-hours-enabled"
                />
              </div>
              
              {quietHoursEnabled && (
                <div className="grid gap-4 md:grid-cols-2 pl-6">
                  <div className="space-y-2">
                    <Label htmlFor="quietStart">Start Time</Label>
                    <Select 
                      value={String(quietHoursStart)} 
                      onValueChange={(v) => {
                        const hour = Math.min(23, Math.max(0, Number(v)));
                        setQuietHoursStart(hour);
                        setHasUnsavedChanges(true);
                      }}
                    >
                      <SelectTrigger id="quietStart" data-testid="select-quiet-hours-start">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 24 }, (_, i) => (
                          <SelectItem key={i} value={String(i)} data-testid={`option-quiet-start-${i}`}>
                            {i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quietEnd">End Time</Label>
                    <Select 
                      value={String(quietHoursEnd)} 
                      onValueChange={(v) => {
                        const hour = Math.min(23, Math.max(0, Number(v)));
                        setQuietHoursEnd(hour);
                        setHasUnsavedChanges(true);
                      }}
                    >
                      <SelectTrigger id="quietEnd" data-testid="select-quiet-hours-end">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 24 }, (_, i) => (
                          <SelectItem key={i} value={String(i)} data-testid={`option-quiet-end-${i}`}>
                            {i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {quietHoursStart === quietHoursEnd && (
                    <p className="text-xs text-yellow-600 md:col-span-2" data-testid="text-quiet-hours-warning">
                      Warning: Start and end times are the same - quiet hours will be disabled
                    </p>
                  )}
                  {quietHoursStart !== quietHoursEnd && quietHoursStart > quietHoursEnd && (
                    <p className="text-xs text-blue-600 md:col-span-2" data-testid="text-quiet-hours-overnight">
                      Overnight quiet hours: {formatQuietHoursRange()}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground md:col-span-2">
                    Notifications will be held during quiet hours and delivered when they end
                  </p>
                </div>
              )}
            </div>

            <Separator />
            
            {/* Notification Cleanup & Retention */}
            <div className="space-y-4">
              <div className="flex items-center justify-between mobile-flex-col mobile-gap-3">
                <div className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <h3 className="text-sm font-semibold">Auto-Cleanup</h3>
                    <p className="text-xs text-muted-foreground">Automatically remove old notifications</p>
                  </div>
                </div>
                <Switch 
                  checked={autoCleanupEnabled} 
                  onCheckedChange={(checked) => {
                    setAutoCleanupEnabled(checked);
                    setHasUnsavedChanges(true);
                  }}
                  data-testid="switch-auto-cleanup"
                />
              </div>
              
              {autoCleanupEnabled && (
                <div className="grid gap-4 md:grid-cols-2 pl-6">
                  <div className="space-y-2">
                    <Label htmlFor="retentionDays">Keep Notifications For</Label>
                    <Select 
                      value={String(retentionDays)} 
                      onValueChange={(v) => {
                        setRetentionDays(Number(v));
                        setHasUnsavedChanges(true);
                      }}
                    >
                      <SelectTrigger id="retentionDays" data-testid="select-retention-days">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7" data-testid="option-retention-7">7 days</SelectItem>
                        <SelectItem value="14" data-testid="option-retention-14">14 days</SelectItem>
                        <SelectItem value="30" data-testid="option-retention-30">30 days</SelectItem>
                        <SelectItem value="60" data-testid="option-retention-60">60 days</SelectItem>
                        <SelectItem value="90" data-testid="option-retention-90">90 days</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Notifications older than this will be automatically deleted
                    </p>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Auto-Archive Read</p>
                        <p className="text-xs text-muted-foreground">Move read notifications to archive faster</p>
                      </div>
                    </div>
                    <Switch 
                      checked={autoArchiveRead} 
                      onCheckedChange={(checked) => {
                        setAutoArchiveRead(checked);
                        setHasUnsavedChanges(true);
                      }}
                      data-testid="switch-auto-archive-read"
                    />
                  </div>
                </div>
              )}
            </div>

            <Separator />
            
            <Button 
              onClick={handleSaveNotificationPrefs}
              disabled={updateNotificationPrefsMutation.isPending}
              data-testid="button-save-notifications"
            >
              {updateNotificationPrefsMutation.isPending ? 'Saving...' : 'Save Notification Settings'}
            </Button>
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
          <CardContent className="space-y-4 mobile-compact-p">
            <div className="flex items-center justify-between mobile-flex-col mobile-gap-3">
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

        {/* Calendar Integration */}
        <CalendarIntegrationCard />

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
          <CardContent className="space-y-8 mobile-compact-p">
            {/* Smart Billing Automation */}
            <div className="space-y-4" aria-busy={updateInvoicingMutation.isPending}>
              <div className="flex items-center justify-between mobile-flex-col mobile-gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Smart Billing Automation</h3>
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
            
            {/* Auto Payroll Automation */}
            <div className="space-y-4" aria-busy={updatePayrollMutation.isPending}>
              <div className="flex items-center justify-between mobile-flex-col mobile-gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Auto Payroll Automation</h3>
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
            
            {/* AI Scheduling Automation */}
            <div className="space-y-4" aria-busy={updateSchedulingMutation.isPending}>
              <div className="flex items-center justify-between mobile-flex-col mobile-gap-3">
                <div>
                  <h3 className="text-sm font-semibold">AI Scheduling Automation</h3>
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

        {/* Break Compliance Settings */}
        <Card data-testid="card-break-compliance">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Scale className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Break Compliance Settings</CardTitle>
                <CardDescription>Configure automatic break scheduling based on local labor laws</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 mobile-compact-p">
            {/* Jurisdiction Selector */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="laborLawJurisdiction">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    Labor Law Jurisdiction
                  </div>
                </Label>
                <Select 
                  value={laborLawJurisdiction} 
                  onValueChange={setLaborLawJurisdiction}
                  disabled={updateBreakComplianceMutation.isPending}
                >
                  <SelectTrigger id="laborLawJurisdiction" data-testid="select-jurisdiction">
                    <SelectValue placeholder="Select jurisdiction" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="US-FEDERAL">
                      <div className="flex flex-col">
                        <span className="font-medium">US Federal (FLSA)</span>
                        <span className="text-xs text-muted-foreground">Federal minimum standards</span>
                      </div>
                    </SelectItem>
                    {laborLawRules.filter((rule: any) => rule.jurisdiction !== 'US-FEDERAL').map((rule: any) => (
                      <SelectItem key={rule.jurisdiction} value={rule.jurisdiction}>
                        <div className="flex flex-col">
                          <span className="font-medium">{rule.jurisdictionName}</span>
                          <span className="text-xs text-muted-foreground">
                            {rule.mealBreakEnabled ? `${rule.mealBreakDurationMinutes} min meal break` : 'No meal break required'}
                            {rule.restBreakEnabled ? `, ${rule.restBreakDurationMinutes} min rest break` : ''}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Select the state or jurisdiction whose labor laws apply to your workplace
                </p>
              </div>

              {/* Current Jurisdiction Rules Display */}
              {workspaceBreakRules && (
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Coffee className="h-4 w-4" />
                    Current Break Rules: {workspaceBreakRules.jurisdictionName}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    {workspaceBreakRules.mealBreakEnabled && (
                      <div className="flex items-start gap-2">
                        <Badge variant="secondary" className="text-xs">Meal</Badge>
                        <span className="text-muted-foreground">
                          {workspaceBreakRules.mealBreakDurationMinutes} min 
                          {workspaceBreakRules.mealBreakIsPaid ? ' (paid)' : ' (unpaid)'}
                          {' '}for {workspaceBreakRules.mealBreakMinShiftHours}+ hour shifts
                        </span>
                      </div>
                    )}
                    {workspaceBreakRules.restBreakEnabled && (
                      <div className="flex items-start gap-2">
                        <Badge variant="outline" className="text-xs">Rest</Badge>
                        <span className="text-muted-foreground">
                          {workspaceBreakRules.restBreakDurationMinutes} min 
                          {workspaceBreakRules.restBreakIsPaid ? ' (paid)' : ' (unpaid)'}
                          {' '}every {workspaceBreakRules.restBreakFrequencyHours} hours
                        </span>
                      </div>
                    )}
                    {!workspaceBreakRules.mealBreakEnabled && !workspaceBreakRules.restBreakEnabled && (
                      <div className="col-span-2 text-muted-foreground">
                        No mandatory break requirements for adult employees in this jurisdiction.
                        {workspaceBreakRules.notes && <p className="mt-1 text-xs">{workspaceBreakRules.notes}</p>}
                      </div>
                    )}
                  </div>
                  {workspaceBreakRules.legalReference && (
                    <p className="text-xs text-muted-foreground border-t pt-2 mt-2">
                      Reference: {workspaceBreakRules.legalReference}
                    </p>
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* Auto Break Scheduling */}
            <div className="space-y-4">
              <div className="flex items-center justify-between mobile-flex-col mobile-gap-3">
                <div className="flex items-center gap-2">
                  <Coffee className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Automatic Break Scheduling</p>
                    <p className="text-xs text-muted-foreground">
                      Automatically add required breaks to shifts based on jurisdiction rules
                    </p>
                  </div>
                </div>
                <Switch 
                  checked={autoBreakSchedulingEnabled} 
                  onCheckedChange={setAutoBreakSchedulingEnabled}
                  disabled={updateBreakComplianceMutation.isPending}
                  data-testid="switch-auto-break-scheduling"
                />
              </div>
            </div>

            {/* Compliance Alerts */}
            <div className="space-y-4">
              <div className="flex items-center justify-between mobile-flex-col mobile-gap-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Break Compliance Alerts</p>
                    <p className="text-xs text-muted-foreground">
                      Show warnings when shifts don't have required breaks scheduled
                    </p>
                  </div>
                </div>
                <Switch 
                  checked={breakComplianceAlerts} 
                  onCheckedChange={setBreakComplianceAlerts}
                  disabled={updateBreakComplianceMutation.isPending}
                  data-testid="switch-break-compliance-alerts"
                />
              </div>
            </div>

            <Separator />

            <Button 
              onClick={handleSaveBreakCompliance}
              disabled={updateBreakComplianceMutation.isPending}
              data-testid="button-save-break-compliance"
            >
              {updateBreakComplianceMutation.isPending ? 'Saving...' : 'Save Break Compliance Settings'}
            </Button>
          </CardContent>
        </Card>
      </div>
  );

  if (isMobile) {
    return (
      <WorkspaceLayout>
        {pageContent}
      </WorkspaceLayout>
    );
  }

  return (
    <WorkspaceLayout maxWidth="7xl">
      {pageContent}
    </WorkspaceLayout>
  );
}

function CalendarIntegrationCard() {
  const { toast } = useToast();
  const [importing, setImporting] = useState(false);
  const fileInputRef = useState<HTMLInputElement | null>(null);

  const { data: calendarStatus } = useQuery<{
    enabled: boolean;
    importEnabled: boolean;
    googleCalendarEnabled: boolean;
    subscriptionCount: number;
    features: {
      tokenBasedSubscriptions: boolean;
      icalImport: boolean;
      conflictDetection: boolean;
      aiIntegration: boolean;
    };
  }>({
    queryKey: ['/api/calendar/status'],
  });

  const { data: subscriptions, refetch: refetchSubscriptions } = useQuery<{
    success: boolean;
    subscriptions: Array<{
      id: string;
      name: string;
      subscriptionType: string;
      token: string;
      lastAccessedAt: string | null;
      accessCount: number;
      createdAt: string;
      urls: {
        icsUrl: string;
        webcalUrl: string;
        googleCalendarSubscribeUrl: string;
        outlookSubscribeUrl: string;
        appleCalendarUrl: string;
        refreshInterval: number;
      };
    }>;
  }>({
    queryKey: ['/api/calendar/subscriptions'],
    enabled: !!calendarStatus?.enabled,
  });

  const createSubscriptionMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      return apiRequest('POST', '/api/calendar/subscriptions', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/subscriptions'] });
      toast({
        title: "Success",
        description: "Calendar subscription created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create subscription",
        variant: "destructive",
      });
    },
  });

  const deleteSubscriptionMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/calendar/subscriptions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/subscriptions'] });
      toast({
        title: "Success",
        description: "Subscription revoked successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to revoke subscription",
        variant: "destructive",
      });
    },
  });

  const regenerateTokenMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('POST', `/api/calendar/subscriptions/${id}/regenerate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/subscriptions'] });
      toast({
        title: "Success",
        description: "Subscription URL regenerated",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to regenerate token",
        variant: "destructive",
      });
    },
  });

  const handleExportCalendar = async () => {
    try {
      const response = await fetch('/api/calendar/export/ical', {
        credentials: 'include',
      });
      
      if (!response.ok) throw new Error('Failed to export calendar');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `schedule-${new Date().toISOString().split('T')[0]}.ics`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Success",
        description: "Calendar exported successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to export calendar",
        variant: "destructive",
      });
    }
  };

  const handleImportCalendar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('conflictResolution', 'skip');

    try {
      const response = await fetch('/api/calendar/import/ical', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      const data = await response.json();
      
      if (!response.ok) throw new Error(data.error || 'Failed to import calendar');

      toast({
        title: data.success ? "Import Complete" : "Import Failed",
        description: data.message || `Imported ${data.result?.eventsImported || 0} events`,
        variant: data.success ? "default" : "destructive",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to import calendar",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied",
        description: `${label} copied to clipboard`,
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  if (!calendarStatus?.enabled) {
    return (
      <Card data-testid="card-calendar-integration">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-muted-foreground">Calendar Integration</CardTitle>
              <CardDescription>Calendar export/import is not enabled for this workspace</CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card data-testid="card-calendar-integration">
      <CardHeader>
        <div className="flex items-center gap-3">
          <Calendar className="h-5 w-5 text-primary" />
          <div>
            <CardTitle>Calendar Integration</CardTitle>
            <CardDescription>Export your schedule to external calendar apps or import events</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 mobile-compact-p">
        {/* Export Section */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export Calendar
          </h3>
          <p className="text-xs text-muted-foreground">
            Download your schedule as an iCal file to import into Google Calendar, Apple Calendar, or Outlook.
          </p>
          <Button
            onClick={handleExportCalendar}
            variant="outline"
            className="w-full sm:w-auto"
            data-testid="button-export-calendar"
          >
            <Download className="h-4 w-4 mr-2" />
            Export Schedule (.ics)
          </Button>
        </div>

        <Separator />

        {/* Subscription URLs Section */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Calendar Subscription
          </h3>
          <p className="text-xs text-muted-foreground">
            Subscribe to your schedule in external calendar apps. Changes will automatically sync.
          </p>

          {subscriptions?.subscriptions && subscriptions.subscriptions.length > 0 ? (
            <div className="space-y-3">
              {subscriptions.subscriptions.map((sub) => (
                <div 
                  key={sub.id} 
                  className="p-3 rounded-lg border bg-muted/30 space-y-2"
                  data-testid={`subscription-${sub.id}`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-medium text-sm">{sub.name}</span>
                    <div className="flex items-center gap-1">
                      <Badge variant="secondary" className="text-xs">
                        {sub.accessCount} syncs
                      </Badge>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => regenerateTokenMutation.mutate(sub.id)}
                        disabled={regenerateTokenMutation.isPending}
                        data-testid={`button-regenerate-${sub.id}`}
                      >
                        <RefreshCw className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteSubscriptionMutation.mutate(sub.id)}
                        disabled={deleteSubscriptionMutation.isPending}
                        data-testid={`button-delete-${sub.id}`}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(sub.urls.icsUrl, 'iCal URL')}
                      data-testid={`button-copy-ical-${sub.id}`}
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copy URL
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(sub.urls.googleCalendarSubscribeUrl, '_blank')}
                      data-testid={`button-google-${sub.id}`}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Google Calendar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(sub.urls.outlookSubscribeUrl, '_blank')}
                      data-testid={`button-outlook-${sub.id}`}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Outlook
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(sub.urls.appleCalendarUrl, '_blank')}
                      data-testid={`button-apple-${sub.id}`}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Apple Calendar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-muted-foreground text-sm">
              No active subscriptions. Create one to sync with external calendars.
            </div>
          )}

          <Button
            onClick={() => createSubscriptionMutation.mutate({ name: 'My Work Schedule' })}
            disabled={createSubscriptionMutation.isPending}
            variant="outline"
            className="w-full sm:w-auto"
            data-testid="button-create-subscription"
          >
            <Link2 className="h-4 w-4 mr-2" />
            {createSubscriptionMutation.isPending ? 'Creating...' : 'Create Subscription URL'}
          </Button>
        </div>

        {calendarStatus?.importEnabled && (
          <>
            <Separator />

            {/* Import Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Import Calendar
              </h3>
              <p className="text-xs text-muted-foreground">
                Import events from an iCal file (.ics) to create shifts. Conflicts with existing shifts will be skipped.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept=".ics,.ical,text/calendar"
                  onChange={handleImportCalendar}
                  disabled={importing}
                  className="hidden"
                  id="calendar-import-input"
                  data-testid="input-import-file"
                />
                <Button
                  variant="outline"
                  disabled={importing}
                  onClick={() => document.getElementById('calendar-import-input')?.click()}
                  className="w-full sm:w-auto"
                  data-testid="button-import-calendar"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {importing ? 'Importing...' : 'Import from File (.ics)'}
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Features Info */}
        <div className="pt-2">
          <div className="flex flex-wrap gap-2">
            {calendarStatus?.features?.tokenBasedSubscriptions && (
              <Badge variant="secondary" className="text-xs">
                <Check className="h-3 w-3 mr-1" />
                Secure Subscriptions
              </Badge>
            )}
            {calendarStatus?.features?.conflictDetection && (
              <Badge variant="secondary" className="text-xs">
                <Check className="h-3 w-3 mr-1" />
                Conflict Detection
              </Badge>
            )}
            {calendarStatus?.features?.aiIntegration && (
              <Badge variant="secondary" className="text-xs">
                <Check className="h-3 w-3 mr-1" />
                AI Sync Tracking
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
