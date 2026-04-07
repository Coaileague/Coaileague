/**
 * Schedule Filters - Dynamic filtering sidebar with database-driven options
 * Connects to employees, clients, and positions from the database
 */

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Search, Building2, Briefcase, Users, Star, ChevronDown, X, Shield, Target } from 'lucide-react';
import type { Employee, Client } from '@shared/schema';
import { formatRoleDisplay } from '@/lib/utils';
import { POSITION_CATEGORIES, POSITION_REGISTRY, getPositionById, type PositionCategory } from '@shared/positionRegistry';

export interface ScheduleFilterState {
  searchQuery: string;
  clientIds: string[];
  positions: string[];
  positionCategories: string[];
  armedStatus: string[];
  employeeStatuses: string[];
  skills: string[];
}

interface ScheduleFiltersProps {
  filters: ScheduleFilterState;
  onFiltersChange: (filters: ScheduleFilterState) => void;
  employees: Employee[];
  clients: Client[];
}

export function ScheduleFilters({
  filters,
  onFiltersChange,
  employees,
  clients,
}: ScheduleFiltersProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    clients: true,
    positions: true,
    positionCategories: false,
    armedStatus: false,
    status: true,
    skills: true,
  });

  const uniqueClients = useMemo(() => {
    return clients.filter(client => client.id && (client.companyName || client.firstName)).slice(0, 20);
  }, [clients]);

  const positions = useMemo(() => {
    const positionSet = new Set<string>();
    employees.forEach(emp => {
      if (emp.role) positionSet.add(emp.role);
      if (emp.organizationalTitle) positionSet.add(emp.organizationalTitle);
    });
    return Array.from(positionSet).filter(Boolean);
  }, [employees]);

  const skills = useMemo(() => {
    const skillSet = new Set<string>();
    employees.forEach(emp => {
      if (emp.workspaceRole === 'department_manager' || emp.workspaceRole === 'co_owner') skillSet.add('Manager');
      if (emp.workspaceRole === 'supervisor') skillSet.add('Supervisor');
      if (emp.performanceScore && Number(emp.performanceScore) > 90) skillSet.add('Top Performer');
    });
    return Array.from(skillSet).filter(Boolean);
  }, [employees]);

  const employeeStatuses = ['active', 'on_leave', 'part_time', 'inactive'];

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const toggleFilter = (filterType: keyof Omit<ScheduleFilterState, 'searchQuery'>, value: string) => {
    const currentValues = filters[filterType] as string[];
    const newValues = currentValues.includes(value)
      ? currentValues.filter(v => v !== value)
      : [...currentValues, value];
    onFiltersChange({ ...filters, [filterType]: newValues });
  };

  const clearFilters = () => {
    onFiltersChange({
      searchQuery: '',
      clientIds: [],
      positions: [],
      positionCategories: [],
      armedStatus: [],
      employeeStatuses: [],
      skills: [],
    });
  };

  const activeFilterCount = filters.clientIds.length + filters.positions.length + 
    filters.positionCategories.length + filters.armedStatus.length +
    filters.employeeStatuses.length + filters.skills.length;

  const categoryEmployeeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    POSITION_CATEGORIES.forEach(cat => {
      counts[cat.id] = employees.filter(emp => {
        const pos = (emp as any).position ? getPositionById((emp as any).position) : undefined;
        return pos?.category === cat.id;
      }).length;
    });
    return counts;
  }, [employees]);

  const armedCounts = useMemo(() => {
    let armed = 0, unarmed = 0;
    employees.forEach(emp => {
      const pos = (emp as any).position ? getPositionById((emp as any).position) : undefined;
      if (pos?.armedStatus === 'armed') armed++;
      else if (pos?.armedStatus === 'unarmed') unarmed++;
    });
    return { armed, unarmed };
  }, [employees]);

  const getFilteredCount = (filterType: string, value: string): number => {
    switch (filterType) {
      case 'positions':
        return employees.filter(e => e.role === value || e.organizationalTitle === value).length;
      case 'status':
        return employees.filter(e => (e.state || 'active').toLowerCase() === value).length;
      default:
        return 0;
    }
  };

  return (
    <div className="space-y-4" data-testid="schedule-filters">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-sm">Filters</h3>
        {activeFilterCount > 0 && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={clearFilters}
            className="h-6 px-2 text-xs"
            data-testid="button-clear-filters"
          >
            <X className="w-3 h-3 mr-1" />
            Clear ({activeFilterCount})
          </Button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search employees..."
          value={filters.searchQuery}
          onChange={(e) => onFiltersChange({ ...filters, searchQuery: e.target.value })}
          className="pl-8"
          data-testid="input-search-employees"
        />
      </div>

      <ScrollArea className="h-[calc(100vh-300px)]">
        <div className="space-y-4 pr-4">
          <Collapsible 
            open={expandedSections.clients} 
            onOpenChange={() => toggleSection('clients')}
          >
            <CollapsibleTrigger className="flex items-center justify-between gap-2 w-full py-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Building2 className="w-4 h-4" />
                Clients
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform ${expandedSections.clients ? 'rotate-180' : ''}`} />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-2">
              {uniqueClients.length === 0 ? (
                <p className="text-xs text-muted-foreground">No clients found</p>
              ) : (
                uniqueClients.map(client => (
                  <div key={client.id} className="flex items-start space-x-2">
                    <Checkbox
                      id={`client-${client.id}`}
                      checked={filters.clientIds.includes(client.id)}
                      onCheckedChange={() => toggleFilter('clientIds', client.id)}
                      className="mt-0.5"
                    />
                    <Label 
                      htmlFor={`client-${client.id}`} 
                      className="text-sm flex-1 cursor-pointer break-words leading-tight"
                      title={client.address || undefined}
                    >
                      {client.companyName || `${client.firstName} ${client.lastName}`.trim() || 'Unknown Client'}
                    </Label>
                  </div>
                ))
              )}
            </CollapsibleContent>
          </Collapsible>

          <Collapsible 
            open={expandedSections.positions} 
            onOpenChange={() => toggleSection('positions')}
          >
            <CollapsibleTrigger className="flex items-center justify-between gap-2 w-full py-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Briefcase className="w-4 h-4" />
                Positions
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform ${expandedSections.positions ? 'rotate-180' : ''}`} />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-2">
              {positions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No positions found</p>
              ) : (
                positions.map(position => (
                  <div key={position} className="flex items-center space-x-2">
                    <Checkbox
                      id={`position-${position}`}
                      checked={filters.positions.includes(position)}
                      onCheckedChange={() => toggleFilter('positions', position)}
                    />
                    <Label 
                      htmlFor={`position-${position}`} 
                      className="text-sm flex-1 cursor-pointer"
                    >
                      {formatRoleDisplay(position)}
                    </Label>
                    <Badge variant="secondary" className="text-xs">
                      {getFilteredCount('positions', position)}
                    </Badge>
                  </div>
                ))
              )}
            </CollapsibleContent>
          </Collapsible>

          <Collapsible 
            open={expandedSections.positionCategories || false} 
            onOpenChange={() => setExpandedSections(prev => ({ ...prev, positionCategories: !prev.positionCategories }))}
          >
            <CollapsibleTrigger className="flex items-center justify-between gap-2 w-full py-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Target className="w-4 h-4" />
                Position Category
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform ${(expandedSections as any).positionCategories ? 'rotate-180' : ''}`} />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-2">
              {POSITION_CATEGORIES.map(cat => (
                <div key={cat.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`cat-${cat.id}`}
                    checked={(filters.positionCategories || []).includes(cat.id)}
                    onCheckedChange={() => toggleFilter('positionCategories', cat.id)}
                  />
                  <Label 
                    htmlFor={`cat-${cat.id}`} 
                    className="text-sm flex-1 cursor-pointer flex items-center gap-2"
                  >
                    <span 
                      className="w-3 h-3 rounded-full flex-shrink-0" 
                      style={{ backgroundColor: cat.color }}
                      data-testid={`color-swatch-${cat.id}`}
                      role="img"
                      aria-label={`${cat.label} color category`}
                    />
                    {cat.label}
                  </Label>
                  <Badge variant="secondary" className="text-xs">
                    {categoryEmployeeCounts[cat.id] || 0}
                  </Badge>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>

          <Collapsible 
            open={expandedSections.armedStatus || false} 
            onOpenChange={() => setExpandedSections(prev => ({ ...prev, armedStatus: !prev.armedStatus }))}
          >
            <CollapsibleTrigger className="flex items-center justify-between gap-2 w-full py-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Shield className="w-4 h-4" />
                Armed Status
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform ${(expandedSections as any).armedStatus ? 'rotate-180' : ''}`} />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="armed-armed"
                  checked={(filters.armedStatus || []).includes('armed')}
                  onCheckedChange={() => toggleFilter('armedStatus', 'armed')}
                />
                <Label htmlFor="armed-armed" className="text-sm flex-1 cursor-pointer">Armed</Label>
                <Badge variant="secondary" className="text-xs">{armedCounts.armed}</Badge>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="armed-unarmed"
                  checked={(filters.armedStatus || []).includes('unarmed')}
                  onCheckedChange={() => toggleFilter('armedStatus', 'unarmed')}
                />
                <Label htmlFor="armed-unarmed" className="text-sm flex-1 cursor-pointer">Unarmed</Label>
                <Badge variant="secondary" className="text-xs">{armedCounts.unarmed}</Badge>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Collapsible 
            open={expandedSections.status} 
            onOpenChange={() => toggleSection('status')}
          >
            <CollapsibleTrigger className="flex items-center justify-between gap-2 w-full py-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Users className="w-4 h-4" />
                Employee Status
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform ${expandedSections.status ? 'rotate-180' : ''}`} />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-2">
              {employeeStatuses.map(status => (
                <div key={status} className="flex items-center space-x-2">
                  <Checkbox
                    id={`status-${status}`}
                    checked={filters.employeeStatuses.includes(status)}
                    onCheckedChange={() => toggleFilter('employeeStatuses', status)}
                  />
                  <Label 
                    htmlFor={`status-${status}`} 
                    className="text-sm flex-1 cursor-pointer capitalize"
                  >
                    {status.replace('_', ' ')}
                  </Label>
                  <Badge variant="secondary" className="text-xs">
                    {getFilteredCount('status', status)}
                  </Badge>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>

          <Collapsible 
            open={expandedSections.skills} 
            onOpenChange={() => toggleSection('skills')}
          >
            <CollapsibleTrigger className="flex items-center justify-between gap-2 w-full py-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Star className="w-4 h-4" />
                Skills & Certifications
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform ${expandedSections.skills ? 'rotate-180' : ''}`} />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-2">
              {skills.length === 0 ? (
                <p className="text-xs text-muted-foreground">No skills found</p>
              ) : (
                skills.map(skill => (
                  <div key={skill} className="flex items-center space-x-2">
                    <Checkbox
                      id={`skill-${skill}`}
                      checked={filters.skills.includes(skill)}
                      onCheckedChange={() => toggleFilter('skills', skill)}
                    />
                    <Label 
                      htmlFor={`skill-${skill}`} 
                      className="text-sm flex-1 cursor-pointer"
                    >
                      {skill}
                    </Label>
                  </div>
                ))
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </ScrollArea>
    </div>
  );
}
