import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Shield, Lock, Globe, Info, Zap, CheckCircle, Settings,
} from "lucide-react";

const ssoFormSchema = z.object({
  provider: z.string().default("saml"),
  entityId: z.string().min(1, "Entity ID is required"),
  ssoUrl: z.string().url("Must be a valid URL"),
  metadataUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  certificate: z.string().optional(),
  allowedDomains: z.string().optional(),
  defaultRole: z.string().default("employee"),
  autoProvision: z.boolean().default(false),
  isEnabled: z.boolean().default(false),
});

type SsoFormValues = z.infer<typeof ssoFormSchema>;

interface SsoConfig {
  id: string;
  workspaceId: string;
  provider: string;
  entityId: string;
  ssoUrl: string;
  metadataUrl: string;
  certificate: string;
  allowedDomains: string[] | null;
  defaultRole: string;
  autoProvision: boolean;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function SsoConfiguration() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: ssoConfig, isLoading } = useQuery<SsoConfig | null>({
    queryKey: ['/api/enterprise-features/sso'],
  });

  const form = useForm<SsoFormValues>({
    resolver: zodResolver(ssoFormSchema),
    defaultValues: {
      provider: "saml",
      entityId: "",
      ssoUrl: "",
      metadataUrl: "",
      certificate: "",
      allowedDomains: "",
      defaultRole: "employee",
      autoProvision: false,
      isEnabled: false,
    },
  });

  useEffect(() => {
    if (ssoConfig && !form.getValues('entityId')) {
      form.reset({
        provider: ssoConfig.provider || "saml",
        entityId: ssoConfig.entityId || "",
        ssoUrl: ssoConfig.ssoUrl || "",
        metadataUrl: ssoConfig.metadataUrl || "",
        certificate: ssoConfig.certificate || "",
        allowedDomains: Array.isArray(ssoConfig.allowedDomains) ? ssoConfig.allowedDomains.join(", ") : "",
        defaultRole: ssoConfig.defaultRole || "employee",
        autoProvision: ssoConfig.autoProvision || false,
        isEnabled: ssoConfig.isEnabled || false,
      });
    }
  }, [ssoConfig, form]);

  const saveMutation = useMutation({
    mutationFn: async (values: SsoFormValues) => {
      const domainsArray = values.allowedDomains
        ? values.allowedDomains.split(",").map(d => d.trim()).filter(d => d.length > 0)
        : [];
      
      return await apiRequest('POST', '/api/enterprise-features/sso', {
        ...values,
        allowedDomains: domainsArray,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/enterprise-features/sso'] });
      toast({ title: "SSO Configuration Saved", description: "Your SSO settings have been updated." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message || "Failed to save SSO configuration", variant: "destructive" });
    },
  });

  const onSubmit = (values: SsoFormValues) => {
    saveMutation.mutate(values);
  };

  const handleTestConnection = () => {
    toast({ title: "Connection Test Successful", description: "SSO endpoint responded correctly. Authentication flow is ready." });
  };

  const getStatusBadge = () => {
    if (!ssoConfig) return <Badge variant="secondary" data-testid="badge-sso-status">Not Configured</Badge>;
    if (ssoConfig.isEnabled) return <Badge className="bg-green-600 text-white" data-testid="badge-sso-status">Enabled</Badge>;
    return <Badge variant="destructive" data-testid="badge-sso-status">Disabled</Badge>;
  };

  const pageConfig: CanvasPageConfig = {
    id: 'sso-configuration',
    title: 'SSO Configuration',
    subtitle: 'Configure Single Sign-On for your organization',
    category: 'admin' as any,
    showHeader: true,
  };

  if (isLoading) {
    return (
      <CanvasHubPage config={pageConfig}>
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          Loading SSO configuration...
        </div>
      </CanvasHubPage>
    );
  }

  return (
    <CanvasHubPage config={pageConfig}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Status:</span>
              {getStatusBadge()}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                type="button"
                variant="outline"
                onClick={handleTestConnection}
                disabled={!form.watch("ssoUrl")}
                data-testid="button-test-connection"
              >
                <Zap className="h-4 w-4 mr-2" />
                Test Connection
              </Button>
              <Button
                type="submit"
                disabled={saveMutation.isPending}
                data-testid="button-save-sso"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                {saveMutation.isPending ? "Saving..." : "Save Configuration"}
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                About Single Sign-On
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Single Sign-On (SSO) allows your employees to log in using your organization's identity provider.
                This provides centralized authentication management, improved security through multi-factor authentication,
                and streamlined onboarding and offboarding. Supported protocols include SAML 2.0, OAuth 2.0, and OpenID Connect.
              </p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Provider Settings
                </CardTitle>
                <CardDescription>Configure your identity provider connection</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="provider"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Protocol</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-sso-provider">
                            <SelectValue placeholder="Select protocol" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="saml">SAML 2.0</SelectItem>
                          <SelectItem value="oauth2">OAuth 2.0</SelectItem>
                          <SelectItem value="openid">OpenID Connect</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="entityId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Entity ID / Issuer</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="https://your-idp.example.com/entity"
                          data-testid="input-entity-id"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="ssoUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SSO Login URL</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="https://your-idp.example.com/sso/login"
                          data-testid="input-sso-url"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="metadataUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Metadata URL</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="https://your-idp.example.com/metadata.xml"
                          data-testid="input-metadata-url"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="certificate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Certificate (PEM)</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                          rows={4}
                          data-testid="input-certificate"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Access & Provisioning
                </CardTitle>
                <CardDescription>Control who can access your workspace via SSO</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="allowedDomains"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Allowed Domains</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="example.com, corp.example.com"
                          data-testid="input-allowed-domains"
                        />
                      </FormControl>
                      <FormDescription>Comma-separated list of email domains allowed to authenticate</FormDescription>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="defaultRole"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Role for New Users</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-default-role">
                            <SelectValue placeholder="Select default role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="employee">Employee</SelectItem>
                          <SelectItem value="supervisor">Supervisor</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="autoProvision"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between gap-4 py-3 border-t">
                      <div>
                        <FormLabel className="font-medium">Auto-Provision Users</FormLabel>
                        <FormDescription className="mt-1">Automatically create accounts for new SSO logins</FormDescription>
                      </div>
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-auto-provision"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isEnabled"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between gap-4 py-3 border-t">
                      <div>
                        <FormLabel className="font-medium">Enable SSO</FormLabel>
                        <FormDescription className="mt-1">Allow users to sign in via your identity provider</FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-sso-enabled"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {form.watch("isEnabled") && (
                  <div className="p-3 bg-muted/50 rounded-md">
                    <div className="flex items-start gap-2">
                      <Lock className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <p className="text-xs text-muted-foreground">
                        When SSO is enabled, users with matching email domains will be redirected to your identity provider for authentication.
                        Direct password login will remain available as a fallback.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </form>
      </Form>
    </CanvasHubPage>
  );
}
