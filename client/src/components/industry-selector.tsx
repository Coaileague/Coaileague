import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  HardHat, Stethoscope, Shield, Sparkles, UtensilsCrossed, 
  ShoppingBag, Briefcase, Truck, Factory, GraduationCap, Wrench,
  CheckCircle2, AlertCircle, Building2
} from "lucide-react";
import industryTaxonomy from "@shared/industry-taxonomy.json";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  HardHat,
  Stethoscope,
  Shield,
  Sparkles,
  UtensilsCrossed,
  ShoppingBag,
  Briefcase,
  Truck,
  Factory,
  GraduationCap,
  Wrench,
};

export interface IndustrySelection {
  sectorId: string;
  industryGroupId: string;
  subIndustryId: string;
  sectorName: string;
  industryGroupName: string;
  subIndustryName: string;
  complianceTemplates: string[];
  certifications: string[];
}

interface IndustrySelectorProps {
  onSelectionChange: (selection: IndustrySelection | null) => void;
  initialSelection?: Partial<IndustrySelection>;
  disabled?: boolean;
  compact?: boolean;
}

export function IndustrySelector({
  onSelectionChange,
  initialSelection,
  disabled = false,
  compact = false,
}: IndustrySelectorProps) {
  const [sectorId, setSectorId] = useState(initialSelection?.sectorId || "");
  const [industryGroupId, setIndustryGroupId] = useState(initialSelection?.industryGroupId || "");
  const [subIndustryId, setSubIndustryId] = useState(initialSelection?.subIndustryId || "");

  const sectors = industryTaxonomy.sectors;

  const selectedSector = useMemo(() => {
    return sectors.find(s => s.id === sectorId);
  }, [sectorId, sectors]);

  const industryGroups = useMemo(() => {
    return selectedSector?.industryGroups || [];
  }, [selectedSector]);

  const selectedIndustryGroup = useMemo(() => {
    return industryGroups.find(g => g.id === industryGroupId);
  }, [industryGroupId, industryGroups]);

  const subIndustries = useMemo(() => {
    return selectedIndustryGroup?.subIndustries || [];
  }, [selectedIndustryGroup]);

  const selectedSubIndustry = useMemo(() => {
    return subIndustries.find(s => s.id === subIndustryId);
  }, [subIndustryId, subIndustries]);

  const handleSectorChange = (value: string) => {
    setSectorId(value);
    setIndustryGroupId("");
    setSubIndustryId("");
    onSelectionChange(null);
  };

  const handleIndustryGroupChange = (value: string) => {
    setIndustryGroupId(value);
    setSubIndustryId("");
    onSelectionChange(null);
  };

  const handleSubIndustryChange = (value: string) => {
    setSubIndustryId(value);
    
    if (selectedSector && selectedIndustryGroup) {
      const subIndustry = selectedIndustryGroup.subIndustries.find(s => s.id === value);
      if (subIndustry) {
        onSelectionChange({
          sectorId,
          industryGroupId,
          subIndustryId: value,
          sectorName: selectedSector.name,
          industryGroupName: selectedIndustryGroup.name,
          subIndustryName: subIndustry.name,
          complianceTemplates: subIndustry.complianceTemplates,
          certifications: subIndustry.certifications,
        });
      }
    }
  };

  const SectorIcon = selectedSector ? iconMap[selectedSector.icon] || Building2 : Building2;

  const isComplete = sectorId && industryGroupId && subIndustryId;

  if (compact) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="sector" className="text-sm font-medium">Sector</Label>
            <Select value={sectorId} onValueChange={handleSectorChange} disabled={disabled}>
              <SelectTrigger id="sector" data-testid="select-sector" className="mt-1">
                <SelectValue placeholder="Select sector" />
              </SelectTrigger>
              <SelectContent>
                <ScrollArea className="h-[200px]">
                  {sectors.map((sector) => {
                    const Icon = iconMap[sector.icon] || Building2;
                    return (
                      <SelectItem key={sector.id} value={sector.id}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span>{sector.name}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </ScrollArea>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="industryGroup" className="text-sm font-medium">Industry Group</Label>
            <Select 
              value={industryGroupId} 
              onValueChange={handleIndustryGroupChange} 
              disabled={disabled || !sectorId}
            >
              <SelectTrigger id="industryGroup" data-testid="select-industry-group" className="mt-1">
                <SelectValue placeholder={sectorId ? "Select group" : "Select sector first"} />
              </SelectTrigger>
              <SelectContent>
                <ScrollArea className="h-[200px]">
                  {industryGroups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </ScrollArea>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="subIndustry" className="text-sm font-medium">Sub-Industry</Label>
            <Select 
              value={subIndustryId} 
              onValueChange={handleSubIndustryChange} 
              disabled={disabled || !industryGroupId}
            >
              <SelectTrigger id="subIndustry" data-testid="select-sub-industry" className="mt-1">
                <SelectValue placeholder={industryGroupId ? "Select type" : "Select group first"} />
              </SelectTrigger>
              <SelectContent>
                <ScrollArea className="h-[200px]">
                  {subIndustries.map((sub) => (
                    <SelectItem key={sub.id} value={sub.id}>
                      {sub.name}
                    </SelectItem>
                  ))}
                </ScrollArea>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isComplete && selectedSubIndustry && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400">
              {selectedSector?.name} → {selectedIndustryGroup?.name} → {selectedSubIndustry.name}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <SectorIcon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <CardTitle>Industry Classification</CardTitle>
            <CardDescription>
              Select your business category to configure compliance and features
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="sector" className="text-sm font-medium mb-2 block">
              Sector
              <span className="text-destructive ml-1">*</span>
            </Label>
            <Select value={sectorId} onValueChange={handleSectorChange} disabled={disabled}>
              <SelectTrigger id="sector" data-testid="select-sector">
                <SelectValue placeholder="Select your sector" />
              </SelectTrigger>
              <SelectContent>
                <ScrollArea className="h-[280px]">
                  {sectors.map((sector) => {
                    const Icon = iconMap[sector.icon] || Building2;
                    return (
                      <SelectItem key={sector.id} value={sector.id}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <span className="font-medium">{sector.name}</span>
                          </div>
                        </div>
                      </SelectItem>
                    );
                  })}
                </ScrollArea>
              </SelectContent>
            </Select>
            {selectedSector && (
              <p className="text-xs text-muted-foreground mt-2">
                {selectedSector.description}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="industryGroup" className="text-sm font-medium mb-2 block">
              Industry Group
              <span className="text-destructive ml-1">*</span>
            </Label>
            <Select 
              value={industryGroupId} 
              onValueChange={handleIndustryGroupChange} 
              disabled={disabled || !sectorId}
            >
              <SelectTrigger id="industryGroup" data-testid="select-industry-group">
                <SelectValue placeholder={sectorId ? "Select industry group" : "Select sector first"} />
              </SelectTrigger>
              <SelectContent>
                <ScrollArea className="h-[280px]">
                  {industryGroups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      <div>
                        <span className="font-medium">{group.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </ScrollArea>
              </SelectContent>
            </Select>
            {selectedIndustryGroup && (
              <p className="text-xs text-muted-foreground mt-2">
                {selectedIndustryGroup.description}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="subIndustry" className="text-sm font-medium mb-2 block">
              Specific Business Type
              <span className="text-destructive ml-1">*</span>
            </Label>
            <Select 
              value={subIndustryId} 
              onValueChange={handleSubIndustryChange} 
              disabled={disabled || !industryGroupId}
            >
              <SelectTrigger id="subIndustry" data-testid="select-sub-industry">
                <SelectValue placeholder={industryGroupId ? "Select your business type" : "Select group first"} />
              </SelectTrigger>
              <SelectContent>
                <ScrollArea className="h-[280px]">
                  {subIndustries.map((sub) => (
                    <SelectItem key={sub.id} value={sub.id}>
                      {sub.name}
                    </SelectItem>
                  ))}
                </ScrollArea>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isComplete && selectedSubIndustry && (
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span className="font-medium">Industry Selected</span>
            </div>
            
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 mb-3">
                <SectorIcon className="h-5 w-5 text-primary" />
                <span className="font-semibold">
                  {selectedSector?.name} → {selectedIndustryGroup?.name} → {selectedSubIndustry.name}
                </span>
              </div>
              
              {selectedSubIndustry.complianceTemplates.length > 0 && (
                <div className="mb-3">
                  <span className="text-sm text-muted-foreground mb-2 block">Compliance Templates:</span>
                  <div className="flex flex-wrap gap-1">
                    {selectedSubIndustry.complianceTemplates.map((template) => (
                      <Badge key={template} variant="secondary" className="text-xs">
                        {template.replace(/_/g, ' ')}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              
              {selectedSubIndustry.certifications.length > 0 && (
                <div>
                  <span className="text-sm text-muted-foreground mb-2 block">Required Certifications:</span>
                  <div className="flex flex-wrap gap-1">
                    {selectedSubIndustry.certifications.map((cert) => (
                      <Badge key={cert} variant="outline" className="text-xs">
                        {cert.replace(/_/g, ' ')}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
              <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="text-sm text-blue-700 dark:text-blue-400">
                <span className="font-medium">What happens next:</span>
                <ul className="mt-1 list-disc list-inside space-y-1 text-xs">
                  <li>Trinity AI will configure your workspace for {selectedSubIndustry.name}</li>
                  <li>Industry-specific compliance templates will be activated</li>
                  <li>Relevant forms and reports will be enabled</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { industryTaxonomy };
