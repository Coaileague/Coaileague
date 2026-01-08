import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Upload, FileText, FolderOpen, Pen, Eye, Download, Trash2, Search, Clock, User, CheckCircle, XCircle, Send } from "lucide-react";
import { format } from "date-fns";

const DOCUMENT_CATEGORIES = [
  { id: "client_contract", label: "Client Contracts", icon: FileText },
  { id: "employee_handbook", label: "Employee Handbooks", icon: FileText },
  { id: "sop", label: "SOPs & Procedures", icon: FolderOpen },
  { id: "training_material", label: "Training Materials", icon: FileText },
  { id: "form", label: "Forms & Templates", icon: FileText },
  { id: "proposal", label: "Proposals", icon: FileText },
  { id: "shared", label: "Shared Documents", icon: FolderOpen },
];

interface OrgDocument {
  id: string;
  category: string;
  fileName: string;
  filePath: string;
  fileSizeBytes: number;
  fileType: string;
  description: string;
  requiresSignature: boolean;
  totalSignaturesRequired: number;
  signaturesCompleted: number;
  createdAt: string;
  uploadedByUser?: { id: string; firstName: string; lastName: string };
}

interface Signature {
  id: string;
  signedAt: string;
  signatureType: string;
  signer?: { id: string; firstName: string; lastName: string; email: string };
  signerEmail?: string;
  signerName?: string;
}

function DocumentCard({ doc, onView, onSign, onRequestSignature }: { 
  doc: OrgDocument; 
  onView: () => void; 
  onSign: () => void;
  onRequestSignature: () => void;
}) {
  const category = DOCUMENT_CATEGORIES.find(c => c.id === doc.category);
  const Icon = category?.icon || FileText;
  
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <Card className="hover-elevate" data-testid={`card-document-${doc.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Icon className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-medium truncate">{doc.fileName}</h4>
            <p className="text-sm text-muted-foreground truncate">{doc.description || "No description"}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="outline" className="text-xs">{category?.label || doc.category}</Badge>
              {doc.fileType && <Badge variant="secondary" className="text-xs">.{doc.fileType}</Badge>}
              {doc.fileSizeBytes && (
                <span className="text-xs text-muted-foreground">{formatBytes(doc.fileSizeBytes)}</span>
              )}
            </div>
            {doc.requiresSignature && (
              <div className="flex items-center gap-2 mt-2">
                {doc.signaturesCompleted === doc.totalSignaturesRequired ? (
                  <Badge className="bg-green-500 text-white text-xs">
                    <CheckCircle className="w-3 h-3 mr-1" /> Complete
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    <Pen className="w-3 h-3 mr-1" />
                    {doc.signaturesCompleted}/{doc.totalSignaturesRequired} signed
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4 pt-3 border-t">
          <Button size="sm" variant="ghost" onClick={onView} data-testid={`button-view-${doc.id}`}>
            <Eye className="w-4 h-4 mr-1" /> View
          </Button>
          {doc.requiresSignature && (
            <>
              <Button size="sm" variant="ghost" onClick={onSign} data-testid={`button-sign-${doc.id}`}>
                <Pen className="w-4 h-4 mr-1" /> Sign
              </Button>
              <Button size="sm" variant="ghost" onClick={onRequestSignature} data-testid={`button-request-sig-${doc.id}`}>
                <Send className="w-4 h-4 mr-1" /> Request
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DocumentLibrary() {
  const { toast } = useToast();
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<OrgDocument | null>(null);
  const [showSignDialog, setShowSignDialog] = useState(false);
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [signatureData, setSignatureData] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const { data: docsData, isLoading } = useQuery({
    queryKey: ["/api/documents", activeCategory !== "all" ? activeCategory : undefined],
  });

  const { data: signaturesData } = useQuery({
    queryKey: ["/api/documents", selectedDoc?.id, "signatures"],
    enabled: !!selectedDoc?.id,
  });

  const uploadMutation = useMutation({
    mutationFn: (data: any) => apiRequest("/api/documents", { 
      method: "POST", 
      body: JSON.stringify(data), 
      headers: { "Content-Type": "application/json" } 
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      setShowUpload(false);
      toast({ title: "Document uploaded successfully" });
    },
  });

  const signMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest(`/api/documents/${id}/sign`, { 
      method: "POST", 
      body: JSON.stringify(data), 
      headers: { "Content-Type": "application/json" } 
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      setShowSignDialog(false);
      setSelectedDoc(null);
      setSignatureData("");
      toast({ title: "Document signed successfully" });
    },
  });

  const requestSignatureMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest(`/api/documents/${id}/request-signature`, { 
      method: "POST", 
      body: JSON.stringify(data), 
      headers: { "Content-Type": "application/json" } 
    }),
    onSuccess: (data: any) => {
      setShowRequestDialog(false);
      toast({ 
        title: "Signature request sent",
        description: `Share link: ${window.location.origin}${data.signatureLink}`
      });
    },
  });

  const documents: OrgDocument[] = docsData?.data?.map((d: any) => ({ ...d.document, uploadedByUser: d.uploadedByUser })) || [];
  const signatures: Signature[] = signaturesData?.data?.map((s: any) => ({ ...s.signature, signer: s.signer })) || [];

  const filteredDocs = documents.filter(doc => {
    const matchesCategory = activeCategory === "all" || doc.category === activeCategory;
    const matchesSearch = !searchQuery || 
      doc.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleUpload = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    uploadMutation.mutate({
      category: formData.get("category"),
      fileName: formData.get("fileName"),
      filePath: `/uploads/${Date.now()}-${formData.get("fileName")}`,
      description: formData.get("description"),
      requiresSignature: formData.get("requiresSignature") === "on",
      totalSignaturesRequired: Number(formData.get("totalSignaturesRequired")) || 0,
    });
  };

  const handleSign = () => {
    if (!selectedDoc || !signatureData) return;
    signMutation.mutate({
      id: selectedDoc.id,
      signatureData,
      signatureType: "drawn",
    });
  };

  const handleRequestSignature = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedDoc) return;
    const formData = new FormData(e.currentTarget);
    requestSignatureMutation.mutate({
      id: selectedDoc.id,
      signerEmail: formData.get("signerEmail"),
      signerName: formData.get("signerName"),
    });
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    ctx.beginPath();
    ctx.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      setSignatureData(canvas.toDataURL());
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureData("");
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Document Library</h1>
          <p className="text-muted-foreground">Manage organization documents and e-signatures</p>
        </div>
        <Dialog open={showUpload} onOpenChange={setShowUpload}>
          <DialogTrigger asChild>
            <Button data-testid="button-upload">
              <Upload className="w-4 h-4 mr-2" />
              Upload Document
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Document</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <Label htmlFor="fileName">Document Name *</Label>
                <Input id="fileName" name="fileName" required data-testid="input-file-name" />
              </div>
              <div>
                <Label htmlFor="category">Category *</Label>
                <Select name="category" required>
                  <SelectTrigger data-testid="select-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_CATEGORIES.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" name="description" data-testid="input-description" />
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="requiresSignature" name="requiresSignature" className="w-4 h-4" data-testid="checkbox-requires-signature" />
                  <Label htmlFor="requiresSignature">Requires Signature</Label>
                </div>
                <div className="flex-1">
                  <Label htmlFor="totalSignaturesRequired">Signatures Needed</Label>
                  <Input type="number" id="totalSignaturesRequired" name="totalSignaturesRequired" min="0" defaultValue="0" data-testid="input-signatures-needed" />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={uploadMutation.isPending} data-testid="button-submit-upload">
                  {uploadMutation.isPending ? "Uploading..." : "Upload"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-56 border-r p-4 space-y-1">
          <Button
            variant={activeCategory === "all" ? "secondary" : "ghost"}
            className="w-full justify-start"
            onClick={() => setActiveCategory("all")}
            data-testid="button-category-all"
          >
            <FolderOpen className="w-4 h-4 mr-2" />
            All Documents
          </Button>
          {DOCUMENT_CATEGORIES.map(cat => (
            <Button
              key={cat.id}
              variant={activeCategory === cat.id ? "secondary" : "ghost"}
              className="w-full justify-start"
              onClick={() => setActiveCategory(cat.id)}
              data-testid={`button-category-${cat.id}`}
            >
              <cat.icon className="w-4 h-4 mr-2" />
              {cat.label}
            </Button>
          ))}
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-4 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search"
              />
            </div>
          </div>

          <ScrollArea className="flex-1 p-4">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading documents...</div>
            ) : filteredDocs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No documents found</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredDocs.map(doc => (
                  <DocumentCard
                    key={doc.id}
                    doc={doc}
                    onView={() => setSelectedDoc(doc)}
                    onSign={() => { setSelectedDoc(doc); setShowSignDialog(true); }}
                    onRequestSignature={() => { setSelectedDoc(doc); setShowRequestDialog(true); }}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      <Dialog open={!!selectedDoc && !showSignDialog && !showRequestDialog} onOpenChange={() => setSelectedDoc(null)}>
        <DialogContent className="max-w-2xl">
          {selectedDoc && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedDoc.fileName}</DialogTitle>
                <DialogDescription>{selectedDoc.description}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Category</p>
                    <p className="font-medium">{DOCUMENT_CATEGORIES.find(c => c.id === selectedDoc.category)?.label}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Uploaded</p>
                    <p className="font-medium">{format(new Date(selectedDoc.createdAt), "MMM d, yyyy")}</p>
                  </div>
                </div>
                {selectedDoc.requiresSignature && (
                  <div>
                    <h4 className="font-medium mb-2">Signatures ({signatures.length}/{selectedDoc.totalSignaturesRequired})</h4>
                    {signatures.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No signatures yet</p>
                    ) : (
                      <div className="space-y-2">
                        {signatures.map(sig => (
                          <div key={sig.id} className="flex items-center gap-2 p-2 border rounded">
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            <span className="text-sm">
                              {sig.signer ? `${sig.signer.firstName} ${sig.signer.lastName}` : sig.signerName || sig.signerEmail}
                            </span>
                            <span className="text-xs text-muted-foreground ml-auto">
                              {format(new Date(sig.signedAt), "MMM d, yyyy h:mm a")}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showSignDialog} onOpenChange={setShowSignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign Document</DialogTitle>
            <DialogDescription>Draw your signature below</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="border rounded-lg p-2 bg-white">
              <canvas
                ref={canvasRef}
                width={400}
                height={150}
                className="w-full cursor-crosshair"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                data-testid="canvas-signature"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={clearSignature} data-testid="button-clear-signature">Clear</Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSignDialog(false)}>Cancel</Button>
            <Button onClick={handleSign} disabled={!signatureData || signMutation.isPending} data-testid="button-submit-signature">
              {signMutation.isPending ? "Signing..." : "Sign Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRequestDialog} onOpenChange={setShowRequestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Signature</DialogTitle>
            <DialogDescription>Send a signature request to an external party</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRequestSignature} className="space-y-4">
            <div>
              <Label htmlFor="signerName">Signer Name *</Label>
              <Input id="signerName" name="signerName" required data-testid="input-signer-name" />
            </div>
            <div>
              <Label htmlFor="signerEmail">Signer Email *</Label>
              <Input id="signerEmail" name="signerEmail" type="email" required data-testid="input-signer-email" />
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowRequestDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={requestSignatureMutation.isPending} data-testid="button-send-request">
                {requestSignatureMutation.isPending ? "Sending..." : "Send Request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
