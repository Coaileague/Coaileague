import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search, Clock, Users, FileText, DollarSign, Calendar, Sparkles } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface SearchResult {
  employees: any[];
  clients: any[];
  invoices: any[];
  timeEntries: any[];
  shifts: any[];
}

interface SearchMetadata {
  totalResults: number;
  executionTimeMs: number;
  query: string;
  searchType: string;
}

export default function AIRecords() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<string>("all");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [metadata, setMetadata] = useState<SearchMetadata | null>(null);
  const { toast } = useToast();

  // Fetch search history
  const { data: searchHistory } = useQuery({
    queryKey: ['/api/search/history'],
  });

  // Search mutation
  const searchMutation = useMutation({
    mutationFn: async ({ query, searchType }: { query: string; searchType: string }) => {
      const response = await apiRequest('POST', '/api/search', { query, searchType });
      return response;
    },
    onSuccess: (data: any) => {
      setResults(data.results);
      setMetadata(data.metadata);
      queryClient.invalidateQueries({ queryKey: ['/api/search/history'] });
      toast({
        title: data.metadata.aiPowered ? "AI Search Complete" : "Search Complete",
        description: `Found ${data.metadata.totalResults} results in ${data.metadata.executionTimeMs}ms${data.metadata.aiPowered ? ' (AI-powered)' : ''}`,
      });
    },
    onError: () => {
      toast({
        title: "Search failed",
        description: "Unable to perform search. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      searchMutation.mutate({ query: searchQuery, searchType });
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg">
            <Search className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">AI Records™</h1>
            <p className="text-muted-foreground">Natural language search across all your data</p>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <Card className="p-6">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Try: 'Show me employees hired this month' or 'Find invoices over $5000'"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-query"
              />
            </div>
            <Button
              type="submit"
              disabled={!searchQuery.trim() || searchMutation.isPending}
              data-testid="button-search"
            >
              {searchMutation.isPending ? (
                <>
                  <Sparkles className="h-4 w-4 mr-2 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </>
              )}
            </Button>
          </div>

          {/* Search Type Tabs */}
          <Tabs value={searchType} onValueChange={setSearchType} className="w-full">
            <TabsList className="grid grid-cols-6 w-full">
              <TabsTrigger value="all" data-testid="tab-search-all">All</TabsTrigger>
              <TabsTrigger value="employees" data-testid="tab-search-employees">
                <Users className="h-4 w-4 mr-1" />
                Employees
              </TabsTrigger>
              <TabsTrigger value="clients" data-testid="tab-search-clients">
                <FileText className="h-4 w-4 mr-1" />
                Clients
              </TabsTrigger>
              <TabsTrigger value="invoices" data-testid="tab-search-invoices">
                <DollarSign className="h-4 w-4 mr-1" />
                Invoices
              </TabsTrigger>
              <TabsTrigger value="time_entries" data-testid="tab-search-time">
                <Clock className="h-4 w-4 mr-1" />
                Time
              </TabsTrigger>
              <TabsTrigger value="shifts" data-testid="tab-search-shifts">
                <Calendar className="h-4 w-4 mr-1" />
                Shifts
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </form>
      </Card>

      {/* Search Results */}
      {results && metadata && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Search Results</h2>
            <Badge variant="outline">
              {metadata.totalResults} results in {metadata.executionTimeMs}ms
            </Badge>
          </div>

          <Tabs defaultValue="employees" className="w-full">
            <TabsList>
              <TabsTrigger value="employees" data-testid="tab-results-employees">
                Employees ({results.employees.length})
              </TabsTrigger>
              <TabsTrigger value="clients" data-testid="tab-results-clients">
                Clients ({results.clients.length})
              </TabsTrigger>
              <TabsTrigger value="invoices" data-testid="tab-results-invoices">
                Invoices ({results.invoices.length})
              </TabsTrigger>
              <TabsTrigger value="timeEntries" data-testid="tab-results-time">
                Time Entries ({results.timeEntries.length})
              </TabsTrigger>
              <TabsTrigger value="shifts" data-testid="tab-results-shifts">
                Shifts ({results.shifts.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="employees" className="space-y-2 mt-4">
              {results.employees.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No employees found</p>
              ) : (
                results.employees.map((employee) => (
                  <Card key={employee.id} className="p-4 hover-elevate" data-testid={`card-employee-${employee.id}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">{employee.firstName} {employee.lastName}</h3>
                        <p className="text-sm text-muted-foreground">{employee.email}</p>
                      </div>
                      <Badge>{employee.role || 'Employee'}</Badge>
                    </div>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="clients" className="space-y-2 mt-4">
              {results.clients.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No clients found</p>
              ) : (
                results.clients.map((client) => (
                  <Card key={client.id} className="p-4 hover-elevate" data-testid={`card-client-${client.id}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">{client.name}</h3>
                        <p className="text-sm text-muted-foreground">{client.contactEmail}</p>
                      </div>
                      <Badge variant="outline">{client.status || 'Active'}</Badge>
                    </div>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="invoices" className="space-y-2 mt-4">
              <p className="text-muted-foreground text-center py-8">No invoices found</p>
            </TabsContent>

            <TabsContent value="timeEntries" className="space-y-2 mt-4">
              <p className="text-muted-foreground text-center py-8">No time entries found</p>
            </TabsContent>

            <TabsContent value="shifts" className="space-y-2 mt-4">
              <p className="text-muted-foreground text-center py-8">No shifts found</p>
            </TabsContent>
          </Tabs>
        </Card>
      )}

      {/* Recent Searches */}
      {searchHistory && Array.isArray(searchHistory) && searchHistory.length > 0 && (
        <Card className="p-6 space-y-4">
          <h2 className="text-xl font-semibold">Recent Searches</h2>
          <div className="space-y-2">
            {searchHistory.slice(0, 5).map((item: any) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover-elevate cursor-pointer"
                onClick={() => {
                  setSearchQuery(item.query);
                  setSearchType(item.searchType);
                }}
                data-testid={`history-item-${item.id}`}
              >
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{item.query}</span>
                </div>
                <Badge variant="outline">{item.resultsCount} results</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
