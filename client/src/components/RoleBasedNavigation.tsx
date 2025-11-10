import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Lock } from "lucide-react";
import {
  getNavigationForRole,
  getLockedFeatures,
  getTierUpgradePath,
  type WorkspaceRole,
  type SubscriptionTier,
  type NavItem,
} from "@/lib/navigation";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface RoleBasedNavigationProps {
  role: WorkspaceRole;
  tier: SubscriptionTier;
  isPlatformStaff?: boolean;
}

export function RoleBasedNavigation({
  role,
  tier,
  isPlatformStaff = false,
}: RoleBasedNavigationProps) {
  const [location] = useLocation();
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<NavItem | null>(null);

  const navigation = getNavigationForRole(role, tier, isPlatformStaff);
  const lockedFeatures = getLockedFeatures(role, tier);
  const upgradePath = getTierUpgradePath(tier);

  const handleLockedFeatureClick = (feature: NavItem) => {
    setSelectedFeature(feature);
    setUpgradeDialogOpen(true);
  };

  return (
    <nav className="space-y-4" data-testid="nav-sidebar">
      {navigation.map((section, idx) => (
        <div key={idx} className="space-y-1">
          <h3 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {section.title}
          </h3>
          <div className="space-y-0.5">
            {section.items.map((item) => {
              const isActive = location === item.href || location.startsWith(item.href + '/');
              
              return (
                <Link key={item.href} href={item.href}>
                  <a
                    className="no-default-hover-elevate no-default-active-elevate"
                    data-testid={`nav-link-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <Button
                      variant={isActive ? "secondary" : "ghost"}
                      className="w-full justify-start gap-3 hover-elevate active-elevate-2"
                      size="sm"
                    >
                      <item.icon className="h-4 w-4" />
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.badge && (
                        <Badge variant="secondary" className="text-xs">
                          {item.badge}
                        </Badge>
                      )}
                    </Button>
                  </a>
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      {lockedFeatures.length > 0 && (
        <div className="space-y-1 pt-4 border-t">
          <h3 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Upgrade to Unlock
          </h3>
          <div className="space-y-0.5">
            {lockedFeatures.map((item) => (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-3 opacity-60 hover-elevate active-elevate-2"
                    size="sm"
                    onClick={() => handleLockedFeatureClick(item)}
                    data-testid={`nav-locked-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="flex-1 text-left">{item.label}</span>
                    <Lock className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Requires {item.badge} plan
                  </p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
      )}

      <Dialog open={upgradeDialogOpen} onOpenChange={setUpgradeDialogOpen}>
        <DialogContent data-testid="dialog-upgrade-prompt">
          <DialogHeader>
            <DialogTitle>Upgrade to {selectedFeature?.badge}</DialogTitle>
            <DialogDescription>
              {selectedFeature?.description}
            </DialogDescription>
          </DialogHeader>

          {upgradePath.nextTier && (
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">New Features:</h4>
                <ul className="space-y-1 text-sm">
                  {upgradePath.newFeatures.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">✓</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-muted p-4 rounded-md">
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold">
                    {upgradePath.nextTier.charAt(0).toUpperCase() + 
                     upgradePath.nextTier.slice(1)} Plan
                  </span>
                  <span className="text-2xl font-bold">
                    {upgradePath.estimatedPrice}
                  </span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUpgradeDialogOpen(false)}
              data-testid="button-cancel-upgrade"
            >
              Not Now
            </Button>
            <Button
              onClick={() => {
                setUpgradeDialogOpen(false);
                window.location.href = '/settings?tab=billing';
              }}
              data-testid="button-upgrade-now"
            >
              Upgrade Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </nav>
  );
}
