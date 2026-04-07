import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardDescription, 
  CardContent 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Table, 
  TableHeader, 
  TableRow, 
  TableHead, 
  TableBody, 
  TableCell 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Code, 
  Key, 
  Activity, 
  ExternalLink, 
  Copy, 
  Trash2, 
  Plus, 
  AlertCircle,
  Terminal,
  FileJson
} from "lucide-react";

export default function DeveloperPortal() {
  const { toast } = useToast();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newKeyData, setNewKeyData] = useState<any>(null);
  const [keyName, setKeyName] = useState("");

  const { data: keys, isLoading: keysLoading } = useQuery({
    queryKey: ["/api/developers/keys"],
  });

  const { data: status } = useQuery({
    queryKey: ["/api/developers/status"],
  });

  const createKeyMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/developers/keys", { name });
      return res.json();
    },
    onSuccess: (data) => {
      setNewKeyData(data);
      queryClient.invalidateQueries({ queryKey: ["/api/developers/keys"] });
      queryClient.invalidateQueries({ queryKey: ["/api/developers/status"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create API key",
        variant: "destructive",
      });
    }
  });

  const revokeKeyMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/developers/keys/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Key Revoked" });
      queryClient.invalidateQueries({ queryKey: ["/api/developers/keys"] });
      queryClient.invalidateQueries({ queryKey: ["/api/developers/status"] });
    },
  });

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#EAB308]">Developer Portal</h1>
          <p className="text-muted-foreground">Manage your API keys and access documentation.</p>
        </div>
        <div className="flex gap-4">
          <Badge variant="outline" className="h-9 px-4 flex gap-2">
            <Activity className="w-4 h-4 text-green-500" />
            System Status: {status?.status || 'checking...'}
          </Badge>
          <Button 
            onClick={() => setIsCreateModalOpen(true)}
            data-testid="button-create-key"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Key
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-1 pb-2">
            <div>
              <CardTitle>API Keys</CardTitle>
              <CardDescription>Your secret keys for authenticating API requests.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Prefix</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keysLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center">Loading...</TableCell></TableRow>
                ) : keys?.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No API keys found.</TableCell></TableRow>
                ) : keys?.map((key: any) => (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium" data-testid={`text-key-name-${key.id}`}>{key.name}</TableCell>
                    <TableCell><code>{key.key_prefix}...</code></TableCell>
                    <TableCell>
                      <Badge variant={key.is_active ? "default" : "secondary"}>
                        {key.is_active ? "Active" : "Revoked"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{new Date(key.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      {key.is_active && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-destructive hover:text-destructive"
                          onClick={() => revokeKeyMutation.mutate(key.id)}
                          data-testid={`button-revoke-key-${key.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resources</CardTitle>
            <CardDescription>Quick links and documentation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" className="w-full justify-start gap-2" asChild>
              <a href="/api/docs" target="_blank">
                <FileJson className="w-4 h-4" />
                OpenAPI Specification
                <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
              </a>
            </Button>
            
            <div className="space-y-2 pt-4">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Quick Example (cURL)</Label>
              <div className="bg-slate-950 p-3 rounded-md overflow-x-auto border border-slate-800">
                <pre className="text-xs text-slate-300">
                  <code>
{`curl -X GET "https://api.coaileague.com/api/employees" \\
  -H "Authorization: Bearer YOUR_API_KEY"`}
                  </code>
                </pre>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Quick Example (Node.js)</Label>
              <div className="bg-slate-950 p-3 rounded-md overflow-x-auto border border-slate-800">
                <pre className="text-xs text-slate-300">
                  <code>
{`const res = await fetch('/api/employees', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
});`}
                  </code>
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isCreateModalOpen} onOpenChange={(open) => {
        setIsCreateModalOpen(open);
        if (!open) {
          setNewKeyData(null);
          setKeyName("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New API Key</DialogTitle>
            <DialogDescription>
              Generate a new secret key to access the CoAIleague API.
            </DialogDescription>
          </DialogHeader>

          {newKeyData ? (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-amber-500/10 border border-amber-500/50 rounded-md flex gap-3 items-start">
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-amber-500">Save this key now!</p>
                  <p className="text-amber-500/80">For security, this is the ONLY time we will show the full key. If you lose it, you'll need to create a new one.</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Secret API Key</Label>
                <div className="flex gap-2">
                  <Input readOnly value={newKeyData.key} className="font-mono text-xs" />
                  <Button size="icon" variant="outline" onClick={() => handleCopy(newKeyData.key)}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="keyName">Key Name</Label>
                <Input 
                  id="keyName" 
                  placeholder="e.g., Production Server, Mobile App" 
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            {newKeyData ? (
              <Button onClick={() => setIsCreateModalOpen(false)}>I've saved it</Button>
            ) : (
              <Button 
                onClick={() => createKeyMutation.mutate(keyName)} 
                disabled={!keyName || createKeyMutation.isPending}
              >
                {createKeyMutation.isPending ? "Generating..." : "Generate Key"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
