import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Edit, Trash2, FileText, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { CustomForm } from "@shared/schema";

interface FormField {
  id: string;
  type: "text" | "textarea" | "select" | "radio" | "checkbox" | "date" | "file" | "esignature";
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
  description?: string;
  accept?: string;
  maxSizeMB?: number;
  agreementText?: string;
}

export default function AdminCustomForms() {
  const { toast } = useToast();
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<CustomForm | null>(null);
  
  // Form builder state
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategory, setFormCategory] = useState<"onboarding" | "rms">("onboarding");
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const [newFieldType, setNewFieldType] = useState<FormField["type"]>("text");

  // Fetch custom forms
  const { data: forms = [], isLoading } = useQuery<CustomForm[]>({
    queryKey: ["/api/custom-forms"],
  });

  // Create form mutation
  const createFormMutation = useMutation({
    mutationFn: async (formData: any) => {
      return await apiRequest("POST", "/api/custom-forms", formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-forms"] });
      toast({ title: "Form created successfully" });
      resetFormBuilder();
      setIsFormDialogOpen(false);
    },
    onError: () => {
      toast({
        title: "Failed to create form",
        variant: "destructive",
      });
    },
  });

  // Update form mutation
  const updateFormMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PATCH", `/api/custom-forms/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-forms"] });
      toast({ title: "Form updated successfully" });
      resetFormBuilder();
      setIsFormDialogOpen(false);
    },
    onError: () => {
      toast({
        title: "Failed to update form",
        variant: "destructive",
      });
    },
  });

  // Delete form mutation
  const deleteFormMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/custom-forms/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-forms"] });
      toast({ title: "Form deleted successfully" });
    },
    onError: () => {
      toast({
        title: "Failed to delete form",
        variant: "destructive",
      });
    },
  });

  const resetFormBuilder = () => {
    setFormTitle("");
    setFormDescription("");
    setFormCategory("onboarding");
    setFormFields([]);
    setEditingForm(null);
  };

  const addField = () => {
    const newField: FormField = {
      id: `field_${Date.now()}`,
      type: newFieldType,
      label: `New ${newFieldType} field`,
      required: false,
    };
    setFormFields([...formFields, newField]);
  };

  const updateField = (index: number, updates: Partial<FormField>) => {
    const updated = [...formFields];
    updated[index] = { ...updated[index], ...updates };
    setFormFields(updated);
  };

  const removeField = (index: number) => {
    setFormFields(formFields.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (!formTitle.trim()) {
      toast({ title: "Form title is required", variant: "destructive" });
      return;
    }

    const formData = {
      name: formTitle,
      description: formDescription,
      category: formCategory,
      template: { fields: formFields },
      isActive: true,
    };

    if (editingForm) {
      updateFormMutation.mutate({ id: editingForm.id, data: formData });
    } else {
      createFormMutation.mutate(formData);
    }
  };

  const handleEdit = (form: CustomForm) => {
    setEditingForm(form);
    setFormTitle(form.name);
    setFormDescription(form.description || "");
    setFormCategory(form.category as "onboarding" | "rms");
    setFormFields((form.template as any)?.fields || []);
    setIsFormDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground" data-testid="text-page-title">
            Custom Forms Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create organization-specific forms for onboarding and reporting
          </p>
        </div>
        <Dialog open={isFormDialogOpen} onOpenChange={setIsFormDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetFormBuilder()} data-testid="button-create-form">
              <Plus className="h-4 w-4 mr-2" />
              Create Form
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingForm ? "Edit Form" : "Create New Form"}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6">
              {/* Form Details */}
              <div className="space-y-4">
                <div>
                  <Label>Form Title *</Label>
                  <Input
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="e.g., Security Guard Onboarding Form"
                    data-testid="input-form-title"
                  />
                </div>

                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Describe the purpose of this form"
                    data-testid="textarea-form-description"
                  />
                </div>

                <div>
                  <Label>Category</Label>
                  <Select
                    value={formCategory}
                    onValueChange={(value: "onboarding" | "rms") => setFormCategory(value)}
                  >
                    <SelectTrigger data-testid="select-form-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="onboarding">Onboarding</SelectItem>
                      <SelectItem value="rms">Report Management (RMS)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Form Fields Builder */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Form Fields</h3>
                  <div className="flex gap-2">
                    <Select
                      value={newFieldType}
                      onValueChange={(value: FormField["type"]) => setNewFieldType(value)}
                    >
                      <SelectTrigger className="w-[200px]" data-testid="select-field-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text Input</SelectItem>
                        <SelectItem value="textarea">Text Area</SelectItem>
                        <SelectItem value="select">Dropdown</SelectItem>
                        <SelectItem value="radio">Radio Buttons</SelectItem>
                        <SelectItem value="checkbox">Checkbox</SelectItem>
                        <SelectItem value="date">Date Picker</SelectItem>
                        <SelectItem value="file">File Upload</SelectItem>
                        <SelectItem value="esignature">E-Signature</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button onClick={addField} size="sm" data-testid="button-add-field">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  {formFields.map((field, index) => (
                    <Card key={field.id} className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs">Field Label</Label>
                              <Input
                                value={field.label}
                                onChange={(e) =>
                                  updateField(index, { label: e.target.value })
                                }
                                data-testid={`input-field-label-${index}`}
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Type</Label>
                              <Input
                                value={field.type}
                                disabled
                                className="bg-muted"
                              />
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeField(index)}
                            className="ml-2"
                            data-testid={`button-remove-field-${index}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={field.required}
                              onCheckedChange={(checked) =>
                                updateField(index, { required: checked })
                              }
                              data-testid={`switch-field-required-${index}`}
                            />
                            <Label className="text-xs">Required</Label>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    resetFormBuilder();
                    setIsFormDialogOpen(false);
                  }}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={createFormMutation.isPending || updateFormMutation.isPending}
                  data-testid="button-save-form"
                >
                  {(createFormMutation.isPending || updateFormMutation.isPending) && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {editingForm ? "Update Form" : "Create Form"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Forms List */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {forms.map((form) => (
          <Card key={form.id} className="p-6">
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <div>
                    <h3 className="font-semibold text-foreground" data-testid={`text-form-title-${form.id}`}>
                      {form.name}
                    </h3>
                    {form.description && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {form.description}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-1 rounded-full bg-primary/10 text-primary">
                  {form.category}
                </span>
                <span className="text-muted-foreground">
                  {((form.template as any)?.fields || []).length} fields
                </span>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEdit(form)}
                  className="flex-1"
                  data-testid={`button-edit-${form.id}`}
                >
                  <Edit className="h-3 w-3 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (confirm("Are you sure you want to delete this form?")) {
                      deleteFormMutation.mutate(form.id);
                    }
                  }}
                  className="flex-1"
                  data-testid={`button-delete-${form.id}`}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Delete
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {forms.length === 0 && (
        <Card className="p-12">
          <div className="text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              No custom forms yet
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first organization-specific form to get started
            </p>
            <Button
              onClick={() => {
                resetFormBuilder();
                setIsFormDialogOpen(true);
              }}
              data-testid="button-create-first-form"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Form
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
