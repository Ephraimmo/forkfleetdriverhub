import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  offered: "bg-info/15 text-info ring-1 ring-info/30",
  accepted: "bg-info/15 text-info ring-1 ring-info/30",
  assigned: "bg-info/15 text-info ring-1 ring-info/30",
  arrived_at_restaurant: "bg-warning/20 text-warning ring-1 ring-warning/30",
  picked_up: "bg-warning/20 text-warning ring-1 ring-warning/30",
  on_the_way: "bg-primary/15 text-primary ring-1 ring-primary/30",
  arrived_at_customer: "bg-primary/15 text-primary ring-1 ring-primary/30",
  delivered: "bg-success/15 text-success ring-1 ring-success/30",
  cancelled: "bg-destructive/15 text-destructive ring-1 ring-destructive/30",
  failed: "bg-destructive/15 text-destructive ring-1 ring-destructive/30",
  rejected: "bg-destructive/15 text-destructive ring-1 ring-destructive/30",
};

const LABEL: Record<string, string> = {
  offered: "Available",
  accepted: "Accepted",
  assigned: "Assigned",
  arrived_at_restaurant: "At restaurant",
  picked_up: "Picked up",
  on_the_way: "On the way",
  arrived_at_customer: "At customer",
  delivered: "Delivered",
  cancelled: "Cancelled",
  failed: "Failed",
  rejected: "Rejected",
  pending: "Pending",
};

export function StatusPill({ status, className }: { status: string; className?: string }) {
  const label = LABEL[status] ?? status.replace(/_/g, " ");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider",
        TONE[status] ?? "bg-muted text-muted-foreground",
        className,
      )}
    >
      {label}
    </span>
  );
}
