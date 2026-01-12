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
import { Search, MapPin, Briefcase, Users, Star, ChevronDown, X } from 'lucide-react';
import type { Employee, Client } from '@shared/schema';
import { formatRoleDisplay } from '@/lib/utils';

export interface ScheduleFilterState {
  searchQuery: string;
  locations: string[];
  positions: string[];
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
  const [expandedSections, setExpandedSections] = useState({
    locations: true,
    positions: true,
    status: true,
    skills: true,
  });

  const locations = useMemo(() => {
    const locationSet = new Set<string>();
    clients.forEach(client => {
      if (client.address) locationSet.add(client.address);
      if (client.city) locationSet.add(client.city);
    });
    employees.forEach(emp => {
      if (emp.city) locationSet.add(emp.city);
    });
    return Array.from(locationSet).filter(Boolean).slice(0, 20);
  }, [clients, employees]);

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
      if (emp.workspaceRole === 'department_manager' || emp.workspaceRole === 'org_admin') skillSet.add('Manager');
      if (emp.workspaceRole === 'supervisor') skillSet.add('Supervisor');
      if (emp.performanceScore && Number(emp.performanceScore) > 90) skillSet.add('Top Performer');
    });
    return Array.from(skillSet).filter(Boolean);
  }, [employees]);

  const employeeStatuses = ['active', 'on_leave', 'part_time', 'inactive'];

  const toggleSection = (section: keyof typeof expandedSections) => {
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
      locations: [],
      positions: [],
      employeeStatuses: [],
      skills: [],
    });
  };

  const activeFilterCount = filters.locations.length + filters.positions.length + 
    filters.employeeStatuses.length + filters.skills.length;

  const getFilteredCount = (filterType: string, value: string): number => {
    switch (filterType) {
      case 'locations':
        return employees.filter(e => e.city === value).length;
      case 'positions':
        return employees.filter(e => e.role === value || e.organizationalTitle === value).length;
      case 'status':
        return employees.filter(e => e.onboardingStatus === value).length;
      default:
        return 0;
    }
  };

  return (
    <div className="space-y-4" data-testid="schedule-filters">
      <div className="flex items-center justify-between">
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
            open={expandedSections.locations} 
            onOpenChange={() => toggleSection('locations')}
          >
            <CollapsibleTrigger className="flex items-center justify-between w-full py-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <MapPin className="w-4 h-4" />
                Locations
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform ${expandedSections.locations ? 'rotate-180' : ''}`} />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-2">
              {locations.length === 0 ? (
                <p className="text-xs text-muted-foreground">No locations found</p>
              ) : (
                locations.map(location => (
                  <div key={location} className="flex items-center space-x-2">
                    <Checkbox
                      id={`location-${location}`}
                      checked={filters.locations.includes(location)}
                      onCheckedChange={() => toggleFilter('locations', location)}
                    />
                    <Label 
                      htmlFor={`location-${location}`} 
                      className="text-sm flex-1 cursor-pointer truncate"
                    >
                      {location}
                    </Label>
                    <Badge variant="secondary" className="text-xs">
                      {getFilteredCount('locations', location)}
                    </Badge>
                  </div>
                ))
              )}
            </CollapsibleContent>
          </Collapsible>

          <Collapsible 
            open={expandedSections.positions} 
            onOpenChange={() => toggleSection('positions')}
          >
            <CollapsibleTrigger className="flex items-center justify-between w-full py-2">
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
            open={expandedSections.status} 
            onOpenChange={() => toggleSection('status')}
          >
            <CollapsibleTrigger className="flex items-center justify-between w-full py-2">
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
            <CollapsibleTrigger className="flex items-center justify-between w-full py-2">
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
