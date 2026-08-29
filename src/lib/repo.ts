import {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  onSnapshot,
  addDoc,
  query,
  where,
  orderBy,
  serverTimestamp as fsServerTimestamp,
  type DocumentReference,
  type CollectionReference,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb } from "./firebase";
import { paths, assignmentKey } from "./paths";
import { log, logError } from "./log";
import type {
  Driver,
  DriverAssignment,
  Order,
  DeliveryEvent,
  DeliveryEventType,
  DeliveryStatus,
  DriverLocation,
  Earning,
  WalletTransaction,
  DriverNotification,
  SupportTicket,
  ProofOfDelivery,
  Restaurant,
  SupportMessage,
} from "@/types/forkfleet";

export const nowIso = () => new Date().toISOString();

export function toArray<T>(val: unknown): T[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean) as T[];
  return Object.values(val as Record<string, T>);
}

function isDocPath(path: string): boolean {
  const segments = path.split("/").filter(Boolean);
  return segments.length % 2 === 0;
}

function getDocRef(path: string): DocumentReference {
  const db = getDb();
  return doc(db, path);
}

function getColRef(path: string): CollectionReference {
  const db = getDb();
  return collection(db, path);
}

function snapToData<T>(snap: { exists: () => boolean; data: () => unknown; id: string }): T | null {
  if (!snap.exists()) return null;
  const data = snap.data() as T;
  if (data && typeof data === "object" && !("id" in (data as object))) {
    return { ...(data as Record<string, unknown>), id: snap.id } as T;
  }
  return data;
}

function snapToArray<T>(snap: {
  docs: { exists: () => boolean; data: () => unknown; id: string }[];
}): T[] {
  const out: T[] = [];
  for (const d of snap.docs) {
    const item = snapToData<T>(d);
    if (item) out.push(item);
  }
  return out;
}

/* ------------------------------------------------------------------ reads */

export async function readOnce<T>(path: string): Promise<T | null> {
  if (isDocPath(path)) {
    const snap = await getDoc(getDocRef(path));
    return snapToData<T>(snap);
  }
  const snap = await getDocs(getColRef(path));
  const records: Record<string, T> = {};
  for (const d of snap.docs) {
    const data = snapToData<T>(d);
    if (data) records[d.id] = data;
  }
  return records as T;
}

export function subscribeDoc<T>(path: string, cb: (value: T | null) => void): Unsubscribe {
  return onSnapshot(
    getDocRef(path),
    (snap) => cb(snapToData<T>(snap)),
    (err) => logError("FIREBASE", `subscribeDoc failed: ${path}`, err),
  );
}

export function subscribeCollection<T>(
  path: string,
  cb: (value: Record<string, T>) => void,
): Unsubscribe {
  return onSnapshot(
    getColRef(path),
    (snap) => {
      const records: Record<string, T> = {};
      for (const d of snap.docs) {
        const data = snapToData<T>(d);
        if (data) records[d.id] = data;
      }
      cb(records);
    },
    (err) => logError("FIREBASE", `subscribeCollection failed: ${path}`, err),
  );
}

export function subscribe<T>(path: string, cb: (value: T | null) => void): Unsubscribe {
  if (isDocPath(path)) {
    return subscribeDoc<T>(path, cb);
  }
  return subscribeCollection(path, (records) => cb(records as unknown as T));
}

/* ---------------------------------------------------------------- drivers */

export async function findDriverForUser(uid: string, email: string | null): Promise<Driver | null> {
  const snap = await getDocs(getColRef(paths.drivers));
  const list: Driver[] = [];
  for (const d of snap.docs) {
    if (d.id === "live") continue;
    const data = d.data() as Driver | undefined;
    if (!data || typeof data !== "object" || data.is_deleted === true) continue;
    list.push({ ...data, id: data.id ?? d.id });
  }

  const byUid = list.find((d) => d.user_id === uid);
  if (byUid) return byUid;
  if (email) {
    const byEmail = list.find((d) => (d.email || "").toLowerCase() === email.toLowerCase());
    if (byEmail) return byEmail;
  }
  return null;
}

export async function linkDriverToAuthUser(driverId: string, uid: string) {
  await updateDoc(getDocRef(paths.driver(driverId)), {
    user_id: uid,
    updated_at: nowIso(),
  });
}

export async function updateDriverProfile(driverId: string, patch: Partial<Driver>) {
  await updateDoc(getDocRef(paths.driver(driverId)), { ...patch, updated_at: nowIso() });
}

export async function setDriverOnline(driverId: string, online: boolean) {
  const patch: Partial<Driver> = {
    status: online ? "online" : "offline",
    updated_at: nowIso(),
  };
  patch[online ? "last_online_at" : "last_offline_at"] = nowIso();
  await updateDoc(getDocRef(paths.driver(driverId)), patch);
  log("STATUS", `driver ${driverId} -> ${online ? "online" : "offline"}`);
}

/* ------------------------------------------------------------ assignments */

export async function loadDriverAssignments(driverId: string): Promise<DriverAssignment[]> {
  const q = query(getColRef(paths.assignments), where("driver_id", "==", driverId));
  const snap = await getDocs(q);
  return snapToArray<DriverAssignment>(snap).map((a) => ({
    ...a,
    id: a.id ?? (a as unknown as { id?: string }).id,
  }));
}

export function subscribeDriverAssignments(driverId: string, cb: (a: DriverAssignment[]) => void) {
  const q = query(getColRef(paths.assignments), where("driver_id", "==", driverId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snapToArray<DriverAssignment>(snap);
      log("ASSIGNMENT", `${list.filter((a) => a.is_active).length} active assignments found`);
      cb(list);
    },
    (err) => logError("FIREBASE", "subscribeDriverAssignments failed", err),
  );
}

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
  assignment?: DriverAssignment;
}

export async function isDriverEligible(
  driverId: string,
  restaurantId: string | undefined | null,
  branchId: string | undefined | null,
): Promise<EligibilityResult> {
  if (!driverId) return { eligible: false, reason: "Missing driver identity." };
  if (!restaurantId)
    return { eligible: false, reason: "Order has no authoritative restaurant_id." };
  if (!branchId) return { eligible: false, reason: "Order has no authoritative branch_id." };

  const driverSnap = await getDoc(getDocRef(paths.driver(driverId)));
  const driver = snapToData<Driver>(driverSnap);
  if (!driver || driver.is_deleted === true || driver.is_active !== true) {
    return { eligible: false, reason: "Driver account is not active." };
  }

  const key = assignmentKey(driverId, restaurantId, branchId);
  const assignSnap = await getDoc(getDocRef(paths.assignment(key)));
  const assignment = snapToData<DriverAssignment>(assignSnap);
  const ok =
    !!assignment &&
    assignment.driver_id === driverId &&
    assignment.restaurant_id === restaurantId &&
    assignment.branch_id === branchId &&
    assignment.is_active === true;

  log(
    "ELIGIBILITY",
    `driver=${driverId} restaurant=${restaurantId} branch=${branchId} result=${ok ? "ELIGIBLE" : "REJECTED"}`,
  );

  if (!ok) {
    return {
      eligible: false,
      reason: "This driver is not authorized for the order's restaurant and branch.",
    };
  }
  return { eligible: true, assignment: assignment! };
}

export function matchesActiveAssignment(
  assignments: DriverAssignment[],
  driverId: string,
  restaurantId?: string | null,
  branchId?: string | null,
): boolean {
  if (!restaurantId || !branchId) return false;
  return assignments.some(
    (a) =>
      a.is_active === true &&
      a.driver_id === driverId &&
      a.restaurant_id === restaurantId &&
      a.branch_id === branchId,
  );
}

/* ----------------------------------------------------------------- orders */

export function orderRestaurantId(order: Order) {
  return order.restaurant_id ?? order.restaurantId ?? null;
}
export function orderBranchId(order: Order) {
  return order.branch_id ?? order.branchId ?? null;
}

export function subscribeOrders(cb: (orders: Order[]) => void) {
  return subscribeCollection<Order>(paths.orders, (all) => {
    cb(Object.entries(all).map(([key, value]) => ({ ...value, id: value.id ?? key })));
  });
}

export function subscribeOrder(orderId: string, cb: (order: Order | null) => void) {
  return subscribeDoc<Order>(paths.order(orderId), (o) =>
    cb(o ? { ...o, id: o.id ?? orderId } : null),
  );
}

export function subscribeOrderEvents(orderId: string, cb: (events: DeliveryEvent[]) => void) {
  const col = getColRef(paths.orderEvents(orderId));
  const q = query(col, orderBy("timestamp", "asc"));
  return onSnapshot(
    q,
    (snap) => cb(snapToArray<DeliveryEvent>(snap)),
    (err) => logError("FIREBASE", "subscribeOrderEvents failed", err),
  );
}

/* ------------------------------------------------------- delivery events */

export interface MutationContext {
  driverId: string;
  order: Order;
  location?: { latitude: number; longitude: number } | null;
  note?: string;
  metadata?: Record<string, unknown>;
  clientRequestId: string;
}

export function idempotencyKey(
  orderId: string,
  driverId: string,
  eventType: DeliveryEventType,
  clientRequestId: string,
) {
  return `${eventType}__${driverId}__${clientRequestId}`.replace(/[.#$/[\]]/g, "-");
}

async function writeEvent(
  eventType: DeliveryEventType,
  status: DeliveryStatus,
  ctx: MutationContext,
) {
  const orderId = ctx.order.id;
  const eventId = idempotencyKey(orderId, ctx.driverId, eventType, ctx.clientRequestId);
  const existingSnap = await getDoc(getDocRef(paths.orderEvent(orderId, eventId)));
  if (existingSnap.exists()) {
    log("ORDER", `duplicate ${eventType} suppressed for ${orderId}`);
    return false;
  }
  const event: DeliveryEvent = {
    event_id: eventId,
    order_id: orderId,
    driver_id: ctx.driverId,
    restaurant_id: orderRestaurantId(ctx.order) ?? undefined,
    branch_id: orderBranchId(ctx.order) ?? undefined,
    event_type: eventType,
    status,
    timestamp: nowIso(),
    latitude: ctx.location?.latitude ?? null,
    longitude: ctx.location?.longitude ?? null,
    note: ctx.note ?? null,
    metadata: ctx.metadata ?? null,
  };
  await setDoc(getDocRef(paths.orderEvent(orderId, eventId)), event);
  log("STATUS", `${ctx.order.order_number ?? orderId} -> ${status}`);
  return true;
}

async function guard(ctx: MutationContext) {
  const res = await isDriverEligible(
    ctx.driverId,
    orderRestaurantId(ctx.order),
    orderBranchId(ctx.order),
  );
  if (!res.eligible) throw new Error(res.reason ?? "Not authorized for this delivery.");
}

function assertOwnership(ctx: MutationContext) {
  if (ctx.order.driver_id && ctx.order.driver_id !== ctx.driverId) {
    throw new Error("This delivery belongs to another driver.");
  }
}

export async function acceptDelivery(ctx: MutationContext, driver: Driver) {
  await guard(ctx);
  const freshSnap = await getDoc(getDocRef(paths.order(ctx.order.id)));
  const fresh = snapToData<Order>(freshSnap);
  if (fresh?.driver_id && fresh.driver_id !== ctx.driverId) {
    throw new Error("This delivery has already been taken by another driver.");
  }
  const created = await writeEvent("assignment_accepted", "accepted", ctx);
  if (!created) return;
  await updateDoc(getDocRef(paths.order(ctx.order.id)), {
    driver_id: ctx.driverId,
    driver_name: driver.full_name,
    driver_phone: driver.phone,
    driver_rating: driver.rating ?? null,
    driver_status: "accepted",
    status: "assigned",
    accepted_at: nowIso(),
    updated_at: nowIso(),
  });
}

export async function rejectDelivery(ctx: MutationContext, reason: string) {
  await guard(ctx);
  const created = await writeEvent("assignment_rejected", "rejected", { ...ctx, note: reason });
  if (!created) return;
  const patch: Record<string, unknown> = {
    rejected_at: nowIso(),
    rejection_reason: reason,
    updated_at: nowIso(),
  };
  if (ctx.order.driver_id === ctx.driverId) {
    patch["driver_id"] = null;
    patch["driver_name"] = null;
    patch["driver_phone"] = null;
    patch["driver_status"] = null;
    patch["status"] = "ready";
  }
  await updateDoc(getDocRef(paths.order(ctx.order.id)), patch);
}

export async function arriveAtRestaurant(ctx: MutationContext) {
  await guard(ctx);
  assertOwnership(ctx);
  const created = await writeEvent("arrived_at_restaurant", "arrived_at_restaurant", ctx);
  if (!created) return;
  await updateDoc(getDocRef(paths.order(ctx.order.id)), {
    driver_status: "arrived_at_restaurant",
    arrived_at_restaurant: nowIso(),
    updated_at: nowIso(),
  });
}

export async function verifyPickup(ctx: MutationContext, code: string) {
  await guard(ctx);
  assertOwnership(ctx);
  await writeEvent("pickup_verified", "arrived_at_restaurant", { ...ctx, metadata: { code } });
}

export async function pickUpOrder(ctx: MutationContext) {
  await guard(ctx);
  assertOwnership(ctx);
  const created = await writeEvent("order_picked_up", "picked_up", ctx);
  if (!created) return;
  await updateDoc(getDocRef(paths.order(ctx.order.id)), {
    driver_status: "picked_up",
    status: "picked_up",
    picked_up_at: nowIso(),
    updated_at: nowIso(),
  });
}

export async function startDelivery(ctx: MutationContext) {
  await guard(ctx);
  assertOwnership(ctx);
  const created = await writeEvent("en_route", "en_route", ctx);
  if (!created) return;
  await updateDoc(getDocRef(paths.order(ctx.order.id)), {
    driver_status: "en_route",
    status: "en_route",
    en_route_at: nowIso(),
    updated_at: nowIso(),
  });
}

export async function arriveAtCustomer(ctx: MutationContext) {
  await guard(ctx);
  assertOwnership(ctx);
  const created = await writeEvent("arrived_at_customer", "arrived_at_customer", ctx);
  if (!created) return;
  await updateDoc(getDocRef(paths.order(ctx.order.id)), {
    driver_status: "arrived_at_customer",
    arrived_at_customer: nowIso(),
    updated_at: nowIso(),
  });
}

export async function completeDelivery(ctx: MutationContext, proof: ProofOfDelivery) {
  await guard(ctx);
  assertOwnership(ctx);
  const created = await writeEvent("delivered", "delivered", {
    ...ctx,
    metadata: { proof_method: proof.method },
  });
  if (!created) return;

  await updateDoc(getDocRef(paths.order(ctx.order.id)), {
    proof_of_delivery: proof,
    driver_status: "delivered",
    status: "delivered",
    delivered_at: nowIso(),
    delivered_latitude: ctx.location?.latitude ?? null,
    delivered_longitude: ctx.location?.longitude ?? null,
    updated_at: nowIso(),
  });

  await recordEarning(ctx.driverId, ctx.order);
  await clearLiveLocation(ctx.order.id);
}

/* --------------------------------------------------------------- earnings */

export async function recordEarning(driverId: string, order: Order) {
  const existingSnap = await getDoc(getDocRef(paths.earning(driverId, order.id)));
  if (existingSnap.exists()) return;
  const base = Number(order.delivery_fee ?? 0);
  const tip = Number(order.tip ?? 0);
  const earning: Earning = {
    id: order.id,
    driver_id: driverId,
    order_id: order.id,
    order_number: order.order_number,
    base_amount: base,
    tip,
    bonus: 0,
    adjustment: 0,
    amount: base + tip,
    status: "pending",
    created_at: nowIso(),
  };
  await setDoc(getDocRef(paths.earning(driverId, order.id)), earning);

  const txId = `tx_${order.id}`;
  const tx: WalletTransaction = {
    transaction_id: txId,
    driver_id: driverId,
    order_id: order.id,
    amount: earning.amount,
    type: "credit",
    status: "pending",
    description: `Delivery ${order.order_number ?? order.id}`,
    created_at: nowIso(),
  };
  await setDoc(getDocRef(paths.walletTx(driverId, txId)), tx);
}

export function subscribeEarnings(driverId: string, cb: (e: Earning[]) => void) {
  const q = query(getColRef(paths.earnings), where("driver_id", "==", driverId));
  return onSnapshot(
    q,
    (snap) => cb(snapToArray<Earning>(snap)),
    (err) => logError("FIREBASE", "subscribeEarnings failed", err),
  );
}

export function subscribeWallet(driverId: string, cb: (t: WalletTransaction[]) => void) {
  const q = query(
    getColRef(paths.wallet),
    where("driver_id", "==", driverId),
    orderBy("created_at", "desc"),
  );
  return onSnapshot(
    q,
    (snap) => cb(snapToArray<WalletTransaction>(snap)),
    (err) => logError("FIREBASE", "subscribeWallet failed", err),
  );
}

/* --------------------------------------------------------------- location */

export async function publishLiveLocation(orderId: string, driverId: string, loc: DriverLocation) {
  const payload: DriverLocation = {
    latitude: loc.latitude,
    longitude: loc.longitude,
    heading: loc.heading ?? null,
    speed: loc.speed ?? null,
    updated_at: nowIso(),
    driver_id: driverId,
    order_id: orderId,
  };
  await setDoc(getDocRef(paths.driverLive(orderId)), payload);
}

export async function clearLiveLocation(orderId: string) {
  const docRef = getDocRef(paths.driverLive(orderId));
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    await setDoc(docRef, {
      ...(snap.data() as object),
      updated_at: nowIso(),
    });
  }
}

export async function publishDriverPosition(driverId: string, lat: number, lng: number) {
  await updateDoc(getDocRef(paths.driver(driverId)), {
    current_latitude: lat,
    current_longitude: lng,
    updated_at: nowIso(),
  });
}

/* ---------------------------------------------------------- notifications */

export function subscribeNotifications(driverId: string, cb: (n: DriverNotification[]) => void) {
  const q = query(
    getColRef(paths.notifications),
    where("driver_id", "==", driverId),
    orderBy("created_at", "desc"),
  );
  return onSnapshot(
    q,
    (snap) => cb(snapToArray<DriverNotification>(snap)),
    (err) => logError("FIREBASE", "subscribeNotifications failed", err),
  );
}

export async function markNotificationRead(driverId: string, id: string) {
  const docRef = doc(getDb(), paths.notifications, id);
  await updateDoc(docRef, { read: true });
}

export async function markAllNotificationsRead(driverId: string, ids: string[]) {
  const db = getDb();
  const batch = ids.map(async (id) => {
    const docRef = doc(db, paths.notifications, id);
    return updateDoc(docRef, { read: true });
  });
  await Promise.all(batch);
}

/* --------------------------------------------------------------- support */

export function subscribeSupportTickets(driverId: string, cb: (t: SupportTicket[]) => void) {
  const q = query(
    getColRef(paths.support),
    where("driver_id", "==", driverId),
    orderBy("created_at", "desc"),
  );
  return onSnapshot(
    q,
    (snap) => cb(snapToArray<SupportTicket>(snap)),
    (err) => logError("FIREBASE", "subscribeSupportTickets failed", err),
  );
}

export async function createSupportTicket(
  driverId: string,
  input: { subject: string; category: string; message: string; order_id?: string | null },
) {
  const col = getColRef(paths.support);
  const id = doc(col).id;
  const ticket: SupportTicket = {
    id,
    driver_id: driverId,
    subject: input.subject,
    category: input.category,
    status: "open",
    order_id: input.order_id ?? null,
    created_at: nowIso(),
    updated_at: nowIso(),
    messages: {
      m0: { id: "m0", sender: "driver", body: input.message, created_at: nowIso() },
    },
  };
  await setDoc(doc(col, id), ticket);
  return id;
}

export async function addSupportMessage(ticketId: string, body: string) {
  const ticketSnap = await getDoc(getDocRef(paths.supportTicket(ticketId)));
  const ticket = snapToData<SupportTicket>(ticketSnap);
  const existing = ticket?.messages ?? {};
  const nextIndex = Object.keys(existing).length;
  const msgId = `m${nextIndex}`;
  const msg: SupportMessage = {
    id: msgId,
    sender: "driver",
    body,
    created_at: nowIso(),
  };
  await updateDoc(getDocRef(paths.supportTicket(ticketId)), {
    [`messages.${msgId}`]: msg,
    updated_at: nowIso(),
    status: "open",
  });
}

/* ------------------------------------------------------------ order chat */

export function subscribeOrderChat(
  orderId: string,
  cb: (m: { id: string; sender: string; body: string; created_at: string }[]) => void,
) {
  type Msg = { id: string; sender: string; body: string; created_at: string };
  const q = query(getColRef(paths.chat(orderId)), orderBy("created_at", "asc"));
  return onSnapshot(
    q,
    (snap) => cb(snapToArray<Msg>(snap)),
    (err) => logError("FIREBASE", "subscribeOrderChat failed", err),
  );
}

export async function sendOrderMessage(orderId: string, driverId: string, body: string) {
  const col = getColRef(paths.chat(orderId));
  const ref = doc(col);
  const id = ref.id;
  await setDoc(ref, {
    id,
    sender: "driver",
    driver_id: driverId,
    body,
    created_at: nowIso(),
  });
}

/* ----------------------------------------------------------- restaurants */

export async function loadRestaurant(restaurantId: string): Promise<Restaurant | null> {
  const snap = await getDoc(getDocRef(paths.restaurant(restaurantId)));
  const r = snapToData<Restaurant>(snap);
  return r ? { ...r, id: r.id ?? restaurantId } : null;
}

export function subscribeRestaurants(cb: (r: Record<string, Restaurant>) => void) {
  return subscribeCollection<Restaurant>(paths.restaurants, (all) => cb(all ?? {}));
}

/* ------------------------------------------------------------- onboarding */

export interface DriverRegistrationInput {
  full_name: string;
  email: string;
  phone: string;
  city?: string;
  vehicle_type?: string;
  vehicle_plate?: string;
  license_number?: string;
}

export async function registerDriverProfile(
  uid: string,
  input: DriverRegistrationInput,
): Promise<Driver> {
  const existing = await findDriverForUser(uid, input.email);
  if (existing) {
    if (existing.user_id !== uid) await linkDriverToAuthUser(existing.id, uid);
    return existing;
  }

  const ts = nowIso();
  const driver: Driver = {
    id: uid,
    user_id: uid,
    full_name: input.full_name.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone.trim(),
    city: input.city?.trim() || "",
    status: "offline",
    is_active: true,
    is_deleted: false,
    is_verified: false,
    rating: 0,
    total_deliveries: 0,
    wallet_balance: 0,
    vehicle_type: input.vehicle_type || "motorbike",
    vehicle_plate: input.vehicle_plate?.trim() || "",
    license_number: input.license_number?.trim() || null,
    current_latitude: null,
    current_longitude: null,
    photo_url: null,
    created_at: ts,
    updated_at: ts,
    last_online_at: null,
    last_offline_at: null,
  };

  const record = {
    ...driver,
    name: driver.full_name,
    driver_id: uid,
    role: "driver",
    is_online: false,
    is_available: false,
    approval_status: "pending",
    onboarding_source: "driver_app",
    registered_at: ts,
  };

  await setDoc(getDocRef(paths.driver(uid)), record);
  log("AUTH", `driver profile created for ${uid}`);
  return driver;
}
