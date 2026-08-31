import { Link } from "@tanstack/react-router";
import { Bike, MapPin, Package, Store, Timer, ChevronRight, DollarSign, Navigation } from "lucide-react";
import type { DriverOrderViewModel } from "@/types/forkfleet";
import { formatKm, formatMoney, haversineKm } from "@/lib/geo";
import { useAppStore } from "@/stores/appStore";
import { StatusPill } from "./StatusPill";
import { Button } from "@/components/ui/button";

const STEP_LABEL: Record<string, string> = {
  offered: "Step 1 of 5 · Accept & head to restaurant",
  assigned: "Step 1 of 5 · Head to restaurant",
  arrived_at_restaurant: "Step 2 of 5 · Verify & pickup order",
  picked_up: "Step 3 of 5 · Start delivery",
  on_the_way: "Step 4 of 5 · Head to customer",
  arrived_at_customer: "Step 5 of 5 · Complete delivery",
  delivered: "Completed · Thanks!",
};

export function DeliveryCard({
  order,
  onAccept,
  onReject,
  busy,
}: {
  order: DriverOrderViewModel;
  onAccept?: () => void;
  onReject?: () => void;
  busy?: boolean;
}) {
  const position = useAppStore((s) => s.position);
  const pickupPoint =
    order.branch.latitude && order.branch.longitude
      ? { latitude: order.branch.latitude, longitude: order.branch.longitude }
      : null;
  const pickupKm = position && pickupPoint ? haversineKm(position, pickupPoint) : null;
  const earnings = order.deliveryFee + order.tip;
  const stepHint = STEP_LABEL[order.driverStatus];
  const isPast = order.driverStatus === "delivered" || order.driverStatus === "cancelled" || order.driverStatus === "failed" || order.driverStatus === "rejected";

  return (
    <article
      className={`surface-card group space-y-3 p-4 shadow-elevate transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
        isPast ? "opacity-85" : ""
      }`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-display text-xl font-bold leading-tight tracking-tight">
              {order.orderNumber}
            </p>
          </div>
          <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-muted-foreground">
            <Store className="size-3.5 shrink-0" />
            <span className="truncate">
              {order.restaurant.name} · {order.branch.name}
            </span>
          </p>
        </div>
        <StatusPill status={order.driverStatus} />
      </header>

      {stepHint && !isPast && (
        <div className="rounded-lg border border-primary/15 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary">
          {stepHint}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <div className="stat-tile">
          <div className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
            <Navigation className="size-3" />
            Pickup
          </div>
          <p className="font-bold">{formatKm(pickupKm)}</p>
        </div>
        <div className="stat-tile">
          <div className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
            <MapPin className="size-3" />
            Drop-off
          </div>
          <p className="font-bold">{formatKm(order.distanceKm)}</p>
        </div>
        <div className="stat-tile ring-1 ring-primary/20">
          <div className="flex items-center justify-center gap-1 text-[11px] text-primary">
            <DollarSign className="size-3" />
            Payout
          </div>
          <p className="font-bold text-primary">{formatMoney(earnings)}</p>
        </div>
      </div>

      <div className="space-y-1.5 text-sm">
        <p className="flex items-start gap-2 text-muted-foreground">
          <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
          <span className="line-clamp-2">
            {order.deliveryAddress.street ?? "—"}
            {order.deliveryAddress.city ? `, ${order.deliveryAddress.city}` : ""}
          </span>
        </p>
        <p className="flex items-center gap-2 text-muted-foreground">
          <Package className="size-4 shrink-0" /> {order.items.length} item
          {order.items.length === 1 ? "" : "s"} · {order.paymentStatus}
        </p>
        {(order.specialInstructions || order.deliveryInstructions) && (
          <div className="rounded-lg border border-warning/20 bg-warning/5 p-2.5 text-warning">
            <p className="flex items-start gap-2 text-xs font-medium">
              <Timer className="mt-0.5 size-3.5 shrink-0" />
              <span className="leading-snug">
                {order.specialInstructions || order.deliveryInstructions}
              </span>
            </p>
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        {onReject && (
          <Button variant="outline" size="lg" className="flex-1 h-12" disabled={busy} onClick={onReject}>
            Reject
          </Button>
        )}
        {onAccept && (
          <Button size="lg" className="flex-1 h-12 text-base font-bold shadow-md" disabled={busy} onClick={onAccept}>
            {busy ? "Accepting…" : "Accept delivery"}
          </Button>
        )}
        {!onAccept && !isPast && (
          <Button asChild size="lg" className="flex-1 h-12 text-base font-bold shadow-md">
            <Link to="/delivery/$orderId" params={{ orderId: order.id }}>
              <Bike className="mr-1 size-5" /> Manage delivery
              <ChevronRight className="size-4" />
            </Link>
          </Button>
        )}
        {!onAccept && isPast && (
          <Button asChild variant="outline" size="lg" className="flex-1 h-12 text-sm">
            <Link to="/delivery/$orderId" params={{ orderId: order.id }}>
              View details
              <ChevronRight className="size-4" />
            </Link>
          </Button>
        )}
      </div>
    </article>
  );
}
