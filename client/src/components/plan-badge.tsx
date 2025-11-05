
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Crown, Zap, ArrowUpCircle } from "lucide-react";
import { useLocation } from "wouter";

export function PlanBadge() {
  const [, setLocation] = useLocation();
  
  const { data: workspace } = useQuery({
    queryKey: ['/api/workspace'],
  });

  const tier = workspace?.subscriptionTier || 'free';
  
  const tierConfig: Record<string, { label: string; icon: any; color: string }> = {
    free: { label: 'Free', icon: null, color: 'bg-gray-500' },
    basic: { label: 'Basic', icon: Zap, color: 'bg-blue-500' },
    professional: { label: 'Professional', icon: Crown, color: 'bg-purple-500' },
    enterprise: { label: 'Enterprise', icon: Crown, color: 'bg-amber-500' },
  };

  const config = tierConfig[tier] || tierConfig.free;
  const Icon = config.icon;

  if (tier === 'enterprise') {
    return (
      <Badge className={`${config.color} text-white gap-1`}>
        {Icon && <Icon className="h-3 w-3" />}
        <span>{config.label}</span>
      </Badge>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Badge variant="outline" className="gap-1 cursor-pointer hover:bg-accent">
          {Icon && <Icon className="h-3 w-3" />}
          <span>{config.label}</span>
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <div className="space-y-3">
          <h4 className="font-medium">Current Plan: {config.label}</h4>
          <p className="text-sm text-muted-foreground">
            Upgrade to unlock premium features
          </p>
          <Button 
            className="w-full gap-2" 
            onClick={() => setLocation('/pricing')}
          >
            <ArrowUpCircle className="h-4 w-4" />
            Upgrade Plan
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
