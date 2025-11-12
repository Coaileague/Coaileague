import { ArrowLeft, Home } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  showBackButton?: boolean;
  backHref?: string;
  children?: React.ReactNode;
  className?: string;
  align?: "left" | "center";
}

export function PageHeader({
  title,
  description,
  breadcrumbs = [],
  showBackButton = true,
  backHref = "/dashboard",
  children,
  className,
  align = "left",
}: PageHeaderProps) {
  const isCentered = align === "center";
  
  return (
    <div className={cn("border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10", className)}>
      <div className={cn(
        "mx-auto px-4 sm:px-6 py-3 sm:py-4",
        isCentered ? "max-w-5xl" : "container max-w-7xl"
      )}>
        {/* Breadcrumbs - Only for left-aligned headers */}
        {breadcrumbs.length > 0 && !isCentered && (
          <Breadcrumb className="mb-2">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/dashboard" data-testid="breadcrumb-home">
                    <span className="flex items-center gap-1.5">
                      <Home className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Dashboard</span>
                    </span>
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>

              {breadcrumbs.map((item, index) => {
                const isLast = index === breadcrumbs.length - 1;
                
                return (
                  <div key={index} className="contents">
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      {item.href && !isLast ? (
                        <BreadcrumbLink asChild>
                          <Link 
                            href={item.href}
                            data-testid={`breadcrumb-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                          >
                            {item.label}
                          </Link>
                        </BreadcrumbLink>
                      ) : (
                        <BreadcrumbPage data-testid={`breadcrumb-current`}>
                          {item.label}
                        </BreadcrumbPage>
                      )}
                    </BreadcrumbItem>
                  </div>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>
        )}

        {/* Header Content */}
        {isCentered ? (
          // Centered Layout: Three-column grid for true centering with max-width
          <div className="w-full">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
              {/* Left spacer */}
              <div></div>
              
              {/* Center: Title & Description */}
              <div className="flex flex-col items-center justify-center text-center">
                <h1 className="text-2xl sm:text-3xl font-semibold text-primary tracking-tight whitespace-nowrap">
                  {title}
                </h1>
                {description && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {description}
                  </p>
                )}
              </div>
              
              {/* Right: Action Buttons */}
              <div className="flex items-center gap-2 justify-end">
                {children}
              </div>
            </div>
          </div>
        ) : (
          // Left-aligned Layout: Standard flex layout
          <div className="flex items-start gap-4 justify-between">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {/* Back Button */}
              {showBackButton && (
                <Link href={backHref}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    data-testid="button-back"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span className="sr-only">Back to Dashboard</span>
                  </Button>
                </Link>
              )}

              {/* Title & Description */}
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight truncate">
                  {title}
                </h1>
                {description && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {description}
                  </p>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            {children && (
              <div className="flex items-center gap-2 shrink-0">
                {children}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
