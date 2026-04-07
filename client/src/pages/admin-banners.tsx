import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import {
  Megaphone,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
} from "lucide-react";
import { WFLogoCompact } from "@/components/wf-logo";

interface PromotionalBanner {
  id: string;
  message: string;
  ctaText: string | null;
  ctaLink: string | null;
  isActive: boolean;
  priority: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export default function AdminBannersPage() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingBanner, setEditingBanner] = useState<PromotionalBanner | null>(null);
  const [formData, setFormData] = useState({
    message: "",
    ctaText: "",
    ctaLink: "",
    isActive: false,
    priority: 0,
  });

  // Fetch all banners (admin endpoint includes inactive banners)
  const { data: banners, isLoading } = useQuery<PromotionalBanner[]>({
    queryKey: ['/api/promotional-banners/admin/all'],
  });

  // Create banner mutation
  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => apiRequest('POST', '/api/promotional-banners', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/promotional-banners/admin/all'] });
      toast({ title: "Success", description: "Banner created successfully" });
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create banner", variant: "destructive" });
    },
  });

  // Update banner mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof formData }) =>
      apiRequest('PATCH', `/api/promotional-banners/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/promotional-banners/admin/all'] });
      toast({ title: "Success", description: "Banner updated successfully" });
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update banner", variant: "destructive" });
    },
  });

  // Delete banner mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/promotional-banners/${id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/promotional-banners/admin/all'] });
      toast({ title: "Success", description: "Banner deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete banner", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({ message: "", ctaText: "", ctaLink: "", isActive: false, priority: 0 });
    setEditingBanner(null);
    setShowForm(false);
  };

  const handleEdit = (banner: PromotionalBanner) => {
    setEditingBanner(banner);
    setFormData({
      message: banner.message,
      ctaText: banner.ctaText || "",
      ctaLink: banner.ctaLink || "",
      isActive: banner.isActive,
      priority: banner.priority,
    });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingBanner) {
      updateMutation.mutate({ id: editingBanner.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const pageConfig: CanvasPageConfig = {
    id: 'admin-banners',
    title: 'Promotional Banners',
    subtitle: 'Manage landing page promotional banners',
    category: 'admin',
    headerActions: (
      <Button
        onClick={() => setShowForm(!showForm)}
        data-testid="button-new-banner"
      >
        <Plus className="w-4 h-4 mr-2" />
        New Banner
      </Button>
    ),
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6">
      {/* Create/Edit Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingBanner ? "Edit Banner" : "Create New Banner"}</CardTitle>
            <CardDescription>
              {editingBanner ? "Update banner information" : "Create a new promotional banner for the landing page"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  placeholder="New Year Special! Get 50% OFF your first 3 months..."
                  required
                  data-testid="input-message"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ctaText">CTA Button Text (Optional)</Label>
                  <Input
                    id="ctaText"
                    value={formData.ctaText}
                    onChange={(e) => setFormData({ ...formData, ctaText: e.target.value })}
                    placeholder="Claim Offer"
                    data-testid="input-cta-text"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ctaLink">CTA Link (Optional)</Label>
                  <Input
                    id="ctaLink"
                    value={formData.ctaLink}
                    onChange={(e) => setFormData({ ...formData, ctaLink: e.target.value })}
                    placeholder="/register"
                    data-testid="input-cta-link"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="isActive"
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                    data-testid="switch-is-active"
                  />
                  <Label htmlFor="isActive">Active (only one banner can be active)</Label>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Input
                    id="priority"
                    type="number"
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                    data-testid="input-priority"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-banner"
                >
                  {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save Banner"}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm} data-testid="button-cancel">
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Banners List */}
      <Card>
        <CardHeader>
          <CardTitle>All Banners</CardTitle>
          <CardDescription>
            Manage all promotional banners
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading banners...</p>
          ) : !banners || banners.length === 0 ? (
            <p className="text-muted-foreground">No banners created yet</p>
          ) : (
            <div className="space-y-3">
              {banners.map((banner) => (
                <div
                  key={banner.id}
                  className="flex items-start gap-4 p-4 border rounded-lg hover-elevate"
                  data-testid={`banner-${banner.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <p className="font-medium text-sm break-words">{banner.message}</p>
                      {banner.isActive && (
                        <Badge className="bg-muted/20 text-blue-400 border-primary/30">
                          Active
                        </Badge>
                      )}
                    </div>
                    {(banner.ctaText || banner.ctaLink) && (
                      <div className="text-xs text-muted-foreground mb-1">
                        CTA: {banner.ctaText || "No text"} → {banner.ctaLink || "No link"}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      Priority: {banner.priority} | Created: {new Date(banner.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleEdit(banner)}
                      data-testid={`button-edit-${banner.id}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Are you sure you want to delete this banner?")) {
                          deleteMutation.mutate(banner.id);
                        }
                      }}
                      data-testid={`button-delete-${banner.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </CanvasHubPage>
  );
}
