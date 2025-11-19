import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { MessageSquare, ArrowRight, ArrowLeft, CheckCircle2, Sparkles, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

export default function AICommunicationsOnboarding() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const [roomName, setRoomName] = useState("");
  const [roomDescription, setRoomDescription] = useState("");
  const [channels, setChannels] = useState<string[]>([]);
  const [newChannelName, setNewChannelName] = useState("");
  const [allowGuests, setAllowGuests] = useState(true);

  const totalSteps = 4;

  const handleAddChannel = () => {
    if (newChannelName.trim()) {
      setChannels([...channels, newChannelName.trim()]);
      setNewChannelName("");
    }
  };

  const handleRemoveChannel = (index: number) => {
    setChannels(channels.filter((_, i) => i !== index));
  };

  const handleNext = () => {
    if (currentStep === 1 && !roomName.trim()) {
      toast({
        title: "Room name required",
        description: "Please enter a name for your chat room",
        variant: "destructive",
      });
      return;
    }
    setCurrentStep(Math.min(currentStep + 1, totalSteps));
  };

  const handleBack = () => {
    setCurrentStep(Math.max(currentStep - 1, 1));
  };

  const completeOnboardingMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/comm-os/complete-onboarding', {
        roomName,
        roomDescription,
        channels,
        allowGuests,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/comm-os/rooms'] });
      queryClient.invalidateQueries({ queryKey: ['/api/comm-os/onboarding-status'] });
      toast({
        title: "Setup Complete!",
        description: "Your organization chat room is ready to use",
      });
      setLocation('/comm-os');
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to complete onboarding",
        variant: "destructive",
      });
    },
  });

  const handleComplete = async () => {
    completeOnboardingMutation.mutate();
  };

  const progressPercentage = (currentStep / totalSteps) * 100;

  return (
    <div className="container mx-auto py-8 px-4 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3 mb-2">
          <MessageSquare className="w-8 h-8 text-primary" />
          AI Communications Setup
        </h1>
        <p className="text-muted-foreground">
          Set up your organization's communication channels in just 4 steps
        </p>
      </div>

      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium">Step {currentStep} of {totalSteps}</span>
          <span className="text-sm text-muted-foreground">{Math.round(progressPercentage)}% complete</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {currentStep === 1 && (
              <>
                <Sparkles className="w-5 h-5 text-primary" />
                Name Your Room
              </>
            )}
            {currentStep === 2 && (
              <>
                <MessageSquare className="w-5 h-5 text-primary" />
                Add Channels
              </>
            )}
            {currentStep === 3 && (
              <>
                <CheckCircle2 className="w-5 h-5 text-primary" />
                Configure Settings
              </>
            )}
            {currentStep === 4 && (
              <>
                <CheckCircle2 className="w-5 h-5 text-primary" />
                Review & Launch
              </>
            )}
          </CardTitle>
          <CardDescription>
            {currentStep === 1 && "Choose a name for your main chat room"}
            {currentStep === 2 && "Create sub-channels for different purposes (optional)"}
            {currentStep === 3 && "Set access controls and permissions"}
            {currentStep === 4 && "Review your settings and launch your room"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 1: Room Name */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="room-name">Room Name *</Label>
                <Input
                  id="room-name"
                  placeholder="e.g., Main Office, Customer Support, Team Chat"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="mt-2"
                  data-testid="input-room-name"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This will be the main communication hub for your organization
                </p>
              </div>
              <div>
                <Label htmlFor="room-description">Description (Optional)</Label>
                <Textarea
                  id="room-description"
                  placeholder="Describe the purpose of this room..."
                  value={roomDescription}
                  onChange={(e) => setRoomDescription(e.target.value)}
                  className="mt-2"
                  data-testid="input-room-description"
                />
              </div>
            </div>
          )}

          {/* Step 2: Channels */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div>
                <Label>Add Sub-Channels</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Create dedicated channels for meetings, departments, or projects
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g., Weekly Meetings, IT Department"
                    value={newChannelName}
                    onChange={(e) => setNewChannelName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddChannel()}
                    data-testid="input-channel-name"
                  />
                  <Button 
                    onClick={handleAddChannel}
                    variant="outline"
                    data-testid="button-add-channel"
                  >
                    Add
                  </Button>
                </div>
              </div>

              {channels.length > 0 && (
                <div>
                  <Label>Your Channels ({channels.length})</Label>
                  <div className="mt-2 space-y-2">
                    {channels.map((channel, index) => (
                      <div 
                        key={index}
                        className="flex items-center justify-between p-3 bg-muted rounded-md"
                        data-testid={`channel-${index}`}
                      >
                        <span className="flex items-center gap-2">
                          <MessageSquare className="w-4 h-4 text-muted-foreground" />
                          {channel}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveChannel(index)}
                          data-testid={`button-remove-channel-${index}`}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {channels.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No channels added yet. You can skip this step if you want.</p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Settings */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label className="text-base">Allow Guest Access</Label>
                  <p className="text-sm text-muted-foreground">
                    Let end customers join as guests with limited permissions
                  </p>
                </div>
                <Switch
                  checked={allowGuests}
                  onCheckedChange={setAllowGuests}
                  data-testid="switch-allow-guests"
                />
              </div>

              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <h4 className="font-semibold text-sm">Default Roles:</h4>
                <ul className="text-sm space-y-1 ml-4">
                  <li className="flex items-start gap-2">
                    <Badge variant="default" className="mt-0.5">Owner</Badge>
                    <span>Full control over room and all settings</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Badge variant="secondary" className="mt-0.5">Admin</Badge>
                    <span>Can manage members and moderate chats</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Badge variant="outline" className="mt-0.5">Member</Badge>
                    <span>Regular employees with standard access</span>
                  </li>
                  {allowGuests && (
                    <li className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5">Guest</Badge>
                      <span>End customers with limited access</span>
                    </li>
                  )}
                </ul>
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <div className="bg-muted/30 dark:bg-slate-950/20 rounded-lg p-4 space-y-3">
                <div>
                  <Label className="text-sm text-muted-foreground">Room Name</Label>
                  <p className="text-lg font-semibold">{roomName}</p>
                </div>
                {roomDescription && (
                  <div>
                    <Label className="text-sm text-muted-foreground">Description</Label>
                    <p className="text-sm">{roomDescription}</p>
                  </div>
                )}
                <div>
                  <Label className="text-sm text-muted-foreground">Channels</Label>
                  <p className="text-sm">
                    {channels.length > 0 ? `${channels.length} sub-channels` : "No sub-channels"}
                  </p>
                  {channels.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {channels.map((ch, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {ch}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">Guest Access</Label>
                  <p className="text-sm">{allowGuests ? "Enabled" : "Disabled"}</p>
                </div>
              </div>

              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="font-semibold text-sm mb-2">What happens next?</h4>
                <ul className="text-sm space-y-1 ml-4 list-disc">
                  <li>Your main chat room will be created</li>
                  <li>You'll be assigned as the room owner</li>
                  {channels.length > 0 && <li>All sub-channels will be set up</li>}
                  <li>You can start inviting team members and customers</li>
                  <li>Support staff can join if needed for assistance</li>
                </ul>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between pt-6 border-t">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 1}
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>

            {currentStep < totalSteps ? (
              <Button onClick={handleNext} data-testid="button-next">
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button 
                onClick={handleComplete} 
                className="bg-primary hover:bg-primary" 
                data-testid="button-complete"
                disabled={completeOnboardingMutation.isPending}
              >
                {completeOnboardingMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Setting up...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Complete Setup
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
