// ══════════════════════════════════════════════════════════════
// Swiggy MCP Food Client
// Wraps the 14 official Food MCP tools documented at:
// https://mcp.swiggy.com/builders/docs/reference/food/
//
// Tools implemented:
//   Discover: get_addresses, search_restaurants, search_menu, get_restaurant_menu
//   Cart:     get_food_cart, update_food_cart, flush_food_cart,
//             fetch_food_coupons, apply_food_coupon
//   Order:    place_food_order
//   Track:    get_food_orders, get_food_order_details, track_food_order
//   Support:  report_error
//
// MCP Protocol: streamable HTTP (JSON-RPC) over POST mcp.swiggy.com/food
// ══════════════════════════════════════════════════════════════

const axios = require("axios");
const { callWithReauth } = require("../auth/oauth-flow");
const mockClient = require("./mockSwiggyClient");
require("dotenv").config();

const FOOD_MCP_URL = process.env.SWIGGY_FOOD_MCP_URL || "https://mcp.swiggy.com/food";
const USE_MOCK = process.env.USE_MOCK !== "false";

// ── MCP JSON-RPC call wrapper ─────────────────────────────────
async function mcpCall(toolName, toolArgs = {}) {
  if (USE_MOCK) {
    console.log(`[MCP Mock] tool=${toolName}`, JSON.stringify(toolArgs));
    return mockClient.call(toolName, toolArgs);
  }

  return callWithReauth(async () => {
    const token = process.env.SWIGGY_ACCESS_TOKEN;
    if (!token) throw new Error("No SWIGGY_ACCESS_TOKEN. Run: npm run auth");

    // Swiggy MCP uses streamable HTTP — standard MCP protocol
    const payload = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name: toolName, arguments: toolArgs },
    };

    const response = await axios.post(FOOD_MCP_URL, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const result = response.data?.result;
    if (!result) throw new Error(`MCP call failed for tool: ${toolName}`);
    return result;
  });
}

// ══════════════════════════════════════════════════════════════
// DISCOVER TOOLS
// ══════════════════════════════════════════════════════════════

/**
 * get_addresses
 * Returns all saved delivery addresses for the authenticated user,
 * sorted by last order date.
 * Use addressId from response in search_restaurants.
 */
async function getAddresses() {
  return mcpCall("get_addresses", {});
}

/**
 * search_restaurants
 * Primary tool for restaurant discovery by location.
 * @param {string} addressId - from get_addresses response
 * @param {string} [query]   - optional cuisine/dish filter e.g. "biryani"
 */
async function searchRestaurants(addressId, query = "") {
  return mcpCall("search_restaurants", { addressId, ...(query && { query }) });
}

/**
 * get_restaurant_menu
 * Full paginated menu for a restaurant.
 * Browse categories and items before adding to cart.
 * @param {string} restaurantId
 * @param {string} addressId
 * @param {number} [page]
 */
async function getRestaurantMenu(restaurantId, addressId, page = 1) {
  return mcpCall("get_restaurant_menu", { restaurantId, addressId, page });
}

/**
 * search_menu
 * Search for specific dishes across restaurants.
 * Use when user wants a specific dish (e.g. "chicken biryani near me").
 * @param {string} query
 * @param {string} addressId
 */
async function searchMenu(query, addressId) {
  return mcpCall("search_menu", { query, addressId });
}

// ══════════════════════════════════════════════════════════════
// CART TOOLS
// ══════════════════════════════════════════════════════════════

/**
 * get_food_cart
 * Returns current cart contents with items, pricing, totals.
 */
async function getFoodCart() {
  return mcpCall("get_food_cart", {});
}

/**
 * update_food_cart
 * Add or update items in the cart.
 * @param {string} restaurantId
 * @param {Array}  items - [{ itemId, quantity, variantId? }]
 * @param {string} addressId
 */
async function updateFoodCart(restaurantId, items, addressId) {
  return mcpCall("update_food_cart", { restaurantId, items, addressId });
}

/**
 * flush_food_cart
 * Clears the entire cart. Call before building a new consolidated order.
 */
async function flushFoodCart() {
  return mcpCall("flush_food_cart", {});
}

/**
 * fetch_food_coupons
 * Returns available coupons/offers for the current cart.
 */
async function fetchFoodCoupons() {
  return mcpCall("fetch_food_coupons", {});
}

/**
 * apply_food_coupon
 * Applies a coupon code to the current cart.
 * @param {string} couponCode
 */
async function applyFoodCoupon(couponCode) {
  return mcpCall("apply_food_coupon", { couponCode });
}

// ══════════════════════════════════════════════════════════════
// ORDER TOOLS
// ══════════════════════════════════════════════════════════════

/**
 * place_food_order
 * Places the order from the current cart.
 * COD (Cash on Delivery) is supported per the Swiggy docs recipe.
 * @param {string} addressId
 * @param {string} [paymentMethod] - "COD" or token for online payment
 */
async function placeFoodOrder(addressId, paymentMethod = "COD") {
  return mcpCall("place_food_order", { addressId, paymentMethod });
}

// ══════════════════════════════════════════════════════════════
// TRACK TOOLS
// ══════════════════════════════════════════════════════════════

/**
 * get_food_orders
 * Active orders and recent order history.
 */
async function getFoodOrders() {
  return mcpCall("get_food_orders", {});
}

/**
 * get_food_order_details
 * Detailed info for a specific order (items, pricing, status).
 * @param {string} orderId
 */
async function getFoodOrderDetails(orderId) {
  return mcpCall("get_food_order_details", { orderId });
}

/**
 * track_food_order
 * Real-time delivery tracking for an active order.
 * @param {string} orderId
 */
async function trackFoodOrder(orderId) {
  return mcpCall("track_food_order", { orderId });
}

// ══════════════════════════════════════════════════════════════
// SUPPORT TOOLS
// ══════════════════════════════════════════════════════════════

/**
 * report_error
 * Generates an error report for the Swiggy MCP team.
 * Returns a pre-filled bug report the user can share.
 * @param {string} errorDescription
 * @param {string} [context]
 */
async function reportError(errorDescription, context = "") {
  return mcpCall("report_error", { errorDescription, context });
}

module.exports = {
  // Discover
  getAddresses,
  searchRestaurants,
  getRestaurantMenu,
  searchMenu,
  // Cart
  getFoodCart,
  updateFoodCart,
  flushFoodCart,
  fetchFoodCoupons,
  applyFoodCoupon,
  // Order
  placeFoodOrder,
  // Track
  getFoodOrders,
  getFoodOrderDetails,
  trackFoodOrder,
  // Support
  reportError,
};
