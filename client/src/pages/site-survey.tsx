import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { ClipboardCheck, Plus, AlertTriangle, Shield, MapPin, User, CheckCircle2, Clock } from 'lucide-react';
import { format } from 'date-fns';

export default function SiteSurveyPage() {
  const [selectedSurveyId, setSelectedSurveyId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { toast } = useToast();

  const { data: surveys = [], isLoading: surveysLoading } = useQuery<any[]>({
    queryKey: ['/api/site-survey'],
  });

  const { data: stats } = useQuery<any>({
    queryKey: ['/api/site-survey/stats'],
  });

  const { data: selectedSurvey, isLoading: detailLoading } = useQuery<any>({
    queryKey: ['/api/site-survey', selectedSurveyId],
    enabled: !!selectedSurveyId,
  });

  const createSurveyMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/site-survey', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/site-survey'] });
      queryClient.invalidateQueries({ queryKey: ['/api/site-survey/stats'] });
      setIsCreateOpen(false);
      toast({ title: 'Success', description: 'Site survey created successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to create survey', description: error.message || 'Please try again.', variant: 'destructive' });
    },
  });

  const updateSurveyMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest('PATCH', `/api/site-survey/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/site-survey'] });
      queryClient.invalidateQueries({ queryKey: ['/api/site-survey', selectedSurveyId] });
      toast({ title: 'Success', description: 'Survey updated successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to update survey', description: error.message || 'Please try again.', variant: 'destructive' });
    },
  });

  const addZoneMutation = useMutation({
    mutationFn: async ({ surveyId, data }: { surveyId: string; data: any }) => {
      const res = await apiRequest('POST', `/api/site-survey/${surveyId}/zones`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/site-survey', selectedSurveyId] });
      toast({ title: 'Success', description: 'Zone added successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to add zone', description: error.message || 'Please try again.', variant: 'destructive' });
    },
  });

  const addRequirementMutation = useMutation({
    mutationFn: async ({ surveyId, data }: { surveyId: string; data: any }) => {
      const res = await apiRequest('POST', `/api/site-survey/${surveyId}/requirements`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/site-survey', selectedSurveyId] });
      toast({ title: 'Success', description: 'Requirement added successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to add requirement', description: error.message || 'Please try again.', variant: 'destructive' });
    },
  });

  const updateRequirementMutation = useMutation({
    mutationFn: async ({ reqId, data }: { reqId: string; data: any }) => {
      const res = await apiRequest('PATCH', `/api/site-survey/requirements/${reqId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/site-survey', selectedSurveyId] });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to update requirement', description: error.message || 'Please try again.', variant: 'destructive' });
    },
  });

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Site Surveys</h1>
          <p className="text-muted-foreground">Conduct facility assessments and manage site security risks.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-survey">
              <Plus className="mr-2 h-4 w-4" />
              New Survey
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Site Survey</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              createSurveyMutation.mutate(Object.fromEntries(formData));
            }} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="siteName">Site Name *</Label>
                <Input id="siteName" name="siteName" required data-testid="input-site-name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clientId">Client ID</Label>
                <Input id="clientId" name="clientId" data-testid="input-client-id" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input id="address" name="address" data-testid="input-address" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="conductedBy">Conducted By</Label>
                <Input id="conductedBy" name="conductedBy" data-testid="input-conducted-by" />
              </div>
              <Button type="submit" className="w-full" disabled={createSurveyMutation.isPending} data-testid="button-submit-survey">
                Create Survey
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="hover-elevate">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Surveys</p>
                <h2 className="text-2xl font-bold" data-testid="text-total-count">{stats?.total || 0}</h2>
              </div>
              <ClipboardCheck className="h-8 w-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Draft</p>
                <h2 className="text-2xl font-bold" data-testid="text-draft-count">{stats?.draft || 0}</h2>
              </div>
              <Clock className="h-8 w-8 text-yellow-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Completed</p>
                <h2 className="text-2xl font-bold" data-testid="text-completed-count">{stats?.completed || 0}</h2>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">High Risk</p>
                <h2 className="text-2xl font-bold" data-testid="text-high-risk-count">{stats?.high_risk || 0}</h2>
              </div>
              <AlertTriangle className="h-8 w-8 text-destructive opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-xl font-semibold">Survey List</h2>
          <div className="space-y-4">
            {surveysLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading surveys...</div>
            ) : surveys.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No surveys found.</div>
            ) : (
              surveys.map((survey) => (
                <Card 
                  key={survey.id} 
                  className={`cursor-pointer transition-all hover-elevate ${selectedSurveyId === survey.id ? 'border-primary ring-1 ring-primary' : ''}`}
                  onClick={() => setSelectedSurveyId(survey.id)}
                  data-testid={`card-survey-${survey.id}`}
                >
                  <CardHeader className="p-4">
                    <div className="flex justify-between items-start gap-2">
                      <CardTitle className="text-lg">{survey.site_name}</CardTitle>
                      <Badge variant={survey.status === 'completed' ? 'default' : 'secondary'} data-testid={`badge-status-${survey.id}`}>
                        {survey.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 space-y-2">
                    <div className="flex items-center text-sm text-muted-foreground">
                      <MapPin className="mr-2 h-4 w-4" />
                      {survey.address || 'No address'}
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center text-sm text-muted-foreground">
                        <User className="mr-2 h-4 w-4" />
                        {survey.conducted_by || 'Unknown'}
                      </div>
                      <Badge 
                        variant="outline" 
                        className={
                          survey.overall_risk_level === 'high' || survey.overall_risk_level === 'critical' 
                            ? 'text-destructive border-destructive' 
                            : 'text-green-600 border-green-600'
                        }
                        data-testid={`badge-risk-${survey.id}`}
                      >
                        {survey.overall_risk_level}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground pt-2 border-t">
                      Created: {format(new Date(survey.created_at), 'PPP')}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
          {selectedSurveyId ? (
            detailLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading details...</div>
            ) : (
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-2xl">{selectedSurvey.site_name}</CardTitle>
                    <div className="flex gap-2">
                      <Select 
                        value={selectedSurvey.status} 
                        onValueChange={(val) => updateSurveyMutation.mutate({ id: selectedSurveyId, data: { status: val } })}
                      >
                        <SelectTrigger className="w-[140px]" data-testid="select-status">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="archived">Archived</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select 
                        value={selectedSurvey.overall_risk_level} 
                        onValueChange={(val) => updateSurveyMutation.mutate({ id: selectedSurveyId, data: { overall_risk_level: val } })}
                      >
                        <SelectTrigger className="w-[140px]" data-testid="select-risk">
                          <SelectValue placeholder="Risk" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="zones">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="zones">Zones</TabsTrigger>
                      <TabsTrigger value="requirements">Requirements</TabsTrigger>
                      <TabsTrigger value="summary">Summary</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="zones" className="space-y-4 mt-4">
                      <div className="flex justify-between items-center">
                        <h3 className="text-lg font-medium">Security Zones</h3>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm" data-testid="button-add-zone">
                              <Plus className="mr-2 h-4 w-4" />
                              Add Zone
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Add Security Zone</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={(e) => {
                              e.preventDefault();
                              const formData = new FormData(e.currentTarget);
                              addZoneMutation.mutate({ surveyId: selectedSurveyId, data: Object.fromEntries(formData) });
                            }} className="space-y-4">
                              <div className="space-y-2">
                                <Label htmlFor="zoneName">Zone Name</Label>
                                <Input id="zoneName" name="zoneName" required data-testid="input-zone-name" />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="zoneType">Zone Type</Label>
                                <Select name="zoneType" defaultValue="other">
                                  <SelectTrigger data-testid="select-zone-type">
                                    <SelectValue placeholder="Select type" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="entry">Entry</SelectItem>
                                    <SelectItem value="perimeter">Perimeter</SelectItem>
                                    <SelectItem value="interior">Interior</SelectItem>
                                    <SelectItem value="parking">Parking</SelectItem>
                                    <SelectItem value="server_room">Server Room</SelectItem>
                                    <SelectItem value="high_value">High Value</SelectItem>
                                    <SelectItem value="other">Other</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="riskLevel">Risk Level</Label>
                                <Select name="riskLevel" defaultValue="low">
                                  <SelectTrigger data-testid="select-zone-risk">
                                    <SelectValue placeholder="Select risk" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="low">Low</SelectItem>
                                    <SelectItem value="medium">Medium</SelectItem>
                                    <SelectItem value="high">High</SelectItem>
                                    <SelectItem value="critical">Critical</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="notes">Notes</Label>
                                <Textarea id="notes" name="notes" data-testid="textarea-zone-notes" />
                              </div>
                              <Button type="submit" className="w-full" data-testid="button-submit-zone">Add Zone</Button>
                            </form>
                          </DialogContent>
                        </Dialog>
                      </div>
                      <div className="space-y-3">
                        {selectedSurvey.zones?.length === 0 ? (
                          <div className="text-center p-6 text-muted-foreground border rounded-md border-dashed">No zones defined yet.</div>
                        ) : (
                          selectedSurvey.zones?.map((zone: any) => (
                            <div key={zone.id} className="p-3 border rounded-md flex justify-between items-start" data-testid={`row-zone-${zone.id}`}>
                              <div>
                                <div className="font-medium flex items-center gap-2">
                                  {zone.zone_name}
                                  <Badge variant="outline" className="text-[10px] uppercase">{zone.zone_type}</Badge>
                                </div>
                                <p className="text-sm text-muted-foreground mt-1">{zone.notes}</p>
                              </div>
                              <Badge 
                                variant="outline" 
                                className={zone.risk_level === 'high' || zone.risk_level === 'critical' ? 'bg-destructive/10 text-destructive' : ''}
                                data-testid={`badge-zone-risk-${zone.id}`}
                              >
                                {zone.risk_level}
                              </Badge>
                            </div>
                          ))
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="requirements" className="space-y-4 mt-4">
                      <div className="flex justify-between items-center">
                        <h3 className="text-lg font-medium">Security Requirements</h3>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm" data-testid="button-add-requirement">
                              <Plus className="mr-2 h-4 w-4" />
                              Add Requirement
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Add Requirement</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={(e) => {
                              e.preventDefault();
                              const formData = new FormData(e.currentTarget);
                              addRequirementMutation.mutate({ surveyId: selectedSurveyId, data: Object.fromEntries(formData) });
                            }} className="space-y-4">
                              <div className="space-y-2">
                                <Label htmlFor="requirementType">Requirement Type</Label>
                                <Select name="requirementType" defaultValue="other">
                                  <SelectTrigger data-testid="select-req-type">
                                    <SelectValue placeholder="Select type" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="access_control">Access Control</SelectItem>
                                    <SelectItem value="cctv">CCTV</SelectItem>
                                    <SelectItem value="lighting">Lighting</SelectItem>
                                    <SelectItem value="patrol_frequency">Patrol Frequency</SelectItem>
                                    <SelectItem value="guard_post">Guard Post</SelectItem>
                                    <SelectItem value="alarm_system">Alarm System</SelectItem>
                                    <SelectItem value="visitor_management">Visitor Management</SelectItem>
                                    <SelectItem value="other">Other</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Textarea id="description" name="description" required data-testid="textarea-req-desc" />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="priority">Priority</Label>
                                <Select name="priority" defaultValue="medium">
                                  <SelectTrigger data-testid="select-req-priority">
                                    <SelectValue placeholder="Select priority" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="low">Low</SelectItem>
                                    <SelectItem value="medium">Medium</SelectItem>
                                    <SelectItem value="high">High</SelectItem>
                                    <SelectItem value="critical">Critical</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <Button type="submit" className="w-full" data-testid="button-submit-req">Add Requirement</Button>
                            </form>
                          </DialogContent>
                        </Dialog>
                      </div>
                      <div className="space-y-3">
                        {selectedSurvey.requirements?.length === 0 ? (
                          <div className="text-center p-6 text-muted-foreground border rounded-md border-dashed">No requirements defined yet.</div>
                        ) : (
                          selectedSurvey.requirements?.map((req: any) => (
                            <div key={req.id} className="p-3 border rounded-md flex items-center gap-4" data-testid={`row-req-${req.id}`}>
                              <Checkbox 
                                id={`req-${req.id}`} 
                                checked={req.is_met} 
                                onCheckedChange={(checked) => updateRequirementMutation.mutate({ reqId: req.id, data: { isMet: !!checked } })}
                                data-testid={`checkbox-req-${req.id}`}
                              />
                              <div className="flex-1">
                                <div className="font-medium flex items-center gap-2">
                                  {req.requirement_type.replace('_', ' ')}
                                  <Badge variant="outline" className={`text-[10px] ${req.priority === 'critical' || req.priority === 'high' ? 'bg-orange-100 text-orange-800' : ''}`}>
                                    {req.priority}
                                  </Badge>
                                </div>
                                <p className={`text-sm mt-1 ${req.is_met ? 'line-through text-muted-foreground' : ''}`}>{req.description}</p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="summary" className="space-y-4 mt-4">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Overall Summary</Label>
                          <Textarea 
                            className="min-h-[100px]"
                            placeholder="Provide an overview of the facility security status..."
                            defaultValue={selectedSurvey.summary}
                            onBlur={(e) => updateSurveyMutation.mutate({ id: selectedSurveyId, data: { summary: e.target.value } })}
                            data-testid="textarea-summary"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Recommendations</Label>
                          <Textarea 
                            className="min-h-[100px]"
                            placeholder="List key security improvements needed..."
                            defaultValue={selectedSurvey.recommendations}
                            onBlur={(e) => updateSurveyMutation.mutate({ id: selectedSurveyId, data: { recommendations: e.target.value } })}
                            data-testid="textarea-recommendations"
                          />
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )
          ) : (
            <Card className="h-[400px] flex items-center justify-center text-muted-foreground border-dashed">
              <div className="text-center">
                <Shield className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>Select a survey to view details or create a new one.</p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
