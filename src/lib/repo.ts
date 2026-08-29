import {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  deleteDoc,
  type DocumentReference,
  type CollectionReference,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb } from "./firebase";
import { paths, assignmentKey, notificationReadKey } from "./paths";
import { log, logError } from "./log";
import type {
  Driver,
  DriverAssignment,
  Order,
  DeliveryEvent,
  DeliveryEventType,
  DeliveryStatus,
  Earning,
  WalletTransaction,
  DriverNotification,
  SupportTicket,
  ProofOfDelivery,
  Restaurant,
  SupportMessage,
  OrderTimelineEntry,
  NotificationRead,
} from "@/types/forkfleet";

export const nowIso = () => new Date().toISOString();

export function toArray<T>(val: unknown): T[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean) as T[];
  return Object.values(val as Record<string, T>);
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v === undefined) {
      out[k] = null;
    } else {
      out[k] = v;
    }
  }
  return out as T;
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

async function mergePatch(path: string, patch: Record<string, unknown>) {
  const clean = stripUndefined(patch);
  await setDoc(getDocRef(path), clean, { merge: true });
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
  await mergePatch(paths.driver(driverId), {
    user_id: uid,
    updated_at: nowIso(),
  });
}

export async function updateDriverProfile(driverId: string, patch: Partial<Driver>) {
  await mergePatch(paths.driver(driverId), { ...patch, updated_at: nowIso() });
}

export async function setDriverOnline(driverId: string, online: boolean) {
  const snap = await getDoc(getDocRef(paths.driver(driverId)));
  const driver = snapToData<Driver>(snap);
  if (!driver) throw new Error("Driver profile not found.");

  if (online) {
    if (!driver.is_verified || !driver.is_active) {
      throw new Error(
        "Cannot go online: driver account must be verified and active. Please complete verification or contact operations.",
      );
    }
  }

  const patch: Record<string, unknown> = {
    status: online ? "online" : "offline",
    updated_at: nowIso(),
  };
  patch[online ? "last_online_at" : "last_offline_at"] = nowIso();
  await mergePatch(paths.driver(driverId), patch);
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
  return subscribeDoc<Order>(paths.order(orderId), (order) => {
    const rawTimeline = (order?.timeline as OrderTimelineEntry[]) ?? [];
    const events: DeliveryEvent[] = rawTimeline.map((entry, idx) => {
      const statusToEvent: Record<string, DeliveryEventType> = {
        assigned: "assignment_offered",
        picked_up: "order_picked_up",
        on_the_way: "on_the_way",
        delivered: "delivered",
        arrived_at_restaurant: "arrived_at_restaurant",
        arrived_at_customer: "arrived_at_customer",
        payment_collected: "proof_uploaded",
      };
      const eventType = statusToEvent[entry.status] ?? ("order_received" as DeliveryEventType);
      return {
        event_id: `${orderId}_tl_${idx}`,
        order_id: orderId,
        driver_id: entry.driver_id ?? "",
        event_type: eventType,
        status: entry.status as DeliveryStatus,
        timestamp: entry.at,
        latitude: entry.latitude ?? null,
        longitude: entry.longitude ?? null,
        note: entry.note ?? null,
        metadata: null,
      } as DeliveryEvent;
    });
    cb(events);
  });
}

async function appendTimeline(
  orderId: string,
  entry: Omit<OrderTimelineEntry, "at"> & { at?: string },
  driverId?: string,
): Promise<void> {
  const snap = await getDoc(getDocRef(paths.order(orderId)));
  const order = snapToData<Order>(snap);
  const existing: OrderTimelineEntry[] = (order?.timeline as OrderTimelineEntry[]) ?? [];
  const newEntry: OrderTimelineEntry = {
    status: entry.status,
    at: entry.at ?? nowIso(),
    ...(entry.note ? { note: entry.note } : {}),
    ...(driverId ? { driver_id: driverId } : entry.driver_id ? { driver_id: entry.driver_id } : {}),
    ...(entry.latitude !== undefined ? { latitude: entry.latitude } : {}),
    ...(entry.longitude !== undefined ? { longitude: entry.longitude } : {}),
  };
  await mergePatch(paths.order(orderId), {
    timeline: [...existing, newEntry],
  });
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

function idempotencyKey(
  orderId: string,
  driverId: string,
  eventType: string,
  clientRequestId: string,
) {
  return `${eventType}__${driverId}__${clientRequestId}`.replace(/[.#$/[\]]/g, "-");
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

async function checkIdempotent(orderId: string, ctx: MutationContext, tag: string): Promise<boolean> {
  const key = idempotencyKey(orderId, ctx.driverId, tag, ctx.clientRequestId);
  const markerPath = `idem/${key}`;
  if (!isDocPath(markerPath)) return true;
  const snap = await getDoc(getDocRef(markerPath)).catch(() => null);
  if (snap && snap.exists()) {
    log("ORDER", `duplicate ${tag} suppressed for ${orderId}`);
    return false;
  }
  try {
    await setDoc(getDocRef(markerPath), { t: nowIso() });
  } catch {
    // ignore marker failures
  }
  return true;
}

export async function arriveAtRestaurant(ctx: MutationContext) {
  await guard(ctx);
  assertOwnership(ctx);
  const ok = await checkIdempotent(ctx.order.id, ctx, "arrive_at_restaurant");
  if (!ok) return;

  await appendTimeline(
    ctx.order.id,
    {
      status: "arrived_at_restaurant",
      driver_id: ctx.driverId,
      latitude: ctx.location?.latitude ?? null,
      longitude: ctx.location?.longitude ?? null,
    },
    ctx.driverId,
  );
  await mergePatch(paths.order(ctx.order.id), {
    driver_status: "arrived_at_restaurant",
    arrived_at_restaurant: nowIso(),
    updated_at: nowIso(),
  });
}

export async function verifyPickup(ctx: MutationContext, code: string) {
  await guard(ctx);
  assertOwnership(ctx);
  await appendTimeline(
    ctx.order.id,
    {
      status: "pickup_verified",
      driver_id: ctx.driverId,
      note: `Pickup code: ${code}`,
      latitude: ctx.location?.latitude ?? null,
      longitude: ctx.location?.longitude ?? null,
    },
    ctx.driverId,
  );
}

export async function pickUpOrder(ctx: MutationContext) {
  await guard(ctx);
  assertOwnership(ctx);
  const ok = await checkIdempotent(ctx.order.id, ctx, "picked_up");
  if (!ok) return;

  await appendTimeline(
    ctx.order.id,
    {
      status: "picked_up",
      driver_id: ctx.driverId,
      latitude: ctx.location?.latitude ?? null,
      longitude: ctx.location?.longitude ?? null,
    },
    ctx.driverId,
  );
  await mergePatch(paths.order(ctx.order.id), {
    driver_status: "picked_up",
    status: "picked_up",
    picked_up_at: nowIso(),
    updated_at: nowIso(),
  });
}

export async function startDelivery(ctx: MutationContext) {
  await guard(ctx);
  assertOwnership(ctx);
  const ok = await checkIdempotent(ctx.order.id, ctx, "on_the_way");
  if (!ok) return;

  await appendTimeline(
    ctx.order.id,
    {
      status: "on_the_way",
      driver_id: ctx.driverId,
      latitude: ctx.location?.latitude ?? null,
      longitude: ctx.location?.longitude ?? null,
    },
    ctx.driverId,
  );
  await mergePatch(paths.order(ctx.order.id), {
    driver_status: "on_the_way",
    status: "on_the_way",
    on_the_way_at: nowIso(),
    updated_at: nowIso(),
  });
}

export async function arriveAtCustomer(ctx: MutationContext) {
  await guard(ctx);
  assertOwnership(ctx);
  const ok = await checkIdempotent(ctx.order.id, ctx, "arrive_at_customer");
  if (!ok) return;

  await appendTimeline(
    ctx.order.id,
    {
      status: "arrived_at_customer",
      driver_id: ctx.driverId,
      latitude: ctx.location?.latitude ?? null,
      longitude: ctx.location?.longitude ?? null,
    },
    ctx.driverId,
  );
  await mergePatch(paths.order(ctx.order.id), {
    driver_status: "arrived_at_customer",
    arrived_at_customer: nowIso(),
    updated_at: nowIso(),
  });
}

export async function completeDelivery(ctx: MutationContext, proof: ProofOfDelivery) {
  await guard(ctx);
  assertOwnership(ctx);
  const ok = await checkIdempotent(ctx.order.id, ctx, "delivered");
  if (!ok) return;

  await appendTimeline(
    ctx.order.id,
    {
      status: "delivered",
      driver_id: ctx.driverId,
      note: `Proof: ${proof.method}`,
      latitude: ctx.location?.latitude ?? null,
      longitude: ctx.location?.longitude ?? null,
    },
    ctx.driverId,
  );
  await mergePatch(paths.order(ctx.order.id), {
    proof_of_delivery: proof,
    driver_status: "delivered",
    status: "delivered",
    delivered_at: nowIso(),
    delivered_latitude: ctx.location?.latitude ?? null,
    delivered_longitude: ctx.location?.longitude ?? null,
    updated_at: nowIso(),
  });

  await recordEarning(ctx.driverId, ctx.order);
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
  const cleanEarning = stripUndefined(earning as unknown as Record<string, unknown>) as unknown as Earning;
  await setDoc(getDocRef(paths.earning(driverId, order.id)), cleanEarning);

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
  const cleanTx = stripUndefined(tx as unknown as Record<string, unknown>) as unknown as WalletTransaction;
  await setDoc(getDocRef(paths.walletTx(driverId, txId)), cleanTx);
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

const lastDriverPositionWrite: Record<string, number> = {};

export async function publishDriverPosition(driverId: string, lat: number, lng: number) {
  const now = Date.now();
  const last = lastDriverPositionWrite[driverId] ?? 0;
  if (now - last < 12_000) {
    return;
  }
  lastDriverPositionWrite[driverId] = now;
  await mergePatch(paths.driver(driverId), {
    current_latitude: lat,
    current_longitude: lng,
    updated_at: nowIso(),
  });
}

/* ---------------------------------------------------------- notifications */

export function subscribeNotifications(driverId: string, cb: (n: DriverNotification[]) => void) {
  return onSnapshot(
    getColRef(paths.notificationAlerts),
    async (snap) => {
      const alerts = snapToArray<Record<string, unknown>>(snap);
      const readSnap = await getDocs(
        query(getColRef(paths.notificationReads), where("user_id", "==", driverId)),
      ).catch(() => null);
      const readIds = new Set<string>();
      if (readSnap) {
        for (const d of readSnap.docs) {
          const data = d.data() as NotificationRead;
          if (data?.alert_id) readIds.add(data.alert_id);
        }
      }
      const result: DriverNotification[] = [];
      for (const a of alerts) {
        const alertDriverId = (a as { driver_id?: string | null }).driver_id;
        const global = !alertDriverId;
        const matchesDriver = alertDriverId === driverId;
        if (!global && !matchesDriver) continue;

        const alertId = (a as { id?: string }).id ?? "";
        result.push({
          id: alertId,
          alert_id: alertId,
          driver_id: alertDriverId ?? driverId,
          user_id: driverId,
          title: (a as { title?: string }).title ?? "",
          body: (a as { body?: string }).body ?? (a as { message?: string }).message ?? "",
          message: (a as { message?: string }).message ?? (a as { body?: string }).body ?? "",
          type: (a as { type?: string }).type ?? "info",
          order_id: (a as { order_id?: string | null }).order_id ?? null,
          read: readIds.has(alertId),
          created_at: (a as { created_at?: string }).created_at ?? nowIso(),
          severity: (a as { severity?: "info" | "warning" | "critical" }).severity ?? "info",
        } as DriverNotification);
      }
      result.sort(
        (x, y) =>
          new Date(y.created_at).getTime() - new Date(x.created_at).getTime(),
      );
      cb(result);
    },
    (err) => logError("FIREBASE", "subscribeNotifications failed", err),
  );
}

export async function markNotificationRead(driverId: string, alertId: string) {
  const id = notificationReadKey(alertId, driverId);
  const read: NotificationRead = {
    id,
    alert_id: alertId,
    user_id: driverId,
    read_at: nowIso(),
  };
  await setDoc(getDocRef(paths.notificationRead(id)), read);
}

export async function markAllNotificationsRead(driverId: string, alertIds: string[]) {
  await Promise.all(alertIds.map((id) => markNotificationRead(driverId, id)));
}

/* ----------------------------------------------------------------- payment */

export async function confirmCashCollection(orderId: string, driverId: string): Promise<void> {
  const snap = await getDoc(getDocRef(paths.order(orderId)));
  const order = snapToData<Order>(snap);
  if (!order) return;

  const payment = order.payment ?? {};
  if (payment.method !== "cash") return;
  if (payment.status === "paid") return;

  await appendTimeline(
    orderId,
    {
      status: "payment_collected",
      driver_id: driverId,
      note: "Cash on delivery collected",
    },
    driverId,
  );
  await mergePatch(paths.order(orderId), {
    payment: {
      status: "paid",
      collected_by: driverId,
      collected_at: nowIso(),
      method: "cash",
      amount: payment.amount ?? order.total ?? null,
      transaction_id: payment.transaction_id ?? null,
    },
    updated_at: nowIso(),
  });
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
  const clean = stripUndefined(ticket as unknown as Record<string, unknown>) as unknown as SupportTicket;
  await setDoc(doc(col, id), clean);
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
  await mergePatch(paths.supportTicket(ticketId), {
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
    status: "pending",
    is_active: false,
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

  const record = stripUndefined({
    ...driver,
    name: driver.full_name,
    driver_id: uid,
    role: "driver",
    is_online: false,
    is_available: false,
    approval_status: "pending",
    onboarding_source: "driver_app",
    registered_at: ts,
  } as Record<string, unknown>) as unknown as Record<string, unknown>;

  await setDoc(getDocRef(paths.driver(uid)), record);
  log("AUTH", `driver profile created for ${uid}`);
  return driver;
}
