// ══════════════════════════════════════════════════════════════
// Corporate Lunch Bot — Test Suite
// Run: npm test  (server must be running: npm start)
// ══════════════════════════════════════════════════════════════

const BASE = "http://localhost:3001";
let pass = 0, fail = 0, sessionId;

const log = (label, ok, detail = "") => {
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? " — " + detail : ""}`);
  ok ? pass++ : fail++;
};

const req = async (method, path, body = null) => {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, opts);
  return { status: r.status, data: await r.json() };
};

async function run() {
  console.log("\n══════════════════════════════════════════");
  console.log("   Corporate Lunch Bot — Test Suite");
  console.log("══════════════════════════════════════════\n");

  // Health
  console.log("── Health ─────────────────────────────────");
  const h = await req("GET", "/health");
  log("Server running", h.status === 200, h.data.mode);

  // Addresses
  console.log("\n── Swiggy MCP Tools ───────────────────────");
  const addr = await req("GET", "/api/addresses");
  log("get_addresses", addr.data.addresses?.length > 0, `${addr.data.addresses?.length} addresses`);
  const addressId = addr.data.addresses[0]?.addressId;

  // search_restaurants
  const rests = await req("GET", `/api/restaurants?addressId=${addressId}`);
  log("search_restaurants", rests.data.restaurants?.length > 0, `${rests.data.restaurants?.length} found`);

  // search_restaurants with query
  const biryani = await req("GET", `/api/restaurants?addressId=${addressId}&query=biryani`);
  log("search_restaurants (filtered)", biryani.data.restaurants?.length > 0, `${biryani.data.restaurants?.length} match`);

  // get_restaurant_menu
  const menu = await req("GET", `/api/restaurants/rest_001/menu?addressId=${addressId}`);
  log("get_restaurant_menu", menu.data.menu?.categories?.length > 0, `${menu.data.menu?.categories?.length} categories`);

  // search_menu
  const search = await req("GET", `/api/menu/search?q=chicken&addressId=${addressId}`);
  log("search_menu", search.data.results?.length > 0, `${search.data.results?.length} results`);

  // ── Full order flow ─────────────────────────────────────────
  console.log("\n── Full Order Flow ────────────────────────");

  // 1. Create session
  const s = await req("POST", "/api/sessions", {
    teamName: "Criteo Engineering", channelId: "CH_TEST_001", platform: "api", createdBy: "vishalika",
  });
  log("Create session", !!s.data.sessionId, s.data.sessionId);
  sessionId = s.data.sessionId;

  // 2. Set restaurant
  const setR = await req("PATCH", `/api/sessions/${sessionId}/restaurant`, {
    restaurantId: "rest_001", addressId,
  });
  log("Set restaurant", setR.data.success);

  // 3. Add team member orders
  const o1 = await req("POST", `/api/sessions/${sessionId}/orders`, {
    userId: "U001", userName: "Vishalika",
    items: [{ itemId: "item_001", name: "Chicken Dum Biryani", price: 279, quantity: 1 }],
  });
  log("Add order — Vishalika", o1.status === 200, "₹279");

  const o2 = await req("POST", `/api/sessions/${sessionId}/orders`, {
    userId: "U002", userName: "Rahul",
    items: [{ itemId: "item_002", name: "Veg Dum Biryani", price: 229, quantity: 1 }],
  });
  log("Add order — Rahul", o2.status === 200, "₹229");

  const o3 = await req("POST", `/api/sessions/${sessionId}/orders`, {
    userId: "U003", userName: "Priya",
    items: [
      { itemId: "item_003", name: "Mutton Biryani", price: 349, quantity: 1 },
      { itemId: "item_004", name: "Raita", price: 49, quantity: 1 },
    ],
  });
  log("Add order — Priya", o3.status === 200, "₹398");

  // 4. Session summary
  const sum = await req("GET", `/api/sessions/${sessionId}`);
  log("Session summary", sum.data.membersOrdered === 3, `${sum.data.membersOrdered} members`);

  // 5. Place consolidated order
  console.log("\n── Place Consolidated Order ───────────────");
  const placed = await req("POST", `/api/sessions/${sessionId}/place-order`, {});
  log("place_food_order", placed.status === 200, placed.data.swiggyOrder?.orderId);

  if (placed.status === 200) {
    const { swiggyOrder, billSplit } = placed.data;
    log("Order ID received", !!swiggyOrder.orderId, swiggyOrder.orderId);
    log("ETA returned", !!swiggyOrder.estimatedDelivery, swiggyOrder.estimatedDelivery);
    log("Grand total > 0", billSplit.pricing.grandTotal > 0, `₹${billSplit.pricing.grandTotal}`);
    log("Bill split has 3 members", billSplit.billSplit.length === 3);
    log("Free delivery (order > ₹399)", billSplit.pricing.deliveryFee === 0);

    console.log("\n── Bill Split Preview ─────────────────────");
    billSplit.billSplit.forEach((m) => {
      console.log(`   ${m.userName}: ₹${m.memberTotal} food + share of extras = ₹${m.totalOwed}`);
    });
    console.log(`   Grand Total: ₹${billSplit.pricing.grandTotal}`);
  }

  // ── Final report ────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════");
  console.log(`   Results: ${pass} passed, ${fail} failed`);
  console.log(`   ${fail === 0 ? "🎉 ALL TESTS PASSED" : "⚠️  SOME TESTS FAILED"}`);
  console.log("══════════════════════════════════════════\n");
}

run().catch((err) => {
  console.error("❌ Test runner error:", err.message);
  console.error("   Make sure server is running: npm start");
});
