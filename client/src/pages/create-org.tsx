import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { CoAIleagueLogo } from "@/components/coailleague-logo";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { triggerGlobalEmote } from "@/hooks/use-mascot-emotes";

interface CreateWorkspaceResponse {
  success: boolean;
  workspace: {
    id: string;
    name: string;
    organizationId: string;
    organizationSerial: string;
  };
}

export default function CreateOrg() {
  const [orgName, setOrgName] = useState("");
  const [orgDescription, setOrgDescription] = useState("");
  const [industry, setIndustry] = useState("");
  const [size, setSize] = useState("");
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const createWorkspaceMutation = useMutation({
    mutationFn: async (formData: { name: string; description: string; industry: string; size: string }) => {
      const response = await apiRequest('POST', '/api/workspaces', formData);
      const result: CreateWorkspaceResponse = await response.json();
      return result;
    },
    onSuccess: (data) => {
      triggerGlobalEmote("org_created");
      toast({
        title: "Organization Created",
        description: `${data.workspace.name} has been created successfully! Organization ID: ${data.workspace.organizationId}`,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/workspaces/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });

      setTimeout(() => {
        setLocation("/dashboard");
      }, 1500);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create organization",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!orgName.trim()) {
      toast({
        title: "Error",
        description: "Organization name is required",
        variant: "destructive",
      });
      return;
    }

    createWorkspaceMutation.mutate({
      name: orgName.trim(),
      description: orgDescription,
      industry,
      size,
    });
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-4xl">
      <PageHeader
        title="Create New Organization"
        description="Set up a new workspace for your team"
        align="center"
      />

      <Card className="mt-6">
        <CardHeader>
          <div className="flex justify-center mb-6">
            <CoAIleagueLogo width={200} height={50} showTagline={false} />
          </div>
          <CardTitle>Organization Details</CardTitle>
          <CardDescription>
            Provide information about your new organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="orgName">Organization Name *</Label>
              <Input
                id="orgName"
                placeholder="Acme Corporation"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                data-testid="input-org-name"
                required
                disabled={createWorkspaceMutation.isPending}
              />
            </div>

            <div>
              <Label htmlFor="industry">Industry</Label>
              <select
                id="industry"
                className="w-full mt-1 rounded-md border bg-background px-3 py-2"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                data-testid="select-industry"
                disabled={createWorkspaceMutation.isPending}
              >
                <option value="">Select an industry</option>
                <option value="technology">Technology</option>
                <option value="healthcare">Healthcare</option>
                <option value="finance">Finance</option>
                <option value="retail">Retail</option>
                <option value="manufacturing">Manufacturing</option>
                <option value="construction">Construction</option>
                <option value="hospitality">Hospitality</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <Label htmlFor="size">Company Size</Label>
              <select
                id="size"
                className="w-full mt-1 rounded-md border bg-background px-3 py-2"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                data-testid="select-size"
                disabled={createWorkspaceMutation.isPending}
              >
                <option value="">Select company size</option>
                <option value="1-10">1-10 employees</option>
                <option value="11-50">11-50 employees</option>
                <option value="51-200">51-200 employees</option>
                <option value="201-500">201-500 employees</option>
                <option value="500+">500+ employees</option>
              </select>
            </div>

            <div>
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                placeholder="Tell us about your organization..."
                value={orgDescription}
                onChange={(e) => setOrgDescription(e.target.value)}
                rows={4}
                data-testid="input-description"
                disabled={createWorkspaceMutation.isPending}
              />
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setLocation("/dashboard")}
                data-testid="button-cancel"
                disabled={createWorkspaceMutation.isPending}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                data-testid="button-create-org"
                disabled={createWorkspaceMutation.isPending}
              >
                {createWorkspaceMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Organization
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
