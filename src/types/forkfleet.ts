/**
 * Shared ForkFleet ecosystem types.
 * Field names mirror the EXISTING Firestore contract used by the
 * Customer App and Super Admin Console. Do not rename fields.
 */

export type DriverStatus =
  | "pending"
  | "offline"
  | "online"
  | "busy"
  | "suspended"
  | "rejected"
  | string;

export interface Driver {
  id: string;
  user_id?: string | null;
  full_name: string;
  username?: string | null;
  email: string;
  phone: string;
  city?: string | null;
  status: DriverStatus;
  is_active: boolean;
  is_deleted?: boolean;
  is_verified: boolean;
  rating?: number;
  total_deliveries?: number;
  wallet_balance?: number;
  vehicle_type?: string | null;
  vehicle_plate?: string | null;
  license_number?: string | null;
  id_number?: string | null;
  bank_name?: string | null;
  bank_account_number?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  preferred_language?: string | null;
  verification_submitted_at?: string | null;
  rejection_reason?: string | null;
  current_latitude?: number | null;
  current_longitude?: number | null;
  photo_url?: string | null;
  created_at?: string;
  updated_at?: string;
  last_online_at?: string | null;
  last_offline_at?: string | null;
}

export interface DriverAssignment {
  id: string; // `${driverId}__${restaurantId}__${branchId}`
  driver_id: string;
  restaurant_id: string;
  branch_id: string;
  restaurant_name?: string;
  branch_name?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  deactivated_at?: string | null;
}

export interface Branch {
  id: string;
  name?: string;
  address?: string;
  phone?: string;
  latitude?: number;
  longitude?: number;
  [k: string]: unknown;
}

export interface Restaurant {
  id: string;
  name?: string;
  address?: string;
  phone?: string;
  latitude?: number;
  longitude?: number;
  branches?: Record<string, Branch>;
  [k: string]: unknown;
}

export interface Address {
  street?: string;
  city?: string;
  label?: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
}

export interface OrderItem {
  id?: string;
  name?: string;
  quantity?: number;
  price?: number;
  notes?: string;
  [k: string]: unknown;
}

export type OrderStatus =
  | "pending"
  | "accepted"
  | "preparing"
  | "ready"
  | "assigned"
  | "picked_up"
  | "on_the_way"
  | "delivered"
  | "rejected"
  | "cancelled"
  | "refunded"
  | string;

export interface OrderPayment {
  status?: "pending" | "paid" | "refunded" | string;
  method?: string;
  amount?: number;
  collected_by?: string;
  collected_at?: string;
  transaction_id?: string;
  [k: string]: unknown;
}

export interface OrderTimelineEntry {
  status: string;
  at: string;
  note?: string;
  driver_id?: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface Order {
  id: string;
  order_number?: string;
  status: OrderStatus;
  order_type?: "delivery" | "pickup" | string;
  restaurant_id?: string;
  restaurantId?: string;
  branch_id?: string;
  branchId?: string;
  restaurant_name?: string;
  branch_name?: string;
  customer_id?: string;
  customer_name?: string;
  customer_phone?: string;
  delivery_address?: Address;
  delivery_instructions?: string;
  special_instructions?: string;
  items?: Record<string, OrderItem> | OrderItem[];
  subtotal?: number;
  delivery_fee?: number;
  service_fee?: number;
  tax?: number;
  discount?: number;
  tip?: number;
  total?: number;
  payment_method?: string;
  payment_status?: string;
  payment?: OrderPayment;
  delivery_distance_km?: number;
  placed_at?: string;
  updated_at?: string;
  accepted_at?: string;
  picked_up_at?: string;
  on_the_way_at?: string;
  delivered_at?: string;
  delivered_latitude?: number | null;
  delivered_longitude?: number | null;
  driver_id?: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  driver_photo?: string | null;
  driver_rating?: number | null;
  eta_minutes?: number | null;
  eta_at?: string | null;
  pickup_code?: string | null;
  delivery_pin?: string | null;
  proof_of_delivery?: ProofOfDelivery | null;
  timeline?: OrderTimelineEntry[];
  [k: string]: unknown;
}

export type DeliveryStatus =
  | "pending"
  | "offered"
  | "accepted"
  | "rejected"
  | "assigned"
  | "arrived_at_restaurant"
  | "picked_up"
  | "on_the_way"
  | "arrived_at_customer"
  | "delivered"
  | "cancelled"
  | "failed";

export type DeliveryEventType =
  | "order_received"
  | "assignment_offered"
  | "assignment_accepted"
  | "assignment_rejected"
  | "arrived_at_restaurant"
  | "pickup_verified"
  | "order_picked_up"
  | "on_the_way"
  | "arrived_at_customer"
  | "delivery_verified"
  | "proof_uploaded"
  | "delivered"
  | "cancelled"
  | "failed";

export interface DeliveryEvent {
  event_id: string;
  order_id: string;
  driver_id: string;
  restaurant_id?: string | undefined;
  branch_id?: string | undefined;
  event_type: DeliveryEventType;
  status?: DeliveryStatus;
  timestamp: string;
  latitude?: number | null;
  longitude?: number | null;
  note?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface DriverLocation {
  latitude: number;
  longitude: number;
  heading?: number | null;
  speed?: number | null;
  updated_at: string;
  driver_id?: string;
  order_id?: string;
}

export type ProofMethod = "pin" | "photo" | "signature" | "qr" | "confirmation";

export interface ProofOfDelivery {
  method: ProofMethod;
  value?: string | null;
  photo_data_url?: string | null;
  signature_data_url?: string | null;
  recorded_at: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface Earning {
  id: string;
  driver_id: string;
  order_id: string;
  order_number?: string | undefined;
  base_amount: number;
  tip: number;
  bonus?: number;
  adjustment?: number;
  amount: number;
  status: "pending" | "paid";
  created_at: string;
}

export interface WalletTransaction {
  transaction_id: string;
  driver_id: string;
  order_id?: string | null;
  amount: number;
  type: "credit" | "debit" | "tip" | "bonus" | "withdrawal" | "adjustment";
  status: "pending" | "completed" | "failed";
  description?: string;
  created_at: string;
}

export interface DriverNotification {
  id: string;
  alert_id?: string;
  driver_id?: string;
  user_id?: string;
  title?: string;
  body?: string;
  message?: string;
  type?: string;
  order_id?: string | null;
  read?: boolean;
  created_at: string;
  severity?: "info" | "warning" | "critical";
}

export interface NotificationRead {
  id: string;
  alert_id: string;
  user_id: string;
  read_at: string;
}

export interface SupportMessage {
  id: string;
  sender: "driver" | "support" | "admin";
  body: string;
  created_at: string;
}

export interface SupportTicket {
  id: string;
  driver_id: string;
  subject: string;
  category: string;
  status: "open" | "pending" | "resolved" | "closed";
  order_id?: string | null;
  created_at: string;
  updated_at: string;
  priority?: "low" | "medium" | "high";
  assignee_id?: string | null;
  messages?: Record<string, SupportMessage>;
}

/** Normalized view model built by joining Firestore records. */
export interface DriverOrderViewModel {
  id: string;
  orderNumber: string;
  customer: { name: string; phone: string; id?: string };
  restaurant: { id: string; name: string; address?: string; latitude?: number; longitude?: number; phone?: string };
  branch: { id: string; name: string; address?: string; latitude?: number; longitude?: number; phone?: string };
  pickupAddress: string;
  deliveryAddress: Address;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  tax: number;
  discount: number;
  tip: number;
  total: number;
  paymentStatus: string;
  paymentMethod: string;
  payment: OrderPayment | null;
  orderStatus: OrderStatus;
  driverStatus: DeliveryStatus;
  timeline: DeliveryEvent[];
  orderTimeline: OrderTimelineEntry[];
  eta: number | null;
  distanceKm: number | null;
  driverId: string | null;
  specialInstructions?: string;
  deliveryInstructions?: string;
  proofOfDelivery?: ProofOfDelivery | null;
  raw: Order;
}
