import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import ModernLayout from "@/components/ModernLayout";
import {
  Building2,
  CreditCard,
  Bell,
  Shield,
} from "lucide-react";

export default function Settings() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();

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

  if (isLoading || !isAuthenticated) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" aria-label="Loading" />
      </div>
    );
  }

  return (
    <ModernLayout>
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
                <Input id="workspaceName" placeholder="My Business" data-testid="input-workspace-name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name</Label>
                <Input id="companyName" placeholder="Acme Inc." data-testid="input-company-name" />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="taxId">Tax ID / EIN</Label>
                <Input id="taxId" placeholder="12-3456789" data-testid="input-tax-id" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" placeholder="+1 (555) 123-4567" data-testid="input-company-phone" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea id="address" placeholder="123 Main St, City, State 12345" data-testid="input-company-address" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input id="website" type="url" placeholder="https://example.com" data-testid="input-company-website" />
            </div>
            <Button data-testid="button-save-workspace">Save Changes</Button>
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
              <Button variant="outline" data-testid="button-upgrade">
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
                    <Button size="sm" variant="ghost" data-testid="button-connect-stripe">
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
              <Button variant="outline" size="sm" data-testid="button-toggle-reminders">
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
              <Button variant="outline" size="sm" data-testid="button-toggle-shift-notifications">
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
              <Button variant="outline" size="sm" data-testid="button-setup-2fa">
                Set Up
              </Button>
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
    </ModernLayout>
  );
}
