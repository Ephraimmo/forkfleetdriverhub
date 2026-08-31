import type {
  DeliveryEvent,
  DeliveryStatus,
  DriverOrderViewModel,
  Order,
  OrderItem,
  OrderPayment,
  OrderTimelineEntry,
  Restaurant,
} from "@/types/forkfleet";
import { orderBranchId, orderRestaurantId, toArray } from "./repo";

export function buildOrderViewModel(
  order: Order,
  opts: {
    restaurant?: Restaurant | null;
    events?: DeliveryEvent[];
  } = {},
): DriverOrderViewModel {
  const restaurantId = orderRestaurantId(order) ?? "";
  const branchId = orderBranchId(order) ?? "";
  const restaurant = opts.restaurant ?? null;
  const branchRecord = restaurant?.branches?.[branchId] as Record<string, unknown> | undefined;

  const branchName =
    (order.branch_name as string) || ((branchRecord?.["name"] as string) ?? branchId ?? "—");
  const branchAddress =
    (branchRecord?.["address"] as string) || (restaurant?.address as string) || "";

  const items = toArray<OrderItem>(order.items);
  const orderTimeline = (order.timeline as OrderTimelineEntry[]) ?? [];
  const payment: OrderPayment | null = order.payment ?? null;

  return {
    id: order.id,
    orderNumber: order.order_number ?? order.id,
    customer: {
      name: order.customer_name ?? "Customer",
      phone: order.customer_phone ?? "",
      ...(order.customer_id ? { id: order.customer_id } : {}),
    },
    restaurant: {
      id: restaurantId,
      name: order.restaurant_name ?? (restaurant?.name as string) ?? restaurantId,
      address: (restaurant?.address as string) ?? "",
      latitude: (branchRecord?.["latitude"] as number) ?? (restaurant?.latitude as number),
      longitude: (branchRecord?.["longitude"] as number) ?? (restaurant?.longitude as number),
      phone: (branchRecord?.["phone"] as string) ?? (restaurant?.phone as string),
    },
    branch: {
      id: branchId,
      name: branchName,
      address: branchAddress,
      latitude: branchRecord?.["latitude"] as number,
      longitude: branchRecord?.["longitude"] as number,
      phone: branchRecord?.["phone"] as string,
    },
    pickupAddress: branchAddress || (restaurant?.address as string) || "",
    deliveryAddress: order.delivery_address ?? {},
    items,
    subtotal: Number(order.subtotal ?? 0),
    deliveryFee: Number(order.delivery_fee ?? 0),
    serviceFee: Number(order.service_fee ?? 0),
    tax: Number(order.tax ?? 0),
    discount: Number(order.discount ?? 0),
    tip: Number(order.tip ?? 0),
    total: Number(order.total ?? 0),
    paymentStatus: order.payment?.status ?? order.payment_status ?? "unknown",
    paymentMethod: order.payment?.method ?? order.payment_method ?? "unknown",
    payment,
    orderStatus: order.status,
    driverStatus: (order["driver_status"] as DeliveryStatus) ?? inferDriverStatus(order),
    timeline: opts.events ?? [],
    orderTimeline,
    eta: order.eta_minutes ?? null,
    distanceKm: order.delivery_distance_km ?? null,
    driverId: order.driver_id ?? null,
    specialInstructions: order.special_instructions ?? "",
    deliveryInstructions: order.delivery_instructions ?? "",
    proofOfDelivery: (order["proof_of_delivery"] as DriverOrderViewModel["proofOfDelivery"]) ?? null,
    raw: order,
  };
}

function inferDriverStatus(order: Order): DeliveryStatus {
  const rawStatus = String(order.status);
  switch (rawStatus) {
    case "delivered":
      return "delivered";
    case "on_the_way":
      return "on_the_way";
    case "picked_up":
      return "picked_up";
    case "assigned":
    case "accepted":
      return order.driver_id ? "assigned" : "offered";
    case "cancelled":
      return "cancelled";
    case "failed":
      return "failed";
    case "rejected":
      return "rejected";
    default:
      return order.driver_id ? "assigned" : "pending";
  }
}

/** Next driver action for the active delivery flow. */
export function nextAction(status: DeliveryStatus):
  | { key: "arrive_restaurant" | "pickup" | "start" | "arrive_customer" | "complete"; label: string }
  | null {
  switch (status) {
    case "offered":
    case "accepted":
    case "assigned":
      return { key: "arrive_restaurant", label: "Arrive at restaurant" };
    case "arrived_at_restaurant":
      return { key: "pickup", label: "Pick up order" };
    case "picked_up":
      return { key: "start", label: "Start delivery" };
    case "on_the_way":
      return { key: "arrive_customer", label: "Arrive at customer" };
    case "arrived_at_customer":
      return { key: "complete", label: "Complete delivery" };
    default:
      return null;
  }
}

export const ACTIVE_STATUSES: DeliveryStatus[] = [
  "offered",
  "accepted",
  "assigned",
  "arrived_at_restaurant",
  "picked_up",
  "on_the_way",
  "arrived_at_customer",
];
