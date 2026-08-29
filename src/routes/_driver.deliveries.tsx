import { createFileRoute } from "@tanstack/react-router";
import { Package } from "lucide-react";
import { useDriverOrders } from "@/hooks/useDriverOrders";
import { DeliveryCard } from "@/components/driver/DeliveryCard";
import { EmptyState } from "@/components/driver/EmptyState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold">Deliveries</h1>
      <Tabs defaultValue="active">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="available">Available</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="past">Past</TabsTrigger>
        </TabsList>

        <TabsContent value="available" className="space-y-3 pt-3">
          {loading ? (
            <div className="surface-card h-32 animate-pulse" />
          ) : available.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No offers right now"
              description="Orders are assigned directly by operations. You'll see your assigned deliveries here instantly."
            />
          ) : (
            available.map((o) => (
              <DeliveryCard
                key={o.id}
                order={o}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="active" className="space-y-3 pt-3">
          {active.length === 0 ? (
            <EmptyState icon={Package} title="No active delivery" description="Your next assigned delivery will appear here." />
          ) : (
            active.map((o) => <DeliveryCard key={o.id} order={o} />)
          )}
        </TabsContent>

        <TabsContent value="past" className="space-y-3 pt-3">
          {history.length === 0 ? (
            <EmptyState icon={Package} title="No delivery history" description="Completed deliveries appear here." />
          ) : (
            history.slice(0, 20).map((o) => <DeliveryCard key={o.id} order={o} />)
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
