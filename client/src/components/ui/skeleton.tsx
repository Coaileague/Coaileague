import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-primary/15 dark:bg-primary/20", className)}
      {...props}
    />
  )
}

export { Skeleton }
