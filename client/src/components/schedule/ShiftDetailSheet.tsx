/**
 * ShiftDetailSheet - Compact shift details popup
 * Polished professional design matching Sling-style UI
 * Enhanced with swap, duplicate, site navigation, POC, post orders, and shift chatroom functionality
 */

import { format } from 'date-fns';
import { TrinityAnimatedLogo } from "@/components/ui/trinity-animated-logo";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
  DrawerClose,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Clock,
  MapPin,
  User,
  Building2,
  Edit2,
  Trash2,
  UserPlus,
  Timer,
  DollarSign,
  FileText,
  X,
  Copy,
  ArrowRightLeft,
  Repeat,
  MoreHorizontal,
  Navigation,
  Phone,
  Mail,
  Shield,
  Camera,
  MessageSquare,
  ClipboardList,
  AlertCircle,
  ExternalLink,
  Play,
} from 'lucide-react';
import { TrinityLogo } from '@/components/ui/coaileague-logo-mark';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { Shift, Employee, Client, Site, SiteContact } from '@shared/schema';

interface ShiftDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shift: Shift | null;
  employee?: Employee | null;
  client?: Client | null;
  site?: Site | null;
  siteContacts?: SiteContact[];
  canEdit: boolean;
  canStartShift?: boolean;
  onEdit?: (shift: Shift) => void;
  onDelete?: (shift: Shift) => void;
  onClaimShift?: (shift: Shift) => void;
  onDuplicate?: (shift: Shift) => void;
  onQuickDuplicate?: (shift: Shift) => void;
  onRequestSwap?: (shift: Shift) => void;
  onStartShift?: (shift: Shift) => void;
  quickDuplicatePending?: boolean;
  startShiftPending?: boolean;
}

export function ShiftDetailSheet({
  open,
  onOpenChange,
  shift,
  employee,
  client,
  site,
  siteContacts = [],
  canEdit,
  canStartShift = false,
  onEdit,
  onDelete,
  onClaimShift,
  onDuplicate,
  onQuickDuplicate,
  onRequestSwap,
  onStartShift,
  quickDuplicatePending,
  startShiftPending,
}: ShiftDetailSheetProps) {
  if (!shift) return null;

  const start = new Date(shift.startTime);
  const end = new Date(shift.endTime);
  const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  const isOpenShift = !shift.employeeId;
  const isPast = end < new Date();
  const isToday = format(start, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
  const isNow = new Date() >= start && new Date() <= end;

  const getStatusConfig = () => {
    if (shift.status === 'completed') {
      return { label: 'Completed', className: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' };
    }
    if (shift.status === 'in_progress') {
      return { label: 'In Progress', className: 'bg-amber-500/15 text-amber-600 border-amber-500/30' };
    }
    if (shift.status === 'draft') {
      return { label: 'Pending', className: 'bg-slate-500/15 text-slate-600 border-slate-500/30' };
    }
    if (isToday) {
      return { label: 'Today', className: 'bg-blue-500/15 text-blue-600 border-blue-500/30' };
    }
    if (isPast) {
      return { label: 'Past', className: 'bg-slate-500/15 text-slate-500 border-slate-500/30' };
    }
    return { label: 'Scheduled', className: 'bg-cyan-500/15 text-cyan-600 border-cyan-500/30' };
  };

  const statusConfig = getStatusConfig();

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getSiteAddress = (): string | null => {
    if (site) {
      const parts = [
        site.addressLine1,
        site.addressLine2,
        site.city,
        site.state,
        site.zip
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(', ') : null;
    }
    if (client?.address) {
      return client.address;
    }
    return (shift as any).jobSiteAddress || null;
  };

  const siteAddress = getSiteAddress();

  const openMapsNavigation = () => {
    if (!siteAddress) return;
    const encodedAddress = encodeURIComponent(siteAddress);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isMac = /Mac/.test(navigator.platform);
    
    if (isIOS || isMac) {
      window.open(`maps://maps.apple.com/?daddr=${encodedAddress}`, '_blank');
    } else {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`, '_blank');
    }
  };

  const primaryContact = siteContacts.find(c => c.isPrimary) || siteContacts[0];
  const emergencyContact = siteContacts.find(c => c.isEmergency);

  const getSpecialInstructions = (): string | null => {
    return site?.specialInstructions || null;
  };

  const getPostOrders = (): string | null => {
    return (shift as any).postOrders || null;
  };

  const hasPhotoRequirement = site?.requiresPhotoVerification || false;
  const hasGpsRequirement = site?.requiresGpsVerification !== false;

  const canShowStartShift = canStartShift && !isOpenShift && shift.status !== 'completed' && shift.status !== 'in_progress' && (isToday || isNow);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[80dvh] sm:max-h-[100ddvh] focus:outline-none">
        <div data-vaul-no-drag className="mx-auto w-full max-w-md overflow-y-auto overscroll-contain [touch-action:pan-y] [-webkit-overflow-scrolling:touch]">
          <DrawerHeader className="pb-3 pt-2 px-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 shrink-0">
                  <TrinityAnimatedLogo size={18} />
                </div>
                <div>
                  <DrawerTitle className="text-base font-semibold">
                    {shift.title || 'Shift Details'}
                  </DrawerTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {format(start, 'EEEE, MMM d, yyyy')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`text-xs ${statusConfig.className}`}>
                  {statusConfig.label}
                </Badge>
                <DrawerClose asChild>
                  <Button variant="ghost" size="icon">
                    <X className="h-4 w-4" />
                  </Button>
                </DrawerClose>
              </div>
            </div>
          </DrawerHeader>

          <div className="px-4 pb-3 space-y-3">
            <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-lg p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  <span className="text-lg font-bold">
                    {format(start, 'h:mm a')} - {format(end, 'h:mm a')}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-muted-foreground text-sm">
                  <Timer className="w-3.5 h-3.5" />
                  <span>{hours.toFixed(1)}h</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">
                  <User className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-xs font-medium">Assigned To</span>
                </div>
                {isOpenShift ? (
                  <Badge variant="outline" className="border-amber-500/50 text-amber-600 text-xs">
                    Open Shift
                  </Badge>
                ) : employee ? (
                  <div className="flex items-center gap-2">
                    <Avatar className="w-7 h-7 shrink-0">
                      <AvatarFallback className="text-xs font-semibold bg-primary text-primary-foreground">
                        {getInitials(`${employee.firstName} ${employee.lastName}`)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium truncate">
                      {employee.firstName} {employee.lastName}
                    </span>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Unassigned</span>
                )}
              </div>

              {client && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">
                    <Building2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-xs font-medium">Client</span>
                  </div>
                  <span className="text-sm font-medium truncate block">
                    {client.companyName || `${client.firstName} ${client.lastName}`}
                  </span>
                </div>
              )}
            </div>

            {siteAddress && (
              <div 
                className="flex items-center gap-2 p-2.5 bg-blue-500/10 rounded-lg cursor-pointer hover-elevate"
                onClick={openMapsNavigation}
                data-testid="button-navigate-to-site"
              >
                <div className="flex-1 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-600 shrink-0" />
                  <span className="text-sm text-blue-700 dark:text-blue-400 truncate">{siteAddress}</span>
                </div>
                <div className="flex items-center gap-1 text-blue-600">
                  <Navigation className="w-4 h-4" />
                  <ExternalLink className="w-3 h-3" />
                </div>
              </div>
            )}

            {(hasPhotoRequirement || hasGpsRequirement) && (
              <div className="flex items-center gap-2">
                {hasPhotoRequirement && (
                  <Badge variant="outline" className="text-xs border-purple-500/50 text-purple-600 bg-purple-500/10">
                    <Camera className="w-3 h-3 mr-1" />
                    Photo Required
                  </Badge>
                )}
                {hasGpsRequirement && (
                  <Badge variant="outline" className="text-xs border-green-500/50 text-green-600 bg-green-500/10">
                    <MapPin className="w-3 h-3 mr-1" />
                    GPS Verified
                  </Badge>
                )}
              </div>
            )}

            {primaryContact && (
              <div className="bg-muted/30 rounded-lg p-2.5">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
                  <Shield className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">Point of Contact (POC)</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{primaryContact.name}</p>
                      {primaryContact.title && (
                        <p className="text-xs text-muted-foreground">{primaryContact.title}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {primaryContact.phone && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => window.open(`tel:${primaryContact.phone}`, '_self')}
                          data-testid="button-call-poc"
                        >
                          <Phone className="w-4 h-4 text-green-600" />
                        </Button>
                      )}
                      {primaryContact.email && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => window.open(`mailto:${primaryContact.email}`, '_blank')}
                          data-testid="button-email-poc"
                        >
                          <Mail className="w-4 h-4 text-blue-600" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {emergencyContact && emergencyContact.id !== primaryContact.id && (
                    <div className="pt-2 border-t border-dashed">
                      <div className="flex items-center gap-1 mb-1">
                        <AlertCircle className="w-3 h-3 text-red-500" />
                        <span className="text-xs text-red-600">Emergency Contact</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm">{emergencyContact.name}</p>
                        {emergencyContact.phone && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => window.open(`tel:${emergencyContact.phone}`, '_self')}
                            data-testid="button-call-emergency"
                          >
                            <Phone className="w-4 h-4 text-red-500" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {shift.hourlyRateOverride && (
              <div className="flex items-center justify-between gap-2 bg-emerald-500/10 rounded-lg p-2.5">
                <div className="flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm font-medium">${shift.hourlyRateOverride}/hr</span>
                </div>
                <span className="text-sm text-emerald-600 font-medium">
                  ~${(parseFloat(shift.hourlyRateOverride) * hours).toFixed(2)}
                </span>
              </div>
            )}

            <Accordion type="single" collapsible className="w-full">
              {getPostOrders() && (
                <AccordionItem value="post-orders" className="border-b-0">
                  <AccordionTrigger className="py-2 hover:no-underline">
                    <div className="flex items-center gap-2 text-sm">
                      <ClipboardList className="w-4 h-4 text-amber-600" />
                      <span>Post Orders / Standing Instructions</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="bg-amber-500/10 rounded-lg p-3">
                      <p className="text-sm whitespace-pre-wrap">{getPostOrders()}</p>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}

              {getSpecialInstructions() && (
                <AccordionItem value="special-instructions" className="border-b-0">
                  <AccordionTrigger className="py-2 hover:no-underline">
                    <div className="flex items-center gap-2 text-sm">
                      <FileText className="w-4 h-4 text-blue-600" />
                      <span>Special Instructions</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="bg-blue-500/10 rounded-lg p-3">
                      <p className="text-sm whitespace-pre-wrap">{getSpecialInstructions()}</p>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}

              {shift.description && (
                <AccordionItem value="notes" className="border-b-0">
                  <AccordionTrigger className="py-2 hover:no-underline">
                    <div className="flex items-center gap-2 text-sm">
                      <FileText className="w-4 h-4 text-slate-600" />
                      <span>Shift Notes</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="bg-muted/30 rounded-lg p-3">
                      <p className="text-sm whitespace-pre-wrap">{shift.description}</p>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}
            </Accordion>
          </div>

          <DrawerFooter className="flex-col gap-2 pt-3 pb-5 px-4 border-t">
            {canShowStartShift && onStartShift && (
              <Button
                size="default"
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white"
                onClick={() => {
                  onStartShift(shift);
                }}
                disabled={startShiftPending}
                data-testid="button-start-shift"
              >
                <Play className="w-4 h-4 mr-2" />
                {startShiftPending ? 'Starting...' : 'Start Shift'}
              </Button>
            )}

            <div className="flex gap-2 w-full">
              {isOpenShift && onClaimShift && (
                <Button
                  className="flex-1 min-w-0 bg-emerald-600 text-white"
                  onClick={() => {
                    onClaimShift(shift);
                    onOpenChange(false);
                  }}
                  data-testid="button-claim-shift"
                >
                  <UserPlus className="w-4 h-4 mr-1.5 shrink-0" />
                  <span className="truncate">Claim</span>
                </Button>
              )}

              {canEdit && onEdit && (
                <Button
                  variant="outline"
                  className="flex-1 min-w-0"
                  onClick={() => {
                    onEdit(shift);
                    onOpenChange(false);
                  }}
                  data-testid="button-edit-shift"
                >
                  <Edit2 className="w-4 h-4 mr-1.5 shrink-0" />
                  <span className="truncate">Edit</span>
                </Button>
              )}

              {canEdit && onDelete && (
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={() => {
                    onDelete(shift);
                    onOpenChange(false);
                  }}
                  data-testid="button-delete-shift"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 w-full">
              {onQuickDuplicate && canEdit && (
                <Button
                  size="sm"
                  className="min-w-0 bg-gradient-to-r from-[#a855f7] to-[#38bdf8] text-white"
                  onClick={() => {
                    onQuickDuplicate(shift);
                    onOpenChange(false);
                  }}
                  disabled={quickDuplicatePending}
                  data-testid="button-quick-duplicate-shift"
                >
                  <Repeat className="w-3.5 h-3.5 mr-1 shrink-0" />
                  <span className="truncate">{quickDuplicatePending ? 'Copying...' : 'Copy +7d'}</span>
                </Button>
              )}

              {onDuplicate && canEdit && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-w-0"
                      data-testid="button-options-shift"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5 mr-1 shrink-0" />
                      <span className="truncate">More</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center">
                    <DropdownMenuItem onClick={() => {
                      onDuplicate(shift);
                      onOpenChange(false);
                    }}>
                      <Copy className="w-4 h-4 mr-2" />
                      Duplicate with options
                    </DropdownMenuItem>
                    {onEdit && (
                      <DropdownMenuItem onClick={() => {
                        onEdit(shift);
                        onOpenChange(false);
                      }}>
                        <Edit2 className="w-4 h-4 mr-2" />
                        Edit shift
                      </DropdownMenuItem>
                    )}
                    {onDelete && (
                      <DropdownMenuItem 
                        className="text-destructive"
                        onClick={() => {
                          onDelete(shift);
                          onOpenChange(false);
                        }}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete shift
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {onRequestSwap && !isOpenShift && employee && (
                <Button
                  size="sm"
                  className="min-w-0 bg-blue-500 text-white"
                  onClick={() => {
                    onRequestSwap(shift);
                    onOpenChange(false);
                  }}
                  data-testid="button-swap-shift"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5 mr-1 shrink-0" />
                  <span className="truncate">Swap</span>
                </Button>
              )}

              {!canEdit && !isOpenShift && !onRequestSwap && !canShowStartShift && (
                <DrawerClose asChild>
                  <Button variant="outline" size="sm" className="min-w-0">
                    Close
                  </Button>
                </DrawerClose>
              )}
            </div>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
