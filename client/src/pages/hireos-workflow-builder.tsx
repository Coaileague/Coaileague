import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch, AnyResponse } from "@/lib/apiError";
import { useLocation } from "wouter";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { UniversalModal, UniversalModalDescription, UniversalModalHeader, UniversalModalTitle, UniversalModalTrigger, UniversalModalContent } from '@/components/ui/universal-modal';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { GripVertical, Plus, Trash2, Edit, Save, AlertCircle, FileText, Upload, PenTool, CheckSquare, Brain, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

// Step types available in AI Hiring
const STEP_TYPES = [
  { value: 'personal_info', label: 'Personal Information', icon: FileText, description: 'Name, address, emergency contacts' },
  { value: 'tax_classification', label: 'Tax Classification', icon: FileText, description: 'W-4 Employee or W-9 Contractor' },
  { value: 'work_availability', label: 'Work Availability', icon: CheckSquare, description: 'Schedule preferences and hours' },
  { value: 'document_upload', label: 'Document Upload', icon: Upload, description: 'ID, certifications, licenses' },
  { value: 'e_signature', label: 'E-Signature', icon: PenTool, description: 'Employment agreements and SOPs' },
  { value: 'custom_form', label: 'Custom Form', icon: FileText, description: 'Industry-specific forms (ReportOS™)' },
];

// Sortable step item component
function SortableStepItem({ step, index, onEdit, onDelete, totalSteps }: any) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const StepIcon = STEP_TYPES.find(t => t.value === step.stepType)?.icon || FileText;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-card border rounded-lg p-4 mb-3"
      data-testid={`step-item-${index}`}
    >
      <div className="flex items-start gap-3">
        <div 
          className="cursor-move mt-1 text-muted-foreground hover-elevate p-1 rounded"
          {...attributes}
          {...listeners}
          data-testid={`drag-handle-${index}`}
        >
          <GripVertical className="h-5 w-5" />
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline">Step {index + 1}</Badge>
            <StepIcon className="h-4 w-4 text-primary" />
            <span className="font-medium">{step.stepName}</span>
            {step.isRequired && <Badge variant="default">Required</Badge>}
            {step.hasConditionalLogic && <Badge variant="secondary"><Brain className="h-3 w-3 mr-1" />Conditional</Badge>}
          </div>
          
          {step.description && (
            <p className="text-sm text-muted-foreground mb-2">{step.description}</p>
          )}
          
          {step.hasConditionalLogic && step.conditionalLogic && (
            <Alert className="mt-2">
              <Brain className="h-4 w-4" />
              <AlertDescription className="text-xs">
                <strong>Logic:</strong> IF {step.conditionalLogic.field} = "{step.conditionalLogic.value}" THEN {step.conditionalLogic.action}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onEdit(step)}
            data-testid={`button-edit-step-${index}`}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDelete(step.id)}
            disabled={totalSteps === 1}
            data-testid={`button-delete-step-${index}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// Step editor dialog
function StepEditorDialog({ open, onOpenChange, step, onSave, reportTemplates }: any) {
  const [formData, setFormData] = useState({
    stepName: '',
    stepType: '',
    description: '',
    isRequired: true,
    hasConditionalLogic: false,
    conditionalLogic: null,
    customFormTemplateId: null,
  });

  // CRITICAL FIX: Reset form state when dialog opens or step changes
  useEffect(() => {
    if (open) {
      setFormData(step || {
        stepName: '',
        stepType: '',
        description: '',
        isRequired: true,
        hasConditionalLogic: false,
        conditionalLogic: null,
        customFormTemplateId: null,
      });
    }
  }, [open, step]);

  const handleSave = () => {
    if (!formData.stepName || !formData.stepType) {
      return;
    }
    onSave(formData);
    onOpenChange(false);
  };

  const selectedStepType = STEP_TYPES.find(t => t.value === formData.stepType);

  return (
    <UniversalModal open={open} onOpenChange={onOpenChange}>
      <UniversalModalContent size="xl" className="max-h-[90vh] overflow-y-auto">
        <UniversalModalHeader>
          <UniversalModalTitle>{step ? 'Edit Step' : 'Add New Step'}</UniversalModalTitle>
          <UniversalModalDescription>
            Configure the onboarding step details and requirements
          </UniversalModalDescription>
        </UniversalModalHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label>Step Type *</Label>
            <Select
              value={formData.stepType}
              onValueChange={(value) => setFormData({ ...formData, stepType: value })}
            >
              <SelectTrigger data-testid="select-step-type">
                <SelectValue placeholder="Select step type" />
              </SelectTrigger>
              <SelectContent>
                {STEP_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex items-center gap-2">
                      <type.icon className="h-4 w-4" />
                      <div>
                        <div className="font-medium">{type.label}</div>
                        <div className="text-xs text-muted-foreground">{type.description}</div>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedStepType && (
            <Alert>
              <selectedStepType.icon className="h-4 w-4" />
              <AlertDescription>{selectedStepType.description}</AlertDescription>
            </Alert>
          )}

          <div>
            <Label>Step Name *</Label>
            <Input
              placeholder="e.g., Upload Commercial Driver's License"
              value={formData.stepName}
              onChange={(e) => setFormData({ ...formData, stepName: e.target.value })}
              data-testid="input-step-name"
            />
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              placeholder="Provide instructions for this step..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              data-testid="textarea-step-description"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="required"
              checked={formData.isRequired}
              onCheckedChange={(checked) => setFormData({ ...formData, isRequired: checked as boolean })}
              data-testid="checkbox-required"
            />
            <Label htmlFor="required" className="cursor-pointer">
              This step is required to complete onboarding
            </Label>
          </div>

          {/* Custom Form Integration */}
          {formData.stepType === 'custom_form' && (
            <div>
              <Label>Custom Form Template (ReportOS™ Integration)</Label>
              <Select
                value={(formData.customFormTemplateId as string) || ''}
                onValueChange={(value) => setFormData({ ...formData, customFormTemplateId: value as any })}
              >
                <SelectTrigger data-testid="select-custom-form">
                  <SelectValue placeholder="Select a custom form template" />
                </SelectTrigger>
                <SelectContent>
                  {reportTemplates?.map((template: any) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Custom forms from ReportOS™ No-Code Template Builder
              </p>
            </div>
          )}

          {/* Conditional Logic */}
          <div>
            <div className="flex items-center space-x-2 mb-3">
              <Checkbox
                id="conditional"
                checked={formData.hasConditionalLogic}
                onCheckedChange={(checked) => setFormData({ 
                  ...formData, 
                  hasConditionalLogic: checked as boolean,
                  conditionalLogic: checked ? ({ field: '', operator: 'equals', value: '', action: 'show' } as any) : null
                })}
                data-testid="checkbox-conditional"
              />
              <Label htmlFor="conditional" className="cursor-pointer flex items-center gap-2">
                <Brain className="h-4 w-4" />
                Enable Conditional Logic
              </Label>
            </div>

            {formData.hasConditionalLogic && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Conditional Rules</CardTitle>
                  <CardDescription>Show this step only when conditions are met</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">Field</Label>
                      <Select
                        value={(formData.conditionalLogic as any)?.field || ''}
                        onValueChange={(value) => setFormData({
                          ...formData,
                          conditionalLogic: { ...(formData.conditionalLogic || {}), field: value } as any
                        })}
                      >
                        <SelectTrigger data-testid="select-condition-field">
                          <SelectValue placeholder="Select field" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="role">Employee Role</SelectItem>
                          <SelectItem value="taxClassification">Tax Classification</SelectItem>
                          <SelectItem value="state">State/Location</SelectItem>
                          <SelectItem value="department">Department</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Operator</Label>
                      <Select
                        value={(formData.conditionalLogic as any)?.operator || 'equals'}
                        onValueChange={(value) => setFormData({
                          ...formData,
                          conditionalLogic: { ...(formData.conditionalLogic || {}), operator: value } as any
                        })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="equals">Equals</SelectItem>
                          <SelectItem value="not_equals">Not Equals</SelectItem>
                          <SelectItem value="contains">Contains</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Value</Label>
                      <Input
                        placeholder="e.g., Truck Driver"
                        value={(formData.conditionalLogic as any)?.value || ''}
                        onChange={(e) => setFormData({
                          ...formData,
                          conditionalLogic: { ...(formData.conditionalLogic || {}), value: e.target.value } as any
                        })}
                        data-testid="input-condition-value"
                      />
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
                    <strong>Example:</strong> IF Role = "Truck Driver" THEN show "Upload Commercial Driver's License"
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-step">
            Cancel
          </Button>
          <Button onClick={handleSave} data-testid="button-save-step">
            <Save className="h-4 w-4 mr-2" />
            Save Step
          </Button>
        </div>
      </UniversalModalContent>
    </UniversalModal>
  );
}

const pageConfig: CanvasPageConfig = {
  id: 'hireos-workflow-builder',
  title: 'AI Hiring™ Workflow Builder',
  subtitle: 'Design your custom onboarding sequence with drag-and-drop simplicity',
  category: 'operations',
};

export default function AIHiringWorkflowBuilder() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [editingStep, setEditingStep] = useState<any>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [steps, setSteps] = useState<any[]>([
    {
      id: '1',
      stepName: 'Personal Information',
      stepType: 'personal_info',
      description: 'Collect basic employee information and emergency contacts',
      sequence: 1,
      isRequired: true,
      hasConditionalLogic: false,
      conditionalLogic: null,
    },
  ]);

  // Fetch report templates for custom form integration
  const { data: reportTemplates } = useQuery({
    queryKey: ['/api/report-templates'],
    queryFn: () => apiFetch('/api/report-templates', AnyResponse),
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setSteps((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex);
        
        // Update sequence numbers
        return newItems.map((item, index) => ({
          ...item,
          sequence: index + 1,
        }));
      });

      toast({
        title: "Step reordered",
        description: "Workflow sequence updated",
      });
    }
  };

  const handleAddStep = () => {
    setEditingStep(null);
    setIsEditorOpen(true);
  };

  const handleEditStep = (step: any) => {
    setEditingStep(step);
    setIsEditorOpen(true);
  };

  const handleSaveStep = (stepData: any) => {
    if (editingStep) {
      // Update existing step
      setSteps(steps.map(s => s.id === editingStep.id ? { ...stepData, id: editingStep.id, sequence: editingStep.sequence } : s));
      toast({
        title: "Step updated",
        description: "Workflow step has been updated successfully",
      });
    } else {
      // Add new step
      const newStep = {
        ...stepData,
        id: Date.now().toString(),
        sequence: steps.length + 1,
      };
      setSteps(prev => [...prev, newStep]);
      toast({
        title: "Step added",
        description: "New step added to workflow",
      });
    }
  };

  const handleDeleteStep = (stepId: string) => {
    if (steps.length === 1) {
      toast({
        title: "Cannot delete",
        description: "Workflow must have at least one step",
        variant: "destructive",
      });
      return;
    }

    setSteps(steps.filter(s => s.id !== stepId).map((s, index) => ({
      ...s,
      sequence: index + 1,
    })));

    toast({
      title: "Step deleted",
      description: "Step removed from workflow",
    });
  };

  const saveTemplateMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/hireos/workflow-templates', {
        templateName: templateName || 'Default Onboarding Workflow',
        description: templateDescription,
        isDefault: false,
        steps: steps.map(s => ({
          stepName: s.stepName,
          stepType: s.stepType,
          description: s.description,
          sequence: s.sequence,
          isRequired: s.isRequired,
          hasConditionalLogic: s.hasConditionalLogic,
          conditionalLogic: s.conditionalLogic,
          customFormTemplateId: s.customFormTemplateId,
        })),
        complianceRequirements: {
          i9Required: true,
          backgroundCheckRequired: false,
          drugTestRequired: false,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hireos/workflow-templates'] });
      toast({
        title: "Workflow saved",
        description: "Onboarding workflow template created successfully",
      });
      navigate('/dashboard');
    },
    onError: (error: any) => {
      toast({
        title: "Save failed",
        description: error.message || "Failed to save workflow template",
        variant: "destructive",
      });
    },
  });

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Workflow Configuration */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Template Settings
              </CardTitle>
              <CardDescription>Configure workflow details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Workflow Name</Label>
                <Input
                  placeholder="e.g., Driver Onboarding"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  data-testid="input-template-name"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  placeholder="Describe this workflow..."
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  data-testid="textarea-template-description"
                />
              </div>
              <div className="pt-4 space-y-2">
                <Button
                  className="w-full"
                  onClick={() => saveTemplateMutation.mutate()}
                  disabled={saveTemplateMutation.isPending || steps.length === 0}
                  data-testid="button-save-template"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save Workflow Template
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate('/dashboard')}
                  data-testid="button-cancel-workflow"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>

          <Alert className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              <strong>Flexible Workflow System:</strong> Create custom onboarding sequences that adapt to your industry-specific needs and compliance requirements.
            </AlertDescription>
          </Alert>
        </div>

        {/* Workflow Steps */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle>Onboarding Steps</CardTitle>
                  <CardDescription>Drag to reorder, click to edit</CardDescription>
                </div>
                <Button onClick={handleAddStep} data-testid="button-add-step">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Step
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {steps.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No steps yet. Click "Add Step" to begin.</p>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={steps.map(s => s.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {steps.map((step, index) => (
                      <SortableStepItem
                        key={step.id}
                        step={step}
                        index={index}
                        totalSteps={steps.length}
                        onEdit={handleEditStep}
                        onDelete={handleDeleteStep}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <StepEditorDialog
        open={isEditorOpen}
        onOpenChange={setIsEditorOpen}
        step={editingStep}
        onSave={handleSaveStep}
        reportTemplates={reportTemplates}
      />
    </CanvasHubPage>
  );
}
