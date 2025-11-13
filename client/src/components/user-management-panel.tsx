import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  User,
  Mail,
  Shield,
  Edit,
  Key,
  UserPlus,
  Building2,
  Calendar,
  AlertCircle,
} from "lucide-react";

interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  workId: string | null;
  platformRole: string;
  workspaceCount?: number;
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface UserDetails {
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    workId: string | null;
    phone: string | null;
    emailVerified: boolean;
    lastLoginAt: string | null;
    loginAttempts: number;
    lockedUntil: string | null;
    createdAt: string;
  };
  platformRole: string;
  workspaces: Array<{
    workspaceId: string;
    workspaceName: string;
    companyName: string | null;
    role: string;
    title: string | null;
    department: string | null;
  }>;
}

export function UserManagementPanel() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  
  // Edit states
  const [editEmail, setEditEmail] = useState("");
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editWorkId, setEditWorkId] = useState("");
  const [selectedPlatformRole, setSelectedPlatformRole] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [roleReason, setRoleReason] = useState("");
  
  // Create states
  const [createEmail, setCreateEmail] = useState("");
  const [createFirstName, setCreateFirstName] = useState("");
  const [createLastName, setCreateLastName] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createPlatformRole, setCreatePlatformRole] = useState("none");

  // Search users
  const { data: searchResults, isLoading: isSearching } = useQuery<User[]>({
    queryKey: ['/api/platform/users/search', searchQuery],
    queryFn: async () => {
      if (!searchQuery || searchQuery.trim().length === 0) {
        return [];
      }
      const response = await fetch(`/api/platform/users/search?q=${encodeURIComponent(searchQuery)}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to search users');
      return response.json();
    },
    enabled: searchQuery.trim().length > 0,
  });

  // Get user details
  const { data: userDetails, isLoading: isLoadingDetails } = useQuery<UserDetails>({
    queryKey: ['/api/platform/users', selectedUserId],
    enabled: !!selectedUserId,
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async (data: { userId: string; updates: any }) => {
      return apiRequest("PATCH", `/api/platform/users/${data.userId}`, data.updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/platform/users'] });
      toast({
        title: "Success",
        description: "User updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update user",
        variant: "destructive",
      });
    },
  });

  // Set password mutation
  const setPasswordMutation = useMutation({
    mutationFn: async (data: { userId: string; password: string }) => {
      return apiRequest("POST", `/api/platform/users/${data.userId}/set-password`, { password: data.password });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Password updated successfully",
      });
      setShowPasswordDialog(false);
      setNewPassword("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to set password",
        variant: "destructive",
      });
    },
  });

  // Grant role mutation
  const grantRoleMutation = useMutation({
    mutationFn: async (data: { userId: string; role: string; reason: string }) => {
      return apiRequest("POST", `/api/platform/users/${data.userId}/grant-role`, { role: data.role, reason: data.reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/platform/users'] });
      toast({
        title: "Success",
        description: "Platform role granted successfully",
      });
      setRoleReason("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to grant role",
        variant: "destructive",
      });
    },
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", '/api/platform/users', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/platform/users'] });
      toast({
        title: "Success",
        description: "User created successfully",
      });
      setShowCreateDialog(false);
      resetCreateForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create user",
        variant: "destructive",
      });
    },
  });

  const resetCreateForm = () => {
    setCreateEmail("");
    setCreateFirstName("");
    setCreateLastName("");
    setCreatePassword("");
    setCreatePlatformRole("none");
  };

  const handleSelectUser = (userId: string) => {
    setSelectedUserId(userId);
    setShowDetailsDialog(true);
  };

  const handleOpenUserDetails = () => {
    if (userDetails) {
      setEditEmail(userDetails.user.email);
      setEditFirstName(userDetails.user.firstName || "");
      setEditLastName(userDetails.user.lastName || "");
      setEditPhone(userDetails.user.phone || "");
      setEditWorkId(userDetails.user.workId || "");
      setSelectedPlatformRole(userDetails.platformRole);
    }
  };

  const handleSaveUserChanges = () => {
    if (!selectedUserId) return;

    updateUserMutation.mutate({
      userId: selectedUserId,
      updates: {
        email: editEmail,
        firstName: editFirstName,
        lastName: editLastName,
        phone: editPhone,
        workId: editWorkId,
      },
    });
  };

  const handleSetPassword = () => {
    if (!selectedUserId || !newPassword) {
      toast({
        title: "Validation Error",
        description: "Password is required",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 8) {
      toast({
        title: "Validation Error",
        description: "Password must be at least 8 characters",
        variant: "destructive",
      });
      return;
    }

    setPasswordMutation.mutate({
      userId: selectedUserId,
      password: newPassword,
    });
  };

  const handleGrantRole = () => {
    if (!selectedUserId || !selectedPlatformRole) return;

    if (selectedPlatformRole === userDetails?.platformRole) {
      toast({
        title: "Info",
        description: "User already has this role",
      });
      return;
    }

    grantRoleMutation.mutate({
      userId: selectedUserId,
      role: selectedPlatformRole,
      reason: roleReason || `Platform role changed to ${selectedPlatformRole}`,
    });
  };

  const handleCreateUser = () => {
    if (!createEmail || !createPassword) {
      toast({
        title: "Validation Error",
        description: "Email and password are required",
        variant: "destructive",
      });
      return;
    }

    if (createPassword.length < 8) {
      toast({
        title: "Validation Error",
        description: "Password must be at least 8 characters",
        variant: "destructive",
      });
      return;
    }

    createUserMutation.mutate({
      email: createEmail,
      firstName: createFirstName,
      lastName: createLastName,
      password: createPassword,
      platformRole: createPlatformRole !== "none" ? createPlatformRole : undefined,
    });
  };

  const getPlatformRoleBadge = (role: string) => {
    const colors: Record<string, string> = {
      root: "bg-red-500/20 text-red-300 border-red-500/30",
      deputy_admin: "bg-orange-500/20 text-orange-300 border-orange-500/30",
      deputy_assistant: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
      sysop: "bg-blue-500/20 text-blue-300 border-blue-500/30",
      support: "bg-muted/20 text-blue-300 border-primary/30",
      none: "bg-slate-500/20 text-slate-300 border-slate-500/30",
    };

    return (
      <Badge className={colors[role] || colors.none}>
        {role.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-white flex items-center gap-2">
                <User className="h-5 w-5" />
                User Management
              </CardTitle>
              <CardDescription className="text-slate-400">
                Search, view, and manage platform users
              </CardDescription>
            </div>
            <Button
              onClick={() => setShowCreateDialog(true)}
              className="bg-indigo-500/20 border-indigo-500/30 hover:bg-indigo-500/30 text-white"
              data-testid="button-create-user"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Create User
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by name, email, user ID, or work ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-slate-500"
              data-testid="input-user-search"
            />
          </div>

          {/* Search Results */}
          {searchQuery && (
            <div className="space-y-2">
              {isSearching ? (
                <div className="text-center text-slate-400 py-4">Searching...</div>
              ) : searchResults && searchResults.length > 0 ? (
                searchResults.map((user) => (
                  <div
                    key={user.id}
                    onClick={() => handleSelectUser(user.id)}
                    className="p-4 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 cursor-pointer transition-colors"
                    data-testid={`user-result-${user.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-white font-medium">
                            {user.firstName && user.lastName
                              ? `${user.firstName} ${user.lastName}`
                              : user.email}
                          </p>
                          {getPlatformRoleBadge(user.platformRole)}
                        </div>
                        <p className="text-sm text-slate-400">{user.email}</p>
                        {user.workId && (
                          <p className="text-xs text-slate-500">Work ID: {user.workId}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {user.workspaceCount} workspace{user.workspaceCount !== 1 ? 's' : ''}
                          </span>
                          {user.lastLoginAt && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Last login: {new Date(user.lastLoginAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-foreground hover:text-indigo-100"
                        data-testid={`button-view-user-${user.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-slate-400 py-4">
                  No users found matching "{searchQuery}"
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* User Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={(open) => {
        setShowDetailsDialog(open);
        if (open) {
          handleOpenUserDetails();
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-slate-900 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">User Details</DialogTitle>
            <DialogDescription className="text-slate-400">
              View and edit user information
            </DialogDescription>
          </DialogHeader>

          {isLoadingDetails ? (
            <div className="text-center py-8 text-slate-400">Loading user details...</div>
          ) : userDetails ? (
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white">Basic Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-email" className="text-slate-300">Email</Label>
                    <Input
                      id="edit-email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="bg-white/5 border-white/10 text-white"
                      data-testid="input-edit-email"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-work-id" className="text-slate-300">Work ID</Label>
                    <Input
                      id="edit-work-id"
                      value={editWorkId}
                      onChange={(e) => setEditWorkId(e.target.value)}
                      className="bg-white/5 border-white/10 text-white"
                      data-testid="input-edit-workid"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-first-name" className="text-slate-300">First Name</Label>
                    <Input
                      id="edit-first-name"
                      value={editFirstName}
                      onChange={(e) => setEditFirstName(e.target.value)}
                      className="bg-white/5 border-white/10 text-white"
                      data-testid="input-edit-firstname"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-last-name" className="text-slate-300">Last Name</Label>
                    <Input
                      id="edit-last-name"
                      value={editLastName}
                      onChange={(e) => setEditLastName(e.target.value)}
                      className="bg-white/5 border-white/10 text-white"
                      data-testid="input-edit-lastname"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="edit-phone" className="text-slate-300">Phone</Label>
                    <Input
                      id="edit-phone"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="bg-white/5 border-white/10 text-white"
                      data-testid="input-edit-phone"
                    />
                  </div>
                </div>
                <Button
                  onClick={handleSaveUserChanges}
                  disabled={updateUserMutation.isPending}
                  className="bg-indigo-500/20 border-indigo-500/30 hover:bg-indigo-500/30"
                  data-testid="button-save-user-changes"
                >
                  {updateUserMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>

              {/* Platform Role */}
              <div className="space-y-4 border-t border-white/10 pt-6">
                <h3 className="text-lg font-semibold text-white">Platform Role</h3>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="platform-role" className="text-slate-300">Role</Label>
                    <Select value={selectedPlatformRole} onValueChange={setSelectedPlatformRole}>
                      <SelectTrigger className="bg-white/5 border-white/10 text-white" data-testid="select-platform-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None (Regular User)</SelectItem>
                        <SelectItem value="support">Support</SelectItem>
                        <SelectItem value="sysop">Sysop</SelectItem>
                        <SelectItem value="deputy_assistant">Deputy Assistant</SelectItem>
                        <SelectItem value="deputy_admin">Deputy Admin</SelectItem>
                        <SelectItem value="root">Root</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="role-reason" className="text-slate-300">Reason for Change</Label>
                    <Textarea
                      id="role-reason"
                      value={roleReason}
                      onChange={(e) => setRoleReason(e.target.value)}
                      placeholder="Why are you changing this user's platform role?"
                      className="bg-white/5 border-white/10 text-white"
                      data-testid="textarea-role-reason"
                    />
                  </div>
                  <Button
                    onClick={handleGrantRole}
                    disabled={grantRoleMutation.isPending || selectedPlatformRole === userDetails.platformRole}
                    className="bg-orange-500/20 border-orange-500/30 hover:bg-orange-500/30"
                    data-testid="button-grant-role"
                  >
                    <Shield className="h-4 w-4 mr-2" />
                    {grantRoleMutation.isPending ? "Updating..." : "Update Platform Role"}
                  </Button>
                </div>
              </div>

              {/* Password Reset */}
              <div className="space-y-4 border-t border-white/10 pt-6">
                <h3 className="text-lg font-semibold text-white">Security</h3>
                <Button
                  onClick={() => setShowPasswordDialog(true)}
                  variant="outline"
                  className="border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/20"
                  data-testid="button-set-password"
                >
                  <Key className="h-4 w-4 mr-2" />
                  Set New Password
                </Button>
              </div>

              {/* Workspace Memberships */}
              {userDetails.workspaces && userDetails.workspaces.length > 0 && (
                <div className="space-y-4 border-t border-white/10 pt-6">
                  <h3 className="text-lg font-semibold text-white">Workspace Memberships</h3>
                  <div className="space-y-2">
                    {userDetails.workspaces.map((ws, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-lg bg-white/5 border border-white/10"
                        data-testid={`workspace-${ws.workspaceId}`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-white font-medium">{ws.workspaceName}</p>
                            {ws.companyName && (
                              <p className="text-sm text-slate-400">{ws.companyName}</p>
                            )}
                            {ws.title && (
                              <p className="text-xs text-slate-500">{ws.title}</p>
                            )}
                          </div>
                          <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">
                            {ws.role}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Password Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="bg-slate-900 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Set New Password</DialogTitle>
            <DialogDescription className="text-slate-400">
              Enter a new password for this user (minimum 8 characters)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="new-password" className="text-slate-300">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password..."
                className="bg-white/5 border-white/10 text-white"
                data-testid="input-new-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowPasswordDialog(false);
                setNewPassword("");
              }}
              data-testid="button-cancel-password"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSetPassword}
              disabled={setPasswordMutation.isPending || !newPassword || newPassword.length < 8}
              className="bg-yellow-500/20 border-yellow-500/30 hover:bg-yellow-500/30"
              data-testid="button-confirm-password"
            >
              {setPasswordMutation.isPending ? "Setting..." : "Set Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create User Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-slate-900 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Create New User</DialogTitle>
            <DialogDescription className="text-slate-400">
              Create a new user account with optional platform role
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="create-email" className="text-slate-300">Email *</Label>
              <Input
                id="create-email"
                type="email"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                placeholder="user@example.com"
                className="bg-white/5 border-white/10 text-white"
                data-testid="input-create-email"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="create-first-name" className="text-slate-300">First Name</Label>
                <Input
                  id="create-first-name"
                  value={createFirstName}
                  onChange={(e) => setCreateFirstName(e.target.value)}
                  placeholder="John"
                  className="bg-white/5 border-white/10 text-white"
                  data-testid="input-create-firstname"
                />
              </div>
              <div>
                <Label htmlFor="create-last-name" className="text-slate-300">Last Name</Label>
                <Input
                  id="create-last-name"
                  value={createLastName}
                  onChange={(e) => setCreateLastName(e.target.value)}
                  placeholder="Doe"
                  className="bg-white/5 border-white/10 text-white"
                  data-testid="input-create-lastname"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="create-password" className="text-slate-300">Password * (min 8 characters)</Label>
              <Input
                id="create-password"
                type="password"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                placeholder="Enter password..."
                className="bg-white/5 border-white/10 text-white"
                data-testid="input-create-password"
              />
            </div>
            <div>
              <Label htmlFor="create-platform-role" className="text-slate-300">Platform Role (Optional)</Label>
              <Select value={createPlatformRole} onValueChange={setCreatePlatformRole}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white" data-testid="select-create-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (Regular User)</SelectItem>
                  <SelectItem value="support">Support</SelectItem>
                  <SelectItem value="sysop">Sysop</SelectItem>
                  <SelectItem value="deputy_assistant">Deputy Assistant</SelectItem>
                  <SelectItem value="deputy_admin">Deputy Admin</SelectItem>
                  <SelectItem value="root">Root</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                resetCreateForm();
              }}
              data-testid="button-cancel-create"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateUser}
              disabled={createUserMutation.isPending || !createEmail || !createPassword}
              className="bg-indigo-500/20 border-indigo-500/30 hover:bg-indigo-500/30"
              data-testid="button-confirm-create"
            >
              {createUserMutation.isPending ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
