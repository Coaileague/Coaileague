import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Plus,
  FileText,
  Copy,
  Trash2,
  Send,
  Calendar,
  Users,
  Clock,
  BarChart3,
  Settings,
  Save,
} from "lucide-react";
import { useLocation } from "wouter";
import { Separator } from "@/components/ui/separator";

type ToolbarButton =
  | {
      icon: React.ReactNode;
      label: string;
      shortcut?: string;
      action?: () => void;
      separator?: never;
      disabled?: boolean;
    }
  | {
      separator: true;
      icon?: never;
      label?: never;
      shortcut?: never;
      action?: never;
      disabled?: never;
    };

export function CADToolbar() {
  const [location, setLocation] = useLocation();

  // Context-aware toolbar buttons based on current route
  const getToolbarButtons = (): ToolbarButton[] => {
    if (location.includes("/schedule")) {
      return [
        {
          icon: <Plus className="w-4 h-4" />,
          label: "New Shift",
          shortcut: "S",
          action: () => {},
        },
        {
          icon: <FileText className="w-4 h-4" />,
          label: "From Template",
          shortcut: "T",
        },
        {
          icon: <Calendar className="w-4 h-4" />,
          label: "Recurring",
          shortcut: "R",
        },
        { separator: true },
        {
          icon: <Copy className="w-4 h-4" />,
          label: "Copy",
          shortcut: "Ctrl+C",
        },
        {
          icon: <Trash2 className="w-4 h-4" />,
          label: "Delete",
          shortcut: "Del",
        },
        { separator: true },
        {
          icon: <Send className="w-4 h-4" />,
          label: "Publish",
          shortcut: "Ctrl+P",
        },
      ];
    }

    if (location.includes("/employees")) {
      return [
        {
          icon: <Plus className="w-4 h-4" />,
          label: "Add Employee",
          shortcut: "Ctrl+N",
        },
        {
          icon: <Users className="w-4 h-4" />,
          label: "Assign Manager",
        },
        { separator: true },
        {
          icon: <Copy className="w-4 h-4" />,
          label: "Duplicate",
          shortcut: "Ctrl+D",
        },
        {
          icon: <Trash2 className="w-4 h-4" />,
          label: "Deactivate",
          shortcut: "Del",
        },
      ];
    }

    if (location.includes("/invoices")) {
      return [
        {
          icon: <Plus className="w-4 h-4" />,
          label: "Generate Invoice",
          shortcut: "Ctrl+N",
        },
        {
          icon: <FileText className="w-4 h-4" />,
          label: "Preview",
          shortcut: "Ctrl+P",
        },
        { separator: true },
        {
          icon: <Send className="w-4 h-4" />,
          label: "Send Email",
        },
        {
          icon: <Save className="w-4 h-4" />,
          label: "Export PDF",
        },
      ];
    }

    // Default toolbar
    return [
      {
        icon: <Calendar className="w-4 h-4" />,
        label: "Schedule",
        action: () => setLocation("/schedule"),
      },
      {
        icon: <Clock className="w-4 h-4" />,
        label: "Time Tracking",
        action: () => setLocation("/time-tracking"),
      },
      {
        icon: <BarChart3 className="w-4 h-4" />,
        label: "Analytics",
        action: () => setLocation("/analytics"),
      },
      { separator: true },
      {
        icon: <Settings className="w-4 h-4" />,
        label: "Settings",
        action: () => setLocation("/settings"),
      },
    ];
  };

  const buttons = getToolbarButtons();

  return (
    <div className="h-12 bg-[hsl(var(--cad-chrome))] border-b border-[hsl(var(--cad-border))] flex items-center px-3 gap-1">
      {buttons.map((button, index) =>
        button.separator ? (
          <Separator
            key={`sep-${index}`}
            orientation="vertical"
            className="h-6 bg-[hsl(var(--cad-border))] mx-1"
          />
        ) : (
          <Tooltip key={button.label}>
            <TooltipTrigger asChild>
              <Button
                variant={button.label === "Publish" ? "default" : "ghost"}
                size={button.label === "Publish" ? "sm" : "icon"}
                className={
                  button.label === "Publish"
                    ? "h-9 px-4 gap-2 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-700 hover:to-indigo-600 text-white font-semibold shadow-lg shadow-indigo-500/30"
                    : "h-9 w-9 hover:bg-[hsl(var(--cad-chrome-hover))] active:bg-[hsl(var(--cad-chrome-active))]"
                }
                onClick={button.action}
                disabled={button.disabled}
                data-testid={`toolbar-${button.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {button.icon}
                {button.label === "Publish" && <span>Publish</span>}
              </Button>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              className="bg-[hsl(var(--cad-surface-elevated))] border-[hsl(var(--cad-border-strong))] text-xs"
            >
              <div className="flex items-center gap-2">
                <span>{button.label}</span>
                {button.shortcut && (
                  <kbd className="text-[10px] px-1 py-0.5 bg-[hsl(var(--cad-chrome))] rounded border border-[hsl(var(--cad-border))]">
                    {button.shortcut}
                  </kbd>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        )
      )}
    </div>
  );
}
