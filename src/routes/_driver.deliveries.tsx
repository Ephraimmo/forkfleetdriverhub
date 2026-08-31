import { createFileRoute } from "@tanstack/react-router";
import { Package } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useDriverOrders } from "@/hooks/useDriverOrders";
import { useDeliveryActions } from "@/hooks/useDeliveryActions";
import { DeliveryCard } from "@/components/driver/DeliveryCard";
import { EmptyState } from "@/components/driver/EmptyState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DriverOrderViewModel } from "@/types/forkfleet";

export const Route = createFileRoute("/_driver/deliveries")({
  head: () => ({
    meta: [
      { title: "Deliveries — ForkFleet Driver" },
      { name: "description", content: "Active and past deliveries for the branches you are authorized to serve." },
      { property: "og:title", content: "Deliveries — ForkFleet Driver" },
      { property: "og:description", content: "Track your assigned deliveries in real time." },
    ],
  }),
  component: DeliveriesPage,
});

function DeliveriesPage() {
  const { available, active, history, loading } = useDriverOrders();
  const { perform } = useDeliveryActions();
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleAccept = async (order: DriverOrderViewModel) => {
    setBusyId(order.id);
    try {
      await perform("accept", order.raw);
      toast.success(`Accepted ${order.orderNumber} — it's now in your Active deliveries.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Deliveries</h1>
          <p className="text-sm text-muted-foreground">
            New offers appear instantly. Accept to add them to your route.
          </p>
        </div>
      </header>

      <Tabs defaultValue="available">
        <TabsList className="grid w-full grid-cols-3 h-12">
          <TabsTrigger value="available" className="text-sm font-semibold">
            Available
            <span className="ml-1.5 inline-flex min-w-[20px] items-center justify-center rounded-full bg-info/15 px-1.5 py-0.5 text-[10px] font-bold text-info">
              {available.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="active" className="text-sm font-semibold">
            Active
            <span className="ml-1.5 inline-flex min-w-[20px] items-center justify-center rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">
              {active.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="past" className="text-sm font-semibold">
            Past
            <span className="ml-1.5 inline-flex min-w-[20px] items-center justify-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
              {history.length}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="available" className="space-y-3 pt-3">
          {loading ? (
            <div className="surface-card h-32 animate-pulse rounded-xl" />
          ) : available.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No deliveries available"
              description="New orders from your authorized restaurants and branches will appear here the moment they're ready for pickup."
            />
          ) : (
            available.map((o) => (
              <DeliveryCard
                key={o.id}
                order={o}
                onAccept={() => handleAccept(o)}
                busy={busyId === o.id}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="active" className="space-y-3 pt-3">
          {active.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No active deliveries"
              description="Accept an offer in the Available tab, and it will move here automatically while you complete the delivery."
            />
          ) : (
            active.map((o) => <DeliveryCard key={o.id} order={o} />)
          )}
        </TabsContent>

        <TabsContent value="past" className="space-y-3 pt-3">
          {history.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No delivery history yet"
              description="Once you mark a delivery Complete, it will be archived here for your records."
            />
          ) : (
            history.slice(0, 20).map((o) => <DeliveryCard key={o.id} order={o} />)
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
