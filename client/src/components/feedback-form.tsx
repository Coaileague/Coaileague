import { useState, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Camera, MessageSquare, Bug, Lightbulb, HelpCircle, 
  Send, Trash2, Image, CheckCircle, Loader2, X
} from "lucide-react";

type FeedbackType = 'bug' | 'feature' | 'question' | 'other';

interface FeedbackData {
  type: FeedbackType;
  title: string;
  description: string;
  screenshot?: string;
  url: string;
  userAgent: string;
  timestamp: string;
}

const FEEDBACK_TYPES: { value: FeedbackType; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'bug', label: 'Bug Report', icon: <Bug className="h-4 w-4" />, color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
  { value: 'feature', label: 'Feature Request', icon: <Lightbulb className="h-4 w-4" />, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
  { value: 'question', label: 'Question', icon: <HelpCircle className="h-4 w-4" />, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  { value: 'other', label: 'Other', icon: <MessageSquare className="h-4 w-4" />, color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
];

const MAX_SCREENSHOT_SIZE = 1024 * 1024; // 1MB max

async function captureScreenshot(): Promise<string | null> {
  try {
    // Feature detection
    if (!navigator.mediaDevices?.getDisplayMedia) {
      console.warn('Screen capture not supported in this browser');
      return null;
    }

    // Check for secure context requirement
    if (!window.isSecureContext) {
      console.warn('Screen capture requires a secure context (HTTPS)');
      return null;
    }

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { 
        displaySurface: 'browser',
      } as any,
      audio: false,
    });

    const video = document.createElement('video');
    video.srcObject = stream;
    await video.play();

    // Calculate scaled dimensions to limit screenshot size
    let width = video.videoWidth;
    let height = video.videoHeight;
    const maxDimension = 1920; // Max resolution
    
    if (width > maxDimension || height > maxDimension) {
      const scale = maxDimension / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(video, 0, 0, width, height);

    stream.getTracks().forEach(track => track.stop());

    // Compress with JPEG and reduce quality if needed
    let quality = 0.8;
    let result = canvas.toDataURL('image/jpeg', quality);
    
    // Reduce quality if image is too large
    while (result.length > MAX_SCREENSHOT_SIZE && quality > 0.3) {
      quality -= 0.1;
      result = canvas.toDataURL('image/jpeg', quality);
    }

    return result;
  } catch (error: any) {
    // Handle user cancellation gracefully
    if (error.name === 'NotAllowedError' || error.name === 'AbortError') {
      console.log('Screen capture cancelled by user');
      return null;
    }
    console.error('Screenshot capture failed:', error);
    return null;
  }
}

interface FeedbackFormProps {
  trigger?: React.ReactNode;
  onSubmitSuccess?: () => void;
}

export function FeedbackForm({ trigger, onSubmitSuccess }: FeedbackFormProps) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const submitMutation = useMutation({
    mutationFn: async (data: FeedbackData) => {
      return apiRequest('POST', '/api/feedback', data);
    },
    onSuccess: () => {
      toast({
        title: "Feedback Submitted",
        description: "Thank you for your feedback! We'll review it shortly.",
      });
      resetForm();
      setOpen(false);
      onSubmitSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Submission Failed",
        description: error.message || "Could not submit feedback. Please try again.",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setType('bug');
    setTitle('');
    setDescription('');
    setScreenshot(null);
  };

  const handleCaptureScreenshot = async () => {
    setIsCapturing(true);
    setOpen(false);

    await new Promise(r => setTimeout(r, 100));

    const captured = await captureScreenshot();
    
    setOpen(true);
    setIsCapturing(false);

    if (captured) {
      setScreenshot(captured);
      toast({
        title: "Screenshot Captured",
        description: "Screenshot has been attached to your feedback.",
      });
    } else {
      toast({
        title: "Capture Failed",
        description: "Could not capture screenshot. You can upload an image instead.",
        variant: "destructive",
      });
    }
  };

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid File",
        description: "Please upload an image file.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please upload an image smaller than 5MB.",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setScreenshot(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, [toast]);

  const handleSubmit = () => {
    if (!title.trim()) {
      toast({
        title: "Title Required",
        description: "Please provide a brief title for your feedback.",
        variant: "destructive",
      });
      return;
    }

    if (!description.trim()) {
      toast({
        title: "Description Required",
        description: "Please describe your feedback in detail.",
        variant: "destructive",
      });
      return;
    }

    const feedbackData: FeedbackData = {
      type,
      title: title.trim(),
      description: description.trim(),
      screenshot: screenshot || undefined,
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    };

    submitMutation.mutate(feedbackData);
  };

  const selectedType = FEEDBACK_TYPES.find(t => t.value === type);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2" data-testid="button-open-feedback">
            <MessageSquare className="h-4 w-4" />
            Send Feedback
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Send Feedback
          </DialogTitle>
          <DialogDescription>
            Help us improve CoAIleague by sharing your feedback, reporting bugs, or suggesting features.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Feedback Type</Label>
            <div className="flex flex-wrap gap-2">
              {FEEDBACK_TYPES.map((feedbackType) => (
                <Badge
                  key={feedbackType.value}
                  variant={type === feedbackType.value ? "default" : "outline"}
                  className={`cursor-pointer gap-1.5 py-1.5 px-3 ${type === feedbackType.value ? '' : 'hover-elevate'}`}
                  onClick={() => setType(feedbackType.value)}
                  data-testid={`badge-feedback-type-${feedbackType.value}`}
                >
                  {feedbackType.icon}
                  {feedbackType.label}
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-title">Title</Label>
            <Input
              id="feedback-title"
              placeholder="Brief summary of your feedback"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="input-feedback-title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-description">Description</Label>
            <Textarea
              id="feedback-description"
              placeholder="Please describe your feedback in detail. For bugs, include steps to reproduce."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              data-testid="input-feedback-description"
            />
          </div>

          <div className="space-y-2">
            <Label>Screenshot (Optional)</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCaptureScreenshot}
                disabled={isCapturing}
                className="gap-2"
                data-testid="button-capture-screenshot"
              >
                {isCapturing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
                Capture Screen
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="gap-2"
                data-testid="button-upload-screenshot"
              >
                <Image className="h-4 w-4" />
                Upload Image
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>

            {screenshot && (
              <div className="relative mt-2 rounded-lg border overflow-hidden">
                <img 
                  src={screenshot} 
                  alt="Screenshot preview" 
                  className="w-full h-32 object-cover"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 h-6 w-6"
                  onClick={() => setScreenshot(null)}
                  data-testid="button-remove-screenshot"
                >
                  <X className="h-3 w-3" />
                </Button>
                <Badge className="absolute bottom-2 left-2" variant="secondary">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Screenshot attached
                </Badge>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            data-testid="button-cancel-feedback"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitMutation.isPending || !title.trim() || !description.trim()}
            className="gap-2"
            data-testid="button-submit-feedback"
          >
            {submitMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Submit Feedback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FloatingFeedbackButton() {
  return (
    <div className="fixed bottom-20 right-4 z-50 md:bottom-6">
      <FeedbackForm
        trigger={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                className="h-12 w-12 rounded-full shadow-lg"
                data-testid="button-floating-feedback"
              >
                <MessageSquare className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="font-medium">
              Send Feedback
            </TooltipContent>
          </Tooltip>
        }
      />
    </div>
  );
}
