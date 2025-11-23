import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiGet, apiPost } from "@/lib/apiClient";
import { queryKeys } from "@/config/queryKeys";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Mail, Send, Users, TrendingUp, Target, Sparkles, 
  Plus, Filter, Search, Download, Eye, Edit
} from "lucide-react";
import type { EmailTemplate, Lead } from "@shared/schema";

export default function SalesPortal() {
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [leadEmail, setLeadEmail] = useState("");
  const [leadName, setLeadName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch email templates
  const { data: templates = [], isLoading: templatesLoading } = useQuery<EmailTemplate[]>({
    queryKey: queryKeys.sales?.templates ?? ["sales", "templates"],
    queryFn: () => apiGet('sales.templates'),
  });

  // Fetch leads
  const { data: leads = [], isLoading: leadsLoading } = useQuery<Lead[]>({
    queryKey: queryKeys.sales?.leads ?? ["sales", "leads"],
    queryFn: () => apiGet('sales.leads'),
  });

  // Send email mutation
  const sendEmail = useMutation({
    mutationFn: async (data: {
      templateId: string;
      toEmail: string;
      toName: string;
      companyName: string;
      industry?: string;
    }) => {
      return await apiPost('sales.sendEmail', data);
    },
    onSuccess: () => {
      toast({
        title: "Email Sent!",
        description: "Your email has been sent successfully with AI personalization.",
      });
      setLeadEmail("");
      setLeadName("");
      setCompanyName("");
      setIndustry("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Send",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Add lead mutation
  const addLead = useMutation({
    mutationFn: async (data: {
      companyName: string;
      contactEmail: string;
      contactName?: string;
      industry?: string;
    }) => {
      return await apiPost('sales.addLead', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sales?.leads ?? ["sales", "leads"] });
      toast({
        title: "Lead Added",
        description: "New lead added to database successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Add Lead",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const filteredTemplates = templates.filter(t => 
    !searchQuery || t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (t.targetIndustry && t.targetIndustry.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleSendEmail = () => {
    if (!selectedTemplate || !leadEmail || !companyName) {
      toast({
        title: "Missing Information",
        description: "Please fill in template, email, and company name",
        variant: "destructive",
      });
      return;
    }

    sendEmail.mutate({
      templateId: selectedTemplate.id,
      toEmail: leadEmail,
      toName: leadName,
      companyName,
      industry,
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Target className="h-8 w-8 text-indigo-500" />
            Sales Portal
          </h1>
          <p className="text-muted-foreground mt-1">
            Automated email campaigns with AI personalization
          </p>
        </div>
        <Badge className="bg-indigo-600 text-white">
          <Sparkles className="h-3 w-3 mr-1" />
          AI-Powered
        </Badge>
      </div>

      {/* Stats Cards */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Email Templates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{templates.length}</div>
            <p className="text-xs text-muted-foreground">Industry-specific</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Leads in Database
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{leads.length}</div>
            <p className="text-xs text-muted-foreground">Ready to contact</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Emails Sent Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">Tracking enabled</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Response Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">--</div>
            <p className="text-xs text-muted-foreground">Build your pipeline</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="compose" className="space-y-4">
        <TabsList>
          <TabsTrigger value="compose" data-testid="tab-compose">
            <Mail className="h-4 w-4 mr-2" />
            Compose & Send
          </TabsTrigger>
          <TabsTrigger value="templates" data-testid="tab-templates">
            <Eye className="h-4 w-4 mr-2" />
            View Templates
          </TabsTrigger>
          <TabsTrigger value="leads" data-testid="tab-leads">
            <Users className="h-4 w-4 mr-2" />
            Manage Leads
          </TabsTrigger>
        </TabsList>

        {/* Compose Tab */}
        <TabsContent value="compose" className="space-y-4">
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Left: Template Selection */}
            <Card>
              <CardHeader>
                <CardTitle>Step 1: Select Email Template</CardTitle>
                <CardDescription>
                  Choose an industry-specific template with AI personalization
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search templates..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    data-testid="input-search-templates"
                  />
                </div>

                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {templatesLoading ? (
                    <p className="text-sm text-muted-foreground">Loading templates...</p>
                  ) : filteredTemplates.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No templates found</p>
                  ) : (
                    filteredTemplates.map((template) => (
                      <div
                        key={template.id}
                        className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                          selectedTemplate?.id === template.id
                            ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950"
                            : "hover:border-indigo-300"
                        }`}
                        onClick={() => setSelectedTemplate(template)}
                        data-testid={`template-${template.id}`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-medium">{template.name}</p>
                            <p className="text-sm text-muted-foreground mt-1">
                              {template.subject}
                            </p>
                          </div>
                          {template.useAI && (
                            <Badge variant="outline" className="ml-2">
                              <Sparkles className="h-3 w-3 mr-1" />
                              AI
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="secondary" className="text-xs">
                            {template.category.replace("_", " ")}
                          </Badge>
                          {template.targetIndustry && (
                            <Badge variant="outline" className="text-xs">
                              {template.targetIndustry}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Right: Recipient Details */}
            <Card>
              <CardHeader>
                <CardTitle>Step 2: Enter Recipient Details</CardTitle>
                <CardDescription>
                  AI will personalize the email based on this information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="company-name">Company Name *</Label>
                  <Input
                    id="company-name"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="ABC Security Services"
                    data-testid="input-company-name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lead-email">Contact Email *</Label>
                  <Input
                    id="lead-email"
                    type="email"
                    value={leadEmail}
                    onChange={(e) => setLeadEmail(e.target.value)}
                    placeholder="john@abcsecurity.com"
                    data-testid="input-lead-email"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lead-name">Contact Name</Label>
                  <Input
                    id="lead-name"
                    value={leadName}
                    onChange={(e) => setLeadName(e.target.value)}
                    placeholder="John Smith"
                    data-testid="input-lead-name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="industry">Industry</Label>
                  <Select value={industry} onValueChange={setIndustry}>
                    <SelectTrigger data-testid="select-industry">
                      <SelectValue placeholder="Select industry" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="security">Security</SelectItem>
                      <SelectItem value="healthcare">Healthcare</SelectItem>
                      <SelectItem value="cleaning">Cleaning Services</SelectItem>
                      <SelectItem value="construction">Construction</SelectItem>
                      <SelectItem value="property_management">Property Management</SelectItem>
                      <SelectItem value="hospitality">Hospitality</SelectItem>
                      <SelectItem value="retail">Retail</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  className="w-full mt-6"
                  size="lg"
                  onClick={handleSendEmail}
                  disabled={!selectedTemplate || !leadEmail || !companyName || sendEmail.isPending}
                  data-testid="button-send-email"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {sendEmail.isPending ? "Sending with AI..." : "Send Personalized Email"}
                </Button>

                {selectedTemplate && (
                  <div className="mt-4 p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground mb-2">Preview Subject:</p>
                    <p className="font-medium">{selectedTemplate.subject}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates">
          <Card>
            <CardHeader>
              <CardTitle>Email Templates Library</CardTitle>
              <CardDescription>
                Pre-built templates with AI personalization for different industries
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {templates.map((template) => (
                  <Card key={template.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{template.name}</CardTitle>
                          <CardDescription className="mt-1">
                            {template.subject}
                          </CardDescription>
                        </div>
                        <div className="flex gap-2">
                          {template.useAI && (
                            <Badge>
                              <Sparkles className="h-3 w-3 mr-1" />
                              AI
                            </Badge>
                          )}
                          {template.targetIndustry && (
                            <Badge variant="outline">{template.targetIndustry}</Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <pre className="text-sm bg-muted p-4 rounded-lg overflow-x-auto whitespace-pre-wrap">
                        {template.bodyTemplate}
                      </pre>
                      {template.aiPrompt && (
                        <div className="mt-4 p-3 bg-indigo-50 dark:bg-indigo-950 rounded-lg">
                          <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 mb-1">
                            AI Personalization Instructions:
                          </p>
                          <p className="text-sm text-muted-foreground">{template.aiPrompt}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Leads Tab */}
        <TabsContent value="leads">
          <div className="grid lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Lead Database</CardTitle>
                <CardDescription>
                  {leads.length} leads ready for outreach
                </CardDescription>
              </CardHeader>
              <CardContent>
                {leadsLoading ? (
                  <p>Loading leads...</p>
                ) : leads.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No leads yet. Add your first lead to get started!</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {leads.map((lead) => (
                      <div key={lead.id} className="p-4 border rounded-lg hover:border-indigo-300 transition-colors">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium">{lead.companyName}</p>
                            <p className="text-sm text-muted-foreground">{lead.contactEmail}</p>
                            {lead.contactName && (
                              <p className="text-sm text-muted-foreground">{lead.contactName}</p>
                            )}
                          </div>
                          <Badge variant="outline">{lead.industry || "General"}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Add New Lead</CardTitle>
                <CardDescription>
                  Manually add prospects to your database
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    addLead.mutate({
                      companyName: formData.get("companyName") as string,
                      contactEmail: formData.get("contactEmail") as string,
                      contactName: formData.get("contactName") as string,
                      industry: formData.get("industry") as string,
                    });
                    e.currentTarget.reset();
                  }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="add-company">Company Name *</Label>
                    <Input
                      id="add-company"
                      name="companyName"
                      required
                      placeholder="ABC Corp"
                      data-testid="input-add-company"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="add-email">Email *</Label>
                    <Input
                      id="add-email"
                      name="contactEmail"
                      type="email"
                      required
                      placeholder="contact@abc.com"
                      data-testid="input-add-email"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="add-name">Contact Name</Label>
                    <Input
                      id="add-name"
                      name="contactName"
                      placeholder="John Doe"
                      data-testid="input-add-contact-name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="add-industry">Industry</Label>
                    <Select name="industry">
                      <SelectTrigger data-testid="select-add-industry">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="security">Security</SelectItem>
                        <SelectItem value="healthcare">Healthcare</SelectItem>
                        <SelectItem value="cleaning">Cleaning</SelectItem>
                        <SelectItem value="construction">Construction</SelectItem>
                        <SelectItem value="property_management">Property Mgmt</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={addLead.isPending}
                    data-testid="button-add-lead"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {addLead.isPending ? "Adding..." : "Add Lead"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
