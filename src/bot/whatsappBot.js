// ══════════════════════════════════════════════════════════════
// WhatsApp Bot — Twilio
// Keyword flow:
//   "lunch start"        → start session, show restaurants
//   "pick <number>"      → select restaurant
//   "order <item>"       → add item to session
//   "lunch status"       → see current orders
//   "lunch done"         → place consolidated order
//   "lunch help"         → show commands
// ══════════════════════════════════════════════════════════════

const swiggy = require("../mcp/swiggyFoodClient");
const aggregator = require("../aggregator/orderAggregator");
const { formatWhatsAppBillSplit } = require("../utils/billSplitter");
require("dotenv").config();

const FROM = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";

// Lazy init — only require + create Twilio client when real credentials present
let _twilioClient = null;
function getTwilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID || "";
  const token = process.env.TWILIO_AUTH_TOKEN || "";
  if (!sid.startsWith("AC")) return null;
  if (!_twilioClient) {
    const twilio = require("twilio");
    _twilioClient = twilio(sid, token);
  }
  return _twilioClient;
}

// Temporary store for restaurant list per channel (WhatsApp is stateless)
const channelRestaurantCache = new Map();

// ── Send WhatsApp message ─────────────────────────────────────
async function sendWhatsApp(to, body) {
  const client = getTwilioClient();
  if (!client) {
    console.log(`[WhatsApp Mock] To: ${to}\n${body}\n`);
    return { sid: "MOCK_SID" };
  }
  return client.messages.create({ from: FROM, to, body });
}

// ── Main message handler (called from Express webhook) ────────
async function handleWhatsAppMessage(req, res) {
  // Twilio sends form-encoded data
  const from = req.body.From;           // e.g. "whatsapp:+919876543210"
  const body = (req.body.Body || "").trim().toLowerCase();
  const channelId = from;               // use sender number as channel key

  // Always respond 200 immediately to Twilio
  res.status(200).send("<Response></Response>");

  try {
    if (body === "lunch start") {
      await handleStart(channelId, from);
    } else if (body.startsWith("pick ")) {
      await handlePick(channelId, from, body);
    } else if (body.startsWith("order ")) {
      await handleOrder(channelId, from, body);
    } else if (body === "lunch status") {
      await handleStatus(channelId, from);
    } else if (body === "lunch done") {
      await handleDone(channelId, from);
    } else {
      await sendWhatsApp(from,
        "🍽️ *Corporate Lunch Bot*\n\n" +
        "Commands:\n" +
        "• *lunch start* — Start a new session\n" +
        "• *pick <number>* — Choose a restaurant (after start)\n" +
        "• *order <item name>* — Add your item\n" +
        "• *lunch status* — See all orders\n" +
        "• *lunch done* — Place the group order"
      );
    }
  } catch (err) {
    console.error("[WhatsApp handler error]", err.message);
    await sendWhatsApp(from, `❌ Something went wrong: ${err.message}`);
  }
}

// ── lunch start ───────────────────────────────────────────────
async function handleStart(channelId, from) {
  const existing = aggregator.getActiveSessionForChannel(channelId);
  if (existing) {
    return sendWhatsApp(from, `⚠️ A session is already open.\nDeadline: ${existing.deadline.toLocaleTimeString("en-IN")}\nSend *lunch status* to see orders.`);
  }

  const { addresses } = await swiggy.getAddresses();
  const address = addresses[0];

  const session = aggregator.createSession({
    teamName: "WhatsApp Lunch Group",
    channelId,
    platform: "whatsapp",
    createdBy: from,
  });

  const { restaurants } = await swiggy.searchRestaurants(address.addressId);
  const top5 = restaurants.slice(0, 5);

  // Cache for pick command
  channelRestaurantCache.set(channelId, {
    restaurants: top5,
    addressId: address.addressId,
    sessionId: session.sessionId,
  });

  const list = top5
    .map((r, i) => `${i + 1}. *${r.name}* — ${r.deliveryTime} min | ⭐${r.rating} | ${r.cuisine[0]}`)
    .join("\n");

  await sendWhatsApp(from,
    `🍽️ *Lunch session started!*\n` +
    `Session: \`${session.sessionId}\`\n` +
    `Deadline: ${session.deadline.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}\n\n` +
    `*Pick a restaurant:*\n${list}\n\n` +
    `Reply *pick <number>* e.g. _pick 1_`
  );
}

// ── pick <number> ─────────────────────────────────────────────
async function handlePick(channelId, from, body) {
  const num = parseInt(body.replace("pick", "").trim()) - 1;
  const cache = channelRestaurantCache.get(channelId);

  if (!cache) return sendWhatsApp(from, "❌ Send *lunch start* first.");
  if (isNaN(num) || num < 0 || num >= cache.restaurants.length) {
    return sendWhatsApp(from, `❌ Please pick a number between 1 and ${cache.restaurants.length}.`);
  }

  const chosen = cache.restaurants[num];
  aggregator.setRestaurant(cache.sessionId, chosen.restaurantId, cache.addressId);

  const { menu } = await swiggy.getRestaurantMenu(chosen.restaurantId, cache.addressId);
  const topItems = menu.categories[0]?.items.slice(0, 5) || [];
  const itemList = topItems
    .map((i) => `• *${i.name}* — ₹${i.price} ${i.isVeg ? "🟢" : "🔴"}`)
    .join("\n");

  await sendWhatsApp(from,
    `✅ *${chosen.name}* selected!\n\n` +
    `*Popular items:*\n${itemList}\n\n` +
    `Reply *order <item name>* to add your order.\n` +
    `Example: _order Chicken Biryani_`
  );
}

// ── order <item> ──────────────────────────────────────────────
async function handleOrder(channelId, from, body) {
  const itemQuery = body.replace("order", "").trim();
  if (!itemQuery) return sendWhatsApp(from, "❌ Please specify an item. Example: _order Paneer Wrap_");

  const session = aggregator.getActiveSessionForChannel(channelId);
  if (!session) return sendWhatsApp(from, "❌ No active session. Send *lunch start* to begin.");
  if (!session.selectedRestaurantId) return sendWhatsApp(from, "⚠️ Please pick a restaurant first with *pick <number>*.");

  const { results } = await swiggy.searchMenu(itemQuery, session.selectedAddressId || "addr_001");
  const match = results.find((r) => r.restaurantId === session.selectedRestaurantId) || results[0];

  if (!match) {
    return sendWhatsApp(from, `❌ No item matching *${itemQuery}* found. Try a different name.`);
  }

  // Use last 10 digits of phone as userId
  const userId = from.replace("whatsapp:+", "").slice(-10);
  const userName = from.replace("whatsapp:", "");

  aggregator.addOrder(session.sessionId, {
    userId,
    userName,
    items: [{ itemId: match.itemId, name: match.name, price: match.price, quantity: 1 }],
  });

  const summary = aggregator.getSummary(session.sessionId);

  await sendWhatsApp(from,
    `✅ Added: *${match.name}* — ₹${match.price}\n\n` +
    `*Team orders:* ${summary.membersOrdered} member(s)\n` +
    `⏰ ${summary.timeLeftMinutes} min left\n\n` +
    `When everyone is done, send *lunch done* to place the order.`
  );
}

// ── lunch status ──────────────────────────────────────────────
async function handleStatus(channelId, from) {
  const session = aggregator.getActiveSessionForChannel(channelId);
  if (!session) return sendWhatsApp(from, "No active session. Send *lunch start* to begin.");

  const summary = aggregator.getSummary(session.sessionId);
  const lines = summary.memberList
    .map((m) => `• ${m.userName}: ${m.itemCount} item(s) — ₹${m.memberTotal}`)
    .join("\n");

  await sendWhatsApp(from,
    `📋 *Lunch Status*\n` +
    `Members ordered: ${summary.membersOrdered}\n` +
    `Restaurant: ${summary.restaurantSelected ? "✅ Selected" : "❌ Not selected"}\n` +
    `Time left: ${summary.timeLeftMinutes} min\n\n` +
    (lines || "_No orders yet_")
  );
}

// ── lunch done ────────────────────────────────────────────────
async function handleDone(channelId, from) {
  const session = aggregator.getActiveSessionForChannel(channelId);
  if (!session) return sendWhatsApp(from, "❌ No active session.");
  if (!session.selectedRestaurantId) return sendWhatsApp(from, "❌ No restaurant selected.");
  if (session.orders.size === 0) return sendWhatsApp(from, "❌ No orders collected.");

  await sendWhatsApp(from, "⏳ Placing order with Swiggy...");

  try {
    await swiggy.flushFoodCart();

    const cartItems = aggregator.getCartItems(session.sessionId);
    await swiggy.updateFoodCart(session.selectedRestaurantId, cartItems, session.selectedAddressId);

    const { coupons } = await swiggy.fetchFoodCoupons();
    if (coupons?.length > 0) {
      await swiggy.applyFoodCoupon(coupons[0].code).catch(() => {});
    }

    const swiggyOrder = await swiggy.placeFoodOrder(session.selectedAddressId, "COD");
    aggregator.closeSession(session.sessionId, swiggyOrder.orderId);

    const billSplitResult = aggregator.buildBillSplit(session.sessionId, swiggyOrder.pricing);
    const msg = formatWhatsAppBillSplit(billSplitResult, swiggyOrder);

    await sendWhatsApp(from, msg);
  } catch (err) {
    await sendWhatsApp(from, `❌ Order failed: ${err.message}`);
  }
}

module.exports = { handleWhatsAppMessage };
