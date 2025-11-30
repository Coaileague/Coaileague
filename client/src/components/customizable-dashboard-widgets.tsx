import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Settings2, GripVertical, Plus, X, Eye, EyeOff,
  BarChart3, Clock, Users, DollarSign, Calendar, 
  TrendingUp, Bell, CheckCircle2, AlertTriangle,
  Briefcase, FileText, Zap
} from "lucide-react";

interface DashboardWidget {
  id: string;
  name: string;
  description: string;
  icon: string;
  size: 'small' | 'medium' | 'large';
  category: string;
  isEnabled: boolean;
  order: number;
  component: string;
}

const WIDGET_ICONS: Record<string, React.ReactNode> = {
  'bar-chart': <BarChart3 className="h-5 w-5" />,
  'clock': <Clock className="h-5 w-5" />,
  'users': <Users className="h-5 w-5" />,
  'dollar': <DollarSign className="h-5 w-5" />,
  'calendar': <Calendar className="h-5 w-5" />,
  'trending': <TrendingUp className="h-5 w-5" />,
  'bell': <Bell className="h-5 w-5" />,
  'check': <CheckCircle2 className="h-5 w-5" />,
  'alert': <AlertTriangle className="h-5 w-5" />,
  'briefcase': <Briefcase className="h-5 w-5" />,
  'file': <FileText className="h-5 w-5" />,
  'zap': <Zap className="h-5 w-5" />,
};

const DEFAULT_WIDGETS: DashboardWidget[] = [
  { id: 'quick-stats', name: 'Quick Stats', description: 'Key metrics at a glance', icon: 'bar-chart', size: 'large', category: 'Analytics', isEnabled: true, order: 1, component: 'QuickStats' },
  { id: 'time-clock', name: 'Time Clock', description: 'Clock in/out status', icon: 'clock', size: 'small', category: 'Time', isEnabled: true, order: 2, component: 'TimeClock' },
  { id: 'team-activity', name: 'Team Activity', description: 'Recent team updates', icon: 'users', size: 'medium', category: 'Team', isEnabled: true, order: 3, component: 'TeamActivity' },
  { id: 'revenue-chart', name: 'Revenue Overview', description: 'Financial performance', icon: 'dollar', size: 'large', category: 'Finance', isEnabled: true, order: 4, component: 'RevenueChart' },
  { id: 'upcoming-shifts', name: 'Upcoming Shifts', description: 'Next scheduled shifts', icon: 'calendar', size: 'medium', category: 'Schedule', isEnabled: true, order: 5, component: 'UpcomingShifts' },
  { id: 'performance', name: 'Performance Trends', description: 'Employee performance', icon: 'trending', size: 'medium', category: 'Analytics', isEnabled: false, order: 6, component: 'PerformanceTrends' },
  { id: 'notifications', name: 'Notifications', description: 'Recent alerts', icon: 'bell', size: 'small', category: 'Alerts', isEnabled: true, order: 7, component: 'NotificationsWidget' },
  { id: 'tasks', name: 'My Tasks', description: 'Pending approvals', icon: 'check', size: 'medium', category: 'Tasks', isEnabled: true, order: 8, component: 'TasksWidget' },
  { id: 'compliance', name: 'Compliance Status', description: 'Compliance alerts', icon: 'alert', size: 'small', category: 'Compliance', isEnabled: false, order: 9, component: 'ComplianceWidget' },
  { id: 'projects', name: 'Active Projects', description: 'Current projects', icon: 'briefcase', size: 'medium', category: 'Projects', isEnabled: false, order: 10, component: 'ProjectsWidget' },
  { id: 'documents', name: 'Recent Documents', description: 'Latest uploads', icon: 'file', size: 'small', category: 'Documents', isEnabled: false, order: 11, component: 'DocumentsWidget' },
  { id: 'automation', name: 'Automation Status', description: 'AI automation jobs', icon: 'zap', size: 'small', category: 'Automation', isEnabled: false, order: 12, component: 'AutomationWidget' },
];

interface WidgetCustomizerProps {
  userId?: number;
  onSave?: (widgets: DashboardWidget[]) => void;
}

const STORAGE_KEY = 'dashboard_widget_config';

function getStoredWidgets(): DashboardWidget[] {
  if (typeof window === 'undefined') return DEFAULT_WIDGETS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return DEFAULT_WIDGETS.map(w => ({
        ...w,
        isEnabled: parsed[w.id]?.isEnabled ?? w.isEnabled,
        order: parsed[w.id]?.order ?? w.order,
      }));
    }
  } catch {}
  return DEFAULT_WIDGETS;
}

function saveWidgetsToStorage(widgets: DashboardWidget[]) {
  if (typeof window === 'undefined') return;
  const config = widgets.reduce((acc, w) => ({
    ...acc,
    [w.id]: { isEnabled: w.isEnabled, order: w.order }
  }), {});
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function WidgetCustomizer({ userId, onSave }: WidgetCustomizerProps) {
  const [widgets, setWidgets] = useState<DashboardWidget[]>(DEFAULT_WIDGETS);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setWidgets(getStoredWidgets());
  }, []);

  const handleToggleWidget = (widgetId: string) => {
    setWidgets(prev => prev.map(w => 
      w.id === widgetId ? { ...w, isEnabled: !w.isEnabled } : w
    ));
  };

  const handleSave = () => {
    saveWidgetsToStorage(widgets);
    onSave?.(widgets);
    setIsOpen(false);
  };

  const enabledWidgets = widgets.filter(w => w.isEnabled);
  const disabledWidgets = widgets.filter(w => !w.isEnabled);
  const categories = [...new Set(widgets.map(w => w.category))];

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" data-testid="button-customize-widgets">
          <Settings2 className="h-4 w-4" />
          Customize Dashboard
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Customize Dashboard Widgets
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Enabled Widgets */}
          <div>
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Eye className="h-4 w-4 text-green-500" />
              Visible Widgets ({enabledWidgets.length})
            </h4>
            <div className="space-y-2">
              {enabledWidgets.map((widget) => (
                <div
                  key={widget.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                    <div className="p-2 rounded-lg bg-primary/10">
                      {WIDGET_ICONS[widget.icon]}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{widget.name}</p>
                      <p className="text-xs text-muted-foreground">{widget.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs">{widget.size}</Badge>
                    <Switch
                      checked={widget.isEnabled}
                      onCheckedChange={() => handleToggleWidget(widget.id)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Available Widgets by Category */}
          {disabledWidgets.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <EyeOff className="h-4 w-4 text-muted-foreground" />
                Available Widgets ({disabledWidgets.length})
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {disabledWidgets.map((widget) => (
                  <div
                    key={widget.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-dashed hover:border-primary/50 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => handleToggleWidget(widget.id)}
                  >
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded bg-muted">
                        {WIDGET_ICONS[widget.icon]}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{widget.name}</p>
                        <p className="text-xs text-muted-foreground">{widget.category}</p>
                      </div>
                    </div>
                    <Plus className="h-4 w-4 text-muted-foreground" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Save Layout
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface DashboardWidgetGridProps {
  widgets?: DashboardWidget[];
}

export function DashboardWidgetGrid({ widgets = DEFAULT_WIDGETS }: DashboardWidgetGridProps) {
  const enabledWidgets = widgets.filter(w => w.isEnabled).sort((a, b) => a.order - b.order);

  const getGridClass = (size: string) => {
    switch (size) {
      case 'small': return 'col-span-1';
      case 'medium': return 'col-span-1 md:col-span-2';
      case 'large': return 'col-span-1 md:col-span-2 lg:col-span-3';
      default: return 'col-span-1';
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="dashboard-widget-grid">
      {enabledWidgets.map((widget) => (
        <Card 
          key={widget.id} 
          className={`p-4 hover-lift ${getGridClass(widget.size)}`}
          data-testid={`widget-${widget.id}`}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-lg bg-primary/10">
              {WIDGET_ICONS[widget.icon]}
            </div>
            <h4 className="font-medium">{widget.name}</h4>
          </div>
          <p className="text-sm text-muted-foreground">{widget.description}</p>
        </Card>
      ))}
    </div>
  );
}
