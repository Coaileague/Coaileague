import { Badge } from "@/components/ui/badge";
import { Settings, Plug, Database, ShieldCheck } from "lucide-react";

const INTEGRATIONS = [
  { name: "HR System", status: "connected", icon: Database },
  { name: "Payroll", status: "available", icon: Settings },
  { name: "Scheduling", status: "available", icon: Plug },
  { name: "Communications", status: "connected", icon: ShieldCheck },
] as const;

export function HelpAIIntegrationPanel() {
  return (
    <div className="space-y-3">
      {INTEGRATIONS.map((integration) => (
        <div
          key={integration.name}
          className="flex items-center justify-between p-3 rounded-md border"
        >
          <div className="flex items-center gap-3">
            <integration.icon className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium">{integration.name}</span>
          </div>
          <Badge
            variant={integration.status === "connected" ? "default" : "secondary"}
          >
            {integration.status}
          </Badge>
        </div>
      ))}
    </div>
  );
}
