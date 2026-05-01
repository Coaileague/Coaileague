/**
 * ScheduleTemplates - Component for creating, saving, and loading schedule templates
 * Allows managers to save common scheduling patterns for quick reuse
 */

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import {
  FileText,
  Plus,
  Save,
  FolderOpen,
  Trash2,
  Loader2,
  X,
  Clock,
  Calendar,
  Users,
  LayoutTemplate,
} from 'lucide-react';
import type { Shift, ScheduleTemplate } from '@shared/schema';

interface ScheduleTemplatesProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentShifts: Shift[];
  selectedDate: Date;
  onApplyTemplate: (shifts: Partial<Shift>[]) => void;
}

export function ScheduleTemplates({
  open,
  onOpenChange,
  currentShifts,
  selectedDate,
  onApplyTemplate,
}: ScheduleTemplatesProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('load');
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { data: templates, isLoading } = useQuery<ScheduleTemplate[]>({
    queryKey: ['/api/shift-templates'],
    enabled: open,
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; shifts: Partial<Shift>[] }) => {
      const response = await apiRequest('POST', '/api/shift-templates', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shift-templates'] });
      toast({
        title: 'Template Saved',
        description: 'Your schedule template has been saved successfully.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/shift-templates'] });
      setTemplateName('');
      setTemplateDescription('');
      setActiveTab('load');
    },
    onError: (error: Error) => {
      toast({
        title: 'Save Failed',
        description: error.message || 'Failed to save template.',
        variant: 'destructive',
      });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const response = await apiRequest('DELETE', `/api/shift-templates/${templateId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Template Deleted',
        description: 'The template has been deleted.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/shift-templates'] });
      setDeleteConfirmId(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Delete Failed',
        description: error.message || 'Failed to delete template.',
        variant: 'destructive',
      });
    },
  });

  const handleSaveTemplate = () => {
    if (!templateName.trim()) {
      toast({
        title: 'Name Required',
        description: 'Please enter a name for the template.',
        variant: 'destructive',
      });
      return;
    }

    if (currentShifts.length === 0) {
      toast({
        title: 'No Shifts',
        description: 'There are no shifts to save as a template.',
        variant: 'destructive',
      });
      return;
    }

    const templateShifts = currentShifts.map(shift => ({
      title: shift.title,
      employeeId: shift.employeeId,
      clientId: shift.clientId,
      description: shift.description,
      startTimeOffset: new Date(shift.startTime).getHours() * 60 + new Date(shift.startTime).getMinutes(),
      endTimeOffset: new Date(shift.endTime).getHours() * 60 + new Date(shift.endTime).getMinutes(),
      dayOfWeek: new Date(shift.startTime).getDay(),
    }));

    createTemplateMutation.mutate({
      name: templateName.trim(),
      description: templateDescription.trim() || undefined,
      shifts: templateShifts,
    });
  };

  const handleApplyTemplate = (template: ScheduleTemplate) => {
    if (!template.shiftPatterns || !Array.isArray(template.shiftPatterns)) {
      toast({
        title: 'Invalid Template',
        description: 'This template has no shift patterns.',
        variant: 'destructive',
      });
      return;
    }

    const shifts: Partial<Shift>[] = template.shiftPatterns.map((pattern) => {
      const startTime = new Date(selectedDate);
      const endTime = new Date(selectedDate);
      
      const startHours = Math.floor((pattern.startTimeOffset || 540) / 60);
      const startMinutes = (pattern.startTimeOffset || 540) % 60;
      const endHours = Math.floor((pattern.endTimeOffset || 1020) / 60);
      const endMinutes = (pattern.endTimeOffset || 1020) % 60;
      
      startTime.setHours(startHours, startMinutes, 0, 0);
      endTime.setHours(endHours, endMinutes, 0, 0);

      return {
        title: pattern.title,
        employeeId: pattern.employeeId,
        clientId: pattern.clientId,
        locationName: pattern.location,
        description: pattern.description,
        startTime: startTime,
        endTime: endTime,
        status: 'scheduled' as const,
      };
    });

    onApplyTemplate(shifts);
    onOpenChange(false);
    toast({
      title: 'Template Applied',
      description: `${shifts.length} shifts have been added from "${template.name}".`,
    });
  };

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    return `${displayHours}:${mins.toString().padStart(2, '0')} ${period}`;
  };

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[80dvh] sm:max-h-[100ddvh] focus:outline-none">
          <div data-vaul-no-drag className="mx-auto w-full max-w-md overflow-y-auto overscroll-contain [touch-action:pan-y] [-webkit-overflow-scrolling:touch]">
            <DrawerHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary/10">
                    <LayoutTemplate className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <DrawerTitle className="text-base font-semibold">
                      Schedule Templates
                    </DrawerTitle>
                    <p className="text-xs text-muted-foreground">
                      Save and reuse common schedules
                    </p>
                  </div>
                </div>
                <DrawerClose asChild>
                  <Button variant="ghost" size="icon">
                    <X className="h-4 w-4" />
                  </Button>
                </DrawerClose>
              </div>
            </DrawerHeader>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="px-4">
              <TabsList className="w-full grid grid-cols-2 h-9">
                <TabsTrigger value="load" className="text-xs" data-testid="tab-load-template">
                  <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
                  Load
                </TabsTrigger>
                <TabsTrigger value="save" className="text-xs" data-testid="tab-save-template">
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  Save
                </TabsTrigger>
              </TabsList>

              <TabsContent value="load" className="mt-3">
                <ScrollArea className="h-[350px]">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : !templates || templates.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
                      <p className="text-sm font-medium">No Templates Yet</p>
                      <p className="text-xs mt-1">Save your current schedule as a template</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {templates.map((template) => (
                        <div
                          key={template.id}
                          className="bg-muted/30 rounded-lg p-3 border hover:border-primary/50 transition-colors"
                          data-testid={`template-${template.id}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-sm truncate">
                                {template.name}
                              </h4>
                              {template.description && (
                                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                  {template.description}
                                </p>
                              )}
                              <div className="flex items-center gap-2 mt-2">
                                <Badge variant="secondary" className="text-[10px]">
                                  <Users className="h-2.5 w-2.5 mr-1" />
                                  {Array.isArray(template.shiftPatterns) ? template.shiftPatterns.length : 0} shifts
                                </Badge>
                                {template.createdAt && (
                                  <span className="text-[10px] text-muted-foreground">
                                    {format(new Date(template.createdAt), 'MMM d, yyyy')}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-1.5">
                              <Button
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => handleApplyTemplate(template)}
                                data-testid={`button-apply-template-${template.id}`}
                              >
                                Apply
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => setDeleteConfirmId(template.id)}
                                data-testid={`button-delete-template-${template.id}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="save" className="mt-3">
                <div className="space-y-4">
                  <div className="bg-muted/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Current Schedule</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">
                        {format(selectedDate, 'EEEE, MMM d')}
                      </span>
                      <Badge variant="secondary">
                        {currentShifts.length} shift{currentShifts.length !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="template-name" className="text-xs font-medium">
                      Template Name
                    </Label>
                    <Input
                      id="template-name"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      placeholder="e.g., Weekend Coverage, Monday Morning..."
                      className="h-10"
                      data-testid="input-template-name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="template-description" className="text-xs font-medium">
                      Description (Optional)
                    </Label>
                    <Textarea
                      id="template-description"
                      value={templateDescription}
                      onChange={(e) => setTemplateDescription(e.target.value)}
                      placeholder="Describe when to use this template..."
                      rows={2}
                      className="text-sm resize-none"
                      data-testid="input-template-description"
                    />
                  </div>

                  {currentShifts.length > 0 && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">
                        Shifts to Save
                      </Label>
                      <ScrollArea className="h-[120px]">
                        <div className="space-y-1">
                          {currentShifts.slice(0, 5).map((shift) => (
                            <div
                              key={shift.id}
                              className="flex items-center justify-between gap-1 text-xs bg-muted/30 rounded px-2 py-1.5"
                            >
                              <span className="font-medium truncate max-w-[120px]">
                                {shift.title || 'Shift'}
                              </span>
                              <span className="text-muted-foreground">
                                {format(new Date(shift.startTime), 'h:mm a')} -{' '}
                                {format(new Date(shift.endTime), 'h:mm a')}
                              </span>
                            </div>
                          ))}
                          {currentShifts.length > 5 && (
                            <p className="text-[10px] text-muted-foreground text-center py-1">
                              +{currentShifts.length - 5} more shifts
                            </p>
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </div>

                <DrawerFooter className="px-0 pt-4 pb-0">
                  <div className="flex gap-2">
                    <DrawerClose asChild>
                      <Button variant="outline" className="flex-1 h-10" data-testid="button-cancel-template">
                        Cancel
                      </Button>
                    </DrawerClose>
                    <Button
                      className="flex-1 h-10"
                      onClick={handleSaveTemplate}
                      disabled={!templateName.trim() || currentShifts.length === 0 || createTemplateMutation.isPending}
                      data-testid="button-save-template"
                    >
                      {createTemplateMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                      ) : (
                        <Save className="h-4 w-4 mr-1.5" />
                      )}
                      Save Template
                    </Button>
                  </div>
                </DrawerFooter>
              </TabsContent>
            </Tabs>

            {activeTab === 'load' && (
              <DrawerFooter className="px-4 pt-3 pb-4">
                <Button
                  variant="outline"
                  className="w-full h-10"
                  onClick={() => setActiveTab('save')}
                  data-testid="button-new-template"
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Create New Template
                </Button>
              </DrawerFooter>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The template will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && deleteTemplateMutation.mutate(deleteConfirmId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTemplateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
