import { useEffect } from 'react';
import { UniversalModal, UniversalModalDescription, UniversalModalFooter, UniversalModalHeader, UniversalModalTitle, UniversalModalContent } from '@/components/ui/universal-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertCircle, Camera, MessageSquare, FileText, CheckSquare, Repeat } from 'lucide-react';
import type { Employee, Client } from '@shared/schema';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

const shiftSchema = z.object({
  employeeId: z.string().nullable(),
  position: z.string().min(1, "Position is required"),
  clockIn: z.string().min(1, "Start time is required"),
  clockOut: z.string().min(1, "End time is required"),
  notes: z.string().optional(),
  postOrders: z.array(z.string()),
  isOpenShift: z.boolean(),
  clientId: z.string().min(1, "Client is required"),
  location: z.string().min(1, "Location is required"),
  isRecurring: z.boolean(),
  recurrencePattern: z.enum(['daily', 'weekly', 'biweekly', 'monthly']),
  daysOfWeek: z.array(z.string()),
  endDate: z.string().optional(),
}).refine((data) => {
  if (!data.clockIn || !data.clockOut) return true;
  return data.clockOut > data.clockIn;
}, {
  message: "End time must be after start time",
  path: ["clockOut"],
});

export interface ShiftFormData {
  employeeId: string | null;
  position: string;
  clockIn: string;
  clockOut: string;
  notes: string;
  postOrders: string[];
  isOpenShift: boolean;
  clientId: string;
  location: string;
  isRecurring: boolean;
  recurrencePattern: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  daysOfWeek: string[];
  endDate: string;
}

export type DayOfWeek = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';

export const DAYS_OF_WEEK: { value: DayOfWeek; label: string }[] = [
  { value: 'monday', label: 'Mon' },
  { value: 'tuesday', label: 'Tue' },
  { value: 'wednesday', label: 'Wed' },
  { value: 'thursday', label: 'Thu' },
  { value: 'friday', label: 'Fri' },
  { value: 'saturday', label: 'Sat' },
  { value: 'sunday', label: 'Sun' },
];

export const POST_ORDER_TEMPLATES = [
  {
    id: '1',
    title: 'Security Patrol Requirements',
    description: 'Complete hourly patrols of all assigned areas',
    requiresAcknowledgment: true,
    requiresSignature: true,
    requiresPhotos: true,
    photoFrequency: 'hourly' as const,
    photoInstructions: 'Take photos of each checkpoint during patrol'
  },
  {
    id: '2',
    title: 'Opening Procedures',
    description: 'Follow all opening checklist items',
    requiresAcknowledgment: true,
    requiresSignature: false,
    requiresPhotos: false,
    photoFrequency: null,
    photoInstructions: null
  },
  {
    id: '3',
    title: 'Closing Procedures',
    description: 'Complete all closing duties and security checks',
    requiresAcknowledgment: true,
    requiresSignature: true,
    requiresPhotos: true,
    photoFrequency: 'at_completion' as const,
    photoInstructions: 'Document all secured areas before leaving'
  },
  {
    id: '4',
    title: 'Equipment Inspection',
    description: 'Inspect and document condition of all equipment',
    requiresAcknowledgment: true,
    requiresSignature: false,
    requiresPhotos: true,
    photoFrequency: 'hourly' as const,
    photoInstructions: 'Photo evidence of equipment status'
  }
];

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface ShiftCreationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shiftForm: ShiftFormData;
  setShiftForm: React.Dispatch<React.SetStateAction<ShiftFormData>>;
  modalPosition: { day: number; hour: number };
  employees: Employee[];
  clients: Client[];
  onCreateShift: () => void;
  isCreating: boolean;
  isCreatingRecurring: boolean;
  togglePostOrder: (orderId: string) => void;
}

import { useWorkspaceAccess } from '@/hooks/useWorkspaceAccess';

export function ShiftCreationModal({
  open,
  onOpenChange,
  shiftForm,
  setShiftForm,
  modalPosition,
  employees,
  clients,
  onCreateShift,
  isCreating,
  isCreatingRecurring,
  togglePostOrder,
}: ShiftCreationModalProps) {
  const { workspaceId } = useWorkspaceAccess();
  const form = useForm<z.infer<typeof shiftSchema>>({
    resolver: zodResolver(shiftSchema),
    defaultValues: shiftForm,
  });

  // Keep internal form in sync with external shiftForm
  useEffect(() => {
    form.reset(shiftForm);
  }, [shiftForm, form]);

  const handleSubmit = form.handleSubmit((values) => {
    // Generate ISO timestamps for backend
    const dateStr = new Date().toISOString().split('T')[0]; // Use current date for relative time inputs
    const startTime = new Date(`${dateStr}T${values.clockIn}`).toISOString();
    const endTime = new Date(`${dateStr}T${values.clockOut}`).toISOString();

    setShiftForm({
      ...values,
      startTime,
      endTime,
      workspaceId: workspaceId!,
    } as any);
    onCreateShift();
  });

  return (
    <UniversalModal open={open} onOpenChange={onOpenChange}>
      <UniversalModalContent size="md" className="overflow-y-auto">
        <Form {...form}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <UniversalModalHeader className="pb-2">
              <UniversalModalTitle className="text-base">New Shift</UniversalModalTitle>
              <UniversalModalDescription className="text-sm">
                {days[modalPosition.day]} at {modalPosition.hour}:00
              </UniversalModalDescription>
            </UniversalModalHeader>

            <div className="space-y-2.5">
              <FormField
                control={form.control}
                name="isOpenShift"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 p-2 rounded-md bg-muted/50 space-y-0">
                    <FormControl>
                      <Checkbox
                        id="open-shift"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="checkbox-open-shift"
                      />
                    </FormControl>
                    <FormLabel htmlFor="open-shift" className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <AlertCircle className="w-3.5 h-3.5 text-orange-600" />
                      <span className="font-medium">Open Shift</span>
                      <span className="text-xs text-muted-foreground ml-1">(AI fills)</span>
                    </FormLabel>
                  </FormItem>
                )}
              />

              {!form.watch('isOpenShift') && (
                <FormField
                  control={form.control}
                  name="employeeId"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-sm">Employee <span className="text-destructive">*</span></FormLabel>
                      <Select value={field.value || ''} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger id="employee" data-testid="select-employee">
                            <SelectValue placeholder="Select employee" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {employees.map(emp => (
                            <SelectItem key={emp.id} value={emp.id}>
                              {emp.firstName} {emp.lastName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <div className="grid grid-cols-2 gap-2">
                <FormField
                  control={form.control}
                  name="position"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-sm">Position <span className="text-destructive" aria-hidden="true">*</span></FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger id="position" data-testid="select-position">
                            <SelectValue placeholder="Select position" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="armed_guard">Armed Security Officer</SelectItem>
                          <SelectItem value="unarmed_guard">Unarmed Security Officer</SelectItem>
                          <SelectItem value="patrol_officer">Patrol Officer</SelectItem>
                          <SelectItem value="site_supervisor">Site Supervisor</SelectItem>
                          <SelectItem value="access_control">Access Control</SelectItem>
                          <SelectItem value="concierge">Concierge Security</SelectItem>
                          <SelectItem value="event_security">Event Security</SelectItem>
                          <SelectItem value="mobile_patrol">Mobile Patrol</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="clientId"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-sm">Client <span className="text-destructive" aria-hidden="true">*</span></FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger id="client" data-testid="select-client">
                            <SelectValue placeholder="Select client" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {clients.map(client => (
                            <SelectItem key={client.id} value={client.id}>
                              {client.companyName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel className="text-sm">Location <span className="text-destructive" aria-hidden="true">*</span></FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger id="location" data-testid="select-location">
                          <SelectValue placeholder="Select location" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="main_site">Main Site</SelectItem>
                        <SelectItem value="front_entrance">Front Entrance</SelectItem>
                        <SelectItem value="back_entrance">Back Entrance</SelectItem>
                        <SelectItem value="lobby">Lobby</SelectItem>
                        <SelectItem value="parking">Parking Area</SelectItem>
                        <SelectItem value="roving">Roving Patrol</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-2">
                <FormField
                  control={form.control}
                  name="clockIn"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-sm">Start <span className="text-destructive" aria-hidden="true">*</span></FormLabel>
                      <FormControl>
                        <Input
                          type="time"
                          data-testid="input-clock-in"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="clockOut"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-sm">End <span className="text-destructive" aria-hidden="true">*</span></FormLabel>
                      <FormControl>
                        <Input
                          type="time"
                          data-testid="input-clock-out"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel className="text-sm">Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Instructions..."
                        className="min-h-[60px] text-sm"
                        data-testid="textarea-notes"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isRecurring"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 p-2 rounded-md bg-muted/50 border-dashed border border-muted-foreground/20 space-y-0">
                    <FormControl>
                      <Checkbox
                        id="recurring-shift"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="checkbox-recurring"
                      />
                    </FormControl>
                    <FormLabel htmlFor="recurring-shift" className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <Repeat className="w-3.5 h-3.5 text-blue-600" />
                      <span className="font-medium">Make Recurring</span>
                      <span className="text-xs text-muted-foreground ml-1">(repeating shifts)</span>
                    </FormLabel>
                  </FormItem>
                )}
              />
              
              {form.watch('isRecurring') && (
                <div className="space-y-3 p-3 rounded-md bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/50">
                  <FormField
                    control={form.control}
                    name="recurrencePattern"
                    render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className="text-sm">Repeat Pattern</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-recurrence">
                              <SelectValue placeholder="Select pattern" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="daily">Daily</SelectItem>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="biweekly">Every 2 Weeks</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="daysOfWeek"
                    render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className="text-sm">Days of Week</FormLabel>
                        <div className="flex flex-wrap gap-1">
                          {DAYS_OF_WEEK.map((day) => (
                            <Button
                              key={day.value}
                              type="button"
                              variant={field.value.includes(day.value) ? 'default' : 'outline'}
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => {
                                const next = field.value.includes(day.value)
                                  ? field.value.filter(d => d !== day.value)
                                  : [...field.value, day.value];
                                field.onChange(next);
                              }}
                              data-testid={`day-${day.value}`}
                            >
                              {day.label}
                            </Button>
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel htmlFor="end-date" className="text-sm">End Date (optional)</FormLabel>
                        <FormControl>
                          <Input
                            id="end-date"
                            type="date"
                            data-testid="input-end-date"
                            {...field}
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">Leave empty for 30-day default</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
              
              <div className="space-y-1.5">
                <Label className="text-sm">Post Orders</Label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {POST_ORDER_TEMPLATES.map(order => {
                    const isSelected = form.watch('postOrders').includes(order.id);
                    return (
                      <div
                        key={order.id}
                        className={`border rounded-md p-2 cursor-pointer transition-colors ${
                          isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                        }`}
                        onClick={() => togglePostOrder(order.id)}
                        data-testid={`post-order-${order.id}`}
                      >
                        <div className="flex items-center gap-2">
                          <Checkbox checked={isSelected} />
                          <span className="text-xs font-medium flex-1">{order.title}</span>
                          <div className="flex gap-1">
                            {order.requiresAcknowledgment && (
                              <CheckSquare className="w-3 h-3 text-muted-foreground" />
                            )}
                            {order.requiresSignature && (
                              <FileText className="w-3 h-3 text-muted-foreground" />
                            )}
                            {order.requiresPhotos && (
                              <Camera className="w-3 h-3 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                        {order.photoInstructions && isSelected && (
                          <div className="mt-2 text-xs bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded p-2">
                            <MessageSquare className="w-3 h-3 inline mr-1" />
                            {order.photoInstructions}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <UniversalModalFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={(isCreating || isCreatingRecurring)}
                variant="default"
                data-testid="button-create-shift"
              >
                {isCreating || isCreatingRecurring ? 'Creating...' : form.watch('isRecurring') ? 'Create Recurring Shifts' : 'Create Shift'}
              </Button>
            </UniversalModalFooter>
          </form>
        </Form>
      </UniversalModalContent>
    </UniversalModal>
  );
}
