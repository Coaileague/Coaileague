import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  Calendar,
  Clock,
  Users,
  UserCircle,
  FileText,
  BarChart3,
  Settings,
  ClipboardCheck,
  Activity,
  HelpCircle,
  LogOut,
  Zap,
  DollarSign,
  Mail,
  Shield,
  MessageSquare,
} from "lucide-react";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();

  // Toggle command palette with Ctrl+K or Cmd+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSelect = useCallback((callback: () => void) => {
    setOpen(false);
    callback();
  }, []);

  const navigate = (path: string) => {
    setLocation(path);
  };

  // Expose open function globally for search button
  useEffect(() => {
    (window as any).openCommandPalette = () => setOpen(true);
  }, []);

  const mainPages = [
    { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard", shortcut: "⌘D" },
    { label: "Schedule", icon: Calendar, path: "/schedule", shortcut: "⌘S" },
    { label: "Time Tracking", icon: Clock, path: "/time-tracking", shortcut: "⌘T" },
    { label: "Employees", icon: Users, path: "/employees", shortcut: "⌘E" },
    { label: "Clients", icon: UserCircle, path: "/clients", shortcut: "⌘C" },
    { label: "Invoices", icon: FileText, path: "/invoices", shortcut: "⌘I" },
    { label: "Reports", icon: ClipboardCheck, path: "/reports", shortcut: "⌘R" },
    { label: "Analytics", icon: BarChart3, path: "/analytics", shortcut: "⌘A" },
    { label: "Settings", icon: Settings, path: "/settings", shortcut: "⌘," },
  ];

  const adminPages = [
    { label: "Usage & Credits", icon: Activity, path: "/admin/usage" },
  ];

  const quickActions = [
    { label: "Clock In/Out", icon: Clock, path: "/time-tracking" },
    { label: "Create Shift", icon: Calendar, path: "/schedule" },
    { label: "Add Employee", icon: Users, path: "/employees" },
    { label: "Add Client", icon: UserCircle, path: "/clients" },
    { label: "Generate Invoice", icon: DollarSign, path: "/invoices" },
  ];

  const helpResources = [
    { label: "Help Center", icon: HelpCircle, path: "/support" },
    { label: "Live Chat Support", icon: MessageSquare, path: "/support/chat" },
    { label: "Contact Support", icon: Mail, path: "/contact" },
    { label: "Login Guide", icon: FileText, action: () => window.open("/docs/LOGIN_GUIDE.md", "_blank") },
    { label: "Feature Showcase", icon: Zap, action: () => window.open("/docs/FEATURES_SHOWCASE.md", "_blank") },
    { label: "Security Docs", icon: Shield, action: () => window.open("/docs/SECURITY.md", "_blank") },
  ];

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." data-testid="input-command-palette" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        
        <CommandGroup heading="Navigation">
          {mainPages.map((page) => (
            <CommandItem
              key={page.path}
              onSelect={() => handleSelect(() => navigate(page.path))}
              data-testid={`command-${page.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <page.icon className="mr-2 h-4 w-4" />
              <span>{page.label}</span>
              {page.shortcut && (
                <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                  {page.shortcut}
                </kbd>
              )}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Admin">
          {adminPages.map((page) => (
            <CommandItem
              key={page.path}
              onSelect={() => handleSelect(() => navigate(page.path))}
              data-testid={`command-${page.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <page.icon className="mr-2 h-4 w-4" />
              <span>{page.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Quick Actions">
          {quickActions.map((item, index) => (
            <CommandItem
              key={index}
              onSelect={() => handleSelect(() => navigate(item.path))}
              data-testid={`command-action-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <item.icon className="mr-2 h-4 w-4" />
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Help & Resources">
          {helpResources.map((resource, index) => (
            <CommandItem
              key={index}
              onSelect={() => handleSelect(resource.action ? resource.action : () => navigate(resource.path!))}
              data-testid={`command-help-${resource.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <resource.icon className="mr-2 h-4 w-4" />
              <span>{resource.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Account">
          <CommandItem
            onSelect={() => handleSelect(() => window.location.href = "/api/logout")}
            data-testid="command-logout"
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span>Log Out</span>
            <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
              ⌘Q
            </kbd>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
