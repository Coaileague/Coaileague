/**
 * Example: Employee Form with Universal Transition Overlay
 * 
 * This example shows how to integrate the universal transition system
 * into a typical form submission flow with success/error handling.
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useTransition } from "@/contexts/transition-context";
// DEPRECATED: transition-utils has been removed in favor of Canvas Hub TransitionLoader.
// Use useTransitionLoader() from '@/components/canvas-hub/TransitionLoader' instead.
// import { handleFormSubmissionWithTransition, showSuccessTransition } from "@/lib/transition-utils";
import { apiRequest } from "@/lib/queryClient";

const employeeSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
});

type EmployeeFormData = z.infer<typeof employeeSchema>;

export default function EmployeeFormExample() {
  const transition = useTransition();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<EmployeeFormData>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
    },
  });

  const onSubmit = async (data: EmployeeFormData) => {
    setIsLoading(true);

    // Using the utility function for automatic transition handling
    // @ts-expect-error — TS migration: fix in refactoring sprint
    await handleFormSubmissionWithTransition(
      transition,
      () => apiRequest("POST", "/api/employees", data),
      {
        loadingMessage: "Creating employee...",
        successMessage: "Employee added successfully!",
        errorMessage: "Failed to create employee",
        redirectTo: "/employees" // Auto-redirect on success
      }
    );

    setIsLoading(false);
  };

  // Alternative: Manual transition control for more customization
  const onSubmitManual = async (data: EmployeeFormData) => {
    setIsLoading(true);

    // Show loading overlay
    transition.showTransition({
      status: "loading",
      message: "Creating employee...",
      submessage: "Please wait while we process your request"
    });

    try {
      const result = await apiRequest("POST", "/api/employees", data);

      // Show success with custom message and redirect
      // @ts-expect-error — TS migration: fix in refactoring sprint
      showSuccessTransition(
        transition,
        "Employee Added!",
        "/employees",
        `${data.firstName} ${data.lastName} has been added to your team`
      );
    } catch (error: any) {
      // Show error overlay
      transition.updateTransition({
        status: "error",
        message: "Failed to Create Employee",
        submessage: error.message || "Please try again",
        duration: 3000,
        onComplete: () => transition.hideTransition()
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="firstName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>First Name</FormLabel>
              <FormControl>
                <Input {...field} disabled={isLoading} data-testid="input-first-name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="lastName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Last Name</FormLabel>
              <FormControl>
                <Input {...field} disabled={isLoading} data-testid="input-last-name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input {...field} type="email" disabled={isLoading} data-testid="input-email" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone (Optional)</FormLabel>
              <FormControl>
                <Input {...field} type="tel" disabled={isLoading} data-testid="input-phone" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isLoading} data-testid="button-submit">
          {isLoading ? "Creating..." : "Add Employee"}
        </Button>
      </form>
    </Form>
  );
}
