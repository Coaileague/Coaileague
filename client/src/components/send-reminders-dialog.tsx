import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Bell, Mail, Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";

interface SendRemindersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeIds?: string[];
}

export function SendRemindersDialog({
  open,
  onOpenChange,
  employeeIds = [],
}: SendRemindersDialogProps) {
  const [reminderTypes, setReminderTypes] = useState({
    email: true,
    sms: false,
    push: false,
  });
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      const enabledTypes = Object.keys(reminderTypes).filter(
        (key) => reminderTypes[key as keyof typeof reminderTypes]
      );

      // @ts-expect-error — TS migration: fix in refactoring sprint
      return apiRequest('/api/reminders/send', {
        method: 'POST',
        body: {
          employeeIds: employeeIds.length > 0 ? employeeIds : undefined,
          reminderTypes: enabledTypes,
          reminderType: 'shift',
        },
      });
    },
    onSuccess: (result: any) => {
      toast({
        title: 'Reminders Sent',
        description: `Sent ${result.data?.sentCount || 0} shift reminders via ${
          Object.keys(reminderTypes)
            .filter((k) => reminderTypes[k as keyof typeof reminderTypes])
            .join(', ')
        }.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/reminders'] });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send reminders',
        variant: 'destructive',
      });
    },
  });

  const enabledChannels = Object.values(reminderTypes).filter((v: any) => v).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Send Shift Reminders
          </DialogTitle>
          <DialogDescription>
            Notify employees about upcoming shifts via their preferred channels.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="email-reminder"
                checked={reminderTypes.email}
                onCheckedChange={(checked) =>
                  setReminderTypes({ ...reminderTypes, email: !!checked })
                }
                data-testid="checkbox-email-reminder"
              />
              <Label htmlFor="email-reminder" className="cursor-pointer">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  <span>Email</span>
                </div>
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="sms-reminder"
                checked={reminderTypes.sms}
                onCheckedChange={(checked) =>
                  setReminderTypes({ ...reminderTypes, sms: !!checked })
                }
                data-testid="checkbox-sms-reminder"
              />
              <Label htmlFor="sms-reminder" className="cursor-pointer">
                <span>SMS</span>
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="push-reminder"
                checked={reminderTypes.push}
                onCheckedChange={(checked) =>
                  setReminderTypes({ ...reminderTypes, push: !!checked })
                }
                data-testid="checkbox-push-reminder"
              />
              <Label htmlFor="push-reminder" className="cursor-pointer">
                <span>Push Notification</span>
              </Label>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
            <p className="text-xs text-blue-900 dark:text-blue-200">
              {enabledChannels > 0
                ? `Reminders will be sent via ${enabledChannels} channel${enabledChannels !== 1 ? 's' : ''}.`
                : 'Please select at least one notification channel.'}
            </p>
          </div>

          {employeeIds.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Sending to {employeeIds.length} employee{employeeIds.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || enabledChannels === 0}
            data-testid="button-send-reminders"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Bell className="w-4 h-4 mr-2" />
                Send Reminders
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
