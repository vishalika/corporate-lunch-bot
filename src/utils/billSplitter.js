// ══════════════════════════════════════════════════════════════
// Bill Splitter — formats split output for each channel
// ══════════════════════════════════════════════════════════════

const formatINR = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0 }).format(n);

// ── Slack Block Kit message ───────────────────────────────────
function formatSlackBillSplit(billSplitResult, swiggyOrder) {
  const { billSplit, pricing } = billSplitResult;
  const { orderId, estimatedDelivery } = swiggyOrder || {};

  const memberBlocks = billSplit.map((m) => ({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*${m.userName}*\n${m.items.map((i) => `• ${i.name || i.itemName} x${i.quantity || 1} — ${formatINR(i.price * (i.quantity || 1))}`).join("\n")}\n_You owe: *${formatINR(m.totalOwed)}*_`,
    },
  }));

  return {
    blocks: [
      { type: "header", text: { type: "plain_text", text: "🍽️ Lunch Order Confirmed!" } },
      orderId && {
        type: "section",
        text: { type: "mrkdwn", text: `*Order ID:* \`${orderId}\`\n*ETA:* ${estimatedDelivery}` },
      },
      { type: "divider" },
      { type: "section", text: { type: "mrkdwn", text: "*Individual Orders & Bill Split*" } },
      ...memberBlocks,
      { type: "divider" },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Subtotal:*\n${formatINR(pricing.subtotal)}` },
          { type: "mrkdwn", text: `*Delivery:*\n${pricing.deliveryFee === 0 ? "FREE 🎉" : formatINR(pricing.deliveryFee)}` },
          { type: "mrkdwn", text: `*Taxes:*\n${formatINR(pricing.taxes)}` },
          { type: "mrkdwn", text: `*Grand Total:*\n${formatINR(pricing.grandTotal)}` },
        ],
      },
      { type: "context", elements: [{ type: "mrkdwn", text: "💡 Pay your share via GPay/UPI to the team coordinator." }] },
    ].filter(Boolean),
  };
}

// ── WhatsApp plain text message ───────────────────────────────
function formatWhatsAppBillSplit(billSplitResult, swiggyOrder) {
  const { billSplit, pricing } = billSplitResult;
  const { orderId, estimatedDelivery } = swiggyOrder || {};

  let msg = `🍽️ *Lunch Order Confirmed!*\n`;
  if (orderId) msg += `📦 Order ID: ${orderId}\n🕐 ETA: ${estimatedDelivery}\n`;
  msg += `\n*Bill Split:*\n─────────────────\n`;

  billSplit.forEach((m) => {
    msg += `\n👤 *${m.userName}*\n`;
    m.items.forEach((i) => {
      msg += `  • ${i.name || i.itemName} x${i.quantity || 1} — ${formatINR(i.price * (i.quantity || 1))}\n`;
    });
    msg += `  💰 *You owe: ${formatINR(m.totalOwed)}*\n`;
  });

  msg += `\n─────────────────\n`;
  msg += `Subtotal: ${formatINR(pricing.subtotal)}\n`;
  msg += `Delivery: ${pricing.deliveryFee === 0 ? "FREE 🎉" : formatINR(pricing.deliveryFee)}\n`;
  msg += `Taxes: ${formatINR(pricing.taxes)}\n`;
  msg += `*Grand Total: ${formatINR(pricing.grandTotal)}*\n\n`;
  msg += `💡 Pay via GPay/UPI to the team coordinator.`;

  return msg;
}

// ── Plain text (for API responses & tests) ────────────────────
function formatPlainText(billSplitResult, swiggyOrder) {
  const { billSplit, pricing } = billSplitResult;
  const { orderId, estimatedDelivery } = swiggyOrder || {};

  let out = `\n===== Lunch Order Summary =====\n`;
  if (orderId) out += `Order ID: ${orderId} | ETA: ${estimatedDelivery}\n`;
  out += `\n`;

  billSplit.forEach((m, i) => {
    out += `${i + 1}. ${m.userName}\n`;
    m.items.forEach((item) => {
      out += `   - ${item.name || item.itemName} x${item.quantity || 1} @ ₹${item.price} = ₹${item.price * (item.quantity || 1)}\n`;
    });
    out += `   OWES: ₹${m.totalOwed}\n\n`;
  });

  out += `Subtotal: ₹${pricing.subtotal} | Delivery: ₹${pricing.deliveryFee} | Taxes: ₹${pricing.taxes}\n`;
  out += `GRAND TOTAL: ₹${pricing.grandTotal}\n`;
  out += `================================\n`;

  return out;
}

module.exports = { formatINR, formatSlackBillSplit, formatWhatsAppBillSplit, formatPlainText };
