import { useState, useEffect, useRef } from "react";
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
import { Paintbrush, Save, Eye, Globe, Image, Palette, Building2, ShieldCheck, Upload, Loader2, X } from "lucide-react";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

interface BrandingData {
  displayName: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
  hidePoweredBy: boolean;
  customDomain: string;
  stateLicenseNumber?: string | null;
  inheritedFromParent?: boolean;
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
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: branding, isLoading } = useQuery<BrandingData | null>({
    queryKey: ["/api/workspace/branding"],
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
      return await apiRequest("POST", "/api/workspace/branding", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspace/branding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/workspace/current"] });
      toast({
        title: "Branding Saved",
        description: "Your branding settings are now active on the dashboard.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save branding settings",
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("logo", file);
      const res = await fetch("/api/workspace/branding/logo", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Upload failed");
      setForm((prev) => ({ ...prev, logoUrl: data.logoUrl }));
      queryClient.invalidateQueries({ queryKey: ["/api/workspace/branding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/workspace/current"] });
      toast({ title: "Logo Uploaded", description: "Your logo is live on the dashboard header." });
    } catch (err: unknown) {
      toast({ title: "Upload Failed", description: err.message || "Could not upload logo", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSave = () => {
    saveMutation.mutate(form);
  };

  const pageConfig: CanvasPageConfig = {
    id: "white-label-branding",
    title: "White-Label Branding",
    subtitle: "Upload your logo and customize colors — your brand shows live on the dashboard header",
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
            <CardDescription>
              Your logo appears in the dashboard header below your license number. Available on all plans.
              {branding?.inheritedFromParent && (
                <span className="block mt-1 text-amber-600 dark:text-amber-400">
                  Currently showing parent organization logo — upload your own to override.
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading branding settings...</div>
            ) : (
              <div className="space-y-5">
                {/* License number info (read-only display) */}
                {branding?.stateLicenseNumber && (
                  <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50 border">
                    <ShieldCheck className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">State License (shown in header badge)</p>
                      <p className="text-sm font-mono font-semibold">{branding.stateLicenseNumber}</p>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="displayName" className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Display Name
                  </Label>
                  <Input
                    id="displayName"
                    placeholder="Your Company Name"
                    value={form.displayName}
                    onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                    data-testid="input-display-name"
                  />
                  <p className="text-xs text-muted-foreground">
                    Overrides workspace name in branded interfaces
                  </p>
                </div>

                {/* Logo section with upload + URL */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Image className="h-4 w-4" />
                    Organization Logo
                  </Label>

                  {/* Current logo preview */}
                  {form.logoUrl && (
                    <div className="flex items-center gap-3 p-3 rounded-md bg-slate-800 border border-slate-700">
                      <img
                        src={form.logoUrl}
                        alt="Current logo"
                        className="h-10 max-w-[140px] object-contain"
                        style={{ filter: "brightness(0) invert(1)", opacity: 0.9 }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        data-testid="img-current-logo"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-300">Preview on dark header</p>
                      </div>
                      <button
                        onClick={() => setForm((prev) => ({ ...prev, logoUrl: "" }))}
                        className="text-slate-400 hover:text-white transition-colors"
                        title="Remove logo"
                        data-testid="button-remove-logo"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  {/* Upload button */}
                  <div className="flex gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
                      className="hidden"
                      onChange={handleFileUpload}
                      data-testid="input-logo-file"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      disabled={isUploading}
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="button-upload-logo"
                    >
                      {isUploading ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading...</>
                      ) : (
                        <><Upload className="h-4 w-4 mr-2" />Upload Logo File</>
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    PNG or SVG with transparent background recommended (max 5 MB).
                    Displays below the license number badge on the dark dashboard header.
                  </p>

                  {/* URL fallback */}
                  <div className="space-y-1">
                    <Label htmlFor="logoUrl" className="text-xs text-muted-foreground">
                      Or paste a URL
                    </Label>
                    <Input
                      id="logoUrl"
                      placeholder="https://example.com/logo.png"
                      value={form.logoUrl}
                      onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
                      data-testid="input-logo-url"
                    />
                  </div>
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
            <CardDescription>Dashboard header preview with your branding applied</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Simulated dashboard hero banner */}
            <div
              className="rounded-md overflow-hidden"
              data-testid="branding-preview"
            >
              <div
                className="p-4 rounded-md relative overflow-hidden"
                style={{ background: "linear-gradient(135deg, #1d4ed8 0%, #2563EB 40%, #4f46e5 100%)" }}
              >
                {/* Decorative orb */}
                <div className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-10 pointer-events-none" style={{ background: "radial-gradient(circle, #fff 0%, transparent 70%)", transform: "translate(30%, -40%)" }} />
                <div className="relative z-10">
                  <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                    <div className="text-white/80 text-sm font-bold tracking-wide">CoAIleague™</div>
                    <div className="flex flex-col items-end gap-2">
                      <span
                        className="text-xs px-2.5 py-0.5 rounded-full font-mono font-semibold text-white border border-white/30"
                        style={{ background: "rgba(255,255,255,0.15)" }}
                        data-testid="text-preview-license"
                      >
                        {branding?.stateLicenseNumber || "C11608501"}
                      </span>
                      {form.logoUrl ? (
                        <img
                          src={form.logoUrl}
                          alt="Logo preview"
                          className="h-8 max-w-[100px] object-contain rounded"
                          style={{ filter: "brightness(0) invert(1)", opacity: 0.9 }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          data-testid="img-logo-preview"
                        />
                      ) : (
                        <div
                          className="h-8 w-24 rounded flex items-center justify-center text-white/40 text-[10px] border border-dashed border-white/30"
                        >
                          your logo
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-white font-bold text-lg">Good afternoon, User</p>
                  <p className="text-white/80 text-sm mt-0.5">
                    {form.displayName || "Your Company Name"}
                  </p>
                </div>
              </div>

              {/* Color swatches */}
              <div className="space-y-3 mt-4 p-3 border rounded-md bg-muted/30">
                <div className="flex items-center gap-2 flex-wrap">
                  <div
                    className="px-3 py-1 rounded-md text-white text-sm font-medium"
                    style={{ backgroundColor: form.primaryColor }}
                    data-testid="preview-primary-btn"
                  >
                    Primary Button
                  </div>
                  <div
                    className="px-3 py-1 rounded-md text-white text-sm font-medium"
                    style={{ backgroundColor: form.accentColor }}
                    data-testid="preview-accent-btn"
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
            </div>

            {!form.hidePoweredBy && (
              <p className="text-xs text-muted-foreground text-center pt-3 border-t mt-4">
                Powered by CoAIleague
              </p>
            )}

            <div className="mt-4 flex items-center gap-2 flex-wrap">
              {(branding?.logoUrl && !branding?.inheritedFromParent) ? (
                <>
                  <Badge variant="default">Active</Badge>
                  <span className="text-sm text-muted-foreground">Custom branding is live</span>
                </>
              ) : branding?.inheritedFromParent ? (
                <>
                  <Badge variant="secondary">Inherited</Badge>
                  <span className="text-sm text-muted-foreground">Showing parent org logo</span>
                </>
              ) : (
                <>
                  <Badge variant="outline">Default</Badge>
                  <span className="text-sm text-muted-foreground">Upload a logo above to activate</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </CanvasHubPage>
  );
}
