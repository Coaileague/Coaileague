
import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Calendar,
  Users,
  FileText,
  Clock,
  DollarSign,
  Briefcase,
} from "lucide-react";

export function QuickActionsMenu() {
  const [, setLocation] = useLocation();

  const actions = [
    {
      label: "Schedule Shift",
      icon: Calendar,
      action: () => setLocation("/schedule"),
      category: "Schedule",
    },
    {
      label: "Add Employee",
      icon: Users,
      action: () => setLocation("/employees"),
      category: "People",
    },
    {
      label: "Add Client",
      icon: Briefcase,
      action: () => setLocation("/clients"),
      category: "People",
    },
    {
      label: "Create Invoice",
      icon: DollarSign,
      action: () => setLocation("/invoices"),
      category: "Finance",
    },
    {
      label: "Log Time",
      icon: Clock,
      action: () => setLocation("/time-tracking"),
      category: "Time",
    },
    {
      label: "New Report",
      icon: FileText,
      action: () => setLocation("/reports"),
      category: "Reports",
    },
  ];

  const groupedActions = actions.reduce((acc, action) => {
    if (!acc[action.category]) {
      acc[action.category] = [];
    }
    acc[action.category].push(action);
    return acc;
  }, {} as Record<string, typeof actions>);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="gap-1">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Quick Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {Object.entries(groupedActions).map(([category, items], idx) => (
          <div key={category}>
            {idx > 0 && <DropdownMenuSeparator />}
            {items.map((item) => (
              <DropdownMenuItem
                key={item.label}
                onClick={item.action}
                className="cursor-pointer"
              >
                <item.icon className="mr-2 h-4 w-4" />
                <span>{item.label}</span>
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
