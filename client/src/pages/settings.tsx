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
} from "lucide-react";

export default function Settings() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  
  // Form state for workspace settings
  const [workspaceName, setWorkspaceName] = useState<string>("");
  const [companyName, setCompanyName] = useState<string>("");
  const [taxId, setTaxId] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [address, setAddress] = useState<string>("");
  const [website, setWebsite] = useState<string>("");

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

  // Initialize form fields when workspace loads
  useEffect(() => {
    if (workspace) {
      const ws = workspace as any;
      setSelectedCategory(ws.businessCategory || "");
      setWorkspaceName(ws.name || "");
      setCompanyName(ws.companyName || "");
      setTaxId(ws.taxId || "");
      setPhone(ws.phone || "");
      setAddress(ws.address || "");
      setWebsite(ws.website || "");
    }
  }, [workspace]);

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

  if (isLoading || !isAuthenticated) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" aria-label="Loading" />
      </div>
    );
  }

  return (
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
        </div>
      </div>
    </div>
  );
}
