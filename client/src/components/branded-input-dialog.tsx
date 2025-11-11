import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Building2 } from "lucide-react";
import { AutoForceLogo } from "@/components/autoforce-logo";
import { WFLogoCompact } from "@/components/wf-logo";

interface BrandedInputDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  inputType?: "text" | "textarea";
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (value: string) => void;
}

export function BrandedInputDialog({
  open,
  onClose,
  title,
  description,
  inputType = "text",
  placeholder = "",
  defaultValue = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
}: BrandedInputDialogProps) {
  const [value, setValue] = useState(defaultValue);

  const handleConfirm = () => {
    onConfirm(value);
    setValue("");
    onClose();
  };

  const handleCancel = () => {
    setValue("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-gradient-to-br from-slate-50 to-blue-50 border-2 border-blue-200">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-blue-900">{title}</DialogTitle>
              {description && (
                <DialogDescription className="text-slate-600">
                  {description}
                </DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="py-4">
          {inputType === "textarea" ? (
            <Textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              className="min-h-[100px] border-blue-300 focus:border-blue-500"
              data-testid="input-branded-textarea"
            />
          ) : (
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              className="border-blue-300 focus:border-blue-500"
              data-testid="input-branded-text"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleConfirm();
                }
              }}
            />
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleCancel}
            className="border-slate-300"
            data-testid="button-cancel-input"
          >
            {cancelLabel}
          </Button>
          <Button
            onClick={handleConfirm}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
            data-testid="button-confirm-input"
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface BrandedConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  onConfirm: () => void;
}

export function BrandedConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
}: BrandedConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-gradient-to-br from-slate-50 to-blue-50 border-2 border-blue-200">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
              variant === "danger" 
                ? "bg-gradient-to-br from-red-600 to-rose-600" 
                : "bg-gradient-to-br from-blue-600 to-indigo-600"
            }`}>
              <WFLogoCompact size={24} />
            </div>
            <div className="flex-1">
              <DialogTitle className={variant === "danger" ? "text-red-900" : "text-blue-900"}>
                {title}
              </DialogTitle>
              {description && (
                <DialogDescription className="text-slate-700 mt-1 font-medium">
                  {description}
                </DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>

        <DialogFooter className="gap-2 mt-4">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-slate-400 text-slate-700 hover:bg-slate-100 hover:text-slate-900 font-semibold"
            data-testid="button-cancel-confirm"
          >
            {cancelLabel}
          </Button>
          <Button
            onClick={handleConfirm}
            className={
              variant === "danger"
                ? "bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white"
                : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
            }
            data-testid="button-confirm-action"
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
