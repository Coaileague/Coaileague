import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Users, Briefcase, Calendar, MapPin, DollarSign, Star, Clock, CheckCircle, XCircle, User, Award, ThumbsUp, ThumbsDown } from "lucide-react";
import { format } from "date-fns";

const GIG_STATUS = {
  open: { label: "Open", color: "bg-green-500" },
  assigned: { label: "Assigned", color: "bg-blue-500" },
  in_progress: { label: "In Progress", color: "bg-amber-500" },
  completed: { label: "Completed", color: "bg-gray-500" },
  cancelled: { label: "Cancelled", color: "bg-red-500" },
};

const CERTIFICATIONS = ["Armed Guard", "CPR/First Aid", "Crowd Control", "Executive Protection", "Fire Safety", "OSHA", "Security+"];

interface FlexContractor {
  id: string;
  userId: string;
  hourlyRate: string;
  certifications: string[];
  bio: string;
  ratingAverage: string;
  totalGigsCompleted: number;
  totalRatings: number;
  isPreferred: boolean;
  isActive: boolean;
  user?: { id: string; email: string; firstName: string; lastName: string };
}

interface FlexGig {
  id: string;
  title: string;
  description: string;
  gigDate: string;
  startTime: string;
  endTime: string;
  locationName: string;
  locationAddress: string;
  requirements: string[];
  payRate: string;
  status: string;
  applicationsCount: number;
  assignedContractorId: string | null;
  createdAt: string;
}

interface GigApplication {
  id: string;
  message: string;
  status: string;
  appliedAt: string;
  contractor?: FlexContractor;
  user?: { id: string; firstName: string; lastName: string; email: string };
}

function ContractorCard({ contractor, onView }: { contractor: { contractor: FlexContractor; user: any }; onView: () => void }) {
  const c = contractor.contractor;
  const u = contractor.user;
  const name = u?.firstName && u?.lastName ? `${u.firstName} ${u.lastName}` : u?.email || "Unknown";
  const initials = name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <Card className="hover-elevate cursor-pointer" onClick={onView} data-testid={`card-contractor-${c.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-12 w-12">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-medium truncate">{name}</h4>
              {c.isPreferred && <Award className="w-4 h-4 text-amber-500" />}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
              <span className="text-sm font-medium">{Number(c.ratingAverage).toFixed(1)}</span>
              <span className="text-sm text-muted-foreground">({c.totalRatings} reviews)</span>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {c.certifications?.slice(0, 3).map((cert: string) => (
                <Badge key={cert} variant="outline" className="text-xs">{cert}</Badge>
              ))}
              {c.certifications?.length > 3 && (
                <Badge variant="outline" className="text-xs">+{c.certifications.length - 3}</Badge>
              )}
            </div>
          </div>
          {c.hourlyRate && (
            <div className="text-right">
              <p className="font-bold text-lg">${c.hourlyRate}</p>
              <p className="text-xs text-muted-foreground">per hour</p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t text-sm text-muted-foreground">
          <span>{c.totalGigsCompleted} gigs completed</span>
          {c.isActive ? (
            <Badge variant="outline" className="text-green-600">Active</Badge>
          ) : (
            <Badge variant="outline" className="text-red-600">Inactive</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function GigCard({ gig, onView }: { gig: FlexGig; onView: () => void }) {
  const status = GIG_STATUS[gig.status as keyof typeof GIG_STATUS] || GIG_STATUS.open;

  return (
    <Card className="hover-elevate cursor-pointer" onClick={onView} data-testid={`card-gig-${gig.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h4 className="font-medium">{gig.title}</h4>
            <p className="text-sm text-muted-foreground line-clamp-2">{gig.description || "No description"}</p>
          </div>
          <Badge className={status.color}>{status.label}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span>{format(new Date(gig.gigDate), "MMM d, yyyy")}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span>{gig.startTime} - {gig.endTime}</span>
          </div>
          {gig.locationName && (
            <div className="flex items-center gap-2 text-sm col-span-2">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              <span className="truncate">{gig.locationName}</span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-green-600" />
            <span className="font-bold">${gig.payRate}/hr</span>
          </div>
          {gig.status === "open" && (
            <Badge variant="outline" className="text-xs">
              <Users className="w-3 h-3 mr-1" />
              {gig.applicationsCount} applications
            </Badge>
          )}
        </div>
        {gig.requirements?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {gig.requirements.map((req: string) => (
              <Badge key={req} variant="secondary" className="text-xs">{req}</Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function FlexStaffing() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("gigs");
  const [showNewGig, setShowNewGig] = useState(false);
  const [selectedGig, setSelectedGig] = useState<FlexGig | null>(null);
  const [selectedContractor, setSelectedContractor] = useState<any>(null);
  const [gigFilter, setGigFilter] = useState("all");

  const { data: gigsData, isLoading: gigsLoading } = useQuery({
    queryKey: ["/api/flex/gigs"],
  });

  const { data: contractorsData, isLoading: contractorsLoading } = useQuery({
    queryKey: ["/api/flex/contractors"],
  });

  const { data: applicationsData } = useQuery({
    queryKey: ["/api/flex/gigs", selectedGig?.id, "applications"],
    enabled: !!selectedGig?.id,
  });

  const createGigMutation = useMutation({
    mutationFn: (data: any) => apiRequest("/api/flex/gigs", { method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/flex/gigs"] });
      setShowNewGig(false);
      toast({ title: "Gig posted successfully" });
    },
  });

  const reviewApplicationMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => 
      apiRequest(`/api/flex/applications/${id}/review`, { method: "PATCH", body: JSON.stringify({ status }), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/flex/gigs"] });
      toast({ title: "Application reviewed" });
    },
  });

  const gigs: FlexGig[] = gigsData?.data || [];
  const contractors = contractorsData?.data || [];
  const applications: GigApplication[] = applicationsData?.data?.map((a: any) => ({
    ...a.application,
    contractor: a.contractor,
    user: a.user
  })) || [];

  const filteredGigs = gigFilter === "all" ? gigs : gigs.filter(g => g.status === gigFilter);

  const handleCreateGig = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const requirements = formData.get("requirements")?.toString().split(",").map(r => r.trim()).filter(Boolean) || [];
    
    createGigMutation.mutate({
      title: formData.get("title"),
      description: formData.get("description"),
      gigDate: formData.get("gigDate"),
      startTime: formData.get("startTime"),
      endTime: formData.get("endTime"),
      locationName: formData.get("locationName"),
      locationAddress: formData.get("locationAddress"),
      requirements,
      payRate: formData.get("payRate"),
    });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Flex Staffing Pool</h1>
          <p className="text-muted-foreground">Manage contractors and gig opportunities</p>
        </div>
        <Dialog open={showNewGig} onOpenChange={setShowNewGig}>
          <DialogTrigger asChild>
            <Button data-testid="button-post-gig">
              <Plus className="w-4 h-4 mr-2" />
              Post New Gig
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Post New Gig</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateGig} className="space-y-4">
              <div>
                <Label htmlFor="title">Gig Title *</Label>
                <Input id="title" name="title" required placeholder="e.g., Event Security Guard" data-testid="input-gig-title" />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" name="description" placeholder="Describe the gig requirements..." data-testid="input-gig-description" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="gigDate">Date *</Label>
                  <Input id="gigDate" name="gigDate" type="date" required data-testid="input-gig-date" />
                </div>
                <div>
                  <Label htmlFor="startTime">Start Time *</Label>
                  <Input id="startTime" name="startTime" type="time" required data-testid="input-start-time" />
                </div>
                <div>
                  <Label htmlFor="endTime">End Time *</Label>
                  <Input id="endTime" name="endTime" type="time" required data-testid="input-end-time" />
                </div>
              </div>
              <div>
                <Label htmlFor="locationName">Location Name</Label>
                <Input id="locationName" name="locationName" placeholder="e.g., Downtown Convention Center" data-testid="input-location-name" />
              </div>
              <div>
                <Label htmlFor="locationAddress">Address</Label>
                <Input id="locationAddress" name="locationAddress" placeholder="Full address" data-testid="input-location-address" />
              </div>
              <div>
                <Label htmlFor="payRate">Pay Rate ($/hr) *</Label>
                <Input id="payRate" name="payRate" type="number" step="0.01" required data-testid="input-pay-rate" />
              </div>
              <div>
                <Label htmlFor="requirements">Required Certifications</Label>
                <Input id="requirements" name="requirements" placeholder="Armed Guard, CPR, etc. (comma separated)" data-testid="input-requirements" />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createGigMutation.isPending} data-testid="button-submit-gig">
                  {createGigMutation.isPending ? "Posting..." : "Post Gig"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-4 gap-4 p-4 border-b">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{gigs.filter(g => g.status === "open").length}</p>
                <p className="text-sm text-muted-foreground">Open Gigs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{contractors.length}</p>
                <p className="text-sm text-muted-foreground">Active Contractors</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">{gigs.filter(g => g.status === "completed").length}</p>
                <p className="text-sm text-muted-foreground">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-500" />
              <div>
                <p className="text-2xl font-bold">{contractors.filter((c: any) => c.contractor?.isPreferred).length}</p>
                <p className="text-sm text-muted-foreground">Preferred</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 border-b">
          <TabsList>
            <TabsTrigger value="gigs" data-testid="tab-gigs">Gig Board</TabsTrigger>
            <TabsTrigger value="contractors" data-testid="tab-contractors">Contractor Pool</TabsTrigger>
          </TabsList>
          {activeTab === "gigs" && (
            <Select value={gigFilter} onValueChange={setGigFilter}>
              <SelectTrigger className="w-40" data-testid="select-gig-filter">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Gigs</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="assigned">Assigned</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        <TabsContent value="gigs" className="flex-1 overflow-auto m-0 p-4">
          {gigsLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading gigs...</div>
          ) : filteredGigs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No gigs found</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredGigs.map(gig => (
                <GigCard key={gig.id} gig={gig} onView={() => setSelectedGig(gig)} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="contractors" className="flex-1 overflow-auto m-0 p-4">
          {contractorsLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading contractors...</div>
          ) : contractors.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No contractors found</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {contractors.map((contractor: any) => (
                <ContractorCard 
                  key={contractor.contractor.id} 
                  contractor={contractor} 
                  onView={() => setSelectedContractor(contractor)} 
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedGig} onOpenChange={() => setSelectedGig(null)}>
        <DialogContent className="max-w-2xl">
          {selectedGig && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedGig.title}</DialogTitle>
                <DialogDescription>{selectedGig.description}</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span>{format(new Date(selectedGig.gigDate), "MMMM d, yyyy")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span>{selectedGig.startTime} - {selectedGig.endTime}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <span>{selectedGig.locationName || "TBD"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                    <span className="font-bold">${selectedGig.payRate}/hr</span>
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Requirements</h4>
                  <div className="flex flex-wrap gap-1">
                    {selectedGig.requirements?.map((req: string) => (
                      <Badge key={req} variant="outline">{req}</Badge>
                    )) || <span className="text-muted-foreground text-sm">None specified</span>}
                  </div>
                </div>
              </div>

              {selectedGig.status === "open" && (
                <div className="mt-4">
                  <h4 className="font-medium mb-2">Applications ({applications.length})</h4>
                  {applications.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No applications yet</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-auto">
                      {applications.map(app => (
                        <div key={app.id} className="flex items-center justify-between p-2 border rounded">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback>
                                {app.user?.firstName?.[0] || "?"}{app.user?.lastName?.[0] || ""}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium">
                                {app.user?.firstName} {app.user?.lastName}
                              </p>
                              <p className="text-xs text-muted-foreground">{app.message || "No message"}</p>
                            </div>
                          </div>
                          {app.status === "pending" ? (
                            <div className="flex gap-1">
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className="h-8 w-8 text-green-600"
                                onClick={() => reviewApplicationMutation.mutate({ id: app.id, status: "accepted" })}
                                data-testid={`button-accept-${app.id}`}
                              >
                                <ThumbsUp className="w-4 h-4" />
                              </Button>
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className="h-8 w-8 text-red-600"
                                onClick={() => reviewApplicationMutation.mutate({ id: app.id, status: "rejected" })}
                                data-testid={`button-reject-${app.id}`}
                              >
                                <ThumbsDown className="w-4 h-4" />
                              </Button>
                            </div>
                          ) : (
                            <Badge variant={app.status === "accepted" ? "default" : "secondary"}>
                              {app.status}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedContractor} onOpenChange={() => setSelectedContractor(null)}>
        <DialogContent>
          {selectedContractor && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {selectedContractor.user?.firstName} {selectedContractor.user?.lastName}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarFallback className="text-lg">
                      {selectedContractor.user?.firstName?.[0]}{selectedContractor.user?.lastName?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                      <span className="text-lg font-bold">
                        {Number(selectedContractor.contractor.ratingAverage).toFixed(1)}
                      </span>
                      <span className="text-muted-foreground">
                        ({selectedContractor.contractor.totalRatings} reviews)
                      </span>
                    </div>
                    <p className="text-muted-foreground">
                      {selectedContractor.contractor.totalGigsCompleted} gigs completed
                    </p>
                  </div>
                </div>
                {selectedContractor.contractor.bio && (
                  <div>
                    <h4 className="font-medium mb-1">Bio</h4>
                    <p className="text-sm text-muted-foreground">{selectedContractor.contractor.bio}</p>
                  </div>
                )}
                <div>
                  <h4 className="font-medium mb-2">Certifications</h4>
                  <div className="flex flex-wrap gap-1">
                    {selectedContractor.contractor.certifications?.map((cert: string) => (
                      <Badge key={cert} variant="outline">{cert}</Badge>
                    )) || <span className="text-muted-foreground text-sm">None listed</span>}
                  </div>
                </div>
                <div className="flex items-center justify-between pt-4 border-t">
                  <div>
                    <p className="text-sm text-muted-foreground">Hourly Rate</p>
                    <p className="text-xl font-bold">${selectedContractor.contractor.hourlyRate}/hr</p>
                  </div>
                  {selectedContractor.contractor.isPreferred && (
                    <Badge className="bg-amber-500">
                      <Award className="w-4 h-4 mr-1" /> Preferred
                    </Badge>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
