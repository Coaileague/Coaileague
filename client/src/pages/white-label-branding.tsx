import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Paintbrush, Save, Eye, Globe, Image, Palette } from "lucide-react";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

interface BrandingData {
  id?: string;
  displayName: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
  hidePoweredBy: boolean;
  customDomain: string;
}

const DEFAULT_BRANDING: BrandingData = {
  displayName: "",
  logoUrl: "",
  primaryColor: "#3b82f6",
  accentColor: "#8b5cf6",
  hidePoweredBy: false,
  customDomain: "",
};

export default function WhiteLabelBranding() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<BrandingData>(DEFAULT_BRANDING);

  const { data: branding, isLoading } = useQuery<BrandingData | null>({
    queryKey: ["/api/enterprise-features/branding"],
  });

  useEffect(() => {
    if (branding) {
      setForm({
        displayName: branding.displayName || "",
        logoUrl: branding.logoUrl || "",
        primaryColor: branding.primaryColor || "#3b82f6",
        accentColor: branding.accentColor || "#8b5cf6",
        hidePoweredBy: branding.hidePoweredBy || false,
        customDomain: branding.customDomain || "",
      });
    }
  }, [branding]);

  const saveMutation = useMutation({
    mutationFn: async (data: BrandingData) => {
      return await apiRequest("POST", "/api/enterprise-features/branding", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/enterprise-features/branding"] });
      toast({
        title: "Branding Saved",
        description: "Your white-label branding settings have been updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save branding settings",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    saveMutation.mutate(form);
  };

  const pageConfig: CanvasPageConfig = {
    id: "white-label-branding",
    title: "White-Label Branding",
    subtitle: "Customize your workspace appearance and branding for a seamless client experience",
    category: "settings" as any,
    showHeader: true,
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 flex-wrap">
              <Paintbrush className="h-5 w-5" />
              Branding Settings
            </CardTitle>
            <CardDescription>Configure how your workspace appears to users</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading branding settings...</div>
            ) : (
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="displayName">Display Name</Label>
                  <Input
                    id="displayName"
                    placeholder="Your Company Name"
                    value={form.displayName}
                    onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                    data-testid="input-display-name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="logoUrl" className="flex items-center gap-2 flex-wrap">
                    <Image className="h-4 w-4" />
                    Logo URL
                  </Label>
                  <Input
                    id="logoUrl"
                    placeholder="https://example.com/logo.png"
                    value={form.logoUrl}
                    onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
                    data-testid="input-logo-url"
                  />
                </div>

                <div className="flex items-center gap-4 flex-wrap">
                  <div className="space-y-2 flex-1 min-w-[140px]">
                    <Label htmlFor="primaryColor" className="flex items-center gap-2 flex-wrap">
                      <Palette className="h-4 w-4" />
                      Primary Color
                    </Label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Input
                        id="primaryColor"
                        type="color"
                        value={form.primaryColor}
                        onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                        className="w-12 p-1 cursor-pointer"
                        data-testid="input-primary-color"
                      />
                      <span className="text-sm text-muted-foreground">{form.primaryColor}</span>
                    </div>
                  </div>

                  <div className="space-y-2 flex-1 min-w-[140px]">
                    <Label htmlFor="accentColor" className="flex items-center gap-2 flex-wrap">
                      <Palette className="h-4 w-4" />
                      Accent Color
                    </Label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Input
                        id="accentColor"
                        type="color"
                        value={form.accentColor}
                        onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
                        className="w-12 p-1 cursor-pointer"
                        data-testid="input-accent-color"
                      />
                      <span className="text-sm text-muted-foreground">{form.accentColor}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="customDomain" className="flex items-center gap-2 flex-wrap">
                    <Globe className="h-4 w-4" />
                    Custom Domain
                  </Label>
                  <Input
                    id="customDomain"
                    placeholder="app.yourcompany.com"
                    value={form.customDomain}
                    onChange={(e) => setForm({ ...form, customDomain: e.target.value })}
                    data-testid="input-custom-domain"
                  />
                  <p className="text-xs text-muted-foreground">
                    Point your domain CNAME to our servers for a fully branded experience
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <Checkbox
                    id="hidePoweredBy"
                    checked={form.hidePoweredBy}
                    onCheckedChange={(checked) =>
                      setForm({ ...form, hidePoweredBy: checked === true })
                    }
                    data-testid="checkbox-hide-powered-by"
                  />
                  <Label htmlFor="hidePoweredBy" className="cursor-pointer text-sm">
                    Hide "Powered by CoAIleague" branding
                  </Label>
                </div>

                <Button
                  onClick={handleSave}
                  disabled={saveMutation.isPending}
                  className="w-full"
                  data-testid="button-save-branding"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {saveMutation.isPending ? "Saving..." : "Save Branding Settings"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 flex-wrap">
              <Eye className="h-5 w-5" />
              Live Preview
            </CardTitle>
            <CardDescription>See how your branding will appear to users</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className="rounded-md border p-6 space-y-4"
              data-testid="branding-preview"
            >
              <div className="flex items-center gap-3 flex-wrap">
                {form.logoUrl ? (
                  <img
                    src={form.logoUrl}
                    alt="Logo preview"
                    className="h-10 w-10 rounded-md object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                    data-testid="img-logo-preview"
                  />
                ) : (
                  <div
                    className="h-10 w-10 rounded-md flex items-center justify-center text-white font-bold text-lg"
                    style={{ backgroundColor: form.primaryColor }}
                  >
                    {form.displayName ? form.displayName[0].toUpperCase() : "C"}
                  </div>
                )}
                <div>
                  <h3 className="font-semibold text-lg" data-testid="text-preview-name">
                    {form.displayName || "Your Company"}
                  </h3>
                  {form.customDomain && (
                    <p className="text-xs text-muted-foreground" data-testid="text-preview-domain">
                      {form.customDomain}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div
                  className="h-2 rounded-full"
                  style={{ backgroundColor: form.primaryColor }}
                />
                <div className="flex items-center gap-2 flex-wrap">
                  <div
                    className="px-3 py-1 rounded-md text-white text-sm font-medium"
                    style={{ backgroundColor: form.primaryColor }}
                  >
                    Primary Button
                  </div>
                  <div
                    className="px-3 py-1 rounded-md text-white text-sm font-medium"
                    style={{ backgroundColor: form.accentColor }}
                  >
                    Accent Button
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="default">Active</Badge>
                  <Badge variant="secondary">Draft</Badge>
                  <Badge variant="outline">Pending</Badge>
                </div>
              </div>

              {!form.hidePoweredBy && (
                <p className="text-xs text-muted-foreground text-center pt-4 border-t">
                  Powered by CoAIleague
                </p>
              )}
            </div>

            {branding ? (
              <div className="mt-4 flex items-center gap-2 flex-wrap">
                <Badge variant="default">Active</Badge>
                <span className="text-sm text-muted-foreground">
                  Custom branding is applied to your workspace
                </span>
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-2 flex-wrap">
                <Badge variant="outline">Default</Badge>
                <span className="text-sm text-muted-foreground">
                  Using default CoAIleague branding
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </CanvasHubPage>
  );
}
