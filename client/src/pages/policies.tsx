import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch, AnyResponse } from "@/lib/apiError";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalContent } from '@/components/ui/universal-modal';
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, FileText, CheckCircle2, Eye } from "lucide-react";
import { format } from "date-fns";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { LegalDocumentDisclaimer } from "@/components/liability-disclaimers";

const policyFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  category: z.string().min(1, "Category is required"),
  contentMarkdown: z.string().min(1, "Content is required"),
  version: z.string().default("1.0"),
});

type PolicyFormValues = z.infer<typeof policyFormSchema>;

export default function PoliciesPage() {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<any | null>(null);
  const [showAcknowledgeDialog, setShowAcknowledgeDialog] = useState(false);

  const { data: policies = [], isLoading } = useQuery({
    queryKey: ['/api/policies'],
    queryFn: () => apiFetch('/api/policies', AnyResponse),
  });

  const form = useForm<PolicyFormValues>({
    resolver: zodResolver(policyFormSchema),
    defaultValues: {
      title: "",
      description: "",
      category: "",
      contentMarkdown: "",
      version: "1.0",
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: PolicyFormValues) => {
      return apiRequest('POST', '/api/policies', values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/policies'] });
      toast({ title: "Success", description: "Policy created successfully" });
      setShowCreateDialog(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create policy", variant: "destructive" });
    },
  });

  const publishMutation = useMutation({
    mutationFn: (id: string) => {
      return apiRequest('PATCH', `/api/policies/${id}/publish`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/policies'] });
      toast({ title: "Success", description: "Policy published successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to publish policy", variant: "destructive" });
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => {
      return apiRequest('POST', `/api/policies/${id}/acknowledge`, {
        ipAddress: 'client-ip',
        userAgent: navigator.userAgent,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/policies'] });
      toast({ title: "Success", description: "Policy acknowledged successfully" });
      setShowAcknowledgeDialog(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to acknowledge policy", variant: "destructive" });
    },
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "outline"> = {
      'draft': 'secondary',
      'published': 'default',
      'archived': 'outline',
    };
    return <Badge variant={variants[status] || 'outline'}>{status}</Badge>;
  };

  // @ts-expect-error — TS migration: fix in refactoring sprint
  const publishedPolicies = policies.filter((p: any) => p.status === 'published');
  // @ts-expect-error — TS migration: fix in refactoring sprint
  const draftPolicies = policies.filter((p: any) => p.status === 'draft');

  if (isLoading) {
    return <div className="p-6">Loading...</div>;
  }

  const createPolicyButton = (
    <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-policy">
      <Plus className="w-4 h-4 mr-2" />
      Create Policy
    </Button>
  );

  const pageConfig: CanvasPageConfig = {
    id: 'policies',
    title: 'PolicIOS™',
    subtitle: 'Company policies and handbook management',
    category: 'operations',
    headerActions: createPolicyButton,
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <LegalDocumentDisclaimer className="mb-4" />
      <Tabs defaultValue="published" className="w-full">
        <TabsList className="w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="published" data-testid="tab-published">Published ({publishedPolicies.length})</TabsTrigger>
          <TabsTrigger value="drafts" data-testid="tab-drafts">Drafts ({draftPolicies.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="published" className="space-y-4">
          {publishedPolicies.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
                No published policies yet
              </CardContent>
            </Card>
          ) : (
            publishedPolicies.map((policy: any) => (
              <Card key={policy.id} data-testid={`card-policy-${policy.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{policy.title}</CardTitle>
                      <CardDescription className="mt-1">
                        Version {policy.version} • {policy.category} • Published {policy.publishedAt ? format(new Date(policy.publishedAt), "MMM dd, yyyy") : 'N/A'}
                      </CardDescription>
                      {policy.description && (
                        <p className="text-sm text-muted-foreground mt-2">{policy.description}</p>
                      )}
                    </div>
                    {getStatusBadge(policy.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSelectedPolicy(policy);
                        setShowAcknowledgeDialog(true);
                      }}
                      data-testid={`button-view-${policy.id}`}
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      View
                    </Button>
                    <Button
                      variant="default"
                      onClick={() => acknowledgeMutation.mutate({ id: policy.id })}
                      disabled={acknowledgeMutation.isPending}
                      data-testid={`button-acknowledge-${policy.id}`}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Acknowledge
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="drafts" className="space-y-4">
          {draftPolicies.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No draft policies
              </CardContent>
            </Card>
          ) : (
            draftPolicies.map((policy: any) => (
              <Card key={policy.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-lg">{policy.title}</CardTitle>
                      <CardDescription>Version {policy.version} • {policy.category}</CardDescription>
                    </div>
                    {getStatusBadge(policy.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() => publishMutation.mutate(policy.id)}
                    disabled={publishMutation.isPending}
                    data-testid={`button-publish-${policy.id}`}
                  >
                    Publish
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      <UniversalModal open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <UniversalModalContent size="md" data-testid="dialog-create-policy">
          <UniversalModalHeader>
            <UniversalModalTitle>Create New Policy</UniversalModalTitle>
          </UniversalModalHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((values) => createMutation.mutate(values))} className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Code of Conduct" {...field} data-testid="input-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., handbook, safety, pto" {...field} data-testid="input-category" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input placeholder="Brief description" {...field} data-testid="input-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contentMarkdown"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Content (Markdown)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Policy content in markdown..."
                        className="resize-none min-h-32"
                        {...field}
                        data-testid="textarea-content"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateDialog(false)}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  data-testid="button-submit"
                >
                  {createMutation.isPending ? "Creating..." : "Create Policy"}
                </Button>
              </div>
            </form>
          </Form>
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={showAcknowledgeDialog} onOpenChange={setShowAcknowledgeDialog}>
        <UniversalModalContent size="md" data-testid="dialog-acknowledge">
          <UniversalModalHeader>
            <UniversalModalTitle>{selectedPolicy?.title}</UniversalModalTitle>
          </UniversalModalHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Version {selectedPolicy?.version}</p>
              <div className="border rounded p-4 max-h-96 overflow-y-auto bg-muted/20">
                <p className="text-sm whitespace-pre-wrap">{selectedPolicy?.contentMarkdown}</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowAcknowledgeDialog(false)}
                data-testid="button-close-view"
              >
                Close
              </Button>
            </div>
          </div>
        </UniversalModalContent>
      </UniversalModal>
    </CanvasHubPage>
  );
}
