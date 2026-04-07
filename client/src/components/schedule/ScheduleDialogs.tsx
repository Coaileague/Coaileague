import { useState, useEffect } from 'react';
import { UniversalModal, UniversalModalDescription, UniversalModalFooter, UniversalModalHeader, UniversalModalTitle, UniversalModalContent } from '@/components/ui/universal-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Trash2, ArrowRightLeft, CopyPlus, Edit2 } from 'lucide-react';
import { TrinityIconStatic } from '@/components/trinity-button';
import type { Shift, Employee, Client } from '@shared/schema';

interface EscalationRule {
  level: number;
  condition: string;
  timeout: string;
  action: string;
}

interface DuplicateShiftModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedShift: Shift | null;
  duplicateTargetDate: string;
  setDuplicateTargetDate: (date: string) => void;
  duplicateTargetEmployee: string | null;
  setDuplicateTargetEmployee: (id: string | null) => void;
  employees: Employee[];
  onDuplicate: (params: { shiftId: string; targetDate: string; targetEmployeeId?: string }) => void;
  isPending: boolean;
}

export function DuplicateShiftModal({
  open,
  onOpenChange,
  selectedShift,
  duplicateTargetDate,
  setDuplicateTargetDate,
  duplicateTargetEmployee,
  setDuplicateTargetEmployee,
  employees,
  onDuplicate,
  isPending,
}: DuplicateShiftModalProps) {
  return (
    <UniversalModal open={open} onOpenChange={onOpenChange}>
      <UniversalModalContent size="md" className="overflow-y-auto top-[52%]">
        <UniversalModalHeader className="border-b border-border/40 pb-3">
          <UniversalModalTitle className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-9 h-9 rounded-md bg-blue-500/10 shrink-0">
              <CopyPlus className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <div>Duplicate Shift</div>
              <UniversalModalDescription className="mt-0.5">
                Copy this shift to another date
              </UniversalModalDescription>
            </div>
          </UniversalModalTitle>
        </UniversalModalHeader>
        
        {selectedShift && (
          <div className="space-y-4">
            <div className="p-3 rounded-lg border border-border/50 text-sm">
              <div className="font-medium">{selectedShift.title}</div>
              <div className="text-muted-foreground">
                {new Date(selectedShift.startTime).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at {new Date(selectedShift.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            
            <div className="space-y-1.5">
              <Label htmlFor="target-date">Target Date</Label>
              <Input
                id="target-date"
                type="date"
                value={duplicateTargetDate}
                onChange={(e) => setDuplicateTargetDate(e.target.value)}
                data-testid="input-duplicate-date"
              />
            </div>
            
            <div className="space-y-1.5">
              <Label htmlFor="target-employee">Assign to Employee (optional)</Label>
              <Select value={duplicateTargetEmployee || ''} onValueChange={setDuplicateTargetEmployee}>
                <SelectTrigger id="target-employee" data-testid="select-duplicate-employee">
                  <SelectValue placeholder="Same employee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_keep">Keep same employee</SelectItem>
                  {employees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        
        <UniversalModalFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (selectedShift && duplicateTargetDate) {
                onDuplicate({
                  shiftId: selectedShift.id,
                  targetDate: duplicateTargetDate,
                  targetEmployeeId: duplicateTargetEmployee === '_keep' ? undefined : duplicateTargetEmployee || undefined,
                });
              }
            }}
            disabled={isPending || !duplicateTargetDate}
            className="bg-gradient-to-r from-blue-500 to-cyan-500"
            data-testid="button-confirm-duplicate"
          >
            {isPending ? 'Duplicating...' : 'Duplicate Shift'}
          </Button>
        </UniversalModalFooter>
      </UniversalModalContent>
    </UniversalModal>
  );
}

interface SwapRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedShift: Shift | null;
  swapReason: string;
  setSwapReason: (reason: string) => void;
  swapTargetEmployee: string | null;
  setSwapTargetEmployee: (id: string | null) => void;
  employees: Employee[];
  onRequestSwap: (params: { shiftId: string; reason: string; targetEmployeeId?: string }) => void;
  isPending: boolean;
}

export function SwapRequestModal({
  open,
  onOpenChange,
  selectedShift,
  swapReason,
  setSwapReason,
  swapTargetEmployee,
  setSwapTargetEmployee,
  employees,
  onRequestSwap,
  isPending,
}: SwapRequestModalProps) {
  return (
    <UniversalModal open={open} onOpenChange={onOpenChange}>
      <UniversalModalContent size="md" className="overflow-y-auto top-[52%]">
        <UniversalModalHeader className="border-b border-border/40 pb-3">
          <UniversalModalTitle className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-9 h-9 rounded-md bg-orange-500/10 shrink-0">
              <ArrowRightLeft className="w-4 h-4 text-orange-600" />
            </div>
            <div>
              <div>Request Shift Swap</div>
              <UniversalModalDescription className="mt-0.5">
                Request to swap this shift with another employee
              </UniversalModalDescription>
            </div>
          </UniversalModalTitle>
        </UniversalModalHeader>
        
        {selectedShift && (
          <div className="space-y-4">
            <div className="p-3 rounded-lg border border-border/50 text-sm">
              <div className="font-medium">{selectedShift.title}</div>
              <div className="text-muted-foreground">
                {new Date(selectedShift.startTime).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at {new Date(selectedShift.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            
            <div className="space-y-1.5">
              <Label htmlFor="swap-reason">Reason for Swap</Label>
              <Textarea
                id="swap-reason"
                value={swapReason}
                onChange={(e) => setSwapReason(e.target.value)}
                placeholder="Why do you need to swap this shift?"
                className="min-h-[80px]"
                data-testid="textarea-swap-reason"
              />
            </div>
            
            <div className="space-y-1.5">
              <Label htmlFor="swap-target">Preferred Swap With (optional)</Label>
              <Select value={swapTargetEmployee || ''} onValueChange={setSwapTargetEmployee}>
                <SelectTrigger id="swap-target" data-testid="select-swap-target">
                  <SelectValue placeholder="Anyone available" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_any">Anyone available</SelectItem>
                  {employees.filter(emp => emp.id !== selectedShift.employeeId).map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Manager approval required</p>
            </div>
          </div>
        )}
        
        <UniversalModalFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (selectedShift) {
                onRequestSwap({
                  shiftId: selectedShift.id,
                  reason: swapReason,
                  targetEmployeeId: swapTargetEmployee === '_any' ? undefined : swapTargetEmployee || undefined,
                });
              }
            }}
            disabled={isPending}
            className="bg-gradient-to-r from-orange-500 to-amber-500"
            data-testid="button-confirm-swap"
          >
            {isPending ? 'Requesting...' : 'Request Swap'}
          </Button>
        </UniversalModalFooter>
      </UniversalModalContent>
    </UniversalModal>
  );
}

export interface EditShiftFormData {
  employeeId: string | null;
  date: string;
  startTime: string;
  endTime: string;
  clientId: string;
  description: string;
  title: string;
}

interface EditShiftModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedShift: Shift | null;
  employees: Employee[];
  clients: Client[];
  onSave: (params: { shiftId: string; data: Partial<EditShiftFormData> }) => void;
  isPending: boolean;
}

export function EditShiftModal({
  open,
  onOpenChange,
  selectedShift,
  employees,
  clients,
  onSave,
  isPending,
}: EditShiftModalProps) {
  const [form, setForm] = useState<EditShiftFormData>({
    employeeId: null,
    date: '',
    startTime: '',
    endTime: '',
    clientId: '',
    description: '',
    title: '',
  });

  useEffect(() => {
    if (selectedShift && open) {
      const startDate = new Date(selectedShift.startTime);
      const endDate = new Date(selectedShift.endTime);
      setForm({
        employeeId: selectedShift.employeeId || null,
        date: startDate.toISOString().split('T')[0],
        startTime: startDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }),
        endTime: endDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }),
        clientId: selectedShift.clientId || '',
        description: selectedShift.description || '',
        title: selectedShift.title || '',
      });
    }
  }, [selectedShift, open]);

  const handleSave = () => {
    if (!selectedShift) return;

    const startDateTime = new Date(`${form.date}T${form.startTime}:00`);
    const endDateTime = new Date(`${form.date}T${form.endTime}:00`);

    if (endDateTime <= startDateTime) {
      endDateTime.setDate(endDateTime.getDate() + 1);
    }

    onSave({
      shiftId: selectedShift.id,
      data: {
        employeeId: form.employeeId,
        title: form.title || undefined,
        clientId: form.clientId || undefined,
        description: form.description || undefined,
        date: form.date,
        startTime: startDateTime.toISOString(),
        endTime: endDateTime.toISOString(),
      },
    });
  };

  return (
    <UniversalModal open={open} onOpenChange={onOpenChange}>
      <UniversalModalContent size="md" className="overflow-y-auto top-[52%]">
        <UniversalModalHeader className="border-b border-border/40 pb-3">
          <UniversalModalTitle className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-9 h-9 rounded-md bg-emerald-500/10 shrink-0">
              <Edit2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <div>Edit Shift</div>
              <UniversalModalDescription className="mt-0.5">
                Update shift details
              </UniversalModalDescription>
            </div>
          </UniversalModalTitle>
        </UniversalModalHeader>

        {selectedShift && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-title">Shift Title</Label>
              <Input
                id="edit-title"
                value={form.title}
                onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="e.g. Morning Patrol"
                data-testid="input-edit-title"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-employee">Employee</Label>
              <Select
                value={form.employeeId || '_open'}
                onValueChange={(val) => setForm(prev => ({ ...prev, employeeId: val === '_open' ? null : val }))}
              >
                <SelectTrigger id="edit-employee" data-testid="select-edit-employee">
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_open">Open Shift (Unassigned)</SelectItem>
                  {employees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-date">Date</Label>
              <Input
                id="edit-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm(prev => ({ ...prev, date: e.target.value }))}
                data-testid="input-edit-date"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-start-time">Start Time</Label>
                <Input
                  id="edit-start-time"
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm(prev => ({ ...prev, startTime: e.target.value }))}
                  data-testid="input-edit-start-time"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-end-time">End Time</Label>
                <Input
                  id="edit-end-time"
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm(prev => ({ ...prev, endTime: e.target.value }))}
                  data-testid="input-edit-end-time"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-client">Client</Label>
              <Select
                value={form.clientId || '_none'}
                onValueChange={(val) => setForm(prev => ({ ...prev, clientId: val === '_none' ? '' : val }))}
              >
                <SelectTrigger id="edit-client" data-testid="select-edit-client">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">No client</SelectItem>
                  {clients.map(client => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.companyName || `${client.firstName} ${client.lastName}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-description">Notes</Label>
              <Textarea
                id="edit-description"
                value={form.description}
                onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Shift notes..."
                className="min-h-[80px]"
                data-testid="textarea-edit-description"
              />
            </div>
          </div>
        )}

        <UniversalModalFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isPending || !form.date || !form.startTime || !form.endTime}
            data-testid="button-confirm-edit"
          >
            {isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </UniversalModalFooter>
      </UniversalModalContent>
    </UniversalModal>
  );
}

interface ShiftActionDialogProps {
  selectedShift: Shift | null;
  onClose: () => void;
  employees: Employee[];
  clients: Client[];
  getEmployeeColor: (id: string) => string;
  onShowEditModal: () => void;
  onShowDuplicateModal: () => void;
  onShowSwapModal: () => void;
  onAIFill: (shiftId: string) => void;
  onDelete: (shiftId: string) => void;
  isAIFillPending: boolean;
  isDeletePending: boolean;
  showEditModal: boolean;
  showDuplicateModal: boolean;
  showSwapModal: boolean;
}

export function ShiftActionDialog({
  selectedShift,
  onClose,
  employees,
  clients,
  getEmployeeColor,
  onShowEditModal,
  onShowDuplicateModal,
  onShowSwapModal,
  onAIFill,
  onDelete,
  isAIFillPending,
  isDeletePending,
  showEditModal,
  showDuplicateModal,
  showSwapModal,
}: ShiftActionDialogProps) {
  const isOpen = !!selectedShift && !showEditModal && !showDuplicateModal && !showSwapModal;
  
  return (
    <UniversalModal open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <UniversalModalContent size="md" hideBuiltInClose>
        {selectedShift && (
          <>
            <UniversalModalHeader className="border-b border-border/40 pb-3 mb-1">
              <UniversalModalTitle className="flex items-center gap-2.5">
                {selectedShift.employeeId ? (
                  <>
                    <div 
                      className="w-8 h-8 rounded-md flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ backgroundColor: getEmployeeColor(selectedShift.employeeId) }}
                    >
                      {employees.find(e => e.id === selectedShift.employeeId)?.firstName?.[0] || '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">
                        {employees.find(e => e.id === selectedShift.employeeId)?.firstName} {employees.find(e => e.id === selectedShift.employeeId)?.lastName}
                      </div>
                      <div className="text-xs font-normal text-muted-foreground truncate">
                        {selectedShift.title || 'Shift'} &middot; {new Date(selectedShift.startTime).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-8 h-8 rounded-md flex items-center justify-center bg-orange-500/15 shrink-0">
                      <AlertCircle className="w-4 h-4 text-orange-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm">Open Shift</div>
                      <div className="text-xs font-normal text-muted-foreground truncate">
                        {selectedShift.title || 'Shift'} &middot; {new Date(selectedShift.startTime).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                  </>
                )}
              </UniversalModalTitle>
            </UniversalModalHeader>
            
            <div className="space-y-3 px-1">
              <div className="rounded-lg border border-border/50 divide-y divide-border/30 text-sm">
                <div className="flex justify-between gap-3 p-2.5">
                  <span className="text-muted-foreground shrink-0">Time</span>
                  <span className="font-medium text-right">
                    {new Date(selectedShift.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} - {new Date(selectedShift.endTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
                {selectedShift.clientId && (
                  <div className="flex justify-between gap-3 p-2.5">
                    <span className="text-muted-foreground shrink-0">Client</span>
                    <span className="font-medium truncate text-right">{clients.find(c => c.id === selectedShift.clientId)?.companyName || 'Unknown'}</span>
                  </div>
                )}
                {selectedShift.aiGenerated && (
                  <div className="flex items-center gap-1.5 p-2.5 text-xs text-muted-foreground">
                    <TrinityIconStatic size={12} />
                    <span>Created by Trinity AI</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onShowEditModal}
                  data-testid="button-action-edit"
                >
                  <Edit2 className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                  <span className="truncate">Edit</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onShowDuplicateModal}
                  data-testid="button-action-duplicate"
                >
                  <CopyPlus className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                  <span className="truncate">Duplicate</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onShowSwapModal}
                  disabled={!selectedShift.employeeId}
                  data-testid="button-action-swap"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                  <span className="truncate">Swap</span>
                </Button>
                {!selectedShift.employeeId && (
                  <Button
                    size="sm"
                    className="bg-gradient-to-r from-[#00BFFF] to-[#FFD700]"
                    onClick={() => onAIFill(selectedShift.id)}
                    disabled={isAIFillPending}
                    data-testid="button-action-ai-fill"
                  >
                    <TrinityIconStatic size={12} className="mr-1.5 shrink-0" />
                    <span className="truncate">{isAIFillPending ? 'Filling...' : 'AI Fill'}</span>
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => onDelete(selectedShift.id)}
                  disabled={isDeletePending}
                  data-testid="button-action-delete"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                  <span className="truncate">{isDeletePending ? 'Deleting...' : 'Delete'}</span>
                </Button>
              </div>
            </div>
          </>
        )}
      </UniversalModalContent>
    </UniversalModal>
  );
}

interface EscalationMatrixDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  escalationRules: EscalationRule[];
  onApplyRules: () => void;
}

export function EscalationMatrixDialog({
  open,
  onOpenChange,
  escalationRules,
  onApplyRules,
}: EscalationMatrixDialogProps) {
  return (
    <UniversalModal open={open} onOpenChange={onOpenChange}>
      <UniversalModalContent size="xl">
        <UniversalModalHeader className="border-b border-border/40 pb-3">
          <UniversalModalTitle className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-9 h-9 rounded-md bg-orange-500/10 shrink-0">
              <AlertCircle className="w-4 h-4 text-orange-600" />
            </div>
            <div>
              <div>Escalation Matrix</div>
              <UniversalModalDescription className="mt-0.5">
                Automated escalation rules for unfilled shift coverage
              </UniversalModalDescription>
            </div>
          </UniversalModalTitle>
        </UniversalModalHeader>
        <div className="space-y-3 px-1">
          {escalationRules.map((rule) => (
            <div key={rule.level} className="rounded-lg border border-border/50 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge className="bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300">Level {rule.level}</Badge>
                  <span className="font-medium text-sm">{rule.condition}</span>
                </div>
                <span className="text-xs text-muted-foreground font-mono">{rule.timeout}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Action: {rule.action}</span>
              </div>
            </div>
          ))}
        </div>
        <UniversalModalFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={onApplyRules}>
            Apply Rules
          </Button>
        </UniversalModalFooter>
      </UniversalModalContent>
    </UniversalModal>
  );
}
