import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Card, CardContent, CardHeader, CardTitle, CardDescription 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger 
} from "@/components/ui/dialog";
import { 
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage 
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ClipboardList, Send, PieChart, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const templateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  surveyType: z.enum(['post_incident', 'quarterly_pulse', 'contract_renewal', 'adhoc']),
  questions: z.string().optional().transform(val => val ? JSON.parse(val) : []),
});

export default function ClientSurveysPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("templates");

  const { data: templates, isLoading: loadingTemplates } = useQuery<any[]>({
    queryKey: ["/api/surveys/templates"],
  });

  const { data: responses, isLoading: loadingResponses } = useQuery<any[]>({
    queryKey: ["/api/surveys/responses"],
  });

  const { data: analytics, isLoading: loadingAnalytics } = useQuery<any>({
    queryKey: ["/api/surveys/analytics"],
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/surveys/templates", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/surveys/templates"] });
      toast({ title: "Template created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create template", description: error.message || "Please try again.", variant: "destructive" });
    },
  });

  const sendSurveyMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/surveys/send", data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Survey sent!", description: `Public URL: ${data.responseUrl}` });
    },
    onError: (error: any) => {
      toast({ title: "Failed to send survey", description: error.message || "Please try again.", variant: "destructive" });
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Client Satisfaction Surveys</h1>
        <Dialog>
          <DialogTrigger asChild>
            <Button data-testid="button-create-template">
              <ClipboardList className="mr-2 h-4 w-4" />
              Create Template
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Survey Template</DialogTitle>
            </DialogHeader>
            <TemplateForm onSubmit={(data) => createTemplateMutation.mutate(data)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg NPS Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.avgNps?.toFixed(1) || "0.0"}</div>
          </CardContent>
        </Card>
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Response Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(analytics?.responseRate * 100)?.toFixed(0) || "0"}%</div>
          </CardContent>
        </Card>
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Sent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.totalSent || 0}</div>
          </CardContent>
        </Card>
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.totalCompleted || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="responses">Responses</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="churn">Churn Risk</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates?.map((template) => (
              <Card key={template.id} className="hover-elevate">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">{template.name}</CardTitle>
                    <Badge variant="outline">{template.survey_type.replace('_', ' ')}</Badge>
                  </div>
                  <CardDescription>
                    {template.questions?.length || 0} questions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-end space-x-2">
                    <SendSurveyDialog templateId={template.id} onSend={(data) => sendSurveyMutation.mutate(data)} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="responses" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {responses?.map((response) => (
                  <div key={response.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-semibold">{response.client_name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {response.completed_at ? format(new Date(response.completed_at), 'PPP') : 'N/A'}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm font-medium">NPS: {response.nps_score}</div>
                        <div className="text-sm text-muted-foreground">Rating: {response.overall_rating}/5</div>
                      </div>
                      <Badge variant={response.nps_score >= 9 ? "default" : response.nps_score >= 7 ? "secondary" : "destructive"}>
                        {response.nps_score >= 9 ? "Promoter" : response.nps_score >= 7 ? "Passive" : "Detractor"}
                      </Badge>
                    </div>
                  </div>
                ))}
                {(!responses || responses.length === 0) && (
                  <div className="text-center py-12 text-muted-foreground">
                    No survey responses found.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>NPS Trend</CardTitle>
                  <CardDescription>Recent NPS scores from completed surveys</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[200px] flex items-end justify-between gap-2 pt-4">
                    {analytics?.recentNpsScores?.map((score: any, i: number) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-2">
                        <div 
                          className="w-full bg-primary rounded-t" 
                          style={{ height: `${(score.nps_score / 10) * 100}%` }}
                        />
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(score.completed_at), 'MM/dd')}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Distribution</CardTitle>
                  <CardDescription>Response completion vs pending</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-center py-6">
                  <div className="relative w-32 h-32">
                     <PieChart className="w-full h-full text-primary opacity-20" />
                     <div className="absolute inset-0 flex items-center justify-center flex-col">
                        <span className="text-2xl font-bold">{analytics?.totalCompleted || 0}</span>
                        <span className="text-[10px] text-muted-foreground">Completed</span>
                     </div>
                  </div>
                </CardContent>
              </Card>
           </div>
        </TabsContent>

        <TabsContent value="churn" className="mt-4">
          <Card className="border-destructive/50 bg-destructive/5">
            <CardHeader>
              <CardTitle className="flex items-center text-destructive">
                <AlertTriangle className="mr-2 h-5 w-5" />
                Churn Risk Accounts
              </CardTitle>
              <CardDescription>Clients who provided a detractor NPS score (0-6)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {responses?.filter(r => r.nps_score <= 6).map((risk) => (
                  <div key={risk.id} className="flex items-center justify-between p-4 border border-destructive/20 rounded-lg bg-background">
                    <div>
                      <h4 className="font-semibold">{risk.client_name}</h4>
                      <p className="text-sm text-destructive font-medium">NPS Score: {risk.nps_score}</p>
                    </div>
                    <Button variant="outline" size="sm" data-testid={`button-followup-${risk.id}`}>
                      Initiate Follow-up
                    </Button>
                  </div>
                ))}
                {(!responses || responses.filter(r => r.nps_score <= 6).length === 0) && (
                  <div className="text-center py-12 text-muted-foreground">
                    No high-risk accounts identified.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TemplateForm({ onSubmit }: { onSubmit: (data: any) => void }) {
  const form = useForm<z.infer<typeof templateSchema>>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: "",
      surveyType: "quarterly_pulse",
      questions: "[]",
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Template Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Q4 Pulse Survey" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="surveyType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Survey Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="post_incident">Post-Incident</SelectItem>
                  <SelectItem value="quarterly_pulse">Quarterly Pulse</SelectItem>
                  <SelectItem value="contract_renewal">Contract Renewal</SelectItem>
                  <SelectItem value="adhoc">Ad-hoc</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="questions"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Questions (JSON Array)</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder='[{"text": "How likely are you to recommend us?", "type": "nps"}]' 
                  className="font-mono h-32" 
                  {...field} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" data-testid="button-save-template">Save Template</Button>
      </form>
    </Form>
  );
}

function SendSurveyDialog({ templateId, onSend }: { templateId: string, onSend: (data: any) => void }) {
  const { data: clients } = useQuery<any[]>({ queryKey: ["/api/clients"] });
  const [selectedClient, setSelectedClient] = useState("");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid={`button-send-survey-${templateId}`}>
          <Send className="mr-2 h-4 w-4" />
          Send
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Survey</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Client</label>
            <Select onValueChange={setSelectedClient}>
              <SelectTrigger>
                <SelectValue placeholder="Select a client" />
              </SelectTrigger>
              <SelectContent>
                {clients?.map((client) => (
                  <SelectItem key={client.id} value={client.id}>{client.company_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button 
            className="w-full" 
            disabled={!selectedClient}
            onClick={() => onSend({ templateId, clientId: selectedClient, triggerType: 'manual' })}
            data-testid="button-confirm-send"
          >
            Confirm & Send
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
