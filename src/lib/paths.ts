/** Canonical Firestore collection / document paths.
 *  Slash-separated paths map to Firestore alternating collection/doc segments.
 */
export const paths = {
  drivers: "drivers",
  driver: (driverId: string) => `drivers/${driverId}`,

  driverLive: (orderId: string) => `driverLive/${orderId}`,

  assignments: "driverAssignments",
  assignment: (key: string) => `driverAssignments/${key}`,

  orders: "orders",
  order: (orderId: string) => `orders/${orderId}`,

  orderEvents: (orderId: string) => `orders/${orderId}/events`,
  orderEvent: (orderId: string, eventId: string) => `orders/${orderId}/events/${eventId}`,

  restaurants: "restaurants",
  restaurant: (restaurantId: string) => `restaurants/${restaurantId}`,
  branches: (restaurantId: string) => `restaurants/${restaurantId}/branches`,

  notifications: "notifications",
  notificationsByDriver: (driverId: string) => `notifications`,

  support: "supportTickets",
  supportTicket: (ticketId: string) => `supportTickets/${ticketId}`,
  supportMessages: (ticketId: string) => `supportTickets/${ticketId}/messages`,

  earnings: "driverEarnings",
  earningsByDriver: (driverId: string) => `driverEarnings`,
  earning: (driverId: string, orderId: string) => `driverEarnings/${orderId}`,

  wallet: "walletTransactions",
  walletByDriver: (driverId: string) => `walletTransactions`,
  walletTx: (driverId: string, txId: string) => `walletTransactions/${txId}`,

  chat: (orderId: string) => `orders/${orderId}/chatMessages`,
};

export function assignmentKey(driverId: string, restaurantId: string, branchId: string) {
  return `${driverId}__${restaurantId}__${branchId}`;
}
