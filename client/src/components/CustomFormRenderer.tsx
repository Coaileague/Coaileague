import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card } from "@/components/ui/card";
import { ESignature } from "./ESignature";
import { DocumentUpload } from "./DocumentUpload";
import { Loader2 } from "lucide-react";

export interface FormField {
  id: string;
  type: "text" | "textarea" | "select" | "radio" | "checkbox" | "date" | "file" | "esignature";
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: string[]; // For select, radio
  description?: string;
  accept?: string; // For file upload
  maxSizeMB?: number; // For file upload
  agreementText?: string; // For e-signature
}

export interface CustomFormTemplate {
  id: string;
  title: string;
  description?: string;
  fields: FormField[];
}

interface CustomFormRendererProps {
  template: CustomFormTemplate;
  onSubmit: (data: Record<string, any>) => Promise<void>;
  initialData?: Record<string, any>;
  submitLabel?: string;
}

export function CustomFormRenderer({
  template,
  onSubmit,
  initialData = {},
  submitLabel = "Submit Form",
}: CustomFormRendererProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Build dynamic Zod schema based on form fields
  const buildSchema = () => {
    const schemaFields: Record<string, z.ZodTypeAny> = {};
    
    template.fields.forEach((field) => {
      if (field.type === "esignature") {
        schemaFields[field.id] = field.required
          ? z.object({
              agreed: z.literal(true, { errorMap: () => ({ message: "You must agree to sign" }) }),
              signatureName: z.string().min(1, "Signature name is required"),
              signedAt: z.string(),
            })
          : z.object({
              agreed: z.boolean(),
              signatureName: z.string(),
              signedAt: z.string(),
            }).optional();
      } else if (field.type === "file") {
        schemaFields[field.id] = field.required
          ? z.instanceof(File, { message: `${field.label} is required` })
          : z.instanceof(File).optional();
      } else if (field.type === "checkbox") {
        schemaFields[field.id] = field.required
          ? z.literal(true, { errorMap: () => ({ message: `${field.label} is required` }) })
          : z.boolean().optional();
      } else {
        schemaFields[field.id] = field.required
          ? z.string().min(1, `${field.label} is required`)
          : z.string().optional();
      }
    });

    return z.object(schemaFields);
  };

  const formSchema = buildSchema();
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: initialData,
  });

  const handleSubmit = async (data: Record<string, any>) => {
    setIsSubmitting(true);
    try {
      await onSubmit(data);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderField = (field: FormField) => {
    switch (field.type) {
      case "text":
      case "date":
        return (
          <FormField
            key={field.id}
            control={form.control}
            name={field.id}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </FormLabel>
                <FormControl>
                  <Input
                    type={field.type}
                    placeholder={field.placeholder}
                    {...formField}
                    data-testid={`input-${field.id}`}
                  />
                </FormControl>
                {field.description && (
                  <p className="text-xs text-muted-foreground">{field.description}</p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case "textarea":
        return (
          <FormField
            key={field.id}
            control={form.control}
            name={field.id}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </FormLabel>
                <FormControl>
                  <Textarea
                    placeholder={field.placeholder}
                    {...formField}
                    data-testid={`textarea-${field.id}`}
                  />
                </FormControl>
                {field.description && (
                  <p className="text-xs text-muted-foreground">{field.description}</p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case "select":
        return (
          <FormField
            key={field.id}
            control={form.control}
            name={field.id}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </FormLabel>
                <Select
                  onValueChange={formField.onChange}
                  defaultValue={formField.value}
                >
                  <FormControl>
                    <SelectTrigger data-testid={`select-${field.id}`}>
                      <SelectValue placeholder={field.placeholder || "Select an option"} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {field.options?.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {field.description && (
                  <p className="text-xs text-muted-foreground">{field.description}</p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case "radio":
        return (
          <FormField
            key={field.id}
            control={form.control}
            name={field.id}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </FormLabel>
                <FormControl>
                  <RadioGroup
                    onValueChange={formField.onChange}
                    defaultValue={formField.value}
                    data-testid={`radio-${field.id}`}
                  >
                    {field.options?.map((option) => (
                      <div key={option} className="flex items-center gap-2">
                        <RadioGroupItem value={option} id={`${field.id}-${option}`} />
                        <Label htmlFor={`${field.id}-${option}`}>{option}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </FormControl>
                {field.description && (
                  <p className="text-xs text-muted-foreground">{field.description}</p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case "checkbox":
        return (
          <FormField
            key={field.id}
            control={form.control}
            name={field.id}
            render={({ field: formField }) => (
              <FormItem className="flex items-start gap-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={formField.value}
                    onCheckedChange={formField.onChange}
                    data-testid={`checkbox-${field.id}`}
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>
                    {field.label}
                    {field.required && <span className="text-destructive ml-1">*</span>}
                  </FormLabel>
                  {field.description && (
                    <p className="text-xs text-muted-foreground">{field.description}</p>
                  )}
                  <FormMessage />
                </div>
              </FormItem>
            )}
          />
        );

      case "file":
        return (
          <FormField
            key={field.id}
            control={form.control}
            name={field.id}
            render={({ field: formField }) => (
              <FormItem>
                <FormControl>
                  <DocumentUpload
                    label={field.label}
                    required={field.required}
                    accept={field.accept}
                    maxSizeMB={field.maxSizeMB}
                    description={field.description}
                    value={formField.value}
                    onChange={formField.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case "esignature":
        return (
          <FormField
            key={field.id}
            control={form.control}
            name={field.id}
            render={({ field: formField }) => (
              <FormItem>
                <FormControl>
                  <ESignature
                    value={formField.value}
                    onChange={formField.onChange}
                    agreementText={field.agreementText}
                    required={field.required}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        );

      default:
        return null;
    }
  };

  return (
    <Card className="p-6">
      <div className="space-y-6">
        {/* Form Header */}
        <div>
          <h2 className="text-2xl font-bold text-foreground" data-testid="text-form-title">
            {template.title}
          </h2>
          {template.description && (
            <p className="text-sm text-muted-foreground mt-2" data-testid="text-form-description">
              {template.description}
            </p>
          )}
        </div>

        {/* Form Fields */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {template.fields.map(renderField)}

            {/* Submit Button */}
            <div className="flex justify-end pt-4">
              <Button
                type="submit"
                disabled={isSubmitting}
                data-testid="button-submit-form"
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {submitLabel}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </Card>
  );
}
