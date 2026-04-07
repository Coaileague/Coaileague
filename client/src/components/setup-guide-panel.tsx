import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalTrigger, UniversalModalContent } from '@/components/ui/universal-modal';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  CheckCircle2,
  Circle,
  X,
  Minimize2,
  Maximize2,
  Sparkles,
  Building2,
  CreditCard,
  Users,
  Settings,
  Calendar,
  Shield,
  Zap,
  Link2,
  Rocket,
  Briefcase,
  Loader2,
} from "lucide-react";
import { TrinityBadge } from "@/components/trinity-marketing-hero";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useTrinityContext } from "@/hooks/use-trinity-context";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";

interface SetupTask {
  id: string;
  title: string;
  description?: string;
  isCompleted: boolean;
  href?: string;
  requiredRole?: string;
  points?: number;
}

interface SetupSection {
  id: string;
  title: string;
  icon: keyof typeof sectionIcons;
  tasks: SetupTask[];
  trinityTip?: string;
}

interface SetupGuideData {
  sections: SetupSection[];
  totalTasks: number;
  completedTasks: number;
  completionPercent: number;
  trinityGreeting?: string;
}

const sectionIcons = {
  organization: Building2,
  billing: CreditCard,
  team: Users,
  settings: Settings,
  scheduling: Calendar,
  compliance: Shield,
  automation: Zap,
  integrations: Link2,
  launch: Rocket,
  payroll: Briefcase,
} as const;

function getIconForSection(iconKey: keyof typeof sectionIcons) {
  return sectionIcons[iconKey] || Settings;
}

interface SetupGuidePanelProps {
  className?: string;
  defaultExpanded?: boolean;
  onClose?: () => void;
}

export function SetupGuidePanel({
  className,
  defaultExpanded = false,
  onClose,
}: SetupGuidePanelProps) {
  const [isOpen, setIsOpen] = useState(defaultExpanded);
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [isDismissed, setIsDismissed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('setup-guide-dismissed') === 'true';
    }
    return false;
  });
  const { user } = useAuth();
  const workspaceId = (user as any)?.activeWorkspaceId || (user as any)?.workspaceId;
  const { context: trinityContext } = useTrinityContext(workspaceId);

  const { data: guideData, isLoading } = useQuery<SetupGuideData>({
    queryKey: ["/api/onboarding/setup-guide"],
    enabled: !!workspaceId && !!user,
    staleTime: 30000,
  });

  useEffect(() => {
    if (guideData?.sections && expandedSections.length === 0) {
      const firstIncomplete = guideData.sections.find(s => s.tasks.some(t => !t.isCompleted));
      if (firstIncomplete) {
        setExpandedSections([firstIncomplete.id]);
      }
    }
  }, [guideData?.sections]);

  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      setCompletingTaskId(taskId);
      const response = await apiRequest("POST", `/api/onboarding/complete-task/${taskId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/setup-guide"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trinity/context"] });
    },
    onSettled: () => {
      setCompletingTaskId(null);
    },
  });

  const handleDismissComplete = () => {
    localStorage.setItem('setup-guide-dismissed', 'true');
    setIsDismissed(true);
  };

  if (isLoading && !guideData) {
    return null;
  }

  if (!guideData) {
    return null;
  }

  if (isDismissed) {
    return null;
  }

  const isComplete = guideData.completionPercent >= 100;
  const incompleteSections = guideData.sections.filter(
    (s) => s.tasks.some((t) => !t.isCompleted)
  );

  if (!isComplete && incompleteSections.length === 0) {
    return null;
  }

  const completedPanelContent = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b shrink-0">
        <span className="text-sm font-semibold">Setup complete</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleDismissComplete}
          data-testid="button-dismiss-complete"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="p-6 text-center">
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold mb-2">You're all set!</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Your workspace is fully configured. Trinity AI is ready to help you manage your workforce.
        </p>
        <Button onClick={handleDismissComplete} className="w-full" data-testid="button-got-it">
          Got it
        </Button>
      </div>
    </div>
  );

  const panelContent = isComplete ? completedPanelContent : (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b shrink-0">
        <div className="flex items-center gap-2">
          <TrinityBadge showLabel={false} />
          <span className="text-sm font-semibold">Setup Guide</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsOpen(false)}
            data-testid="button-minimize-guide"
          >
            <Minimize2 className="h-4 w-4" />
          </Button>
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onClose}
              data-testid="button-close-guide"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="px-4 py-3 border-b shrink-0">
        <Progress value={guideData.completionPercent} className="h-1.5" />
        <div className="flex items-center justify-between gap-1 mt-2">
          <span className="text-xs text-muted-foreground">
            {guideData.completedTasks} of {guideData.totalTasks} tasks complete
          </span>
          <span className="text-xs font-medium text-primary">
            {guideData.completionPercent}%
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {trinityContext?.trinityMode === "guru" && guideData.trinityGreeting && (
          <div className="px-3 py-2 mx-2 my-2 rounded-lg bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-purple-500/10 border border-cyan-500/20 text-xs text-muted-foreground flex items-start gap-2">
            <TrinityBadge showLabel={false} className="shrink-0 mt-0.5" />
            <span className="text-foreground/80">{guideData.trinityGreeting}</span>
          </div>
        )}

        <Accordion
          type="multiple"
          value={expandedSections}
          onValueChange={setExpandedSections}
          className="w-full"
        >
          {guideData.sections.map((section) => {
            const completedCount = section.tasks.filter((t) => t.isCompleted).length;
            const totalCount = section.tasks.length;
            const isFullyComplete = completedCount === totalCount;
            const SectionIcon = getIconForSection(section.icon);

            return (
              <AccordionItem
                key={section.id}
                value={section.id}
                className="border-b last:border-b-0"
                data-testid={`setup-section-${section.id}`}
              >
                <AccordionTrigger
                  className={cn(
                    "px-4 py-3 hover:no-underline hover:bg-muted/50 text-sm",
                    isFullyComplete && "text-muted-foreground"
                  )}
                  data-testid={`trigger-section-${section.id}`}
                >
                  <div className="flex items-center gap-3 flex-1">
                    {isFullyComplete ? (
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    ) : (
                      <SectionIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span className={cn(
                      "font-medium text-left",
                      isFullyComplete && "line-through"
                    )}>
                      {section.title}
                    </span>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="pb-0">
                  {section.trinityTip && trinityContext?.trinityMode === "guru" && (
                    <div className="mx-4 mb-2 p-2 rounded-lg bg-gradient-to-r from-cyan-500/5 to-purple-500/5 border border-cyan-500/10 text-xs text-muted-foreground flex items-start gap-2">
                      <TrinityBadge showLabel={false} className="shrink-0 mt-0.5" />
                      <span className="text-foreground/70">{section.trinityTip}</span>
                    </div>
                  )}

                  <div className="space-y-0.5 pb-2">
                    {section.tasks.map((task) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        onComplete={() => completeTaskMutation.mutate(task.id)}
                        isCompleting={completingTaskId === task.id}
                      />
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </div>
    </div>
  );

  return (
    <>
      <div className="hidden md:block">
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div
              key="panel"
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <Card
                className={cn("w-80 shadow-sm max-h-[70vh] flex flex-col overflow-hidden", className)}
                data-testid="setup-guide-panel"
              >
                {panelContent}
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="button"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.15 }}
            >
              <Button
                onClick={() => setIsOpen(true)}
                className="rounded-full h-11 px-4 gap-2 shadow-sm"
                data-testid="button-open-setup-guide"
              >
                <Settings className="w-4 h-4" />
                <span className="font-medium">Setup guide</span>
                <Badge variant="secondary" className="bg-primary-foreground/20 text-primary-foreground text-xs px-1.5">
                  {guideData.completionPercent}%
                </Badge>
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="md:hidden">
        <UniversalModal open={isOpen} onOpenChange={setIsOpen}>
          <UniversalModalTrigger asChild>
            <Button
              className="rounded-full h-11 px-4 gap-2 shadow-sm"
              data-testid="button-open-setup-guide-mobile"
            >
              <Settings className="w-4 h-4" />
              <span className="font-medium">Setup</span>
              <Badge variant="secondary" className="bg-primary-foreground/20 text-primary-foreground text-xs px-1.5">
                {guideData.completionPercent}%
              </Badge>
            </Button>
          </UniversalModalTrigger>
          <UniversalModalContent side="bottom" className="h-[85vh] p-0 rounded-t-xl sm:max-w-3xl" showHomeButton={false}>
            <UniversalModalHeader className="sr-only">
              <UniversalModalTitle>Setup Guide</UniversalModalTitle>
            </UniversalModalHeader>
            {panelContent}
          </UniversalModalContent>
        </UniversalModal>
      </div>
    </>
  );
}

function TaskItem({
  task,
  onComplete,
  isCompleting,
}: {
  task: SetupTask;
  onComplete: () => void;
  isCompleting: boolean;
}) {
  const content = (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/30 transition-colors cursor-pointer",
        task.isCompleted && "opacity-60"
      )}
      onClick={(e) => {
        if (task.isCompleted || isCompleting) return;
        if (!task.href) {
          e.preventDefault();
          onComplete();
        }
      }}
      data-testid={`task-item-${task.id}`}
    >
      {isCompleting ? (
        <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
      ) : task.isCompleted ? (
        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
      ) : (
        <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
      )}
      <span
        className={cn(
          "flex-1 text-left",
          task.isCompleted && "line-through text-muted-foreground"
        )}
      >
        {task.title}
      </span>
      {task.points && !task.isCompleted && (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
          +{task.points}
        </Badge>
      )}
    </div>
  );

  if (task.href && !task.isCompleted) {
    return (
      <Link href={task.href} className="block">
        {content}
      </Link>
    );
  }

  return content;
}

export default SetupGuidePanel;
