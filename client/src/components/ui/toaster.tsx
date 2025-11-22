import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { CheckCircle2, XCircle, AlertTriangle, Info, Zap } from "lucide-react"

export function Toaster() {
  const { toasts } = useToast()

  const getToastIcon = (variant?: string) => {
    switch (variant) {
      case "success":
        return <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
      case "destructive":
        return <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
      case "warning":
        return <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
      case "info":
        return <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
      default:
        return <Zap className="h-5 w-5 text-slate-600 dark:text-slate-400 shrink-0" />
    }
  }

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        return (
          <Toast key={id} variant={variant as any} {...props}>
            <div className="flex items-start gap-3 w-full">
              {getToastIcon(variant as string)}
              <div className="grid gap-1 flex-1">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && (
                  <ToastDescription>{description}</ToastDescription>
                )}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
