export const paths = {
  drivers: "drivers",
  driver: (driverId: string) => `drivers/${driverId}`,

  assignments: "driverAssignments",
  assignment: (key: string) => `driverAssignments/${key}`,

  orders: "orders",
  order: (orderId: string) => `orders/${orderId}`,

  restaurants: "restaurants",
  restaurant: (restaurantId: string) => `restaurants/${restaurantId}`,

  notificationAlerts: "notificationAlerts",
  notificationAlert: (alertId: string) => `notificationAlerts/${alertId}`,
  notificationReads: "notificationReads",
  notificationRead: (readId: string) => `notificationReads/${readId}`,

  support: "support/_/tickets",
  supportTicket: (ticketId: string) => `support/_/tickets/${ticketId}`,

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

export function notificationReadKey(alertId: string, userId: string) {
  return `${alertId}__${userId}`;
}
