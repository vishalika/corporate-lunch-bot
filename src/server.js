// ══════════════════════════════════════════════════════════════
// Corporate Lunch Bot — Main Server
// Wires together: Swiggy MCP, Slack Bolt, WhatsApp/Twilio,
//                 Order Aggregator, REST API for testing
// ══════════════════════════════════════════════════════════════

require("dotenv").config();
const express = require("express");
const cors = require("cors");

const { isTokenValid } = require("./auth/oauth-flow");
const swiggy = require("./mcp/swiggyFoodClient");
const aggregator = require("./aggregator/orderAggregator");
const { formatPlainText } = require("./utils/billSplitter");
const { handleWhatsAppMessage } = require("./bot/whatsappBot");

const app = express();
const PORT = process.env.PORT || 3000;
const USE_MOCK = process.env.USE_MOCK !== "false";

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── OAuth callback (used by oauth-flow.js) ────────────────────
const { exchangeCodeForToken, generatePKCE } = require("./auth/oauth-flow");
let pendingPKCE = null;

app.get("/auth/callback", async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.send(`<h2>Auth error: ${error}</h2>`);
  if (!pendingPKCE) return res.send("<h2>No pending auth session found. Run: npm run auth</h2>");

  try {
    const tokenData = await exchangeCodeForToken(code, pendingPKCE.codeVerifier);
    process.env.SWIGGY_ACCESS_TOKEN = tokenData.access_token;
    pendingPKCE = null;
    res.send("<h2>✅ Authenticated! You can close this tab.</h2>");
  } catch (err) {
    res.send(`<h2>Token exchange failed: ${err.message}</h2>`);
  }
});

// ── WhatsApp webhook ──────────────────────────────────────────
// Configure this URL in Twilio Console → Messaging → Sandbox settings
// Webhook URL: https://your-domain.com/whatsapp/webhook
app.post("/whatsapp/webhook", handleWhatsAppMessage);

// ══════════════════════════════════════════════════════════════
// REST API — for testing and Slack bot coordination
// ══════════════════════════════════════════════════════════════

// ── Swiggy MCP direct wrappers ────────────────────────────────
app.get("/api/addresses", async (req, res) => {
  try { res.json(await swiggy.getAddresses()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/restaurants", async (req, res) => {
  try {
    const { addressId = "addr_001", query } = req.query;
    res.json(await swiggy.searchRestaurants(addressId, query));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/restaurants/:id/menu", async (req, res) => {
  try {
    const { addressId = "addr_001", page = 1 } = req.query;
    res.json(await swiggy.getRestaurantMenu(req.params.id, addressId, parseInt(page)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/menu/search", async (req, res) => {
  try {
    const { q, addressId = "addr_001" } = req.query;
    if (!q) return res.status(400).json({ error: "q is required" });
    res.json(await swiggy.searchMenu(q, addressId));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Session management ────────────────────────────────────────
app.post("/api/sessions", (req, res) => {
  try {
    const { teamName, channelId, platform = "api", createdBy = "api", deadlineMinutes } = req.body;
    if (!teamName || !channelId) return res.status(400).json({ error: "teamName and channelId are required" });
    const session = aggregator.createSession({ teamName, channelId, platform, createdBy, deadlineMinutes });
    res.json({ sessionId: session.sessionId, deadline: session.deadline, status: session.status });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/sessions/:id", (req, res) => {
  const summary = aggregator.getSummary(req.params.id);
  if (!summary) return res.status(404).json({ error: "Session not found" });
  res.json(summary);
});

app.patch("/api/sessions/:id/restaurant", (req, res) => {
  try {
    const { restaurantId, addressId = "addr_001" } = req.body;
    aggregator.setRestaurant(req.params.id, restaurantId, addressId);
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post("/api/sessions/:id/orders", (req, res) => {
  try {
    const { userId, userName, items } = req.body;
    if (!userId || !userName || !items?.length) {
      return res.status(400).json({ error: "userId, userName, and items[] required" });
    }
    aggregator.addOrder(req.params.id, { userId, userName, items });
    res.json(aggregator.getSummary(req.params.id));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Full order placement flow ─────────────────────────────────
app.post("/api/sessions/:id/place-order", async (req, res) => {
  const sessionId = req.params.id;
  try {
    const session = aggregator.getSession(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (!session.selectedRestaurantId) return res.status(400).json({ error: "No restaurant selected" });
    if (session.orders.size === 0) return res.status(400).json({ error: "No orders collected" });

    // 1. Flush cart
    await swiggy.flushFoodCart();

    // 2. Build and push cart
    const cartItems = aggregator.getCartItems(sessionId);
    await swiggy.updateFoodCart(session.selectedRestaurantId, cartItems, session.selectedAddressId || "addr_001");

    // 3. Apply best available coupon
    const { coupons } = await swiggy.fetchFoodCoupons();
    if (coupons?.length > 0) {
      await swiggy.applyFoodCoupon(coupons[0].code).catch(() => {});
    }

    // 4. Place order (COD)
    const swiggyOrder = await swiggy.placeFoodOrder(session.selectedAddressId || "addr_001", "COD");

    // 5. Close session + build bill split
    aggregator.closeSession(sessionId, swiggyOrder.orderId);
    const billSplitResult = aggregator.buildBillSplit(sessionId, swiggyOrder.pricing);

    console.log(formatPlainText(billSplitResult, swiggyOrder));

    res.json({ swiggyOrder, billSplit: billSplitResult });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Health check ──────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "Corporate Lunch Bot",
    mode: USE_MOCK ? "mock" : "live",
    swiggyAuth: USE_MOCK ? "n/a (mock)" : isTokenValid() ? "valid" : "expired — run npm run auth",
    platforms: {
      slack: !!(process.env.SLACK_BOT_TOKEN && !process.env.SLACK_BOT_TOKEN.startsWith("xoxb-your")),
      whatsapp: !!(process.env.TWILIO_ACCOUNT_SID && !process.env.TWILIO_ACCOUNT_SID.startsWith("your")),
    },
    timestamp: new Date().toISOString(),
  });
});

app.use((req, res) => res.status(404).json({ error: `${req.path} not found` }));

// ── Boot Slack bot (socket mode) ──────────────────────────────
async function startSlackBot() {
  const slackConfigured =
    process.env.SLACK_BOT_TOKEN &&
    !process.env.SLACK_BOT_TOKEN.startsWith("xoxb-your") &&
    process.env.SLACK_APP_TOKEN &&
    !process.env.SLACK_APP_TOKEN.startsWith("xapp-your");

  if (slackConfigured) {
    try {
      const { createSlackApp } = require("./bot/slackBot");
      const slackApp = createSlackApp();
      await slackApp.start();
      console.log("✅ Slack bot connected (Socket Mode)");
    } catch (err) {
      console.warn("⚠️  Slack bot failed to start:", err.message);
    }
  } else {
    console.log("ℹ️  Slack bot skipped — add SLACK_* tokens to .env to enable");
  }
}

// ── Start server ──────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n🚀 Corporate Lunch Bot running on port ${PORT}`);
  console.log(`📋 Health:       http://localhost:${PORT}/health`);
  console.log(`🍔 Restaurants:  http://localhost:${PORT}/api/restaurants`);
  console.log(`📦 Sessions:     http://localhost:${PORT}/api/sessions`);
  console.log(`📱 WA Webhook:   http://localhost:${PORT}/whatsapp/webhook`);
  console.log(`\n   Mode: ${USE_MOCK ? "🟡 MOCK (set USE_MOCK=false for live Swiggy)" : "🟢 LIVE"}`);
  if (!USE_MOCK && !isTokenValid()) {
    console.warn("   ⚠️  Swiggy token missing or expired — run: npm run auth");
  }
  console.log();

  await startSlackBot();
});

module.exports = app;
