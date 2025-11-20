/**
 * ShiftBottomSheet - Bottom sheet for creating/editing shifts
 * Mobile-first with shadcn Drawer component
 */

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import type { Employee, Client, Shift } from '@shared/schema';

const shiftFormSchema = z.object({
  employeeId: z.string().optional(), // Optional for open shifts
  title: z.string().min(1, "Title/Position required"),
  clientId: z.string().min(1, "Client required"),
  startTime: z.string().min(1, "Start time required"),
  endTime: z.string().min(1, "End time required"),
  description: z.string().optional(),
});

type ShiftFormData = z.infer<typeof shiftFormSchema>;

interface ShiftBottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
  clients: Client[];
  selectedDate: Date;
  selectedEmployee?: Employee;
  editingShift?: Shift;
  onSubmit: (data: any) => Promise<void>;
  isSubmitting: boolean;
}

export function ShiftBottomSheet({
  open,
  onOpenChange,
  employees,
  clients,
  selectedDate,
  selectedEmployee,
  editingShift,
  onSubmit,
  isSubmitting,
}: ShiftBottomSheetProps) {
  const form = useForm<ShiftFormData>({
    resolver: zodResolver(shiftFormSchema),
    defaultValues: {
      employeeId: selectedEmployee?.id || '',
      title: '',
      clientId: '',
      startTime: '09:00',
      endTime: '17:00',
      description: '',
    },
  });

  // Reset form when editing shift or selected employee changes
  useEffect(() => {
    if (editingShift) {
      const start = new Date(editingShift.startTime);
      const end = new Date(editingShift.endTime);
      form.reset({
        employeeId: editingShift.employeeId || '',
        title: editingShift.title || '',
        clientId: editingShift.clientId || '',
        startTime: format(start, 'HH:mm'),
        endTime: format(end, 'HH:mm'),
        description: editingShift.description || '',
      });
    } else if (selectedEmployee) {
      form.reset({
        employeeId: selectedEmployee.id,
        title: selectedEmployee.role || '',
        clientId: '',
        startTime: '09:00',
        endTime: '17:00',
        description: '',
      });
    }
  }, [editingShift, selectedEmployee, form]);

  const handleSubmit = async (data: ShiftFormData) => {
    // Combine date with time
    const [startHours, startMinutes] = data.startTime.split(':');
    const [endHours, endMinutes] = data.endTime.split(':');
    
    const startTime = new Date(selectedDate);
    startTime.setHours(parseInt(startHours), parseInt(startMinutes), 0, 0);
    
    const endTime = new Date(selectedDate);
    endTime.setHours(parseInt(endHours), parseInt(endMinutes), 0, 0);
    
    // If end time is before start time, assume next day
    if (endTime < startTime) {
      endTime.setDate(endTime.getDate() + 1);
    }

    await onSubmit({
      ...data,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      status: 'scheduled',
    });
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent data-testid="shift-bottom-sheet">
        <div className="mx-auto w-full max-w-2xl">
          <DrawerHeader>
            <DrawerTitle>
              {editingShift ? 'Edit Shift' : 'Create New Shift'}
            </DrawerTitle>
            <DrawerDescription>
              {format(selectedDate, 'EEEE, MMMM d, yyyy')}
            </DrawerDescription>
          </DrawerHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="px-4 space-y-4">
              <FormField
                control={form.control}
                name="employeeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employee</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-employee">
                          <SelectValue placeholder="Select employee" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">Open Shift (Unassigned)</SelectItem>
                        {(employees || []).map((emp) => (
                          <SelectItem key={emp.id} value={emp.id}>
                            {emp.firstName} {emp.lastName} - {emp.role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title / Position</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g., Paramedic - Station 3" data-testid="input-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="clientId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-client">
                          <SelectValue placeholder="Select client" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(clients || []).map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.companyName || `${client.firstName} ${client.lastName}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Time</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} data-testid="input-start-time" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="endTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Time</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} data-testid="input-end-time" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Additional information..." rows={3} data-testid="input-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DrawerFooter className="px-0 pt-4">
                <div className="flex gap-3">
                  <DrawerClose asChild>
                    <Button variant="outline" className="flex-1" type="button" data-testid="button-cancel-shift">
                      Cancel
                    </Button>
                  </DrawerClose>
                  <Button
                    type="submit"
                    className="flex-1 bg-primary"
                    disabled={isSubmitting}
                    data-testid="button-save-shift"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      editingShift ? 'Update Shift' : 'Create Shift'
                    )}
                  </Button>
                </div>
              </DrawerFooter>
            </form>
          </Form>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
