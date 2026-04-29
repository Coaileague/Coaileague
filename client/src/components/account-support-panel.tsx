/**
 * Account Support Tools Panel
 * Comprehensive account management and support tools
 */

import { useState } from "react";
import { UniversalModal, UniversalModalTitle, UniversalModalClose, UniversalModalContent } from '@/components/ui/universal-modal';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Eye,
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Shield,
  Key,
  RefreshCw,
  Unlock,
  Lock,
  CheckCircle,
  XCircle,
  EyeOff,
  Edit,
  Save,
  AlertTriangle,
  Clock,
} from 'lucide-react';;
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AccountInfo {
  id: string;
  name: string;
  email: string;
  phone?: string;
  status: 'active' | 'locked' | 'suspended' | 'pending';
  tier: 'free' | 'professional' | 'enterprise' | 'elite';
  lastLogin?: string;
  accountAge?: string;
  ticketCount?: number;
}

interface AccountSupportPanelProps {
  isOpen: boolean;
  onClose: () => void;
  accountInfo?: AccountInfo;
  isStaff?: boolean;
  onAction?: (action: string, data?: any) => void;
}

const DialogStyledHeader = ({ children, ...props }: any) => <div className="flex items-center gap-2 pb-2 border-b border-border/40 mb-4" {...props}>{children}</div>;

export function AccountSupportPanel({ 
  isOpen, 
  onClose, 
  accountInfo,
  isStaff = false,
  onAction 
}: AccountSupportPanelProps) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState(accountInfo || {} as AccountInfo);

  const defaultAccount: AccountInfo = {
    id: accountInfo?.id || '',
    name: accountInfo?.name || 'Unknown',
    email: accountInfo?.email || 'Not available',
    phone: accountInfo?.phone || 'Not provided',
    status: accountInfo?.status || 'active',
    tier: accountInfo?.tier || 'free',
    lastLogin: accountInfo?.lastLogin || 'Unknown',
    accountAge: accountInfo?.accountAge || 'Unknown',
    ticketCount: accountInfo?.ticketCount || 0
  };

  const account = accountInfo || defaultAccount;

  const getStatusColor = (status: AccountInfo['status']) => {
    switch (status) {
      case 'active': return 'bg-muted/50 text-foreground dark:bg-slate-900/30';
      case 'locked': return 'bg-blue-100 text-blue-900 dark:bg-blue-900/30';
      case 'suspended': return 'bg-rose-100 text-rose-900 dark:bg-rose-900/30';
      case 'pending': return 'bg-blue-100 text-blue-900 dark:bg-blue-900/30';
      default: return 'bg-slate-100 text-slate-900';
    }
  };

  const getTierColor = (tier: AccountInfo['tier']) => {
    switch (tier) {
      case 'elite': return 'bg-purple-100 text-purple-900 border-purple-300';
      case 'enterprise': return 'bg-blue-100 text-blue-900 border-blue-300';
      case 'professional': return 'bg-blue-100 text-blue-900 border-blue-300';
      case 'free': return 'bg-slate-100 text-slate-900 border-slate-300';
    }
  };

  const handleAction = (action: string) => {
    if (onAction) {
      onAction(action, account);
    }
    toast({
      title: "Action Executed",
      description: `${action} completed for ${account.name}`,
    });
  };

  const handleSaveChanges = () => {
    if (onAction) {
      onAction('update_account', editData);
    }
    setIsEditing(false);
    toast({
      title: "Account Updated",
      description: "Changes have been saved successfully",
    });
  };

  return (
    <UniversalModal open={isOpen} onOpenChange={onClose}>
      <UniversalModalContent size="full" hideBuiltInClose className="max-h-[90vh] p-0 overflow-hidden">
        {/* @ts-ignore */}
        <DialogStyledHeader variant="info" className="p-5 sm:p-6">
          <UniversalModalTitle className="flex items-center gap-3 text-xl sm:text-2xl text-inherit">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
              <User className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            Account Support Tools
          </UniversalModalTitle>
          <p className="text-white/80 text-xs sm:text-sm mt-2">Manage account details, security, and support actions</p>
        {/* @ts-ignore */}
        </DialogStyledHeader>

        <ScrollArea className="max-h-[calc(90vh-120px)]">
          <div className="p-6 space-y-6">
            {/* Account Overview Card */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <User className="w-5 h-5 text-primary" />
                    Account Information
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge className={getStatusColor(account.status)}>
                      {account.status.toUpperCase()}
                    </Badge>
                    <Badge className={getTierColor(account.tier)}>
                      {account.tier.toUpperCase()}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Account Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-600 flex items-center gap-1">
                      <User className="w-3 h-3" /> Full Name
                    </Label>
                    {isEditing ? (
                      <Input
                        value={editData.name}
                        onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                        data-testid="input-account-name"
                      />
                    ) : (
                      <p className="text-sm font-medium" data-testid="text-account-name">{account.name}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-slate-600 flex items-center gap-1">
                      <Mail className="w-3 h-3" /> Email Address
                    </Label>
                    {isEditing ? (
                      <Input
                        value={editData.email}
                        onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                        data-testid="input-account-email"
                      />
                    ) : (
                      <p className="text-sm font-medium" data-testid="text-account-email">{account.email}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-slate-600 flex items-center gap-1">
                      <Phone className="w-3 h-3" /> Phone Number
                    </Label>
                    <p className="text-sm font-medium" data-testid="text-account-phone">{account.phone || 'Not provided'}</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-slate-600 flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> Account ID
                    </Label>
                    <p className="text-sm font-mono font-medium text-slate-600" data-testid="text-account-id">{account.id}</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-slate-600 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Last Login
                    </Label>
                    <p className="text-sm font-medium" data-testid="text-last-login">{account.lastLogin || 'Never'}</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-slate-600 flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> Account Age
                    </Label>
                    <p className="text-sm font-medium" data-testid="text-account-age">{account.accountAge || 'N/A'}</p>
                  </div>
                </div>

                {/* Edit Controls */}
                <div className="flex items-center gap-2 pt-2">
                  {isStaff && (
                    <>
                      {isEditing ? (
                        <>
                          <Button size="sm" onClick={handleSaveChanges} data-testid="button-save-changes">
                            <Save className="w-4 h-4 mr-2" />
                            Save Changes
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setIsEditing(false)} data-testid="button-cancel-edit">
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setIsEditing(true)} data-testid="button-edit-account">
                          <Edit className="w-4 h-4 mr-2" />
                          Edit Details
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Account Actions - Staff Only */}
            {isStaff && (
              <>
                <Separator />
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Shield className="w-5 h-5 text-primary" />
                      Security & Account Actions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Password Reset */}
                      <Button 
                        variant="outline" 
                        className="justify-start"
                        onClick={() => handleAction('reset_password')}
                        data-testid="button-reset-password"
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Send Password Reset
                      </Button>

                      {/* Unlock Account */}
                      <Button 
                        variant="outline" 
                        className="justify-start"
                        onClick={() => handleAction('unlock_account')}
                        data-testid="button-unlock-account"
                      >
                        <Unlock className="w-4 h-4 mr-2" />
                        Unlock Account
                      </Button>

                      {/* Lock Account */}
                      <Button 
                        variant="outline" 
                        className="justify-start text-primary border-primary/50"
                        onClick={() => handleAction('lock_account')}
                        data-testid="button-lock-account"
                      >
                        <Lock className="w-4 h-4 mr-2" />
                        Lock Account
                      </Button>

                      {/* Suspend Account */}
                      <Button 
                        variant="outline" 
                        className="justify-start text-rose-700 border-rose-300"
                        onClick={() => handleAction('suspend_account')}
                        data-testid="button-suspend-account"
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Suspend Account
                      </Button>

                      {/* Verify Account */}
                      <Button 
                        variant="outline" 
                        className="justify-start text-primary border-primary"
                        onClick={() => handleAction('verify_account')}
                        data-testid="button-verify-account"
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Verify Account
                      </Button>

                      {/* View Security Log */}
                      <Button 
                        variant="outline" 
                        className="justify-start"
                        onClick={() => handleAction('view_security_log')}
                        data-testid="button-security-log"
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View Security Log
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {/* Quick Info Card */}
            <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/20 border-blue-200 dark:border-blue-800">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">Support Tip</p>
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      {isStaff 
                        ? "All account actions are logged. Use password reset for authentication issues. Lock accounts if suspicious activity is detected."
                        : "If you need to update your email or phone number, contact support. For security reasons, these changes require verification."
                      }
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </UniversalModalContent>
    </UniversalModal>
  );
}
