import { useState } from "react";
import { secureFetch } from "@/lib/csrf";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Heart, MessageSquare, Award, Star, Lightbulb } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';

export default function EmployeeEngagement() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("pulse");

  // Fetch active pulse surveys
  const { data: pulseSurveys } = useQuery<any[]>({
    queryKey: ['/api/engagement/pulse-surveys/templates'],
    queryFn: async () => {
      const response = await secureFetch('/api/engagement/pulse-surveys/templates?isActive=true');
      if (!response.ok) return [];
      return response.json();
    }
  });

  // Fetch recognition feed
  const { data: recognitions } = useQuery<any[]>({
    queryKey: ['/api/engagement/recognition'],
  });

  // Submit pulse survey response
  const submitSurveyMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/engagement/pulse-surveys/responses", data);
    },
    onSuccess: () => {
      toast({ title: "Survey submitted", description: "Thank you for your feedback!" });
      queryClient.invalidateQueries({ queryKey: ['/api/engagement/pulse-surveys/responses'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Submit Survey Failed',
        description: error.message || 'Something went wrong.',
        variant: 'destructive',
      });
    },
  });

  // Submit employer rating
  const submitRatingMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/engagement/employer-ratings", data);
    },
    onSuccess: () => {
      toast({ title: "Rating submitted", description: "Your feedback helps improve our workplace!" });
      queryClient.invalidateQueries({ queryKey: ['/api/engagement/employer-ratings'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Submit Rating Failed',
        description: error.message || 'Something went wrong.',
        variant: 'destructive',
      });
    },
  });

  // Submit anonymous suggestion
  const submitSuggestionMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/engagement/suggestions", data);
    },
    onSuccess: () => {
      toast({ title: "Suggestion submitted", description: "We'll review your suggestion soon!" });
      queryClient.invalidateQueries({ queryKey: ['/api/engagement/suggestions'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Submit Suggestion Failed',
        description: error.message || 'Something went wrong.',
        variant: 'destructive',
      });
    },
  });

  // Submit employee recognition
  const submitRecognitionMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/engagement/recognition", data);
    },
    onSuccess: () => {
      toast({ title: "Recognition sent!", description: "Your kudos have been shared!" });
      queryClient.invalidateQueries({ queryKey: ['/api/engagement/recognition'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Submit Recognition Failed',
        description: error.message || 'Something went wrong.',
        variant: 'destructive',
      });
    },
  });

  const pageConfig: CanvasPageConfig = {
    id: 'engagement-employee',
    title: 'Employee Engagement',
    subtitle: 'Share feedback, recognize peers, and help improve our workplace',
    category: 'operations',
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="pulse" data-testid="tab-pulse">
            <Heart className="h-4 w-4 mr-2" />
            Pulse Surveys
          </TabsTrigger>
          <TabsTrigger value="ratings" data-testid="tab-ratings">
            <Star className="h-4 w-4 mr-2" />
            Rate Employer
          </TabsTrigger>
          <TabsTrigger value="suggestions" data-testid="tab-suggestions">
            <Lightbulb className="h-4 w-4 mr-2" />
            Suggestions
          </TabsTrigger>
          <TabsTrigger value="recognition" data-testid="tab-recognition">
            <Award className="h-4 w-4 mr-2" />
            Recognition
          </TabsTrigger>
        </TabsList>

        {/* Pulse Surveys Tab */}
        <TabsContent value="pulse" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pulse Surveys</CardTitle>
              <CardDescription>Quick check-ins to gauge how you're feeling</CardDescription>
            </CardHeader>
            <CardContent>
              {pulseSurveys && pulseSurveys.length > 0 ? (
                <div className="space-y-4">
                  {pulseSurveys.slice(0, 1).map((survey: any) => (
                    <PulseSurveyForm
                      key={survey.id}
                      survey={survey}
                      onSubmit={(responses) => {
                        submitSurveyMutation.mutate({
                          surveyTemplateId: survey.id,
                          responses
                          // Backend will calculate engagement/sentiment scores from responses
                        });
                      }}
                      isSubmitting={submitSurveyMutation.isPending}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No active pulse surveys at this time. Check back later!
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Employer Ratings Tab */}
        <TabsContent value="ratings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Rate Your Employer</CardTitle>
              <CardDescription>Your honest feedback helps improve our workplace</CardDescription>
            </CardHeader>
            <CardContent>
              <EmployerRatingForm
                onSubmit={(data) => submitRatingMutation.mutate(data)}
                isSubmitting={submitRatingMutation.isPending}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Suggestions Tab */}
        <TabsContent value="suggestions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Anonymous Suggestion Box</CardTitle>
              <CardDescription>Share ideas to improve our workplace (optional anonymity)</CardDescription>
            </CardHeader>
            <CardContent>
              <SuggestionForm
                onSubmit={(data) => submitSuggestionMutation.mutate(data)}
                isSubmitting={submitSuggestionMutation.isPending}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recognition Tab */}
        <TabsContent value="recognition" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recognize a Peer</CardTitle>
              <CardDescription>Celebrate teammates who go above and beyond</CardDescription>
            </CardHeader>
            <CardContent>
              <RecognitionForm
                onSubmit={(data) => submitRecognitionMutation.mutate(data)}
                isSubmitting={submitRecognitionMutation.isPending}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Recognition</CardTitle>
              <CardDescription>Latest kudos and achievements</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recognitions && recognitions.length > 0 ? (
                  recognitions.slice(0, 5).map((rec: any) => (
                    <div key={rec.id} className="border rounded-lg p-3 flex items-start gap-3">
                      <Award className="h-5 w-5 text-yellow-500 mt-0.5" />
                      <div className="flex-1">
                        <div className="text-sm font-medium">
                          {rec.category && <Badge variant="outline" className="mr-2">{rec.category}</Badge>}
                          Employee recognized
                        </div>
                        <div className="text-sm mt-1">{rec.reason}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {new Date(rec.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    No recognitions yet. Be the first to celebrate your teammates!
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </CanvasHubPage>
  );
}

// Pulse Survey Form Component
function PulseSurveyForm({ survey, onSubmit, isSubmitting }: any) {
  const [responses, setResponses] = useState<Record<string, any>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(responses);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-4">
        {survey.questions && survey.questions.map((q: any, idx: number) => (
          <div key={idx} className="space-y-2">
            <Label>{q.question}</Label>
            {q.type === 'text' && (
              <Textarea
                placeholder="Your answer..."
                onChange={(e) => setResponses({ ...responses, [q.id]: e.target.value })}
                data-testid={`input-survey-${idx}`}
              />
            )}
            {q.type === 'rating' && (
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((rating) => (
                  <Button
                    key={rating}
                    type="button"
                    variant={responses[q.id] === rating ? "default" : "outline"}
                    onClick={() => setResponses({ ...responses, [q.id]: rating })}
                    data-testid={`button-rating-${rating}`}
                  >
                    {rating}
                  </Button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <Button type="submit" disabled={isSubmitting} data-testid="button-submit-survey">
        {isSubmitting ? "Submitting..." : "Submit Survey"}
      </Button>
    </form>
  );
}

// Employer Rating Form Component
function EmployerRatingForm({ onSubmit, isSubmitting }: any) {
  const [formData, setFormData] = useState({
    ratingType: 'organization',
    managementQuality: 3,
    workEnvironment: 3,
    compensationFairness: 3,
    growthOpportunities: 3,
    workLifeBalance: 3,
    equipmentResources: 3,
    communicationClarity: 3,
    recognitionAppreciation: 3,
    positiveComments: '',
    improvementSuggestions: '',
    isAnonymous: true
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const overallScore = (
      formData.managementQuality +
      formData.workEnvironment +
      formData.compensationFairness +
      formData.growthOpportunities +
      formData.workLifeBalance +
      formData.equipmentResources +
      formData.communicationClarity +
      formData.recognitionAppreciation
    ) / 8;
    onSubmit({ ...formData, overallScore: overallScore.toFixed(1) });
  };

  const ratingCategories = [
    { key: 'managementQuality', label: 'Management Quality' },
    { key: 'workEnvironment', label: 'Work Environment' },
    { key: 'compensationFairness', label: 'Compensation Fairness' },
    { key: 'growthOpportunities', label: 'Growth Opportunities' },
    { key: 'workLifeBalance', label: 'Work-Life Balance' },
    { key: 'equipmentResources', label: 'Equipment & Resources' },
    { key: 'communicationClarity', label: 'Communication Clarity' },
    { key: 'recognitionAppreciation', label: 'Recognition & Appreciation' }
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        {ratingCategories.map((category) => (
          <div key={category.key} className="space-y-2">
            <Label>{category.label}</Label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((rating) => (
                <Button
                  key={rating}
                  type="button"
                  variant={(formData as any)[category.key] === rating ? "default" : "outline"}
                  onClick={() => setFormData({ ...formData, [category.key]: rating })}
                  data-testid={`button-${category.key}-${rating}`}
                >
                  <Star className="h-4 w-4" />
                  {rating}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Label>What do you appreciate most? (Optional)</Label>
        <Textarea
          placeholder="Share positive feedback..."
          value={formData.positiveComments}
          onChange={(e) => setFormData({ ...formData, positiveComments: e.target.value })}
          data-testid="input-positive-comments"
        />
      </div>

      <div className="space-y-2">
        <Label>What could be improved? (Optional)</Label>
        <Textarea
          placeholder="Share constructive suggestions..."
          value={formData.improvementSuggestions}
          onChange={(e) => setFormData({ ...formData, improvementSuggestions: e.target.value })}
          data-testid="input-improvement-suggestions"
        />
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          checked={formData.isAnonymous}
          onCheckedChange={(checked) => setFormData({ ...formData, isAnonymous: checked })}
          data-testid="switch-anonymous"
        />
        <Label>Submit anonymously</Label>
      </div>

      <Button type="submit" disabled={isSubmitting} data-testid="button-submit-rating">
        {isSubmitting ? "Submitting..." : "Submit Rating"}
      </Button>
    </form>
  );
}

// Suggestion Form Component
function SuggestionForm({ onSubmit, isSubmitting }: any) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'workplace_improvement',
    isAnonymous: true
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
    setFormData({ title: '', description: '', category: 'workplace_improvement', isAnonymous: true });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Title</Label>
        <Input
          placeholder="Brief summary of your suggestion"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          required
          data-testid="input-suggestion-title"
        />
      </div>

      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          placeholder="Explain your suggestion in detail..."
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          required
          rows={6}
          data-testid="input-suggestion-description"
        />
      </div>

      <div className="space-y-2">
        <Label>Category</Label>
        <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
          <SelectTrigger data-testid="select-suggestion-category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="workplace_improvement">Workplace Improvement</SelectItem>
            <SelectItem value="process_improvement">Process Improvement</SelectItem>
            <SelectItem value="benefits_perks">Benefits & Perks</SelectItem>
            <SelectItem value="equipment_tools">Equipment & Tools</SelectItem>
            <SelectItem value="communication">Communication</SelectItem>
            <SelectItem value="safety_concern">Safety Concern</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          checked={formData.isAnonymous}
          onCheckedChange={(checked) => setFormData({ ...formData, isAnonymous: checked })}
          data-testid="switch-suggestion-anonymous"
        />
        <Label>Submit anonymously</Label>
      </div>

      <Button type="submit" disabled={isSubmitting} data-testid="button-submit-suggestion">
        {isSubmitting ? "Submitting..." : "Submit Suggestion"}
      </Button>
    </form>
  );
}

// Recognition Form Component
function RecognitionForm({ onSubmit, isSubmitting }: any) {
  const [formData, setFormData] = useState({
    recognizedEmployeeId: '',
    reason: '',
    category: 'teamwork',
    isPublic: true
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
    setFormData({ recognizedEmployeeId: '', reason: '', category: 'teamwork', isPublic: true });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Employee ID or Email</Label>
        <Input
          placeholder="Who are you recognizing?"
          value={formData.recognizedEmployeeId}
          onChange={(e) => setFormData({ ...formData, recognizedEmployeeId: e.target.value })}
          required
          data-testid="input-recognition-employee"
        />
      </div>

      <div className="space-y-2">
        <Label>What did they do?</Label>
        <Textarea
          placeholder="Describe their achievement or contribution..."
          value={formData.reason}
          onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
          required
          rows={4}
          data-testid="input-recognition-reason"
        />
      </div>

      <div className="space-y-2">
        <Label>Category</Label>
        <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
          <SelectTrigger data-testid="select-recognition-category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="teamwork">Teamwork</SelectItem>
            <SelectItem value="innovation">Innovation</SelectItem>
            <SelectItem value="leadership">Leadership</SelectItem>
            <SelectItem value="customer_service">Customer Service</SelectItem>
            <SelectItem value="going_above_beyond">Going Above & Beyond</SelectItem>
            <SelectItem value="mentorship">Mentorship</SelectItem>
            <SelectItem value="problem_solving">Problem Solving</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          checked={formData.isPublic}
          onCheckedChange={(checked) => setFormData({ ...formData, isPublic: checked })}
          data-testid="switch-recognition-public"
        />
        <Label>Share publicly on recognition feed</Label>
      </div>

      <Button type="submit" disabled={isSubmitting} data-testid="button-submit-recognition">
        {isSubmitting ? "Submitting..." : "Send Recognition"}
      </Button>
    </form>
  );
}
