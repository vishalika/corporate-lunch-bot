// ══════════════════════════════════════════════════════════════
// Order Aggregator
// Manages lunch sessions: collects individual team member orders,
// consolidates them, and coordinates with Swiggy MCP cart tools
// ══════════════════════════════════════════════════════════════

class OrderAggregator {
  constructor() {
    this.sessions = new Map(); // sessionId → session object
  }

  createSession({ teamName, channelId, platform, createdBy, deadlineMinutes = 30 }) {
    const sessionId = `SESSION-${Date.now()}`;
    const session = {
      sessionId,
      teamName,
      channelId,
      platform,
      createdBy,
      deadline: new Date(Date.now() + deadlineMinutes * 60000),
      status: "open",
      selectedRestaurantId: null,
      selectedAddressId: null,
      orders: new Map(), // userId → { userName, items[] }
      swiggyOrderId: null,
      createdAt: new Date(),
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  getActiveSessionForChannel(channelId) {
    for (const session of this.sessions.values()) {
      if (session.channelId === channelId && session.status === "open") return session;
    }
    return null;
  }

  setRestaurant(sessionId, restaurantId, addressId) {
    const session = this._requireOpen(sessionId);
    session.selectedRestaurantId = restaurantId;
    session.selectedAddressId = addressId;
    return session;
  }

  addOrder(sessionId, { userId, userName, items }) {
    const session = this._requireOpen(sessionId);
    if (new Date() > session.deadline) {
      session.status = "closed";
      throw new Error("Order deadline has passed");
    }
    session.orders.set(userId, { userId, userName, items, updatedAt: new Date() });
    return session;
  }

  removeOrder(sessionId, userId) {
    const session = this._requireOpen(sessionId);
    session.orders.delete(userId);
    return session;
  }

  // Build the flat items array needed for Swiggy update_food_cart
  getCartItems(sessionId) {
    const session = this._requireSession(sessionId);
    const cartItems = [];
    for (const [, order] of session.orders) {
      for (const item of order.items) {
        const existing = cartItems.find(
          (c) => c.itemId === item.itemId && c.orderedBy === order.userId
        );
        if (existing) {
          existing.quantity += item.quantity || 1;
        } else {
          cartItems.push({
            itemId: item.itemId,
            quantity: item.quantity || 1,
            orderedBy: order.userName,
          });
        }
      }
    }
    return cartItems;
  }

  // Build bill split after order is placed
  buildBillSplit(sessionId, pricingFromSwiggy) {
    const session = this._requireSession(sessionId);
    const billSplit = [];
    let subtotal = 0;

    for (const [, order] of session.orders) {
      const memberTotal = order.items.reduce(
        (s, i) => s + i.price * (i.quantity || 1), 0
      );
      subtotal += memberTotal;
      billSplit.push({ userId: order.userId, userName: order.userName, items: order.items, memberTotal });
    }

    const { deliveryFee = 0, taxes = 0, grandTotal = subtotal } = pricingFromSwiggy || {};
    const extras = deliveryFee + taxes;
    const extraPerPerson = billSplit.length > 0 ? Math.ceil(extras / billSplit.length) : 0;

    billSplit.forEach((m) => { m.totalOwed = m.memberTotal + extraPerPerson; });

    return { billSplit, pricing: { subtotal, deliveryFee, taxes, grandTotal } };
  }

  closeSession(sessionId, swiggyOrderId) {
    const session = this._requireSession(sessionId);
    session.status = "ordered";
    session.swiggyOrderId = swiggyOrderId;
    session.closedAt = new Date();
    return session;
  }

  getSummary(sessionId) {
    const session = this._requireSession(sessionId);
    const memberList = [];
    for (const [, o] of session.orders) {
      memberList.push({
        userName: o.userName,
        itemCount: o.items.length,
        memberTotal: o.items.reduce((s, i) => s + i.price * (i.quantity || 1), 0),
      });
    }
    const timeLeftMinutes = Math.max(0, Math.floor((session.deadline - Date.now()) / 60000));
    return {
      sessionId: session.sessionId,
      teamName: session.teamName,
      status: session.status,
      membersOrdered: session.orders.size,
      memberList,
      timeLeftMinutes,
      deadline: session.deadline.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      restaurantSelected: !!session.selectedRestaurantId,
    };
  }

  _requireSession(sessionId) {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error(`Session ${sessionId} not found`);
    return s;
  }

  _requireOpen(sessionId) {
    const s = this._requireSession(sessionId);
    if (s.status !== "open") throw new Error("Session is no longer open");
    return s;
  }
}

module.exports = new OrderAggregator();
