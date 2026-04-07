import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookOpen, Search, RefreshCw, ChevronRight, MapPin, Globe, FileText } from "lucide-react";

interface KnowledgeModule {
  id: string;
  moduleKey: string;
  title: string;
  category: string;
  scope: string;
  stateCode: string | null;
  version: number;
  isActive: boolean;
  lastVerifiedAt: string | null;
  createdAt: string;
}

interface ModuleDetail {
  id: string;
  moduleKey: string;
  title: string;
  category: string;
  scope: string;
  stateCode: string | null;
  content: string;
  source: string | null;
  effectiveDate: string | null;
  expirationDate: string | null;
  version: number;
  lastVerifiedAt: string | null;
  createdAt: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  regulation: "Regulation",
  licensing: "Licensing",
  use_of_force: "Use of Force",
  tax: "Tax",
  pricing: "Pricing",
  labor_law: "Labor Law",
  insurance: "Insurance",
  contract_law: "Contract Law",
  compliance: "Compliance",
  industry_standards: "Industry Standards",
};

const CATEGORY_COLORS: Record<string, string> = {
  regulation: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  licensing: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  use_of_force: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  tax: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  pricing: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  labor_law: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",
  insurance: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
};

export function TrinityKnowledgePanel() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedModule, setSelectedModule] = useState<ModuleDetail | null>(null);

  const { data, isLoading } = useQuery<{ modules: KnowledgeModule[] }>({
    queryKey: ["/api/platform/knowledge/static"],
  });

  const reseedMutation = useMutation({
    mutationFn: () => apiRequest("/api/platform/knowledge/reseed", { method: "POST" }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/knowledge/static"] });
      toast({ title: "Knowledge base reseeded", description: `${data.moduleCount} modules loaded.` });
    },
    onError: (err: any) => {
      toast({ title: "Reseed failed", description: err.message, variant: "destructive" });
    },
  });

  const openModule = async (moduleKey: string) => {
    try {
      const res = await apiRequest(`/api/platform/knowledge/static/${moduleKey}`);
      setSelectedModule(res.module);
    } catch (err: any) {
      toast({ title: "Failed to load module", description: err.message, variant: "destructive" });
    }
  };

  const modules = data?.modules ?? [];
  const filtered = modules.filter(m =>
    !search ||
    m.title.toLowerCase().includes(search.toLowerCase()) ||
    m.category.toLowerCase().includes(search.toLowerCase()) ||
    (m.stateCode ?? "").toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 rounded-md bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="panel-trinity-knowledge">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">Trinity Knowledge Base</h3>
          <p className="text-sm text-muted-foreground">
            Static industry knowledge modules — regulations, tax, pricing, labor law, use of force.
            Trinity pulls these into context when answering relevant questions.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => reseedMutation.mutate()}
          disabled={reseedMutation.isPending}
          data-testid="button-reseed-knowledge"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${reseedMutation.isPending ? "animate-spin" : ""}`} />
          {reseedMutation.isPending ? "Reseeding…" : "Re-Seed Modules"}
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by title, category, or state…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
            data-testid="input-knowledge-search"
          />
        </div>
        <Badge variant="outline" className="text-xs shrink-0" data-testid="badge-module-count">
          {filtered.length} module{filtered.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <BookOpen className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {modules.length === 0
                ? "No knowledge modules loaded. Click \"Re-Seed Modules\" to load the static knowledge base."
                : "No modules match your search."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="divide-y rounded-md border">
          {filtered.map((mod, idx) => (
            <button
              key={mod.id}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover-elevate active-elevate-2 transition-colors"
              onClick={() => openModule(mod.moduleKey)}
              data-testid={`row-knowledge-${idx}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                  <span className="text-sm font-medium truncate">{mod.title}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[mod.category] ?? "bg-muted text-muted-foreground"}`}
                  >
                    {CATEGORY_LABELS[mod.category] ?? mod.category}
                  </span>
                  {mod.stateCode ? (
                    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {mod.stateCode}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                      <Globe className="h-3 w-3" />
                      Global
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">v{mod.version}</span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Trinity uses these modules to answer regulatory, compliance, tax, and pricing questions.
        Content is injected into context when keywords match the user query.
        Tax rates expire annually — verify and re-seed at the start of each year.
      </p>

      <Dialog open={!!selectedModule} onOpenChange={open => !open && setSelectedModule(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              {selectedModule?.title}
            </DialogTitle>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {selectedModule?.category && (
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[selectedModule.category] ?? "bg-muted text-muted-foreground"}`}>
                  {CATEGORY_LABELS[selectedModule.category] ?? selectedModule.category}
                </span>
              )}
              {selectedModule?.stateCode && (
                <Badge variant="outline" className="text-xs">{selectedModule.stateCode}</Badge>
              )}
              {selectedModule?.source && (
                <span className="text-xs text-muted-foreground">
                  Source: {selectedModule.source.slice(0, 80)}{selectedModule.source.length > 80 ? "…" : ""}
                </span>
              )}
            </div>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0 mt-2">
            <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed p-1">
              {selectedModule?.content}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
