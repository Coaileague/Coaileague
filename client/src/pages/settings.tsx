import { useEffect, useState, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalDescription } from "@/components/ui/universal-modal";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { queryKeys } from "@/config/queryKeys";
import { secureFetch } from "@/lib/csrf";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
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
  User,
  Settings2,
  Sparkles,
  CheckCircle2,
  XCircle,
  Palette,
  Image,
  UserPlus,
  Send,
  ClipboardCopy,
  Users,
  DollarSign,
  Receipt,
  Landmark,
  PiggyBank,
  TrendingUp,
  CircleCheck,
  CircleX,
  ChevronRight,
  Info,
  Percent,
  Hash,
  ClipboardList,
  Wallet,
  HardDrive,
  Database,
  Lock,
  Eye,
  EyeOff,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes";
import { SettingsCardSkeleton, PageHeaderSkeleton } from "@/components/loading-indicators/skeletons";
import { SimpleModeToggle } from "@/components/SimpleModeToggle";
import { useSimpleMode } from "@/contexts/SimpleModeContext";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { apiFetch } from "@/lib/apiError";
import { WorkspaceResponse, OnboardingStatusResponse } from "@shared/schemas/responses/workspace";

const settingsConfig: CanvasPageConfig = {
  id: 'settings',
  title: 'Settings',
  subtitle: 'Configure your workspace, notifications, and automation preferences',
  category: 'settings',
};

const profileSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
});

const workspaceSchema = z.object({
  name: z.string().min(1, "Workspace name is required"),
  companyName: z.string().min(1, "Company name is required"),
  taxId: z.string().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  website: z.string().optional().or(z.literal("")),
  companyCity: z.string().optional().or(z.literal("")),
  companyState: z.string().max(2, "Use 2-letter state code").optional().or(z.literal("")),
  companyZip: z.string().optional().or(z.literal("")),
  stateLicenseNumber: z.string().optional().or(z.literal("")),
  stateLicenseState: z.string().max(2).optional().or(z.literal("")),
  stateLicenseExpiry: z.string().optional().or(z.literal("")),
  logoUrl: z.string().optional().or(z.literal("")),
  brandColor: z.string().optional().or(z.literal("")),
});

const invoiceFinancialsSchema = z.object({
  invoicePrefix: z.string().min(1, "Prefix is required"),
  invoiceNextNumber: z.coerce.number().min(1, "Next number must be at least 1"),
  lateFeePercentage: z.coerce.number().min(0).max(100),
  lateFeeDays: z.coerce.number().min(0),
  billingEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  paymentTermsDays: z.coerce.number().min(0),
  defaultTaxRate: z.coerce.number().min(0).max(100),
});

const payrollFinancialsSchema = z.object({
  stateUnemploymentRate: z.coerce.number().min(0).max(100),
  workerCompRate: z.coerce.number().min(0).max(100),
  payrollBankName: z.string().optional().or(z.literal("")),
  payrollBankRouting: z.string().regex(/^\d{9}$/, "Routing number must be 9 digits").optional().or(z.literal("")),
  payrollBankAccount: z.string().optional().or(z.literal("")),
  payrollMemo: z.string().optional().or(z.literal("")),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must not exceed 72 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[!@#$%^&*(),.?":{}|<>]/, "Password must contain at least one special character"),
  confirmPassword: z.string().min(1, "Please confirm your new password"),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type ProfileFormValues = z.infer<typeof profileSchema>;
type WorkspaceFormValues = z.infer<typeof workspaceSchema>;
type InvoiceFinancialsFormValues = z.infer<typeof invoiceFinancialsSchema>;
type PayrollFinancialsFormValues = z.infer<typeof payrollFinancialsSchema>;
type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

// Settings section configuration for navigation
const SETTINGS_SECTIONS = [
  { id: 'profile', label: 'My Profile', icon: User, description: 'Your personal information' },
  { id: 'quick', label: 'Quick Settings', icon: Sparkles, description: 'Most-used settings' },
  { id: 'notifications', label: 'Notifications', icon: Bell, description: 'How you receive alerts' },
  { id: 'organization', label: 'Organization', icon: Building2, description: 'Business info & branding' },
  { id: 'financial', label: 'Financial', icon: DollarSign, description: 'Invoice, payroll & tax config' },
  { id: 'automation', label: 'Automation', icon: Zap, description: 'AI-powered workflows' },
  { id: 'compliance', label: 'Compliance', icon: Scale, description: 'Labor laws & breaks' },
  { id: 'storage', label: 'Storage', icon: HardDrive, description: 'Quota & usage by category' },
  { id: 'billing', label: 'Billing', icon: CreditCard, description: 'Plans & payments' },
] as const;

type SettingsSection = typeof SETTINGS_SECTIONS[number]['id'];

function ProfileTabContent() {
  const { toast } = useToast();

  const { data: session, isLoading: sessionLoading } = useQuery<{ user?: any }>({
    queryKey: ['/api/auth/me'],
    staleTime: 5 * 60 * 1000,
  });

  const currentUser = (session as any)?.user || session;

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
    },
  });

  useEffect(() => {
    if (currentUser) {
      form.reset({
        firstName: currentUser?.firstName || '',
        lastName: currentUser?.lastName || '',
        email: currentUser?.email || '',
        phone: currentUser?.phone || '',
      });
    }
  }, [session, form]);

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [newEmailInput, setNewEmailInput] = useState('');
  const [showPinInput, setShowPinInput] = useState(false);
  const [newPin, setNewPin] = useState('');

  const { isDirty } = form.formState;

  // Intercept navigation attempts when form is dirty
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormValues) => {
      // Email is intentionally excluded — changes are handled via the verified email-change flow
      const res = await apiRequest('PATCH', '/api/auth/profile', {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      toast({
        title: "Profile Updated",
        description: "Your personal information has been saved.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update profile",
        variant: "destructive",
      });
    },
  });

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
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: "Request Failed",
        description: err?.message || "Unable to request email change. Please try again.",
      });
    },
  });

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

  const setPinMutation = useMutation({
    mutationFn: async (pin: string) => {
      const res = await apiRequest('POST', '/api/employees/me/pin/set', { pin });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to set PIN');
      return data;
    },
    onSuccess: () => {
      setNewPin('');
      setShowPinInput(false);
      toast({ title: 'PIN Updated', description: 'Your clock-in PIN has been saved.' });
    },
    onError: (error: Error) => {
      toast({ title: 'PIN Error', description: error.message, variant: 'destructive' });
    },
  });

  const onSubmit = (values: ProfileFormValues) => {
    updateProfileMutation.mutate(values);
  };

  const handleRequestEmailChange = () => {
    const trimmed = newEmailInput.trim();
    if (!trimmed) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      toast({ variant: "destructive", title: "Invalid Email", description: "Please enter a valid email address." });
      return;
    }
    requestEmailChangeMutation.mutate(trimmed);
  };

  if (sessionLoading) {
    return <SettingsCardSkeleton />;
  }

  const firstName = currentUser?.firstName || '';
  const lastName = currentUser?.lastName || '';
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || '?';
  const displayName = [firstName, lastName].filter(Boolean).join(' ') || currentUser?.email || 'User';
  const pendingEmail = currentUser?.pendingEmail || null;
  const emailVerified = currentUser?.emailVerified ?? false;
  const workspaceRole = currentUser?.workspaceRole || currentUser?.role || null;
  const organizationalTitle = currentUser?.organizationalTitle || null;
  const userNumber = currentUser?.userNumber || null;

  const roleLabel = organizationalTitle
    ? organizationalTitle.charAt(0).toUpperCase() + organizationalTitle.slice(1)
    : workspaceRole
      ? workspaceRole.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
      : null;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ── Profile Identity Card ───────────────────────────────────────────── */}
      <Card data-testid="card-profile-identity">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-start gap-4">
            <Avatar className="h-16 w-16 sm:h-20 sm:w-20 ring-2 ring-primary/20 shrink-0">
              <AvatarImage
                src={currentUser?.profileImageUrl || ''}
                alt={displayName}
                data-testid="avatar-profile-image"
              />
              <AvatarFallback
                className="bg-primary/15 text-primary text-xl sm:text-2xl font-bold"
                data-testid="avatar-profile-fallback"
              >
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 space-y-1.5">
              <h2
                className="text-base sm:text-lg font-bold leading-tight truncate"
                data-testid="text-profile-display-name"
              >
                {displayName}
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="text-xs sm:text-sm text-muted-foreground truncate"
                  data-testid="text-profile-email"
                >
                  {currentUser?.email}
                </span>
                {emailVerified ? (
                  <Badge
                    variant="outline"
                    className="text-[10px] sm:text-xs text-green-600 dark:text-green-400 border-green-200 dark:border-green-800 shrink-0"
                    data-testid="badge-email-verified"
                  >
                    <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                    Verified
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-[10px] sm:text-xs text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800 shrink-0"
                    data-testid="badge-email-unverified"
                  >
                    <AlertCircle className="h-2.5 w-2.5 mr-1" />
                    Unverified
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {roleLabel && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] sm:text-xs"
                    data-testid="badge-profile-role"
                  >
                    {roleLabel}
                  </Badge>
                )}
                {userNumber && (
                  <span
                    className="text-[10px] sm:text-xs text-muted-foreground font-mono"
                    data-testid="text-profile-user-number"
                  >
                    {userNumber}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Pending email change notice */}
          {pendingEmail && (
            <div
              className="mt-4 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800"
              data-testid="alert-pending-email"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Email change pending — verify{' '}
                    <strong className="font-semibold">{pendingEmail}</strong> to complete
                  </p>
                  <div className="flex gap-2 mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                      onClick={() => cancelEmailChangeMutation.mutate()}
                      disabled={cancelEmailChangeMutation.isPending}
                      data-testid="button-cancel-email-change"
                    >
                      Cancel Change
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Personal Information Form ─────────────────────────────────────────── */}
      <Card data-testid="card-personal-info">
        <CardHeader className="p-4 sm:p-6 pb-3 sm:pb-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <User className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
            <div className="min-w-0">
              <CardTitle className="text-base sm:text-lg">Personal Information</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Update your name and phone number</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-6 pt-0">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs sm:text-sm">First Name <span className="text-destructive" aria-hidden="true">*</span></FormLabel>
                      <FormControl>
                        <Input
                          placeholder="First name"
                          data-testid="input-profile-first-name"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs sm:text-sm">Last Name <span className="text-destructive" aria-hidden="true">*</span></FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Last name"
                          data-testid="input-profile-last-name"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs sm:text-sm">Phone</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          type="tel"
                          placeholder="Phone number"
                          className="pl-9"
                          data-testid="input-profile-phone"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Clock-in PIN (self-service) */}
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm">Clock-in PIN</Label>
                <p className="text-xs text-muted-foreground">Used to clock in via kiosk or voice. 4–8 digits.</p>
                {showPinInput ? (
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={8}
                      placeholder="Enter 4–8 digit PIN"
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      data-testid="input-new-pin"
                      className="max-w-[160px]"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setPinMutation.mutate(newPin)}
                      disabled={setPinMutation.isPending || newPin.length < 4}
                      data-testid="button-save-pin"
                    >
                      {setPinMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => { setShowPinInput(false); setNewPin(''); }}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowPinInput(true)}
                    data-testid="button-set-pin"
                  >
                    Set / Reset PIN
                  </Button>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  disabled={updateProfileMutation.isPending || saveSuccess}
                  data-testid="button-save-profile"
                  variant={saveSuccess ? "outline" : "default"}
                  className={saveSuccess ? "border-green-500 text-green-600 dark:text-green-400" : ""}
                >
                  {updateProfileMutation.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : saveSuccess ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Saved
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* ── Email Address Card ───────────────────────────────────────────────── */}
      <Card data-testid="card-email-address">
        <CardHeader className="p-4 sm:p-6 pb-3 sm:pb-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <Mail className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base sm:text-lg">Email Address</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Email changes require verification</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50 border">
            <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium flex-1 truncate" data-testid="text-current-email">{currentUser?.email}</span>
            {emailVerified ? (
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" aria-label="Email verified" />
            ) : (
              <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" aria-label="Email not verified" />
            )}
          </div>
          {!pendingEmail && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs sm:text-sm"
              onClick={() => setShowEmailDialog(true)}
              data-testid="button-change-email"
            >
              <Mail className="h-3.5 w-3.5 mr-2" />
              Change Email
            </Button>
          )}
        </CardContent>
      </Card>

      {/* ── Email Change Dialog ──────────────────────────────────────────────── */}
      <UniversalModal open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <UniversalModalHeader>
          <UniversalModalTitle>Change Email Address</UniversalModalTitle>
          <UniversalModalDescription>
            A verification link will be sent to your new email. You must click it to confirm the change.
          </UniversalModalDescription>
        </UniversalModalHeader>
        <div className="p-4 sm:p-6 space-y-4">
          <div>
            <Label className="text-xs mb-1.5 block">New Email Address</Label>
            <Input
              type="email"
              placeholder="new@example.com"
              value={newEmailInput}
              onChange={(e) => setNewEmailInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRequestEmailChange(); }}
              data-testid="input-new-email"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setShowEmailDialog(false); setNewEmailInput(''); }}
              data-testid="button-cancel-email-dialog"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleRequestEmailChange}
              disabled={requestEmailChangeMutation.isPending || !newEmailInput.trim()}
              data-testid="button-send-email-verification"
            >
              {requestEmailChangeMutation.isPending ? (
                <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />Sending...</>
              ) : (
                <><Send className="h-3.5 w-3.5 mr-1.5" />Send Verification</>
              )}
            </Button>
          </div>
        </div>
      </UniversalModal>
    </div>
  );
}

function ChangePasswordCard() {
  const { toast } = useToast();
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const form = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: ChangePasswordFormValues) => {
      const res = await secureFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: data.currentPassword, newPassword: data.newPassword }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Password change failed');
      }
      return res.json();
    },
    onSuccess: () => {
      setSaveSuccess(true);
      form.reset();
      toast({
        title: "Password Changed",
        description: "Your password has been updated. Please log in again.",
      });
      // Session was destroyed server-side; redirect to login after a short delay
      setTimeout(() => {
        window.location.href = '/login';
      }, 1500);
    },
    onError: (error: Error) => {
      toast({
        title: "Password Change Failed",
        description: error.message || "Please check your current password and try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: ChangePasswordFormValues) => {
    changePasswordMutation.mutate(values);
  };

  return (
    <Card data-testid="card-change-password">
      <CardHeader className="p-4 sm:p-6 pb-3 sm:pb-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <Lock className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
          <div className="min-w-0">
            <CardTitle className="text-base sm:text-lg">Change Password</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Update your login password. You will be logged out after changing it.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs sm:text-sm">Current Password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        type={showCurrent ? 'text' : 'password'}
                        placeholder="Enter current password"
                        className="pl-9 pr-9"
                        data-testid="input-current-password"
                        autoComplete="current-password"
                        {...field}
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-label={showCurrent ? 'Hide password' : 'Show password'}
                        onClick={() => setShowCurrent((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showCurrent ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs sm:text-sm">New Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          type={showNew ? 'text' : 'password'}
                          placeholder="8+ chars, upper, lower, number, symbol"
                          className="pl-9 pr-9"
                          data-testid="input-new-password"
                          autoComplete="new-password"
                          {...field}
                        />
                        <button
                          type="button"
                          tabIndex={-1}
                          aria-label={showNew ? 'Hide password' : 'Show password'}
                          onClick={() => setShowNew((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showNew ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs sm:text-sm">Confirm New Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          type={showConfirm ? 'text' : 'password'}
                          placeholder="Re-enter new password"
                          className="pl-9 pr-9"
                          data-testid="input-confirm-password"
                          autoComplete="new-password"
                          {...field}
                        />
                        <button
                          type="button"
                          tabIndex={-1}
                          aria-label={showConfirm ? 'Hide password' : 'Show password'}
                          onClick={() => setShowConfirm((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showConfirm ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                disabled={changePasswordMutation.isPending || saveSuccess}
                data-testid="button-change-password"
                variant={saveSuccess ? "outline" : "default"}
                className={saveSuccess ? "border-green-500 text-green-600 dark:text-green-400" : ""}
              >
                {changePasswordMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : saveSuccess ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Password Changed
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4 mr-2" />
                    Change Password
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

// @ts-expect-error — TS migration: fix in refactoring sprint
function WorkspaceSettingsForm({ workspace }: { workspace: Workspace }) {
  const [workspaceSaveSuccess, setWorkspaceSaveSuccess] = useState(false);
  const { toast } = useToast();
  const form = useForm<WorkspaceFormValues>({
    resolver: zodResolver(workspaceSchema),
    defaultValues: {
      name: '',
      companyName: '',
      taxId: '',
      phone: '',
      address: '',
      website: '',
      companyCity: '',
      companyState: '',
      companyZip: '',
      stateLicenseNumber: '',
      stateLicenseState: '',
      stateLicenseExpiry: '',
      logoUrl: '',
      brandColor: '#000000',
    },
  });

  useEffect(() => {
    if (workspace) {
      const ws = workspace;
      form.reset({
        name: ws.name || '',
        companyName: ws.companyName || '',
        taxId: ws.taxId || '',
        phone: ws.phone || '',
        address: ws.address || '',
        website: ws.website || '',
        companyCity: ws.companyCity || '',
        companyState: ws.companyState || '',
        companyZip: ws.companyZip || '',
        stateLicenseNumber: ws.stateLicenseNumber || '',
        stateLicenseState: ws.stateLicenseState || '',
        stateLicenseExpiry: ws.stateLicenseExpiry ? new Date(ws.stateLicenseExpiry).toISOString().split('T')[0] : '',
        logoUrl: ws.logoUrl || '',
        brandColor: ws.brandColor || '#000000',
      });
    }
  }, [workspace, form]);

  const { isDirty } = form.formState;

  // Intercept navigation attempts when form is dirty
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const updateWorkspaceMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('PATCH', `/api/workspace`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workspace'] });
      setWorkspaceSaveSuccess(true);
      setTimeout(() => setWorkspaceSaveSuccess(false), 2000);
      toast({
        title: "Settings Updated",
        description: "Your workspace settings have been saved successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save settings",
        description: error?.message || "An error occurred while saving your settings.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: WorkspaceFormValues) => {
    updateWorkspaceMutation.mutate({
      ...values,
      companyCity: values.companyCity || null,
      companyState: values.companyState || null,
      companyZip: values.companyZip || null,
      stateLicenseNumber: values.stateLicenseNumber || null,
      stateLicenseState: values.stateLicenseState || null,
      stateLicenseExpiry: values.stateLicenseExpiry ? new Date(values.stateLicenseExpiry) : null,
      logoUrl: values.logoUrl || null,
      brandColor: values.brandColor || null,
    });
  };

  return (
    <Card data-testid="card-workspace-settings">
      <CardHeader>
        <div className="flex items-center gap-3">
          <Building2 className="h-5 w-5 text-primary" />
          <div>
            <CardTitle>Workspace Settings</CardTitle>
            <CardDescription>Update your workspace name and general business information</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Workspace Name <span className="text-destructive" aria-hidden="true">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="Workspace Name" data-testid="input-workspace-name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="companyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Legal Name <span className="text-destructive" aria-hidden="true">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="Company Legal Name" data-testid="input-company-name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="taxId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employer Tax ID (EIN)</FormLabel>
                    <FormControl>
                      <Input placeholder="XX-XXXXXXX" data-testid="input-tax-id" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="(555) 000-0000" data-testid="input-workspace-phone" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Headquarters Address</FormLabel>
                  <FormControl>
                    <Input placeholder="123 Main St, Suite 100" data-testid="input-workspace-address" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="companyCity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input placeholder="Dallas" data-testid="input-workspace-city" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="companyState"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>State</FormLabel>
                    <FormControl>
                      <Input placeholder="TX" maxLength={2} data-testid="input-workspace-state" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="companyZip"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ZIP Code</FormLabel>
                    <FormControl>
                      <Input placeholder="75201" data-testid="input-workspace-zip" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="website"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Website</FormLabel>
                  <FormControl>
                    <Input placeholder="https://example.com" data-testid="input-workspace-website" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator className="my-6" />
            <div className="flex items-center gap-3 mb-4">
              <Shield className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">State Licensing & Credentials</CardTitle>
                <CardDescription>Regulatory information required for your industry</CardDescription>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="stateLicenseNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>License Number</FormLabel>
                    <FormControl>
                      <Input placeholder="B-12345" data-testid="input-license-number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="stateLicenseState"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Issuing State</FormLabel>
                    <FormControl>
                      <Input placeholder="TX" maxLength={2} data-testid="input-license-state" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="stateLicenseExpiry"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Expiration Date</FormLabel>
                  <FormControl>
                    <Input type="date" data-testid="input-license-expiry" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end pt-4">
              <Button 
                type="submit" 
                disabled={updateWorkspaceMutation.isPending || workspaceSaveSuccess} 
                data-testid="button-save-workspace"
                variant={workspaceSaveSuccess ? "outline" : "default"}
                className={workspaceSaveSuccess ? "border-green-500 text-green-600 dark:text-green-400" : ""}
              >
                {updateWorkspaceMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : workspaceSaveSuccess ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Saved
                  </>
                ) : (
                  <>
                    {/* @ts-ignore */}
                    <Save className="h-4 w-4 mr-2" />
                    Save Workspace Changes
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

// @ts-expect-error — TS migration: fix in refactoring sprint
function InvoiceFinancialsForm({ workspace, updateWorkspaceMutation }: { workspace: Workspace, updateWorkspaceMutation: any }) {
  const form = useForm<InvoiceFinancialsFormValues>({
    resolver: zodResolver(invoiceFinancialsSchema),
    defaultValues: {
      invoicePrefix: 'INV',
      invoiceNextNumber: 1000,
      lateFeePercentage: 0,
      lateFeeDays: 30,
      billingEmail: '',
      paymentTermsDays: 30,
      defaultTaxRate: 8.875,
    },
  });

  useEffect(() => {
    if (workspace) {
      const ws = workspace;
      form.reset({
        invoicePrefix: ws.invoicePrefix || 'INV',
        invoiceNextNumber: ws.invoiceNextNumber || 1000,
        lateFeePercentage: ws.lateFeePercentage ? parseFloat(ws.lateFeePercentage) : 0,
        lateFeeDays: ws.lateFeeDays || 30,
        billingEmail: ws.billingEmail || '',
        paymentTermsDays: ws.paymentTermsDays || 30,
        defaultTaxRate: ws.defaultTaxRate ? parseFloat(ws.defaultTaxRate) * 100 : 8.875,
      });
    }
  }, [workspace, form]);

  const { isDirty } = form.formState;

  // Intercept navigation attempts when form is dirty
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const onSubmit = (values: InvoiceFinancialsFormValues) => {
    updateWorkspaceMutation.mutate({
      ...values,
      billingEmail: values.billingEmail || null,
      defaultTaxRate: values.defaultTaxRate / 100,
    });
  };

  return (
    <Card data-testid="card-invoice-financials">
      <CardHeader>
        <div className="flex items-center gap-3">
          <Receipt className="h-5 w-5 text-primary" />
          <div>
            <CardTitle>Invoice & Billing Config</CardTitle>
            <CardDescription>Default terms, late fees, and numbering for your client invoices</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 mobile-compact-p">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-primary" />
                <Label className="text-sm font-semibold">Invoice Numbering & Terms</Label>
              </div>
              <div className="grid gap-4 md:grid-cols-2 mobile-cols-1">
                <FormField
                  control={form.control}
                  name="invoicePrefix"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Invoice Number Prefix</FormLabel>
                      <FormControl>
                        <Input placeholder="INV" data-testid="input-invoice-prefix" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="invoiceNextNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Next Invoice Number</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="1000" data-testid="input-invoice-next-number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2 mobile-cols-1">
                <FormField
                  control={form.control}
                  name="paymentTermsDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Payment Terms (Days)</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="30" data-testid="input-payment-terms" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="billingEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Billing Contact Email</FormLabel>
                      <FormControl>
                        <Input placeholder="billing@company.com" data-testid="input-billing-email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Percent className="h-4 w-4 text-primary" />
                <Label className="text-sm font-semibold">Taxes & Late Fees</Label>
              </div>
              <div className="grid gap-4 md:grid-cols-2 mobile-cols-1">
                <FormField
                  control={form.control}
                  name="defaultTaxRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Sales Tax Rate (%)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input type="number" step="0.001" className="pl-9" data-testid="input-tax-rate" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lateFeePercentage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Late Fee Percentage (%)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input type="number" step="0.5" className="pl-9" data-testid="input-late-fee-percentage" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="lateFeeDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Late Fee Grace Period (Days)</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="30" data-testid="input-late-fee-days" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={updateWorkspaceMutation.isPending} data-testid="button-save-invoice-financials">
                {updateWorkspaceMutation.isPending ? "Saving..." : "Save Invoice Settings"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function PayrollFinancialsForm({ workspace, updateWorkspaceMutation }: { workspace: any, updateWorkspaceMutation: any }) {
  const form = useForm<PayrollFinancialsFormValues>({
    resolver: zodResolver(payrollFinancialsSchema),
    defaultValues: {
      stateUnemploymentRate: 2.7,
      workerCompRate: 1.5,
      payrollBankName: '',
      payrollBankRouting: '',
      payrollBankAccount: '',
      payrollMemo: '',
    },
  });

  useEffect(() => {
    if (workspace) {
      const ws = workspace;
      form.reset({
        stateUnemploymentRate: ws.stateUnemploymentRate ? parseFloat(ws.stateUnemploymentRate) * 100 : 2.7,
        workerCompRate: ws.workerCompRate ? parseFloat(ws.workerCompRate) * 100 : 1.5,
        payrollBankName: ws.payrollBankName || '',
        payrollBankRouting: ws.payrollBankRouting || '',
        payrollBankAccount: ws.payrollBankAccount || '',
        payrollMemo: ws.payrollMemo || '',
      });
    }
  }, [workspace, form]);

  const { isDirty } = form.formState;

  // Intercept navigation attempts when form is dirty
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const onSubmit = (values: PayrollFinancialsFormValues) => {
    updateWorkspaceMutation.mutate({
      ...values,
      stateUnemploymentRate: values.stateUnemploymentRate / 100,
      workerCompRate: values.workerCompRate / 100,
      payrollBankName: values.payrollBankName || null,
      payrollBankRouting: values.payrollBankRouting || null,
      payrollBankAccount: values.payrollBankAccount || null,
      payrollMemo: values.payrollMemo || null,
    });
  };

  return (
    <Card data-testid="card-payroll-financials">
      <CardHeader>
        <div className="flex items-center gap-3">
          <Landmark className="h-5 w-5 text-primary" />
          <div>
            <CardTitle>Payroll Tax & Funding</CardTitle>
            <CardDescription>Employer tax rates, worker's comp, and the bank account used to fund payroll disbursements</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 mobile-compact-p">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <Label className="text-sm font-semibold">Employer Tax Rates</Label>
              </div>
              <div className="grid gap-4 md:grid-cols-2 mobile-cols-1">
                <FormField
                  control={form.control}
                  name="stateUnemploymentRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State Unemployment Insurance Rate (%)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input type="number" step="0.01" className="pl-9" data-testid="input-sui-rate" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="workerCompRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Worker's Compensation Rate (%)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input type="number" step="0.01" className="pl-9" data-testid="input-worker-comp-rate" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" />
                <Label className="text-sm font-semibold">Payroll Funding Bank Account</Label>
              </div>
              <div className="grid gap-4 md:grid-cols-2 mobile-cols-1">
                <FormField
                  control={form.control}
                  name="payrollBankName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bank Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Chase, Wells Fargo, etc." data-testid="input-payroll-bank-name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="payrollMemo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Payroll Memo</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Payroll - Biweekly" data-testid="input-payroll-memo" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2 mobile-cols-1">
                <FormField
                  control={form.control}
                  name="payrollBankRouting"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ABA Routing Number</FormLabel>
                      <FormControl>
                        <Input placeholder="9-digit routing number" maxLength={9} data-testid="input-payroll-bank-routing" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="payrollBankAccount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Number</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Account number (stored securely)" data-testid="input-payroll-bank-account" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={updateWorkspaceMutation.isPending} data-testid="button-save-payroll-financials">
                {updateWorkspaceMutation.isPending ? "Saving..." : "Save Payroll Settings"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

// ── Storage Tab ───────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  email:         { label: 'Email & Attachments', color: 'bg-blue-500' },
  documents:     { label: 'Documents & Contracts', color: 'bg-green-600' },
  media:         { label: 'Media & Images', color: 'bg-violet-500' },
  audit_reserve: { label: 'Audit Reserve (Protected)', color: 'bg-amber-500' },
};

function StorageQuotaBar({ pct, colorClass }: { pct: number; colorClass: string }) {
  const clamped = Math.min(pct, 100);
  const barColor = pct >= 95 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : colorClass;
  return (
    <div className="w-full rounded-full bg-muted h-2 overflow-hidden">
      <div
        className={`h-2 rounded-full transition-all duration-500 ${barColor}`}
        style={{ width: `${clamped}%` }}
        data-testid="bar-storage-fill"
      />
    </div>
  );
}

function StorageTabContent() {
  const { data, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ['/api/workspace/storage-usage'],
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground text-sm">
          Loading storage usage...
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm space-y-3">
          <p className="text-muted-foreground">Failed to load storage data.</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  const categories = data.categories ?? {};
  const tierLabel = String(data.tier ?? 'trial').replace(/\b\w/g, (c: string) => c.toUpperCase());

  return (
    <div className="space-y-6">
      {/* Summary card */}
      <Card data-testid="card-storage-summary">
        <CardHeader>
          <div className="flex items-center gap-3 flex-wrap justify-between">
            <div className="flex items-center gap-3">
              <HardDrive className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Storage Usage</CardTitle>
                <CardDescription>Category breakdown for your {tierLabel} plan</CardDescription>
              </div>
            </div>
            <Badge variant="secondary" data-testid="badge-storage-tier">{tierLabel} Plan</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between text-sm flex-wrap gap-1">
            <span className="text-muted-foreground">Total used (excl. audit reserve)</span>
            <span className="font-medium" data-testid="text-storage-total">
              {((data.totalUsedBytes ?? 0) / 1073741824).toFixed(2)} GB
              {data.totalLimitBytes > 0 && (
                <span className="text-muted-foreground"> / {((data.totalLimitBytes ?? 0) / 1073741824).toFixed(2)} GB</span>
              )}
            </span>
          </div>
          <StorageQuotaBar pct={data.totalUsedPercent ?? 0} colorClass="bg-primary" />
          {(data.totalUsedPercent ?? 0) >= 80 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {(data.totalUsedPercent ?? 0) >= 95
                ? 'Storage is almost full. Uploads may be blocked soon. Upgrade your plan.'
                : 'Storage usage is high. Consider upgrading your plan or adding storage.'}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Per-category breakdown */}
      <Card data-testid="card-storage-categories">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Database className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>Category Breakdown</CardTitle>
              <CardDescription>Usage per storage category</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {Object.entries(CATEGORY_LABELS).map(([cat, { label, color }]) => {
            const c = categories[cat];
            if (!c) return null;
            const isAudit = cat === 'audit_reserve';
            return (
              <div key={cat} className="space-y-1" data-testid={`section-storage-${cat}`}>
                <div className="flex items-center justify-between flex-wrap gap-1 text-sm">
                  <span className="font-medium">{label}</span>
                  <span className="text-muted-foreground" data-testid={`text-storage-used-${cat}`}>
                    {c.usedGB} GB
                    {!isAudit && c.limitBytes > 0 && (
                      <> / {c.limitGB} GB</>
                    )}
                    {!isAudit && c.limitBytes > 0 && (
                      <span className="ml-1 text-xs">({c.usedPercent}%)</span>
                    )}
                    {isAudit && (
                      <Badge variant="outline" className="ml-2 text-xs">Protected floor</Badge>
                    )}
                  </span>
                </div>
                {!isAudit && c.limitBytes > 0 && (
                  <StorageQuotaBar pct={c.usedPercent} colorClass={color} />
                )}
                {(data.overageBytes?.[cat] ?? 0) > 0 && (
                  <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {((data.overageBytes[cat]) / 1073741824).toFixed(2)} GB over limit — billed at $0.10/GB
                  </p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Overage info */}
      {Object.values(data.overageBytes ?? {}).some((v: any) => v > 0) && (
        <Card data-testid="card-storage-overage" className="border-amber-500/40">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <CardTitle className="text-base">Storage Overage</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p className="text-muted-foreground">
              Your workspace has exceeded its category storage limits. Overage is billed at
              <strong> $0.10 per GB</strong> per month (minimum 1 GB threshold applies).
              Charges are calculated during your next weekly billing cycle.
            </p>
            <p className="text-muted-foreground text-xs">
              To avoid overage charges, upgrade your plan or contact your account manager
              to purchase a storage add-on.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function Settings() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [location, setLocation] = useLocation();
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), [window.location.search]);
  const isMobile = useIsMobile();
  const { isSimpleMode } = useSimpleMode();
  const { workspaceRole } = useWorkspaceAccess();
  const [activeSection, setActiveSection] = useState<SettingsSection>(() => {
    return (searchParams.get('tab') as SettingsSection) || 'quick';
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (activeSection === 'quick') {
      params.delete('tab');
    } else {
      params.set('tab', activeSection);
    }
    const newSearch = params.toString();
    if (newSearch !== window.location.search.replace(/^\?/, "")) {
      setLocation(`${window.location.pathname}${newSearch ? `?${newSearch}` : ""}`, { replace: true });
    }
  }, [activeSection, setLocation]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [mfaSetupOpen, setMfaSetupOpen] = useState(false);
  const [mfaSetupData, setMfaSetupData] = useState<{qrCodeUrl: string; backupCodes: string[]} | null>(null);
  
  // In Simple Mode, hide technical settings tabs (automation, compliance)
  const hiddenInSimpleMode = ['automation', 'compliance'];
  const visibleSections = isSimpleMode 
    ? SETTINGS_SECTIONS.filter(s => !hiddenInSimpleMode.includes(s.id))
    : SETTINGS_SECTIONS;
  
  // Reset to a visible tab if current tab becomes hidden when Simple Mode is enabled
  useEffect(() => {
    if (isSimpleMode && hiddenInSimpleMode.includes(activeSection)) {
      setActiveSection('quick');
    }
  }, [isSimpleMode, activeSection]);
  
  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('manager');
  const [inviteResult, setInviteResult] = useState<{ code: string; link: string } | null>(null);

  // Fetch workspace data
  const { data: workspace } = useQuery({
    queryKey: ['/api/workspace'],
    enabled: isAuthenticated,
    queryFn: () => apiFetch('/api/workspace', WorkspaceResponse),
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

  // Re-added required state for toggles and non-refactored sections
  const [autoInvoicingEnabled, setAutoInvoicingEnabled] = useState<boolean>(true);
  const [invoiceSchedule, setInvoiceSchedule] = useState<string>("monthly");
  const [invoiceCustomDays, setInvoiceCustomDays] = useState<number | undefined>();
  const [invoiceGenerationDay, setInvoiceGenerationDay] = useState<number>(1);

  const [autoPayrollEnabled, setAutoPayrollEnabled] = useState<boolean>(true);
  const [payrollSchedule, setPayrollSchedule] = useState<string>("biweekly");
  const [payrollCustomDays, setPayrollCustomDays] = useState<number | undefined>();
  const [payrollProcessDay, setPayrollProcessDay] = useState<number>(1);
  const [payrollCutoffDay, setPayrollCutoffDay] = useState<number>(15);

  const [autoSchedulingEnabled, setAutoSchedulingEnabled] = useState<boolean>(true);
  const [scheduleGenerationInterval, setScheduleGenerationInterval] = useState<string>("weekly");
  const [scheduleCustomDays, setScheduleCustomDays] = useState<number | undefined>();
  const [scheduleAdvanceNoticeDays, setScheduleAdvanceNoticeDays] = useState<number>(7);
  const [scheduleGenerationDay, setScheduleGenerationDay] = useState<number>(0);

  const [laborLawJurisdiction, setLaborLawJurisdiction] = useState<string>("US-FEDERAL");
  const [autoBreakSchedulingEnabled, setAutoBreakSchedulingEnabled] = useState<boolean>(true);
  const [breakComplianceAlerts, setBreakComplianceAlerts] = useState<boolean>(true);

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

  const [enableAiSummarization, setEnableAiSummarization] = useState<boolean>(true);
  const [digestFrequency, setDigestFrequency] = useState<string>('realtime');
  const [quietHoursEnabled, setQuietHoursEnabled] = useState<boolean>(false);
  const [quietHoursStart, setQuietHoursStart] = useState<number>(22);
  const [quietHoursEnd, setQuietHoursEnd] = useState<number>(7);
  const [autoCleanupEnabled, setAutoCleanupEnabled] = useState<boolean>(true);
  const [retentionDays, setRetentionDays] = useState<number>(30);
  const [autoArchiveRead, setAutoArchiveRead] = useState<boolean>(true);

  // ── Financials tab state (workspace & invoice & payroll) ───────────────────
  // Workspace / company fields used in handleSaveWorkspace
  const [workspaceName, setWorkspaceName] = useState<string>('');
  const [companyName, setCompanyName] = useState<string>('');
  const [taxId, setTaxId] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [website, setWebsite] = useState<string>('');
  const [companyCity, setCompanyCity] = useState<string>('');
  const [companyState, setCompanyState] = useState<string>('');
  const [companyZip, setCompanyZip] = useState<string>('');
  const [stateLicenseNumber, setStateLicenseNumber] = useState<string>('');
  const [stateLicenseState, setStateLicenseState] = useState<string>('');
  const [stateLicenseExpiry, setStateLicenseExpiry] = useState<string>('');
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [brandColor, setBrandColor] = useState<string>('#1a1a2e');

  // Invoice financial fields
  const [billingEmail, setBillingEmail] = useState<string>('');
  const [invoicePrefix, setInvoicePrefix] = useState<string>('INV');
  const [invoiceNextNumber, setInvoiceNextNumber] = useState<number>(1000);
  const [lateFeePercentage, setLateFeePercentage] = useState<number>(0);
  const [lateFeeDays, setLateFeeDays] = useState<number>(30);
  const [paymentTermsDays, setPaymentTermsDays] = useState<number>(30);
  const [defaultTaxRate, setDefaultTaxRate] = useState<number>(8.875);

  // Payroll financial fields
  const [stateUnemploymentRate, setStateUnemploymentRate] = useState<number>(0);
  const [workerCompRate, setWorkerCompRate] = useState<number>(0);
  const [payrollBankName, setPayrollBankName] = useState<string>('');
  const [payrollBankRouting, setPayrollBankRouting] = useState<string>('');
  const [payrollBankAccount, setPayrollBankAccount] = useState<string>('');
  const [payrollMemo, setPayrollMemo] = useState<string>('');

  // Fetch QuickBooks connection status (for org owners)
  const { data: quickbooksStatus } = useQuery<any>({
    queryKey: ['/api/quickbooks/connection-status'],
    enabled: isAuthenticated && (workspaceRole === 'org_owner' || workspaceRole === 'co_owner'),
  });

  // Fetch staffing email configuration
  const { data: staffingEmailConfig, refetch: refetchStaffingEmail } = useQuery<{
    orgCode: string | null;
    orgEmail: string | null;
    hasGenericEmailClaim: boolean;
    genericEmail: string;
    genericEmailClaimedBy: { name: string; orgCode: string } | null;
    canClaimGenericEmail: boolean;
  }>({
    queryKey: ['/api/workspace/staffing-email-config'],
    enabled: isAuthenticated && (workspaceRole === 'org_owner' || workspaceRole === 'co_owner'),
  });

  // State for org code editing
  const [editingOrgCode, setEditingOrgCode] = useState(false);
  const [newOrgCode, setNewOrgCode] = useState('');
  const [forwardEmailValue, setForwardEmailValue] = useState('');
  // Sync forwardEmailValue from workspace data on load
  useEffect(() => {
    if ((workspace as any)?.inboundEmailForwardTo !== undefined) {
      setForwardEmailValue((workspace as any).inboundEmailForwardTo || '');
    }
  }, [workspace]);

  // Mutation to update org code
  const updateOrgCodeMutation = useMutation({
    mutationFn: async (orgCode: string) => {
      const response = await secureFetch('/api/workspace/org-code', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newOrgCode: orgCode }),
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update org code');
      }
      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate ALL workspace-related caches to ensure sync across pages
      queryClient.invalidateQueries({ queryKey: ['/api/workspace'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.current });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
      refetchStaffingEmail();
      setEditingOrgCode(false);
      setNewOrgCode('');
      toast({
        title: "Org Code Updated",
        description: `Your org code is now: ${data.orgCode}. Email addresses provisioned.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update org code",
        variant: "destructive",
      });
    },
  });

  // Mutation to claim generic staffing email
  const claimGenericEmailMutation = useMutation({
    mutationFn: async () => {
      const response = await secureFetch('/api/workspace/claim-generic-staffing-email', {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to claim generic staffing email');
      }
      return response.json();
    },
    onSuccess: () => {
      refetchStaffingEmail();
      toast({
        title: "Generic Email Claimed",
        description: "Emails to staffing@coaileague.com will now route to your organization",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to claim generic staffing email",
        variant: "destructive",
      });
    },
  });

  // Mutation to release generic staffing email
  const releaseGenericEmailMutation = useMutation({
    mutationFn: async () => {
      const response = await secureFetch('/api/workspace/claim-generic-staffing-email', {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to release generic staffing email');
      }
      return response.json();
    },
    onSuccess: () => {
      refetchStaffingEmail();
      toast({
        title: "Generic Email Released",
        description: "Generic staffing email is now available for other organizations",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to release generic staffing email",
        variant: "destructive",
      });
    },
  });

  const updateForwardEmailMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await secureFetch('/api/workspace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inboundEmailForwardTo: email }),
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message || 'Failed to update forwarding email');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workspace'] });
      toast({ title: 'Forwarding Email Updated', description: 'Inbound emails will be forwarded to the new address.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const billingPortalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/stripe/billing-portal', {
        returnUrl: window.location.href,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data?.url) window.open(data.url, '_blank');
    },
    onError: () => {
      toast({ title: 'Error', description: 'Could not open billing portal. Please try again.', variant: 'destructive' });
    },
  });

  // Workspace invite query
  const { data: workspaceInvites, refetch: refetchInvites } = useQuery<any[]>({
    queryKey: ['/api/invites'],
    enabled: isAuthenticated && (workspaceRole === 'org_owner' || workspaceRole === 'co_owner' || workspaceRole === 'org_admin' || workspaceRole === 'manager'),
  });

  const { data: dataReadiness, isLoading: readinessLoading, refetch: refetchReadiness } = useQuery<any>({
    queryKey: ['/api/workspace/data-readiness'],
    enabled: isAuthenticated,
    staleTime: 60 * 1000,
  });

  // Send invite mutation
  const sendInviteMutation = useMutation({
    mutationFn: async (data: { email: string; role: string }) => {
      const res = await apiRequest('POST', '/api/invites/create', data);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to send invite');
      return json;
    },
    onSuccess: (data) => {
      const inv = data.invite || data;
      setInviteResult({
        code: inv.inviteCode || data.inviteCode || '',
        link: inv.inviteLink || data.inviteLink || `${window.location.origin}/accept-invite?code=${inv.inviteCode || data.inviteCode || ''}`,
      });
      setInviteEmail('');
      refetchInvites();
      toast({ title: "Invitation sent!", description: `Invite sent to ${inv.inviteeEmail || data.inviteeEmail || 'recipient'}.` });
    },
    onError: (err: any) => {
      toast({ title: "Failed to send invite", description: err.message, variant: "destructive" });
    },
  });

  // Update break compliance settings mutation
  const updateBreakComplianceMutation = useMutation({
    mutationFn: async (data: { 
      laborLawJurisdiction: string; 
      autoBreakSchedulingEnabled: boolean; 
      breakComplianceAlerts: boolean; 
    }) => {
      const response = await secureFetch('/api/breaks/jurisdiction', {
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
      const response = await secureFetch('/api/notifications/preferences', {
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
      const response = await secureFetch('/api/notifications/test-sms', {
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
      const response = await secureFetch('/api/notifications/verify-phone', {
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
        // @ts-expect-error — TS migration: fix in refactoring sprint
        setHasUnsavedChanges(false);
      }
    });
  };

  const quickSaveNotificationPref = (overrides: Record<string, any>) => {
    updateNotificationPrefsMutation.mutate({
      enableEmail: overrides.enableEmail ?? enableEmail,
      enableSms: overrides.enableSms ?? enableSms,
      enablePush: overrides.enablePush ?? enablePush,
      enableShiftReminders: overrides.enableShiftReminders ?? enableShiftReminders,
      shiftReminderTiming,
      shiftReminderCustomMinutes: shiftReminderTiming === 'custom' ? shiftReminderCustomMinutes : null,
      shiftReminderChannels,
      smsPhoneNumber: (overrides.enableSms ?? enableSms) ? smsPhoneNumber : null,
      digestFrequency,
      enableAiSummarization: overrides.enableAiSummarization ?? enableAiSummarization,
      quietHoursStart: quietHoursEnabled ? quietHoursStart : null,
      quietHoursEnd: quietHoursEnabled ? quietHoursEnd : null,
      autoCleanupEnabled,
      retentionDays: autoCleanupEnabled ? retentionDays : null,
      autoArchiveRead,
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
      setShiftReminderChannels(prev => [...prev, channel]);
    }
  };

  // Update workspace mutation
  const updateWorkspaceMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await secureFetch('/api/workspace', {
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
      // @ts-expect-error — TS migration: fix in refactoring sprint
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
      const response = await secureFetch('/api/workspace/seed-form-templates', {
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
      const response = await secureFetch('/api/workspace/automation/invoicing', {
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
      const response = await secureFetch('/api/workspace/automation/payroll', {
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
      const response = await secureFetch('/api/workspace/automation/scheduling', {
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
      const ws = workspace;
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setAutoInvoicingEnabled(ws.autoInvoicingEnabled ?? true);
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setInvoiceSchedule(ws.invoiceSchedule || "monthly");
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setInvoiceCustomDays(ws.invoiceCustomDays || undefined);
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setInvoiceGenerationDay(ws.invoiceGenerationDay || 1);
      
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setAutoPayrollEnabled(ws.autoPayrollEnabled ?? true);
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setPayrollSchedule(ws.payrollSchedule || "biweekly");
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setPayrollCustomDays(ws.payrollCustomDays || undefined);
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setPayrollProcessDay(ws.payrollProcessDay || 1);
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setPayrollCutoffDay(ws.payrollCutoffDay || 15);
      
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setAutoSchedulingEnabled(ws.autoSchedulingEnabled ?? true);
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setScheduleGenerationInterval(ws.scheduleGenerationInterval || "weekly");
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setScheduleCustomDays(ws.scheduleCustomDays || undefined);
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setScheduleAdvanceNoticeDays(ws.scheduleAdvanceNoticeDays || 7);
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setScheduleGenerationDay(ws.scheduleGenerationDay ?? 0);

      // @ts-expect-error — TS migration: fix in refactoring sprint
      setLaborLawJurisdiction(ws.laborLawJurisdiction || "US-FEDERAL");
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setAutoBreakSchedulingEnabled(ws.autoBreakSchedulingEnabled ?? true);
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setBreakComplianceAlerts(ws.breakComplianceAlerts ?? true);

      // Financials tab workspace fields
      setWorkspaceName(ws.name || '');
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setCompanyName(ws.companyName || '');
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setTaxId(ws.taxId || '');
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setPhone(ws.phone || '');
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setAddress(ws.address || '');
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setWebsite(ws.website || '');
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setCompanyCity(ws.companyCity || '');
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setCompanyState(ws.companyState || '');
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setCompanyZip(ws.companyZip || '');
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setStateLicenseNumber(ws.stateLicenseNumber || '');
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setStateLicenseState(ws.stateLicenseState || '');
      setStateLicenseExpiry(ws.stateLicenseExpiry ? String(ws.stateLicenseExpiry).split('T')[0] : '');
      setLogoUrl(ws.logoUrl || '');
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setBrandColor(ws.brandColor || '#1a1a2e');

      // Invoice financials
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setBillingEmail(ws.billingEmail || '');
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setInvoicePrefix(ws.invoicePrefix || 'INV');
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setInvoiceNextNumber(ws.invoiceNextNumber || 1000);
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setLateFeePercentage(ws.lateFeePercentage ? parseFloat(ws.lateFeePercentage) : 0);
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setLateFeeDays(ws.lateFeeDays || 30);
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setPaymentTermsDays(ws.paymentTermsDays || 30);
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setDefaultTaxRate(ws.defaultTaxRate ? parseFloat(ws.defaultTaxRate) * 100 : 8.875);

      // Payroll financials
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setStateUnemploymentRate(ws.stateUnemploymentRate ? parseFloat(ws.stateUnemploymentRate) * 100 : 0);
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setWorkerCompRate(ws.workerCompRate ? parseFloat(ws.workerCompRate) * 100 : 0);
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setPayrollBankName(ws.payrollBankName || '');
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setPayrollBankRouting(ws.payrollBankRouting || '');
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setPayrollBankAccount(ws.payrollBankAccount || '');
      // @ts-expect-error — TS migration: fix in refactoring sprint
      setPayrollMemo(ws.payrollMemo || '');
    }
  }, [workspace]);

  // Sync notification preferences
  useEffect(() => {
    if (notificationPrefs) {
      setEnableEmail(notificationPrefs.enableEmail ?? true);
      setEnableSms(notificationPrefs.enableSms ?? false);
      setEnablePush(notificationPrefs.enablePush ?? true);
      setEnableShiftReminders(notificationPrefs.enableShiftReminders ?? true);
      setShiftReminderTiming(notificationPrefs.shiftReminderTiming || '1hour');
      setShiftReminderCustomMinutes(notificationPrefs.shiftReminderCustomMinutes || 60);
      setShiftReminderChannels(notificationPrefs.shiftReminderChannels || ['email', 'push']);
      setSmsPhoneNumber(notificationPrefs.smsPhoneNumber || '');
      setSmsVerified(notificationPrefs.smsVerified ?? false);
      setEnableAiSummarization(notificationPrefs.enableAiSummarization ?? true);
    }
  }, [notificationPrefs]);

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
    try {
      await updateWorkspaceMutation.mutateAsync({ businessCategory: category });
    } catch {
      // Error is handled by mutation's onError callback
    }
  };

  const handleSeedTemplates = async () => {
    try {
      await seedTemplatesMutation.mutateAsync();
    } catch {
      // Error is handled by mutation's onError callback
    }
  };

  const handleSaveWorkspace = async () => {
    try {
      await updateWorkspaceMutation.mutateAsync({
        name: workspaceName,
        companyName,
        taxId,
        phone,
        address,
        website,
        companyCity: companyCity || null,
        companyState: companyState || null,
        companyZip: companyZip || null,
        // State license fields
        stateLicenseNumber: stateLicenseNumber || null,
        stateLicenseState: stateLicenseState || null,
        stateLicenseExpiry: stateLicenseExpiry ? new Date(stateLicenseExpiry) : null,
        logoUrl: logoUrl || null,
        brandColor: brandColor || null,
      });
    } catch {
      // Error is handled by mutation's onError callback
    }
  };

  const handleSaveInvoiceFinancials = async () => {
    try {
      await updateWorkspaceMutation.mutateAsync({
        invoicePrefix: invoicePrefix || "INV",
        invoiceNextNumber: invoiceNextNumber || 1000,
        lateFeePercentage: lateFeePercentage,
        lateFeeDays: lateFeeDays || 30,
        billingEmail: billingEmail || null,
        paymentTermsDays: paymentTermsDays || 30,
        defaultTaxRate: defaultTaxRate / 100,
      });
    } catch {
      // Error is handled by mutation's onError callback
    }
  };

  const handleSavePayrollFinancials = async () => {
    try {
      await updateWorkspaceMutation.mutateAsync({
        stateUnemploymentRate: stateUnemploymentRate / 100,
        workerCompRate: workerCompRate / 100,
        payrollBankName: payrollBankName || null,
        payrollBankRouting: payrollBankRouting || null,
        payrollBankAccount: payrollBankAccount || null,
        payrollMemo: payrollMemo || null,
      });
    } catch {
      // Error is handled by mutation's onError callback
    }
  };

  const handleSaveInvoicing = async () => {
    try {
      await updateInvoicingMutation.mutateAsync({
        autoInvoicingEnabled,
        invoiceSchedule,
        invoiceCustomDays: invoiceSchedule === 'custom' ? invoiceCustomDays : undefined,
        invoiceGenerationDay,
      });
    } catch {
      // Error is handled by mutation's onError callback
    }
  };

  const handleSavePayroll = async () => {
    try {
      await updatePayrollMutation.mutateAsync({
        autoPayrollEnabled,
        payrollSchedule,
        payrollCustomDays: payrollSchedule === 'custom' ? payrollCustomDays : undefined,
        payrollProcessDay,
        payrollCutoffDay,
      });
    } catch {
      // Error is handled by mutation's onError callback
    }
  };

  const handleSaveScheduling = async () => {
    try {
      await updateSchedulingMutation.mutateAsync({
        autoSchedulingEnabled,
        scheduleGenerationInterval,
        scheduleCustomDays: scheduleGenerationInterval === 'custom' ? scheduleCustomDays : undefined,
        scheduleAdvanceNoticeDays,
        scheduleGenerationDay,
      });
    } catch {
      // Error is handled by mutation's onError callback
    }
  };

  const handleSaveBreakCompliance = async () => {
    try {
      await updateBreakComplianceMutation.mutateAsync({
        laborLawJurisdiction,
        autoBreakSchedulingEnabled,
        breakComplianceAlerts,
      });
    } catch {
      // Error is handled by mutation's onError callback
    }
  };

  // Status indicators for hero summary
  const statusItems = [
    { 
      label: 'Email', 
      enabled: enableEmail, 
      icon: Mail 
    },
    { 
      label: 'Push', 
      enabled: enablePush, 
      icon: MessageSquare 
    },
    { 
      label: 'SMS', 
      enabled: enableSms && smsStatus?.configured, 
      icon: Phone 
    },
    { 
      label: 'AI Scheduling', 
      enabled: autoSchedulingEnabled, 
      icon: Zap 
    },
    { 
      label: 'Auto Payroll', 
      enabled: autoPayrollEnabled, 
      icon: Clock 
    },
    { 
      label: 'Break Alerts', 
      enabled: breakComplianceAlerts, 
      icon: Scale 
    },
  ];

  const headerAction = undefined;

  const pageContent = isLoading ? (
    <div className="space-y-4 sm:space-y-6">
      <PageHeaderSkeleton />
      <SettingsCardSkeleton count={4} />
    </div>
  ) : (
    <div className="space-y-4 sm:space-y-6">
        {/* Quick Status Overview - Compact on mobile */}
        <Card className="bg-muted/30">
          <CardContent className="py-3 sm:py-4 px-3 sm:px-6">
            <div className="flex flex-wrap gap-1.5 sm:gap-3">
              {statusItems.map((item) => (
                <div 
                  key={item.label}
                  className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-md bg-background border text-xs sm:text-sm"
                >
                  <item.icon className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground shrink-0" />
                  <span className="font-medium whitespace-nowrap">{item.label}</span>
                  {item.enabled ? (
                    <CheckCircle2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-green-500 shrink-0" />
                  ) : (
                    <XCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

      {/* Tabbed Navigation */}
      <Tabs value={activeSection} onValueChange={(v) => setActiveSection(v as SettingsSection)} className="w-full">
        <ScrollArea className="w-full -mx-1">
          <TabsList className="inline-flex w-max sm:w-auto h-auto p-0.5 sm:p-1 gap-0.5 sm:gap-1 bg-muted/50">
            {visibleSections.map((section) => (
              <TabsTrigger
                key={section.id}
                value={section.id}
                className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm data-[state=active]:bg-background"
                data-testid={`tab-${section.id}`}
              >
                <section.icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                <span className="hidden sm:inline">{section.label}</span>
                <span className="sm:hidden whitespace-nowrap">{section.label.split(' ')[0]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          <ScrollBar orientation="horizontal" className="h-1.5" />
        </ScrollArea>

        {/* Profile Section */}
        <TabsContent value="profile" className="mt-4 sm:mt-6 space-y-4 sm:space-y-6">
          <ProfileTabContent />
          <ChangePasswordCard />
        </TabsContent>

        {/* Quick Settings Section */}
        <TabsContent value="quick" className="mt-4 sm:mt-6 space-y-4 sm:space-y-6">
          {/* Easy View Mode - Top Priority Setting */}
          <SimpleModeToggle variant="labeled" />
          
          <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
            {/* Quick Toggles Card */}
            <Card>
              <CardHeader className="p-4 sm:p-6 pb-3 sm:pb-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
                  <div className="min-w-0">
                    <CardTitle className="text-base sm:text-lg">Quick Toggles</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">Most frequently used settings</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6 pt-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-medium truncate">Email Notifications</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Receive alerts via email</p>
                    </div>
                  </div>
                  <Switch 
                    checked={enableEmail} 
                    onCheckedChange={(checked) => {
                      setEnableEmail(checked);
                      quickSaveNotificationPref({ enableEmail: checked });
                    }}
                    data-testid="quick-switch-email"
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <MessageSquare className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-medium truncate">Push Notifications</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground truncate">In-app alerts</p>
                    </div>
                  </div>
                  <Switch 
                    checked={enablePush} 
                    onCheckedChange={(checked) => {
                      setEnablePush(checked);
                      quickSaveNotificationPref({ enablePush: checked });
                    }}
                    data-testid="quick-switch-push"
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Zap className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-medium truncate">AI Scheduling</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Auto-generate schedules</p>
                    </div>
                  </div>
                  <Switch 
                    checked={autoSchedulingEnabled} 
                    onCheckedChange={(checked) => {
                      setAutoSchedulingEnabled(checked);
                      updateSchedulingMutation.mutate({
                        autoSchedulingEnabled: checked,
                        scheduleGenerationInterval,
                        scheduleCustomDays: scheduleGenerationInterval === 'custom' ? scheduleCustomDays : undefined,
                        scheduleAdvanceNoticeDays,
                        scheduleGenerationDay,
                      });
                    }}
                    data-testid="quick-switch-scheduling"
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-medium truncate">AI Summarization</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Intelligent digests</p>
                    </div>
                  </div>
                  <Switch 
                    checked={enableAiSummarization} 
                    onCheckedChange={(checked) => {
                      setEnableAiSummarization(checked);
                      quickSaveNotificationPref({ enableAiSummarization: checked });
                    }}
                    data-testid="quick-switch-ai-summary"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Automation Status Card */}
            <Card>
              <CardHeader className="p-4 sm:p-6 pb-3 sm:pb-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
                  <div className="min-w-0">
                    <CardTitle className="text-base sm:text-lg">Automation Status</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">AI-powered workflow status</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6 pt-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-medium truncate">Auto Invoicing</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{invoiceSchedule} cycle</p>
                    </div>
                  </div>
                  <Switch 
                    checked={autoInvoicingEnabled} 
                    onCheckedChange={(checked) => {
                      setAutoInvoicingEnabled(checked);
                      updateInvoicingMutation.mutate({
                        autoInvoicingEnabled: checked,
                        invoiceSchedule,
                        invoiceCustomDays: invoiceSchedule === 'custom' ? invoiceCustomDays : undefined,
                        invoiceGenerationDay,
                      });
                    }}
                    data-testid="quick-switch-invoicing"
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-medium truncate">Auto Payroll</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{payrollSchedule} cycle</p>
                    </div>
                  </div>
                  <Switch 
                    checked={autoPayrollEnabled} 
                    onCheckedChange={(checked) => {
                      setAutoPayrollEnabled(checked);
                      updatePayrollMutation.mutate({
                        autoPayrollEnabled: checked,
                        payrollSchedule,
                        payrollCustomDays: payrollSchedule === 'custom' ? payrollCustomDays : undefined,
                        payrollProcessDay,
                        payrollCutoffDay,
                      });
                    }}
                    data-testid="quick-switch-payroll"
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Scale className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-medium truncate">Break Compliance</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{laborLawJurisdiction}</p>
                    </div>
                  </div>
                  <Switch 
                    checked={breakComplianceAlerts} 
                    onCheckedChange={(checked) => {
                      setBreakComplianceAlerts(checked);
                      updateBreakComplianceMutation.mutate({
                        // @ts-expect-error — TS migration: fix in refactoring sprint
                        jurisdiction: laborLawJurisdiction,
                        enableBreakAlerts: checked,
                      });
                    }}
                    data-testid="quick-switch-break-alerts"
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Bell className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-medium truncate">Shift Reminders</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{shiftReminderTiming} before</p>
                    </div>
                  </div>
                  <Switch 
                    checked={enableShiftReminders} 
                    onCheckedChange={(checked) => {
                      setEnableShiftReminders(checked);
                      quickSaveNotificationPref({ enableShiftReminders: checked });
                    }}
                    data-testid="quick-switch-reminders"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Organization Section */}
        <TabsContent value="organization" className="mt-6 space-y-6">
          <WorkspaceSettingsForm workspace={workspace} />

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
                    <SelectItem value="">Select...</SelectItem>
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

        {/* Organization Identifiers - Visible only to org_owner and co_owner for support purposes */}
        {(workspaceRole === 'org_owner' || workspaceRole === 'co_owner') && (
          <Card data-testid="card-org-identifiers">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle>Organization Identifiers</CardTitle>
                  <CardDescription>For support and integration reference</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 mobile-compact-p">
              <div className="grid gap-4 md:grid-cols-2 mobile-cols-1">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Organization Canonical ID</Label>
                  <div className="flex items-center gap-2">
                    <Input 
                      readOnly 
                      value={(workspace as any)?.orgId || (workspace as any)?.organizationId || 'N/A'} 
                      className="font-mono text-sm bg-muted"
                      data-testid="input-org-id"
                    />
                    <Button 
                      size="icon" 
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText((workspace as any)?.orgId || (workspace as any)?.organizationId || '');
                        toast({ title: "Copied!", description: "Organization Canonical ID copied to clipboard" });
                      }}
                      data-testid="button-copy-org-id"
                      aria-label="Copy Organization Canonical ID"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Organization Serial (Invite Code)</Label>
                  <div className="flex items-center gap-2">
                    <Input 
                      readOnly 
                      value={(workspace as any)?.organizationSerial || 'N/A'} 
                      className="font-mono text-sm bg-muted"
                      data-testid="input-org-serial"
                    />
                    <Button 
                      size="icon" 
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText((workspace as any)?.organizationSerial || '');
                        toast({ title: "Copied!", description: "Organization Serial copied to clipboard" });
                      }}
                      data-testid="button-copy-org-serial"
                      aria-label="Copy Organization Serial"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">QuickBooks Connection ID</Label>
                <div className="flex items-center gap-2">
                  <Input 
                    readOnly 
                    value={quickbooksStatus?.connectionId || (quickbooksStatus?.connected === false ? 'Not Connected' : 'N/A')} 
                    className="font-mono text-sm bg-muted"
                    data-testid="input-quickbooks-id"
                  />
                  {quickbooksStatus?.connectionId && (
                    <Button 
                      size="icon" 
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(quickbooksStatus?.connectionId || '');
                        toast({ title: "Copied!", description: "QuickBooks Connection ID copied to clipboard" });
                      }}
                      data-testid="button-copy-quickbooks-id"
                      aria-label="Copy QuickBooks Connection ID"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {quickbooksStatus?.companyName && quickbooksStatus.companyName !== 'Unknown Company' && (
                  <p className="text-xs text-muted-foreground">
                    Connected to: {quickbooksStatus.companyName}
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                These identifiers help our support team quickly locate your organization when you contact us.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Staffing Email Configuration - For Trinity AI work request routing */}
        {(workspaceRole === 'org_owner' || workspaceRole === 'co_owner') && staffingEmailConfig && (
          <Card data-testid="card-staffing-email">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle>Staffing Email Routing</CardTitle>
                  <CardDescription>Configure how work requests are routed to your organization via email</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Org Code Section */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Organization Code</Label>
                {editingOrgCode ? (
                  <div className="flex gap-2">
                    <Input
                      value={newOrgCode}
                      onChange={(e) => setNewOrgCode(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6))}
                      placeholder="e.g., sps"
                      className="lowercase font-mono"
                      maxLength={6}
                      data-testid="input-new-org-code"
                    />
                    <Button
                      size="sm"
                      onClick={() => updateOrgCodeMutation.mutate(newOrgCode)}
                      disabled={updateOrgCodeMutation.isPending || newOrgCode.length < 2}
                      data-testid="button-save-org-code"
                    >
                      {updateOrgCodeMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setEditingOrgCode(false); setNewOrgCode(''); }}
                      data-testid="button-cancel-org-code"
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-base px-3 py-1 font-mono" data-testid="badge-org-code">
                      {staffingEmailConfig.orgCode || 'Not Set'}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setNewOrgCode(staffingEmailConfig.orgCode || '');
                        setEditingOrgCode(true);
                      }}
                      data-testid="button-edit-org-code"
                    >
                      Change
                    </Button>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  2-6 alphanumeric characters, lowercase. Your staffing email: staffing@{staffingEmailConfig.orgCode || 'yourcode'}.coaileague.com
                </p>
              </div>

              <Separator />

              {/* Email Addresses */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Your Staffing Email</Label>
                {staffingEmailConfig.orgEmail && (
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={staffingEmailConfig.orgEmail}
                      className="font-mono text-sm"
                      data-testid="input-org-email"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(staffingEmailConfig.orgEmail || '');
                        toast({ title: "Copied!", description: "Email address copied to clipboard" });
                      }}
                      data-testid="button-copy-org-email"
                      aria-label="Copy Organization Email"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Work requests sent to this email will be automatically processed by Trinity AI and routed to your organization.
                </p>
              </div>

              <Separator />

              {/* Inbound Email Forwarding */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Inbound Email Forward Address</Label>
                <p className="text-xs text-muted-foreground">
                  Copies of all inbound emails (calloffs, incidents, support) processed by Trinity are forwarded to this address.
                </p>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={forwardEmailValue}
                    onChange={(e) => setForwardEmailValue(e.target.value)}
                    data-testid="input-inbound-forward-email"
                    className="max-w-xs"
                  />
                  <Button
                    size="sm"
                    onClick={() => updateForwardEmailMutation.mutate(forwardEmailValue)}
                    disabled={updateForwardEmailMutation.isPending}
                    data-testid="button-save-forward-email"
                  >
                    {updateForwardEmailMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Generic Email Claim */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-medium">Generic Staffing Email</Label>
                  {staffingEmailConfig.hasGenericEmailClaim ? (
                    <Badge className="bg-green-600" data-testid="badge-generic-claimed">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Claimed by You
                    </Badge>
                  ) : staffingEmailConfig.genericEmailClaimedBy ? (
                    <Badge variant="secondary" data-testid="badge-generic-other">
                      Claimed by {staffingEmailConfig.genericEmailClaimedBy.name}
                    </Badge>
                  ) : (
                    <Badge variant="outline" data-testid="badge-generic-available">Available</Badge>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={staffingEmailConfig.genericEmail}
                    className="font-mono text-sm"
                    data-testid="input-generic-email"
                  />
                  {staffingEmailConfig.hasGenericEmailClaim ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => releaseGenericEmailMutation.mutate()}
                      disabled={releaseGenericEmailMutation.isPending}
                      data-testid="button-release-generic"
                    >
                      {releaseGenericEmailMutation.isPending ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        'Release'
                      )}
                    </Button>
                  ) : staffingEmailConfig.canClaimGenericEmail ? (
                    <Button
                      size="sm"
                      onClick={() => claimGenericEmailMutation.mutate()}
                      disabled={claimGenericEmailMutation.isPending}
                      data-testid="button-claim-generic"
                    >
                      {claimGenericEmailMutation.isPending ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        'Claim'
                      )}
                    </Button>
                  ) : null}
                </div>
                
                <p className="text-xs text-muted-foreground">
                  The generic email (staffing@coaileague.com) routes to whichever organization claims it.
                  Only one organization can claim this at a time.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
        {/* Workspace Invite Section */}
        {(workspaceRole === 'org_owner' || workspaceRole === 'co_owner' || workspaceRole === 'org_admin' || workspaceRole === 'manager') && (
          <Card data-testid="card-send-invite">
            <CardHeader>
              <div className="flex items-center gap-3">
                <UserPlus className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle>Invite Team Members</CardTitle>
                  <CardDescription>Send an email invitation to join your workspace</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Email Address</Label>
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@company.com"
                    data-testid="input-invite-email"
                    onKeyDown={(e) => { if (e.key === 'Enter' && inviteEmail.trim()) sendInviteMutation.mutate({ email: inviteEmail.trim(), role: inviteRole }); }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Role</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger data-testid="select-invite-role">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="supervisor">Supervisor</SelectItem>
                      <SelectItem value="co_owner">Co-Owner</SelectItem>
                      <SelectItem value="org_admin">Administrator</SelectItem>
                      <SelectItem value="employee">Employee</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                onClick={() => { if (inviteEmail.trim()) { setInviteResult(null); sendInviteMutation.mutate({ email: inviteEmail.trim(), role: inviteRole }); } }}
                disabled={sendInviteMutation.isPending || !inviteEmail.trim()}
                data-testid="button-send-invite"
                className="gap-2"
              >
                {sendInviteMutation.isPending ? (
                  <><RefreshCw className="h-4 w-4 animate-spin" />Sending...</>
                ) : (
                  <><Send className="h-4 w-4" />Send Invitation</>
                )}
              </Button>

              {inviteResult && (
                <div className="rounded-md bg-muted p-3 space-y-2" data-testid="invite-result">
                  <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    Invitation sent! Share this link if they don't receive the email:
                  </p>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={inviteResult.link} className="font-mono text-xs bg-background" data-testid="input-invite-link" />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => { navigator.clipboard.writeText(inviteResult.link); toast({ title: "Copied!", description: "Invite link copied to clipboard" }); }}
                      data-testid="button-copy-invite-link"
                      aria-label="Copy invite link"
                    >
                      <ClipboardCopy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Code: <span className="font-mono font-medium">{inviteResult.code}</span></p>
                </div>
              )}

              {Array.isArray(workspaceInvites) && workspaceInvites.length > 0 && (
                <div className="space-y-2 pt-2">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    Recent Invitations
                  </p>
                  <div className="space-y-1.5">
                    {workspaceInvites.slice(0, 8).map((inv: any) => (
                      <div key={inv.id} className="flex items-center justify-between py-1.5 px-2 rounded-md bg-muted/50 text-xs" data-testid={`invite-row-${inv.id}`}>
                        <span className="text-foreground font-medium truncate max-w-[200px]">{inv.inviteeEmail || 'Unknown'}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-muted-foreground capitalize">{(inv.inviteeRole || 'staff').replace('_', ' ')}</span>
                          <Badge variant={inv.status === 'accepted' ? 'default' : inv.status === 'pending' ? 'secondary' : 'outline'} className="text-xs">
                            {inv.status || 'pending'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
        </TabsContent>

        {/* Storage Section */}
        <TabsContent value="storage" className="mt-6">
          <StorageTabContent />
        </TabsContent>

        {/* Billing Section */}
        <TabsContent value="billing" className="mt-6 space-y-6">
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
            <div className="flex items-center justify-between mobile-flex-col mobile-gap-3 flex-wrap gap-2">
              <div>
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <span className="text-sm font-medium">Current Plan</span>
                  <Badge
                    data-testid="badge-current-plan"
                    className="capitalize"
                    variant={(workspace as any)?.subscriptionTier === 'enterprise' ? 'default' : 'secondary'}
                  >
                    {(workspace as any)?.subscriptionTier === 'free' || !(workspace as any)?.subscriptionTier
                      ? 'Free Trial'
                      : (workspace as any)?.subscriptionTier === 'free_trial'
                      ? 'Free Trial'
                      : (workspace as any)?.subscriptionTier?.charAt(0).toUpperCase() +
                        ((workspace as any)?.subscriptionTier?.slice(1) || '')}
                  </Badge>
                  {(workspace as any)?.subscriptionStatus === 'active' && (
                    <Badge variant="outline" className="text-xs text-green-600 border-green-500/30 dark:text-green-400" data-testid="badge-plan-status">
                      Active
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {(workspace as any)?.subscriptionTier === 'enterprise'
                    ? 'Unlimited employees \u2022 Unlimited clients \u2022 Full Trinity AI suite'
                    : (workspace as any)?.subscriptionTier === 'professional'
                    ? 'Up to 25 employees \u2022 Unlimited clients \u2022 Advanced AI features'
                    : (workspace as any)?.subscriptionTier === 'starter'
                    ? 'Up to 10 employees \u2022 Unlimited clients \u2022 Core features'
                    : '5 employees \u2022 10 clients \u2022 Basic features (trial)'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setLocation('/billing')}
                  data-testid="button-upgrade"
                >
                  {(workspace as any)?.subscriptionTier && (workspace as any)?.subscriptionTier !== 'free' && (workspace as any)?.subscriptionTier !== 'free_trial'
                    ? 'Manage Plan'
                    : 'Upgrade Plan'}
                </Button>
                {(workspace as any)?.subscriptionTier && (workspace as any)?.subscriptionTier !== 'free' && (workspace as any)?.subscriptionTier !== 'free_trial' && (
                  <Button
                    variant="outline"
                    onClick={() => billingPortalMutation.mutate()}
                    disabled={billingPortalMutation.isPending}
                    data-testid="button-billing-portal"
                  >
                    {billingPortalMutation.isPending ? 'Opening...' : 'Manage Payment Method'}
                  </Button>
                )}
              </div>
            </div>
            <Separator />
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Payment Processing</h3>
              <div className="grid gap-4 md:grid-cols-2 mobile-cols-1">
                <div className="space-y-2">
                  <Label htmlFor="platformFee">Processing Fee (%)</Label>
                  <Input 
                    id="platformFee" 
                    type="number" 
                    defaultValue="2.90" 
                    step="0.01"
                    disabled
                    data-testid="input-platform-fee" 
                  />
                  <p className="text-xs text-muted-foreground">
                    Standard card processing fee per invoice collected through CoAIleague
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Stripe Payment Processing</Label>
                  <div className="flex items-center gap-2 h-10 flex-wrap">
                    <Badge
                      variant="outline"
                      className="text-green-600 border-green-500/30 dark:text-green-400"
                      data-testid="badge-stripe-status"
                    >
                      Platform Connected
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Payments are processed securely via CoAIleague's Stripe integration. No additional setup required.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        </TabsContent>

        {/* Notifications Section - populated with full notification content */}
        <TabsContent value="notifications" className="mt-6 space-y-6">
        {/* Notifications */}
        <Card data-testid="card-notifications-full">
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
                        <span className="ml-2 text-yellow-600 dark:text-yellow-400">(Twilio not configured)</span>
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
                      placeholder="Enter phone number"
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
                    <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
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
                        <SelectValue placeholder="Select timing" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Select...</SelectItem>
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
                      // @ts-expect-error — TS migration: fix in refactoring sprint
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
                  <div className="flex items-center justify-between gap-2">
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
                        // @ts-expect-error — TS migration: fix in refactoring sprint
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
                    // @ts-expect-error — TS migration: fix in refactoring sprint
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
                        // @ts-expect-error — TS migration: fix in refactoring sprint
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
                        // @ts-expect-error — TS migration: fix in refactoring sprint
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
                    <p className="text-xs text-yellow-600 dark:text-yellow-400 md:col-span-2" data-testid="text-quiet-hours-warning">
                      Warning: Start and end times are the same - quiet hours will be disabled
                    </p>
                  )}
                  {quietHoursStart !== quietHoursEnd && quietHoursStart > quietHoursEnd && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 md:col-span-2" data-testid="text-quiet-hours-overnight">
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
                    // @ts-expect-error — TS migration: fix in refactoring sprint
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
                        // @ts-expect-error — TS migration: fix in refactoring sprint
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
                  
                  <div className="flex items-center justify-between gap-2">
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
                        // @ts-expect-error — TS migration: fix in refactoring sprint
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
                onClick={async () => {
                  try {
                    const res = await apiRequest('POST', '/api/auth/mfa/setup', {});
                    const data = await res.json();
                    setMfaSetupData(data);
                    setMfaSetupOpen(true);
                  } catch (error: any) {
                    toast({ title: "Error", description: error.message || "Failed to start 2FA setup", variant: "destructive" });
                  }
                }}
                data-testid="button-setup-2fa"
              >
                Set Up
              </Button>
            </div>
            <UniversalModal open={mfaSetupOpen} onOpenChange={setMfaSetupOpen}>
              <UniversalModalHeader>
                  <UniversalModalTitle>Set Up Two-Factor Authentication</UniversalModalTitle>
                  <UniversalModalDescription>Scan the QR code with your authenticator app</UniversalModalDescription>
                </UniversalModalHeader>
                {mfaSetupData && (
                  <div className="space-y-4">
                    <div className="flex justify-center">
                      <img src={mfaSetupData.qrCodeUrl} alt="2FA QR Code" width={192} height={192} className="w-48 h-48" />
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-2">Backup Codes</p>
                      <p className="text-xs text-muted-foreground mb-2">Save these codes in a safe place. You can use them to access your account if you lose your authenticator.</p>
                      <div className="grid grid-cols-2 gap-1 p-3 bg-muted rounded-md">
                        {mfaSetupData.backupCodes.map((code: string, i: number) => (
                          <code key={i} className="text-xs font-mono">{code}</code>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
            </UniversalModal>
          </CardContent>
        </Card>

        {/* Calendar Integration */}
        <CalendarIntegrationCard />
        </TabsContent>

        {/* Financial Section */}
        <TabsContent value="financial" className="mt-6 space-y-6">

          {/* Data Readiness Dashboard */}
          <Card data-testid="card-data-readiness">
            <CardHeader>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <ClipboardList className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle>Automation Pipeline Readiness</CardTitle>
                    <CardDescription>All data required for invoice, payroll, and tax automation pipelines</CardDescription>
                  </div>
                </div>
                {!readinessLoading && dataReadiness && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{dataReadiness.score}% complete</span>
                    <Badge variant={dataReadiness.automationReady ? "default" : "destructive"} className={dataReadiness.automationReady ? "bg-green-600" : ""}>
                      {dataReadiness.automationReady ? "Pipeline Ready" : `${dataReadiness.criticalFailingCount} critical gaps`}
                    </Badge>
                    <Button size="icon" variant="ghost" onClick={() => refetchReadiness()} data-testid="button-refresh-readiness">
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-6 mobile-compact-p">
              {readinessLoading ? (
                <div className="space-y-3">
                  {[1,2,3,4,5,6].map(i => <div key={i} className="h-8 bg-muted animate-pulse rounded-md" />)}
                </div>
              ) : dataReadiness ? (
                <div className="space-y-6">
                  {Object.entries(dataReadiness.sections || {}).map(([sectionId, section]: [string, any]) => (
                    <div key={sectionId} className="space-y-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          {sectionId === 'org' && <Building2 className="h-4 w-4 text-muted-foreground" />}
                          {sectionId === 'invoice' && <Receipt className="h-4 w-4 text-muted-foreground" />}
                          {sectionId === 'payroll' && <Landmark className="h-4 w-4 text-muted-foreground" />}
                          <span className="text-sm font-medium">{section.label}</span>
                        </div>
                        <Badge variant="outline" className={section.score === 100 ? "border-green-500 text-green-600" : section.score >= 60 ? "border-yellow-500 text-yellow-600" : "border-red-500 text-red-600"}>
                          {section.score}%
                        </Badge>
                      </div>
                      <div className="space-y-2">
                        {section.checks.map((check: any) => (
                          <div key={check.id} className="flex items-start gap-3 p-2 rounded-md bg-muted/30" data-testid={`readiness-check-${check.id}`}>
                            {check.ok ? (
                              <CircleCheck className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                            ) : check.critical ? (
                              <CircleX className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium leading-none">{check.label}</p>
                              {!check.ok && <p className="text-xs text-muted-foreground mt-1">{check.tip}</p>}
                            </div>
                            {check.critical && !check.ok && (
                              <Badge variant="destructive" className="text-xs shrink-0">Required</Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Unable to load readiness data.</p>
              )}
            </CardContent>
          </Card>

          {/* Invoice Financial Configuration */}
          <Card data-testid="card-invoice-financials">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Receipt className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle>Invoice Settings</CardTitle>
                  <CardDescription>Configure invoice numbering, payment terms, late fees, and the email address invoices are sent from</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 mobile-compact-p">
              {/* Billing Email */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-primary" />
                  <Label className="text-sm font-semibold">Invoice From Email</Label>
                  <Badge variant="destructive" className="text-xs">Required</Badge>
                </div>
                <p className="text-xs text-muted-foreground">The email address used to send invoices to your clients. Must be a verified sender address.</p>
                <Input
                  type="email"
                  placeholder="billing@yourcompany.com"
                  value={billingEmail}
                  onChange={e => setBillingEmail(e.target.value)}
                  data-testid="input-billing-email"
                />
              </div>

              <Separator />

              {/* Invoice Numbering */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-primary" />
                  <Label className="text-sm font-semibold">Invoice Number Format</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Invoices will be numbered as: <strong>{invoicePrefix || 'INV'}-{invoiceNextNumber || 1000}</strong>, {invoicePrefix || 'INV'}-{(invoiceNextNumber || 1000) + 1}, etc.
                </p>
                <div className="grid gap-4 md:grid-cols-2 mobile-cols-1">
                  <div className="space-y-2">
                    <Label htmlFor="invoicePrefix">Invoice Prefix</Label>
                    <Input
                      id="invoicePrefix"
                      placeholder="INV"
                      maxLength={10}
                      value={invoicePrefix}
                      onChange={e => setInvoicePrefix(e.target.value.toUpperCase())}
                      data-testid="input-invoice-prefix"
                    />
                    <p className="text-xs text-muted-foreground">Up to 10 characters (e.g. INV, SGA, SEC)</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invoiceNextNumber">Next Invoice Number</Label>
                    <Input
                      id="invoiceNextNumber"
                      type="number"
                      min={1}
                      placeholder="1000"
                      value={invoiceNextNumber}
                      onChange={e => setInvoiceNextNumber(parseInt(e.target.value) || 1000)}
                      data-testid="input-invoice-next-number"
                    />
                    <p className="text-xs text-muted-foreground">The number assigned to the next generated invoice</p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Payment Terms */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  <Label className="text-sm font-semibold">Payment Terms & Tax</Label>
                </div>
                <div className="grid gap-4 md:grid-cols-3 mobile-cols-1">
                  <div className="space-y-2">
                    <Label htmlFor="paymentTermsDays">Payment Terms (Days)</Label>
                    <Select value={String(paymentTermsDays)} onValueChange={v => setPaymentTermsDays(parseInt(v))}>
                      <SelectTrigger id="paymentTermsDays" data-testid="select-payment-terms">
                        <SelectValue placeholder="Select terms" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Due on Receipt</SelectItem>
                        <SelectItem value="7">Net 7</SelectItem>
                        <SelectItem value="10">Net 10</SelectItem>
                        <SelectItem value="15">Net 15</SelectItem>
                        <SelectItem value="30">Net 30</SelectItem>
                        <SelectItem value="45">Net 45</SelectItem>
                        <SelectItem value="60">Net 60</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="defaultTaxRate">Default Tax Rate (%)</Label>
                    <div className="relative">
                      <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        id="defaultTaxRate"
                        type="number"
                        step="0.001"
                        min={0}
                        max={100}
                        placeholder="8.875"
                        value={defaultTaxRate}
                        onChange={e => setDefaultTaxRate(parseFloat(e.target.value) || 0)}
                        className="pl-9"
                        data-testid="input-default-tax-rate"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Applied to invoices unless overridden per client</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lateFeePercentage">Late Fee (%)</Label>
                    <div className="relative">
                      <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        id="lateFeePercentage"
                        type="number"
                        step="0.5"
                        min={0}
                        max={25}
                        placeholder="0"
                        value={lateFeePercentage}
                        onChange={e => setLateFeePercentage(parseFloat(e.target.value) || 0)}
                        className="pl-9"
                        data-testid="input-late-fee-percentage"
                      />
                    </div>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2 mobile-cols-1">
                  <div className="space-y-2">
                    <Label htmlFor="lateFeeDays">Late Fee Grace Period (Days)</Label>
                    <Input
                      id="lateFeeDays"
                      type="number"
                      min={1}
                      placeholder="30"
                      value={lateFeeDays}
                      onChange={e => setLateFeeDays(parseInt(e.target.value) || 30)}
                      data-testid="input-late-fee-days"
                    />
                    <p className="text-xs text-muted-foreground">Days after the due date before the late fee is applied</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleSaveInvoiceFinancials}
                  disabled={updateWorkspaceMutation.isPending}
                  data-testid="button-save-invoice-financials"
                >
                  {updateWorkspaceMutation.isPending ? "Saving..." : "Save Invoice Settings"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Payroll Financial Configuration */}
          <Card data-testid="card-payroll-financials">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Landmark className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle>Payroll Tax & Funding</CardTitle>
                  <CardDescription>Employer tax rates, worker's comp, and the bank account used to fund payroll disbursements</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 mobile-compact-p">
              {/* Employer Tax Rates */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <Label className="text-sm font-semibold">Employer Tax Rates</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  These rates are used for payroll cost reporting, P&L calculations, and tax filing preparation. They do not affect employee net pay.
                </p>
                <div className="grid gap-4 md:grid-cols-2 mobile-cols-1">
                  <div className="space-y-2">
                    <Label htmlFor="suiRate">State Unemployment Insurance Rate (%)</Label>
                    <div className="relative">
                      <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        id="suiRate"
                        type="number"
                        step="0.01"
                        min={0}
                        max={15}
                        placeholder="2.7"
                        value={stateUnemploymentRate}
                        onChange={e => setStateUnemploymentRate(parseFloat(e.target.value) || 0)}
                        className="pl-9"
                        data-testid="input-sui-rate"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Your state SUI / SUTA rate from the state unemployment agency</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="workerCompRate">Worker's Compensation Rate (%)</Label>
                    <div className="relative">
                      <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        id="workerCompRate"
                        type="number"
                        step="0.01"
                        min={0}
                        max={25}
                        placeholder="1.5"
                        value={workerCompRate}
                        onChange={e => setWorkerCompRate(parseFloat(e.target.value) || 0)}
                        className="pl-9"
                        data-testid="input-worker-comp-rate"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Your worker's comp insurance rate (used for payroll cost calculations)</p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Payroll Funding Bank */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-primary" />
                  <Label className="text-sm font-semibold">Payroll Funding Bank Account</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  The company bank account used to fund ACH payroll disbursements to employees. Routing and account numbers are stored securely and used by the payroll processor.
                </p>
                <div className="grid gap-4 md:grid-cols-2 mobile-cols-1">
                  <div className="space-y-2">
                    <Label htmlFor="payrollBankName">Bank Name</Label>
                    <Input
                      id="payrollBankName"
                      placeholder="Chase, Wells Fargo, etc."
                      value={payrollBankName}
                      onChange={e => setPayrollBankName(e.target.value)}
                      data-testid="input-payroll-bank-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="payrollMemo">Default Payroll Memo</Label>
                    <Input
                      id="payrollMemo"
                      placeholder="e.g. Payroll - Biweekly"
                      value={payrollMemo}
                      onChange={e => setPayrollMemo(e.target.value)}
                      data-testid="input-payroll-memo"
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2 mobile-cols-1">
                  <div className="space-y-2">
                    <Label htmlFor="payrollBankRouting">ABA Routing Number</Label>
                    <Input
                      id="payrollBankRouting"
                      placeholder="9-digit routing number"
                      maxLength={9}
                      value={payrollBankRouting}
                      onChange={e => setPayrollBankRouting(e.target.value.replace(/\D/g, ''))}
                      data-testid="input-payroll-bank-routing"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="payrollBankAccount">Account Number</Label>
                    <Input
                      id="payrollBankAccount"
                      type="password"
                      placeholder="Account number (stored securely)"
                      value={payrollBankAccount}
                      onChange={e => setPayrollBankAccount(e.target.value)}
                      data-testid="input-payroll-bank-account"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleSavePayrollFinancials}
                  disabled={updateWorkspaceMutation.isPending}
                  data-testid="button-save-payroll-financials"
                >
                  {updateWorkspaceMutation.isPending ? "Saving..." : "Save Payroll Settings"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Company Address for Invoice Headers */}
          <Card data-testid="card-company-address">
            <CardHeader>
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle>Company Billing Address</CardTitle>
                  <CardDescription>Address shown on invoice headers, pay stubs, and tax documents</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 mobile-compact-p">
              <div className="space-y-2">
                <Label htmlFor="finStreetAddress">Street Address</Label>
                <Input
                  id="finStreetAddress"
                  placeholder="123 Main Street"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  data-testid="input-fin-street-address"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-3 mobile-cols-1">
                <div className="space-y-2">
                  <Label htmlFor="finCity">City</Label>
                  <Input
                    id="finCity"
                    placeholder="Dallas"
                    value={companyCity}
                    onChange={e => setCompanyCity(e.target.value)}
                    data-testid="input-fin-city"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="finState">State</Label>
                  <Input
                    id="finState"
                    placeholder="TX"
                    maxLength={2}
                    value={companyState}
                    onChange={e => setCompanyState(e.target.value.toUpperCase())}
                    data-testid="input-fin-state"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="finZip">ZIP Code</Label>
                  <Input
                    id="finZip"
                    placeholder="75201"
                    value={companyZip}
                    onChange={e => setCompanyZip(e.target.value)}
                    data-testid="input-fin-zip"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={handleSaveWorkspace}
                  disabled={updateWorkspaceMutation.isPending}
                  data-testid="button-save-company-address"
                >
                  {updateWorkspaceMutation.isPending ? "Saving..." : "Save Address"}
                </Button>
              </div>
            </CardContent>
          </Card>

        </TabsContent>

        {/* Automation Section */}
        <TabsContent value="automation" className="mt-6 space-y-6">
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
              <div className="space-y-2">
                <Label htmlFor="invoiceGenerationDay">Day of Month to Generate Invoices</Label>
                <Select
                  value={String(invoiceGenerationDay)}
                  onValueChange={(v) => setInvoiceGenerationDay(Number(v))}
                  disabled={!autoInvoicingEnabled || updateInvoicingMutation.isPending}
                >
                  <SelectTrigger id="invoiceGenerationDay" data-testid="select-invoice-generation-day">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                      <SelectItem key={d} value={String(d)}>Day {d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Which day of the month automatic invoices are generated</p>
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="payrollProcessDay">Process Day of Month</Label>
                  <Select
                    value={String(payrollProcessDay)}
                    onValueChange={(v) => setPayrollProcessDay(Number(v))}
                    disabled={!autoPayrollEnabled || updatePayrollMutation.isPending}
                  >
                    <SelectTrigger id="payrollProcessDay" data-testid="select-payroll-process-day">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                        <SelectItem key={d} value={String(d)}>Day {d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Day payroll is processed</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payrollCutoffDay">Hours Cutoff Day</Label>
                  <Select
                    value={String(payrollCutoffDay)}
                    onValueChange={(v) => setPayrollCutoffDay(Number(v))}
                    disabled={!autoPayrollEnabled || updatePayrollMutation.isPending}
                  >
                    <SelectTrigger id="payrollCutoffDay" data-testid="select-payroll-cutoff-day">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                        <SelectItem key={d} value={String(d)}>Day {d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Last day hours are counted</p>
                </div>
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
              <div className="space-y-2">
                <Label htmlFor="scheduleGenerationDay">Day of Week to Generate Schedules</Label>
                <Select
                  value={String(scheduleGenerationDay)}
                  onValueChange={(v) => setScheduleGenerationDay(Number(v))}
                  disabled={!autoSchedulingEnabled || updateSchedulingMutation.isPending}
                >
                  <SelectTrigger id="scheduleGenerationDay" data-testid="select-schedule-generation-day">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Sunday</SelectItem>
                    <SelectItem value="1">Monday</SelectItem>
                    <SelectItem value="2">Tuesday</SelectItem>
                    <SelectItem value="3">Wednesday</SelectItem>
                    <SelectItem value="4">Thursday</SelectItem>
                    <SelectItem value="5">Friday</SelectItem>
                    <SelectItem value="6">Saturday</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Which day of the week schedules are automatically generated</p>
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
        </TabsContent>

        {/* Compliance Section */}
        <TabsContent value="compliance" className="mt-6 space-y-6">
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
        </TabsContent>

      </Tabs>
      </div>
  );

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['/api/workspace'] });
    await queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
    await queryClient.invalidateQueries({ queryKey: ['/api/notifications/preferences'] });
  };

  const pageConfig: CanvasPageConfig = {
    ...settingsConfig,
    headerActions: headerAction,
    onRefresh: handleRefresh,
  };

  return (
    <CanvasHubPage config={pageConfig}>
      {pageContent}
    </CanvasHubPage>
  );
}

function CalendarIntegrationCard() {
  const { toast } = useToast();
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
      const response = await secureFetch('/api/calendar/export/ical', {
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
      const response = await secureFetch('/api/calendar/import/ical', {
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
                        aria-label="Regenerate token"
                      >
                        <RefreshCw className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteSubscriptionMutation.mutate(sub.id)}
                        disabled={deleteSubscriptionMutation.isPending}
                        data-testid={`button-delete-${sub.id}`}
                        aria-label="Delete subscription"
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
