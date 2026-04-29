// ══════════════════════════════════════════════════════════════
// Slack Bot — Bolt SDK
// Commands: /lunch start | /lunch order | /lunch status | /lunch done
// Interactive: restaurant poll buttons, item selection
// ══════════════════════════════════════════════════════════════

const { App } = require("@slack/bolt");
const swiggy = require("../mcp/swiggyFoodClient");
const aggregator = require("../aggregator/orderAggregator");
const { formatSlackBillSplit } = require("../utils/billSplitter");
require("dotenv").config();

function createSlackApp() {
  const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    socketMode: true,
    appToken: process.env.SLACK_APP_TOKEN,
  });

  // ── /lunch command ──────────────────────────────────────────
  app.command("/lunch", async ({ command, ack, respond, client }) => {
    await ack();
    const [subcommand, ...args] = command.text.trim().split(" ");

    switch (subcommand) {
      case "start":
        await handleStart(command, respond, client);
        break;
      case "order":
        await handleOrder(command, respond, args.join(" "));
        break;
      case "status":
        await handleStatus(command, respond);
        break;
      case "done":
        await handleDone(command, respond, client);
        break;
      default:
        await respond({
          text: "🍽️ *Corporate Lunch Bot*\n\n" +
            "• `/lunch start` — Start a new lunch session & pick a restaurant\n" +
            "• `/lunch order <item name>` — Add your order\n" +
            "• `/lunch status` — See who has ordered\n" +
            "• `/lunch done` — Place the consolidated order",
        });
    }
  });

  // ── /lunch start ────────────────────────────────────────────
  async function handleStart(command, respond, client) {
    const existing = aggregator.getActiveSessionForChannel(command.channel_id);
    if (existing) {
      return respond({ text: `⚠️ A lunch session is already open (${existing.sessionId}). Use \`/lunch status\` to check it.` });
    }

    // Get office address from Swiggy (first saved address)
    const { addresses } = await swiggy.getAddresses();
    const address = addresses[0];

    // Create session
    const session = aggregator.createSession({
      teamName: command.team_domain || "Office Team",
      channelId: command.channel_id,
      platform: "slack",
      createdBy: command.user_id,
    });

    // Fetch nearby restaurants
    const { restaurants } = await swiggy.searchRestaurants(address.addressId);

    // Build restaurant poll blocks
    const restaurantButtons = restaurants.slice(0, 5).map((r) => ({
      type: "button",
      text: { type: "plain_text", text: `${r.name} (${r.deliveryTime}min)` },
      value: JSON.stringify({ restaurantId: r.restaurantId, addressId: address.addressId, sessionId: session.sessionId }),
      action_id: `select_restaurant_${r.restaurantId}`,
    }));

    await respond({
      blocks: [
        { type: "header", text: { type: "plain_text", text: "🍽️ Lunch Time! Vote for a restaurant:" } },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Session:* \`${session.sessionId}\`\n*Deadline:* ${session.deadline.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}\n\nAfter a restaurant is selected, use \`/lunch order <item>\` to add your item.`,
          },
        },
        { type: "actions", elements: restaurantButtons },
      ],
    });
  }

  // ── Restaurant selection button handler ─────────────────────
  // Registers a dynamic handler for any restaurant button
  app.action(/select_restaurant_.*/, async ({ body, ack, respond }) => {
    await ack();
    const action = body.actions[0];
    const { restaurantId, addressId, sessionId } = JSON.parse(action.value);

    aggregator.setRestaurant(sessionId, restaurantId, addressId);

    const { restaurant, menu } = await swiggy.getRestaurantMenu(restaurantId, addressId);

    // Show top 5 items from first category as a preview
    const topItems = menu.categories[0]?.items.slice(0, 5) || [];
    const itemList = topItems.map((i) => `• *${i.name}* — ₹${i.price} ${i.isVeg ? "🟢" : "🔴"}`).join("\n");

    await respond({
      replace_original: true,
      blocks: [
        { type: "header", text: { type: "plain_text", text: `✅ Selected: ${restaurant.name}` } },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Popular items:*\n${itemList}\n\nUse \`/lunch order <item name>\` to add your order.\nExample: \`/lunch order Chicken Dum Biryani\``,
          },
        },
        { type: "context", elements: [{ type: "mrkdwn", text: `⏰ Order deadline: ${aggregator.getSession(sessionId)?.deadline.toLocaleTimeString("en-IN")}` }] },
      ],
    });
  });

  // ── /lunch order <item> ─────────────────────────────────────
  async function handleOrder(command, respond, itemQuery) {
    if (!itemQuery) return respond({ text: "❌ Please specify an item. Example: `/lunch order Chicken Biryani`" });

    const session = aggregator.getActiveSessionForChannel(command.channel_id);
    if (!session) return respond({ text: "❌ No active lunch session. Start one with `/lunch start`" });
    if (!session.selectedRestaurantId) return respond({ text: "⚠️ Please wait for the restaurant to be selected first." });

    // Search the menu for the requested item
    const { results } = await swiggy.searchMenu(itemQuery, session.selectedAddressId || "addr_001");
    const match = results.find((r) => r.restaurantId === session.selectedRestaurantId) || results[0];

    if (!match) {
      return respond({ text: `❌ No item matching "*${itemQuery}*" found at the selected restaurant. Try a different name.` });
    }

    aggregator.addOrder(session.sessionId, {
      userId: command.user_id,
      userName: command.user_name,
      items: [{ itemId: match.itemId, name: match.name, price: match.price, quantity: 1 }],
    });

    const summary = aggregator.getSummary(session.sessionId);

    await respond({
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `✅ *@${command.user_name}* added: *${match.name}* — ₹${match.price}\n\n*Team orders so far:* ${summary.membersOrdered} member(s)\n${summary.memberList.map((m) => `• ${m.userName}: ${m.itemCount} item(s) — ₹${m.memberTotal}`).join("\n")}`,
          },
        },
        { type: "context", elements: [{ type: "mrkdwn", text: `⏰ ${summary.timeLeftMinutes} min left | Use \`/lunch done\` when everyone has ordered.` }] },
      ],
    });
  }

  // ── /lunch status ───────────────────────────────────────────
  async function handleStatus(command, respond) {
    const session = aggregator.getActiveSessionForChannel(command.channel_id);
    if (!session) return respond({ text: "No active lunch session. Start one with `/lunch start`" });

    const summary = aggregator.getSummary(session.sessionId);
    const lines = summary.memberList.map((m) => `• *${m.userName}* — ${m.itemCount} item(s), ₹${m.memberTotal}`).join("\n");

    await respond({
      blocks: [
        { type: "header", text: { type: "plain_text", text: "📋 Lunch Session Status" } },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Session:* \`${summary.sessionId}\`\n*Members ordered:* ${summary.membersOrdered}\n*Restaurant set:* ${summary.restaurantSelected ? "✅ Yes" : "❌ Not yet"}\n*Time left:* ${summary.timeLeftMinutes} min\n\n${lines || "_No orders yet_"}`,
          },
        },
      ],
    });
  }

  // ── /lunch done ─────────────────────────────────────────────
  async function handleDone(command, respond) {
    const session = aggregator.getActiveSessionForChannel(command.channel_id);
    if (!session) return respond({ text: "❌ No active session." });
    if (!session.selectedRestaurantId) return respond({ text: "❌ No restaurant selected yet." });
    if (session.orders.size === 0) return respond({ text: "❌ No orders collected yet." });

    await respond({ text: "⏳ Placing consolidated order with Swiggy..." });

    try {
      // Step 1: Flush any existing cart
      await swiggy.flushFoodCart();

      // Step 2: Build cart from all member orders
      const cartItems = aggregator.getCartItems(session.sessionId);
      await swiggy.updateFoodCart(session.selectedRestaurantId, cartItems, session.selectedAddressId);

      // Step 3: Optionally fetch and apply best coupon
      const { coupons } = await swiggy.fetchFoodCoupons();
      if (coupons?.length > 0) {
        await swiggy.applyFoodCoupon(coupons[0].code).catch(() => {});
      }

      // Step 4: Place the order
      const swiggyOrder = await swiggy.placeFoodOrder(session.selectedAddressId, "COD");

      // Step 5: Close session + build bill split
      aggregator.closeSession(session.sessionId, swiggyOrder.orderId);
      const billSplitResult = aggregator.buildBillSplit(session.sessionId, swiggyOrder.pricing);
      const slackMsg = formatSlackBillSplit(billSplitResult, swiggyOrder);

      await respond(slackMsg);
    } catch (err) {
      await respond({ text: `❌ Order failed: ${err.message}` });
    }
  }

  return app;
}

module.exports = { createSlackApp };
