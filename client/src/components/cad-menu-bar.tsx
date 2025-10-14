import { useState, useEffect } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { useLocation } from "wouter";

interface MenuItem {
  label: string;
  items: (
    | {
        label: string;
        shortcut?: string;
        action?: () => void;
        separator?: never;
      }
    | {
        separator: true;
        label?: never;
        shortcut?: never;
        action?: never;
      }
  )[];
}

export function CADMenuBar() {
  const [, setLocation] = useLocation();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const menus: MenuItem[] = [
    {
      label: "File",
      items: [
        { label: "New Workspace", shortcut: "Ctrl+N" },
        { label: "Open Recent", shortcut: "Ctrl+O" },
        { separator: true },
        { label: "Save Layout", shortcut: "Ctrl+S" },
        { label: "Export Data", shortcut: "Ctrl+E" },
        { label: "Print Report", shortcut: "Ctrl+P" },
        { separator: true },
        { label: "Preferences", shortcut: "Ctrl+," },
        { separator: true },
        { label: "Exit", shortcut: "Ctrl+Q" },
      ],
    },
    {
      label: "Edit",
      items: [
        { label: "Undo", shortcut: "Ctrl+Z" },
        { label: "Redo", shortcut: "Ctrl+Y" },
        { separator: true },
        { label: "Cut", shortcut: "Ctrl+X" },
        { label: "Copy", shortcut: "Ctrl+C" },
        { label: "Paste", shortcut: "Ctrl+V" },
        { label: "Duplicate", shortcut: "Ctrl+D" },
        { separator: true },
        { label: "Select All", shortcut: "Ctrl+A" },
        { label: "Find", shortcut: "Ctrl+F" },
      ],
    },
    {
      label: "View",
      items: [
        { label: "Dashboard", shortcut: "Ctrl+1", action: () => setLocation("/dashboard") },
        { label: "Schedule", shortcut: "Ctrl+2", action: () => setLocation("/schedule") },
        { label: "Time Tracking", shortcut: "Ctrl+3", action: () => setLocation("/time-tracking") },
        { label: "Analytics", shortcut: "Ctrl+4", action: () => setLocation("/analytics") },
        { separator: true },
        { label: "Toggle Left Panel", shortcut: "Ctrl+B" },
        { label: "Toggle Right Panel", shortcut: "Ctrl+Shift+B" },
        { label: "Full Screen", shortcut: "F11" },
        { separator: true },
        { label: "Zoom In", shortcut: "Ctrl++" },
        { label: "Zoom Out", shortcut: "Ctrl+-" },
        { label: "Reset Zoom", shortcut: "Ctrl+0" },
      ],
    },
    {
      label: "Schedule",
      items: [
        { label: "New Shift", shortcut: "S", action: () => setLocation("/schedule") },
        { label: "From Template", shortcut: "T" },
        { label: "Create Recurring", shortcut: "R" },
        { separator: true },
        { label: "Check Conflicts", shortcut: "Ctrl+K" },
        { label: "Publish Schedule", shortcut: "Ctrl+Shift+P" },
        { label: "Send Notifications" },
      ],
    },
    {
      label: "Tools",
      items: [
        { label: "Command Palette", shortcut: "Ctrl+K", action: () => {} },
        { separator: true },
        { label: "Time Clock", action: () => setLocation("/time-tracking") },
        { label: "Invoice Generator", action: () => setLocation("/invoices") },
        { label: "Generate Reports" },
        { label: "Export to PDF" },
        { separator: true },
        { label: "Employee Manager", action: () => setLocation("/employees") },
        { label: "Client Manager", action: () => setLocation("/clients") },
      ],
    },
    {
      label: "Help",
      items: [
        { label: "Documentation", shortcut: "F1" },
        { label: "Keyboard Shortcuts", shortcut: "Ctrl+/" },
        { label: "Video Tutorials" },
        { separator: true },
        { label: "Contact Support" },
        { label: "Report Bug" },
        { label: "Feature Request" },
        { separator: true },
        { label: "About WorkforceOS" },
      ],
    },
  ];

  return (
    <div className="h-10 bg-[hsl(var(--cad-chrome))] border-b border-[hsl(var(--cad-border))] flex items-center px-2 gap-1">
      {menus.map((menu) => (
        <DropdownMenu
          key={menu.label}
          open={openMenu === menu.label}
          onOpenChange={(open) => setOpenMenu(open ? menu.label : null)}
        >
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-3 text-xs font-medium hover:bg-[hsl(var(--cad-chrome-hover))] data-[state=open]:bg-[hsl(var(--cad-chrome-active))]"
              data-testid={`menu-${menu.label.toLowerCase()}`}
            >
              {menu.label}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-56 bg-[hsl(var(--cad-surface-elevated))] border-[hsl(var(--cad-border-strong))]"
          >
            {menu.items.map((item, index) =>
              item.separator ? (
                <DropdownMenuSeparator
                  key={`sep-${index}`}
                  className="bg-[hsl(var(--cad-border))]"
                />
              ) : (
                <DropdownMenuItem
                  key={item.label}
                  onClick={item.action}
                  className="text-xs cursor-pointer hover:bg-[hsl(var(--cad-chrome-hover))] focus:bg-[hsl(var(--cad-chrome-hover))]"
                  data-testid={`menuitem-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  {item.label}
                  {item.shortcut && (
                    <DropdownMenuShortcut className="text-[hsl(var(--cad-text-tertiary))]">
                      {item.shortcut}
                    </DropdownMenuShortcut>
                  )}
                </DropdownMenuItem>
              )
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ))}

      <div className="flex-1" />

      <div className="text-xs text-[hsl(var(--cad-text-secondary))] font-mono">
        {currentTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
      </div>
    </div>
  );
}
