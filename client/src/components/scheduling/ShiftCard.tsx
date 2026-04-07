/**
 * CoAIleague ShiftCard Component
 * Visual shift card with status borders and position color strips
 * 
 * Fortune 500 standards - Centralized configuration in /constants/scheduling.ts
 */

import { memo } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MapPin, Clock, User, AlertCircle, CheckCircle, Edit3, Shield, Star, Crown } from "lucide-react";
import { 
  SHIFT_STATUS, 
  POSITION_TYPES, 
  ShiftStatusConfig, 
  PositionTypeConfig,
  getShiftStatus,
  getPositionType,
  getShiftStatusByKey
} from "@/constants/scheduling";

export interface ShiftCardProps {
  status?: ShiftStatusConfig | string;
  position?: PositionTypeConfig | string;
  officerName?: string | null;
  location?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  isCompact?: boolean;
  onClick?: () => void;
  className?: string;
}

const StatusIcon = ({ status }: { status: ShiftStatusConfig }) => {
  switch (status.key) {
    case 'draft':
      return <Edit3 className="h-3 w-3" />;
    case 'assigned':
      return <User className="h-3 w-3" />;
    case 'published':
      return <CheckCircle className="h-3 w-3" />;
    case 'unfilled':
      return <AlertCircle className="h-3 w-3" />;
    case 'active':
      return <Clock className="h-3 w-3" />;
    case 'completed':
      return <CheckCircle className="h-3 w-3" />;
    default:
      return <Edit3 className="h-3 w-3" />;
  }
};

const PositionIcon = ({ position }: { position: PositionTypeConfig }) => {
  switch (position.key) {
    case 'armed':
      return <Shield className="h-3 w-3" />;
    case 'supervisor':
      return <Star className="h-3 w-3" />;
    case 'manager':
      return <Star className="h-3 w-3" />;
    case 'owner':
      return <Crown className="h-3 w-3" />;
    default:
      return <User className="h-3 w-3" />;
  }
};

export const ShiftCard = memo(function ShiftCard({
  status = SHIFT_STATUS.DRAFT,
  position = POSITION_TYPES.UNARMED,
  officerName = null,
  location = 'Site Location',
  date = 'Mon, Jan 27',
  startTime = '08:00 AM',
  endTime = '04:00 PM',
  isCompact = false,
  onClick,
  className,
}: ShiftCardProps) {
  // Resolve status and position if passed as strings
  const resolvedStatus = typeof status === 'string' ? getShiftStatusByKey(status) : status;
  const resolvedPosition = typeof position === 'string' ? getPositionType(position) : position;
  
  const isActive = resolvedStatus.key === 'active';
  const isUnfilled = resolvedStatus.key === 'unfilled';

  return (
    <div
      data-testid={`shift-card-${resolvedStatus.key}`}
      onClick={onClick}
      className={cn(
        "relative rounded-lg overflow-hidden transition-all",
        resolvedStatus.tailwindBorder,
        resolvedStatus.tailwindBg,
        isActive && "shift-card-active",
        onClick && "cursor-pointer hover-elevate",
        className
      )}
      style={{
        '--position-color': resolvedPosition.color,
        '--status-color': resolvedStatus.badgeColor,
      } as React.CSSProperties}
    >
      {/* Position Color Strip - Left Edge */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ backgroundColor: resolvedPosition.color }}
        data-testid="position-strip"
      />

      {/* Card Content */}
      <div className={cn("pl-3 pr-3 py-2", isCompact ? "space-y-1" : "space-y-2")}>
        {/* Header Row - Position & Status Badges */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Badge
            variant="secondary"
            className="text-xs font-medium"
            style={{
              backgroundColor: resolvedPosition.bgColor,
              color: resolvedPosition.color,
              border: 'none',
            }}
          >
            <PositionIcon position={resolvedPosition} />
            <span className="ml-1">{resolvedPosition.shortLabel}</span>
          </Badge>

          <Badge
            className="text-xs font-medium text-white"
            style={{
              backgroundColor: resolvedStatus.badgeColor,
              border: 'none',
            }}
          >
            <StatusIcon status={resolvedStatus} />
            <span className="ml-1">{resolvedStatus.label}</span>
          </Badge>
        </div>

        {/* Time Block */}
        <div className="space-y-0.5">
          <div className="flex items-center gap-1 text-sm font-semibold text-foreground">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{startTime}</span>
            <span className="text-muted-foreground mx-0.5">-</span>
            <span>{endTime}</span>
          </div>
          <div className="text-xs text-muted-foreground pl-4.5">{date}</div>
        </div>

        {/* Location */}
        {!isCompact && (
          <div className="flex items-start gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span className="line-clamp-1">{location}</span>
          </div>
        )}

        {/* Officer Assignment */}
        <div className="flex items-center gap-2">
          {officerName ? (
            <>
              <Avatar className="h-7 w-7 border" style={{ borderColor: resolvedPosition.color }}>
                <AvatarFallback 
                  className="text-xs font-semibold"
                  style={{ backgroundColor: resolvedPosition.bgColor, color: resolvedPosition.color }}
                >
                  {officerName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium text-foreground truncate">{officerName}</span>
            </>
          ) : (
            <>
              <Avatar className="h-7 w-7 border border-dashed border-muted-foreground/50">
                <AvatarFallback className="text-xs text-muted-foreground bg-muted/50">
                  ?
                </AvatarFallback>
              </Avatar>
              <span className={cn(
                "text-sm italic",
                isUnfilled ? "text-red-500 font-medium" : "text-muted-foreground"
              )}>
                {isUnfilled ? "Needs Officer!" : "Unassigned"}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
});

// Export configuration for external use
export { SHIFT_STATUS, POSITION_TYPES, getShiftStatus, getPositionType, getShiftStatusByKey };
