/**
 * Pass-Down Composer
 * Specialized broadcast composer for security industry shift pass-downs
 * Allows supervisors to communicate incidents, notes, and instructions to incoming shift officers
 */

import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalContent } from '@/components/ui/universal-modal';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Send, Plus, X, AlertTriangle, FileText, Wrench, 
  CloudRain, Phone, Clipboard, Loader2, MapPin, Calendar
} from 'lucide-react';
import { useCreateBroadcast } from '@/hooks/useBroadcasts';
import { useSites } from '@/hooks/useSites';
import { cn } from '@/lib/utils';
import type { PassDownData, CreateBroadcastRequest } from '@shared/types/broadcasts';

// ============================================
// FORM SCHEMA
// ============================================

const passDownFormSchema = z.object({
  siteId: z.string().min(1, 'Site is required'),
  shiftDate: z.string().min(1, 'Shift date is required'),
  title: z.string().optional(),
  additionalNotes: z.string().optional(),
  
  // Pass-down sections
  incidents: z.array(z.object({
    time: z.string().optional(),
    description: z.string().min(1),
    severity: z.enum(['low', 'medium', 'high']),
    resolved: z.boolean(),
  })).optional(),
  
  clientNotes: z.array(z.object({
    note: z.string().min(1),
    important: z.boolean(),
  })).optional(),
  
  equipmentIssues: z.array(z.object({
    equipment: z.string().min(1),
    issue: z.string().min(1),
    reported: z.boolean(),
  })).optional(),
  
  specialInstructions: z.array(z.string()).optional(),
  
  weatherAlert: z.object({
    enabled: z.boolean(),
    condition: z.string().optional(),
    advisory: z.string().optional(),
  }).optional(),
  
  keyContacts: z.array(z.object({
    name: z.string().min(1),
    role: z.string().min(1),
    phone: z.string().optional(),
  })).optional(),
});

type PassDownFormData = z.infer<typeof passDownFormSchema>;

// ============================================
// MAIN COMPONENT
// ============================================

interface PassDownComposerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultSiteId?: string;
}

export function PassDownComposer({ open, onOpenChange, defaultSiteId }: PassDownComposerProps) {
  const createBroadcast = useCreateBroadcast();
  const { sites } = useSites();

  const form = useForm<PassDownFormData>({
    resolver: zodResolver(passDownFormSchema),
    defaultValues: {
      siteId: defaultSiteId || '',
      shiftDate: new Date().toISOString().split('T')[0],
      title: '',
      additionalNotes: '',
      incidents: [],
      clientNotes: [],
      equipmentIssues: [],
      specialInstructions: [],
      weatherAlert: { enabled: false },
      keyContacts: [],
    },
  });

  const { fields: incidentFields, append: appendIncident, remove: removeIncident } = useFieldArray({
    control: form.control,
    name: 'incidents',
  });

  const { fields: clientNoteFields, append: appendClientNote, remove: removeClientNote } = useFieldArray({
    control: form.control,
    name: 'clientNotes',
  });

  const { fields: equipmentFields, append: appendEquipment, remove: removeEquipment } = useFieldArray({
    control: form.control,
    name: 'equipmentIssues',
  });

  const { fields: contactFields, append: appendContact, remove: removeContact } = useFieldArray({
    control: form.control,
    name: 'keyContacts',
  });

  const [instructions, setInstructions] = useState<string[]>([]);
  const [newInstruction, setNewInstruction] = useState('');

  const watchWeatherEnabled = form.watch('weatherAlert.enabled');
  const selectedSite = sites.find(s => s.id === form.watch('siteId'));

  const onSubmit = async (data: PassDownFormData) => {
    // Build pass-down data
    const passDownData: PassDownData = {
      incidents: data.incidents?.filter(i => i.description) || [],
      clientNotes: data.clientNotes?.filter(n => n.note) || [],
      equipmentIssues: data.equipmentIssues?.filter(e => e.equipment && e.issue) || [],
      specialInstructions: instructions.filter(i => i.trim()),
      keyContacts: data.keyContacts?.filter(c => c.name && c.role) || [],
    };

    if (data.weatherAlert?.enabled && data.weatherAlert.condition) {
      passDownData.weatherAlert = {
        condition: data.weatherAlert.condition,
        advisory: data.weatherAlert.advisory || '',
      };
    }

    // Build title
    const title = data.title || `Pass-Down: ${selectedSite?.name || 'Site'} - ${new Date(data.shiftDate).toLocaleDateString()}`;

    // Build message
    let message = `Shift pass-down for ${selectedSite?.name || 'Site'} on ${new Date(data.shiftDate).toLocaleDateString()}.`;
    
    if (data.additionalNotes) {
      message += `\n\n${data.additionalNotes}`;
    }

    const countSummary = [];
    if (passDownData.incidents?.length) countSummary.push(`${passDownData.incidents.length} incident(s)`);
    if (passDownData.clientNotes?.length) countSummary.push(`${passDownData.clientNotes.length} client note(s)`);
    if (passDownData.equipmentIssues?.length) countSummary.push(`${passDownData.equipmentIssues.length} equipment issue(s)`);
    if (passDownData.specialInstructions?.length) countSummary.push(`${passDownData.specialInstructions.length} instruction(s)`);
    
    if (countSummary.length) {
      message += `\n\nIncludes: ${countSummary.join(', ')}.`;
    }

    const request: CreateBroadcastRequest = {
      type: 'pass_down',
      priority: passDownData.incidents?.some(i => i.severity === 'high') ? 'high' : 'normal',
      title,
      message,
      targetType: 'site_shift',
      targetConfig: {
        type: 'site_shift',
        siteId: data.siteId,
        shiftDate: data.shiftDate,
      },
      actionType: 'acknowledge',
      actionConfig: {
        type: 'acknowledge',
        buttonLabel: 'I\'ve Read This',
      },
      passDownData,
    };

    try {
      await createBroadcast.mutateAsync(request);
      onOpenChange(false);
      form.reset();
      setInstructions([]);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const addInstruction = () => {
    if (newInstruction.trim()) {
      setInstructions(prev => [...prev, newInstruction.trim()]);
      setNewInstruction('');
    }
  };

  return (
    <UniversalModal open={open} onOpenChange={onOpenChange}>
      <UniversalModalContent side="right" className="w-full sm:max-w-xl">
        <UniversalModalHeader>
          <UniversalModalTitle className="flex items-center gap-2">
            <Clipboard className="h-5 w-5" />
            Create Pass-Down
          </UniversalModalTitle>
        </UniversalModalHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4">
          <ScrollArea className="h-[calc(100vh-180px)] pr-4">
            <div className="space-y-6">
              
              {/* Site & Date Selection */}
              <Card>
                <CardContent className="pt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> Site
                      </Label>
                      <Select
                        value={form.watch('siteId')}
                        onValueChange={(v) => form.setValue('siteId', v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select site..." />
                        </SelectTrigger>
                        <SelectContent>
                          {sites.map(site => (
                            <SelectItem key={site.id} value={site.id}>
                              {site.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> Shift Date
                      </Label>
                      <Input
                        type="date"
                        {...form.register('shiftDate')}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Title (Optional)</Label>
                    <Input
                      placeholder="Custom title or leave blank for auto-generated"
                      {...form.register('title')}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Weather Alert */}
              <Card>
                <CardHeader className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <CloudRain className="h-4 w-4" />
                      Weather Alert
                    </CardTitle>
                    <Switch
                      checked={watchWeatherEnabled}
                      onCheckedChange={(checked) => form.setValue('weatherAlert.enabled', checked)}
                    />
                  </div>
                </CardHeader>
                {watchWeatherEnabled && (
                  <CardContent className="pt-0 space-y-3">
                    <Input
                      placeholder="Condition (e.g. Heavy Rain, Extreme Heat)"
                      {...form.register('weatherAlert.condition')}
                    />
                    <Textarea
                      placeholder="Advisory (e.g. Stay hydrated, seek shelter if lightning)"
                      rows={2}
                      {...form.register('weatherAlert.advisory')}
                    />
                  </CardContent>
                )}
              </Card>

              {/* Incidents */}
              <Card>
                <CardHeader className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Incidents
                      {incidentFields.length > 0 && (
                        <Badge variant="secondary">{incidentFields.length}</Badge>
                      )}
                    </CardTitle>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => appendIncident({ time: '', description: '', severity: 'low', resolved: false })}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add
                    </Button>
                  </div>
                </CardHeader>
                {incidentFields.length > 0 && (
                  <CardContent className="pt-0 space-y-3">
                    {incidentFields.map((field, index) => (
                      <div key={field.id} className="p-3 bg-muted/50 rounded-lg space-y-2">
                        <div className="flex items-center gap-2">
                          <Input
                            placeholder="Time (e.g. 2:30 AM)"
                            className="w-24"
                            {...form.register(`incidents.${index}.time`)}
                          />
                          <Select
                            value={form.watch(`incidents.${index}.severity`)}
                            onValueChange={(v) => form.setValue(`incidents.${index}.severity`, v as any)}
                          >
                            <SelectTrigger className="w-24">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low">Low</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => removeIncident(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <Textarea
                          placeholder="Describe the incident..."
                          rows={2}
                          {...form.register(`incidents.${index}.description`)}
                        />
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={form.watch(`incidents.${index}.resolved`)}
                            onCheckedChange={(checked) => form.setValue(`incidents.${index}.resolved`, checked)}
                          />
                          <Label className="text-xs">Resolved</Label>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                )}
              </Card>

              {/* Client Notes */}
              <Card>
                <CardHeader className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Client Notes
                      {clientNoteFields.length > 0 && (
                        <Badge variant="secondary">{clientNoteFields.length}</Badge>
                      )}
                    </CardTitle>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => appendClientNote({ note: '', important: false })}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add
                    </Button>
                  </div>
                </CardHeader>
                {clientNoteFields.length > 0 && (
                  <CardContent className="pt-0 space-y-2">
                    {clientNoteFields.map((field, index) => (
                      <div key={field.id} className="flex items-start gap-2">
                        <Textarea
                          placeholder="Client note..."
                          rows={2}
                          className="flex-1"
                          {...form.register(`clientNotes.${index}.note`)}
                        />
                        <div className="flex flex-col gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant={form.watch(`clientNotes.${index}.important`) ? "default" : "outline"}
                            className="h-8 w-8"
                            onClick={() => form.setValue(`clientNotes.${index}.important`, !form.watch(`clientNotes.${index}.important`))}
                            title="Mark as important"
                          >
                            ⚠️
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => removeClientNote(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                )}
              </Card>

              {/* Equipment Issues */}
              <Card>
                <CardHeader className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Wrench className="h-4 w-4" />
                      Equipment Issues
                      {equipmentFields.length > 0 && (
                        <Badge variant="secondary">{equipmentFields.length}</Badge>
                      )}
                    </CardTitle>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => appendEquipment({ equipment: '', issue: '', reported: false })}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add
                    </Button>
                  </div>
                </CardHeader>
                {equipmentFields.length > 0 && (
                  <CardContent className="pt-0 space-y-2">
                    {equipmentFields.map((field, index) => (
                      <div key={field.id} className="flex items-start gap-2">
                        <div className="flex-1 space-y-2">
                          <Input
                            placeholder="Equipment (e.g. Gate 3 keypad)"
                            {...form.register(`equipmentIssues.${index}.equipment`)}
                          />
                          <Input
                            placeholder="Issue description"
                            {...form.register(`equipmentIssues.${index}.issue`)}
                          />
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={form.watch(`equipmentIssues.${index}.reported`)}
                              onCheckedChange={(checked) => form.setValue(`equipmentIssues.${index}.reported`, checked)}
                            />
                            <Label className="text-xs">Already reported</Label>
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => removeEquipment(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                )}
              </Card>

              {/* Special Instructions */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    📌 Special Instructions
                    {instructions.length > 0 && (
                      <Badge variant="secondary">{instructions.length}</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {instructions.map((inst, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                      <span className="flex-1 text-sm">{inst}</span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => setInstructions(instructions.filter((_, i) => i !== index))}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add instruction..."
                      value={newInstruction}
                      onChange={(e) => setNewInstruction(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addInstruction())}
                    />
                    <Button type="button" size="sm" onClick={addInstruction}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Key Contacts */}
              <Card>
                <CardHeader className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      Key Contacts
                      {contactFields.length > 0 && (
                        <Badge variant="secondary">{contactFields.length}</Badge>
                      )}
                    </CardTitle>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => appendContact({ name: '', role: '', phone: '' })}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add
                    </Button>
                  </div>
                </CardHeader>
                {contactFields.length > 0 && (
                  <CardContent className="pt-0 space-y-2">
                    {contactFields.map((field, index) => (
                      <div key={field.id} className="flex items-center gap-2">
                        <Input
                          placeholder="Name"
                          className="flex-1"
                          {...form.register(`keyContacts.${index}.name`)}
                        />
                        <Input
                          placeholder="Role"
                          className="w-24"
                          {...form.register(`keyContacts.${index}.role`)}
                        />
                        <Input
                          placeholder="Phone"
                          className="w-28"
                          {...form.register(`keyContacts.${index}.phone`)}
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => removeContact(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                )}
              </Card>

              {/* Additional Notes */}
              <div className="space-y-2">
                <Label>Additional Notes (Optional)</Label>
                <Textarea
                  placeholder="Any other information for the incoming shift..."
                  rows={3}
                  {...form.register('additionalNotes')}
                />
              </div>

            </div>
          </ScrollArea>

          {/* Submit */}
          <div className="flex gap-2 pt-4 border-t mt-4">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={createBroadcast.isPending}
            >
              {createBroadcast.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Pass-Down
                </>
              )}
            </Button>
          </div>
        </form>
      </UniversalModalContent>
    </UniversalModal>
  );
}

export default PassDownComposer;
