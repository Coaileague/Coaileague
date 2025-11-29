/**
 * ShiftBottomSheet - Compact professional shift creation/editing
 * Sling-inspired design with tight spacing and polished UI
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
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Clock, User, Briefcase, MapPin, FileText, Sparkles, X } from 'lucide-react';
import { LogoMark } from '@/components/ui/logo-mark';
import type { Employee, Client, Shift } from '@shared/schema';

const shiftFormSchema = z.object({
  employeeId: z.string().optional(),
  title: z.string().min(1, "Position required"),
  clientId: z.string().min(1, "Client required"),
  location: z.string().optional(),
  startTime: z.string().min(1, "Start time required"),
  endTime: z.string().min(1, "End time required"),
  notes: z.string().optional(),
  isOpenShift: z.boolean().default(false),
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
  const [isOpenShift, setIsOpenShift] = useState(false);
  
  const form = useForm<ShiftFormData>({
    resolver: zodResolver(shiftFormSchema),
    defaultValues: {
      employeeId: selectedEmployee?.id || '',
      title: '',
      clientId: '',
      location: '',
      startTime: '09:00',
      endTime: '17:00',
      notes: '',
      isOpenShift: false,
    },
  });

  useEffect(() => {
    if (editingShift) {
      const start = new Date(editingShift.startTime);
      const end = new Date(editingShift.endTime);
      const isOpen = !editingShift.employeeId;
      setIsOpenShift(isOpen);
      form.reset({
        employeeId: editingShift.employeeId || '',
        title: editingShift.title || '',
        clientId: editingShift.clientId || '',
        location: editingShift.location || '',
        startTime: format(start, 'HH:mm'),
        endTime: format(end, 'HH:mm'),
        notes: editingShift.description || '',
        isOpenShift: isOpen,
      });
    } else if (selectedEmployee) {
      setIsOpenShift(false);
      form.reset({
        employeeId: selectedEmployee.id,
        title: selectedEmployee.role || '',
        clientId: '',
        location: '',
        startTime: '09:00',
        endTime: '17:00',
        notes: '',
        isOpenShift: false,
      });
    } else {
      setIsOpenShift(false);
      form.reset({
        employeeId: '',
        title: '',
        clientId: '',
        location: '',
        startTime: '09:00',
        endTime: '17:00',
        notes: '',
        isOpenShift: false,
      });
    }
  }, [editingShift, selectedEmployee, form, open]);

  const handleSubmit = async (data: ShiftFormData) => {
    const [startHours, startMinutes] = data.startTime.split(':');
    const [endHours, endMinutes] = data.endTime.split(':');
    
    const startTime = new Date(selectedDate);
    startTime.setHours(parseInt(startHours), parseInt(startMinutes), 0, 0);
    
    const endTime = new Date(selectedDate);
    endTime.setHours(parseInt(endHours), parseInt(endMinutes), 0, 0);
    
    if (endTime < startTime) {
      endTime.setDate(endTime.getDate() + 1);
    }

    await onSubmit({
      ...data,
      employeeId: isOpenShift ? null : (data.employeeId || null),
      description: data.notes,
      location: data.location,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      status: 'scheduled',
    });
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent 
        className="max-h-[85vh] focus:outline-none"
        data-testid="shift-bottom-sheet"
      >
        <div className="mx-auto w-full max-w-md">
          <DrawerHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LogoMark size="sm" />
                <div>
                  <DrawerTitle className="text-base font-semibold">
                    {editingShift ? 'Edit Shift' : 'New Shift'}
                  </DrawerTitle>
                  <p className="text-xs text-muted-foreground">
                    {format(selectedDate, 'EEE, MMM d')}
                  </p>
                </div>
              </div>
              <DrawerClose asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <X className="h-4 w-4" />
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="px-4 pb-4 space-y-3">
              
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  <Label htmlFor="open-shift" className="text-sm font-medium cursor-pointer">
                    Open Shift
                  </Label>
                  <span className="text-xs text-muted-foreground">(AI fills)</span>
                </div>
                <Switch
                  id="open-shift"
                  checked={isOpenShift}
                  onCheckedChange={(checked) => {
                    setIsOpenShift(checked);
                    if (checked) {
                      form.setValue('employeeId', '');
                    }
                  }}
                  data-testid="switch-open-shift"
                />
              </div>

              {!isOpenShift && (
                <FormField
                  control={form.control}
                  name="employeeId"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-xs font-medium flex items-center gap-1.5">
                        <User className="h-3 w-3" />
                        Employee
                      </FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-9 text-sm" data-testid="select-employee">
                            <SelectValue placeholder="Select employee" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Array.isArray(employees) && employees.map((emp) => (
                            <SelectItem key={emp.id} value={emp.id} className="text-sm">
                              {emp.firstName} {emp.lastName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
              )}

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-xs font-medium flex items-center gap-1.5">
                        <Briefcase className="h-3 w-3" />
                        Position <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          placeholder="Role" 
                          className="h-9 text-sm"
                          data-testid="input-title" 
                        />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="clientId"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-xs font-medium">
                        Client
                      </FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-9 text-sm" data-testid="select-client">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Array.isArray(clients) && clients.map((client) => (
                            <SelectItem key={client.id} value={client.id} className="text-sm">
                              {client.companyName || `${client.firstName} ${client.lastName}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-xs font-medium flex items-center gap-1.5">
                      <MapPin className="h-3 w-3" />
                      Location
                    </FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="Area/Site" 
                        className="h-9 text-sm"
                        data-testid="input-location" 
                      />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-xs font-medium flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        Start
                      </FormLabel>
                      <FormControl>
                        <Input 
                          type="time" 
                          {...field} 
                          className="h-9 text-sm"
                          data-testid="input-start-time" 
                        />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="endTime"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-xs font-medium">
                        End
                      </FormLabel>
                      <FormControl>
                        <Input 
                          type="time" 
                          {...field} 
                          className="h-9 text-sm"
                          data-testid="input-end-time" 
                        />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-xs font-medium flex items-center gap-1.5">
                      <FileText className="h-3 w-3" />
                      Notes
                    </FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        placeholder="Additional details..." 
                        rows={2} 
                        className="text-sm resize-none min-h-[60px]"
                        data-testid="input-notes" 
                      />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <DrawerFooter className="px-0 pt-3 pb-0">
                <div className="flex gap-2">
                  <DrawerClose asChild>
                    <Button 
                      variant="outline" 
                      className="flex-1 h-10" 
                      type="button" 
                      data-testid="button-cancel-shift"
                    >
                      Cancel
                    </Button>
                  </DrawerClose>
                  <Button
                    type="submit"
                    className="flex-1 h-10"
                    disabled={isSubmitting}
                    data-testid="button-save-shift"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      editingShift ? 'Update' : 'Create Shift'
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
