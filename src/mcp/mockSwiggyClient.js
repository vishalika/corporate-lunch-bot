// ══════════════════════════════════════════════════════════════
// Mock Swiggy MCP Client
// Returns data in the exact same shape as real Swiggy MCP tools
// so switching USE_MOCK=false requires zero code changes elsewhere
// ══════════════════════════════════════════════════════════════

const { v4: uuidv4 } = require("uuid");

// ── Mock data mirrors real Swiggy API response shapes ─────────

const MOCK_ADDRESSES = [
  { addressId: "addr_001", label: "Office", address: "Criteo India, DLF Cyber City Phase 2, Gurugram, 122002", lat: 28.4595, lng: 77.0266 },
];

const MOCK_RESTAURANTS = [
  { restaurantId: "rest_001", name: "Biryani Blues", cuisine: ["Biryani", "Mughlai"], rating: 4.3, deliveryTime: 35, costForTwo: 400, isOpen: true, addressId: "addr_001" },
  { restaurantId: "rest_002", name: "South Tiffin House", cuisine: ["South Indian", "Kerala"], rating: 4.5, deliveryTime: 25, costForTwo: 250, isOpen: true, addressId: "addr_001" },
  { restaurantId: "rest_003", name: "Punjabi Dhaba Express", cuisine: ["North Indian", "Dal Makhani"], rating: 4.1, deliveryTime: 40, costForTwo: 350, isOpen: true, addressId: "addr_001" },
  { restaurantId: "rest_004", name: "Wrap & Roll", cuisine: ["Wraps", "Fast Food"], rating: 4.2, deliveryTime: 20, costForTwo: 200, isOpen: true, addressId: "addr_001" },
  { restaurantId: "rest_005", name: "Green Bowl", cuisine: ["Salads", "Healthy", "Vegan"], rating: 4.4, deliveryTime: 30, costForTwo: 500, isOpen: true, addressId: "addr_001" },
];

const MOCK_MENUS = {
  rest_001: {
    restaurantId: "rest_001",
    categories: [
      {
        categoryId: "cat_001", name: "Biryani",
        items: [
          { itemId: "item_001", name: "Chicken Dum Biryani", price: 279, isVeg: false, description: "Slow-cooked aromatic rice with tender chicken", calories: 650 },
          { itemId: "item_002", name: "Veg Dum Biryani", price: 229, isVeg: true, description: "Fragrant basmati with seasonal vegetables", calories: 520 },
          { itemId: "item_003", name: "Mutton Biryani", price: 349, isVeg: false, description: "Rich slow-cooked mutton in spiced rice", calories: 720 },
        ],
      },
      {
        categoryId: "cat_002", name: "Sides",
        items: [
          { itemId: "item_004", name: "Raita", price: 49, isVeg: true, description: "Fresh yogurt with cucumber and mint", calories: 80 },
          { itemId: "item_005", name: "Salan", price: 59, isVeg: true, description: "Spiced gravy accompaniment", calories: 120 },
        ],
      },
    ],
  },
  rest_002: {
    restaurantId: "rest_002",
    categories: [
      {
        categoryId: "cat_101", name: "Tiffin Combos",
        items: [
          { itemId: "item_101", name: "Idli Sambhar (4 pcs)", price: 99, isVeg: true, description: "Steamed rice cakes with lentil soup", calories: 320 },
          { itemId: "item_102", name: "Masala Dosa", price: 129, isVeg: true, description: "Crispy crepe with spiced potato filling", calories: 410 },
          { itemId: "item_103", name: "Uttapam + Chutney", price: 119, isVeg: true, description: "Thick pancake with tomato and onion", calories: 380 },
        ],
      },
      {
        categoryId: "cat_102", name: "Rice Meals",
        items: [
          { itemId: "item_104", name: "Kerala Meals (Full)", price: 199, isVeg: true, description: "Complete thali with rice, curry, payasam", calories: 750 },
        ],
      },
    ],
  },
  rest_003: {
    restaurantId: "rest_003",
    categories: [
      {
        categoryId: "cat_201", name: "Dal & Curries",
        items: [
          { itemId: "item_201", name: "Dal Makhani + 4 Rotis", price: 189, isVeg: true, description: "Slow-cooked black lentils in cream", calories: 580 },
          { itemId: "item_202", name: "Butter Chicken + Naan", price: 259, isVeg: false, description: "Creamy tomato-based chicken curry", calories: 640 },
          { itemId: "item_203", name: "Paneer Butter Masala + Naan", price: 229, isVeg: true, description: "Cottage cheese in rich tomato gravy", calories: 590 },
        ],
      },
    ],
  },
  rest_004: {
    restaurantId: "rest_004",
    categories: [
      {
        categoryId: "cat_301", name: "Wraps",
        items: [
          { itemId: "item_301", name: "Chicken Tikka Wrap", price: 149, isVeg: false, description: "Grilled chicken with mint chutney", calories: 420 },
          { itemId: "item_302", name: "Paneer Tikka Wrap", price: 129, isVeg: true, description: "Smoky paneer with pickled onions", calories: 380 },
        ],
      },
    ],
  },
  rest_005: {
    restaurantId: "rest_005",
    categories: [
      {
        categoryId: "cat_401", name: "Salad Bowls",
        items: [
          { itemId: "item_401", name: "Quinoa Veggie Bowl", price: 249, isVeg: true, description: "Quinoa, roasted veggies, tahini dressing", calories: 420 },
          { itemId: "item_402", name: "Grilled Chicken Salad", price: 279, isVeg: false, description: "Lettuce, grilled chicken, avocado", calories: 380 },
        ],
      },
    ],
  },
};

// In-memory cart for mock
let mockCart = { restaurantId: null, items: [], addressId: null };

// ── Tool dispatcher ───────────────────────────────────────────
function call(toolName, args) {
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  const handlers = {
    get_addresses: async () => {
      await delay(200);
      return { addresses: MOCK_ADDRESSES };
    },

    search_restaurants: async () => {
      await delay(300);
      const { query } = args;
      let results = [...MOCK_RESTAURANTS];
      if (query) {
        results = results.filter(
          (r) =>
            r.name.toLowerCase().includes(query.toLowerCase()) ||
            r.cuisine.some((c) => c.toLowerCase().includes(query.toLowerCase()))
        );
      }
      return { restaurants: results, total: results.length };
    },

    get_restaurant_menu: async () => {
      await delay(300);
      const menu = MOCK_MENUS[args.restaurantId];
      if (!menu) throw new Error(`Restaurant ${args.restaurantId} not found`);
      const restaurant = MOCK_RESTAURANTS.find((r) => r.restaurantId === args.restaurantId);
      return { restaurant, menu, page: args.page || 1 };
    },

    search_menu: async () => {
      await delay(300);
      const results = [];
      for (const [restId, menu] of Object.entries(MOCK_MENUS)) {
        const restaurant = MOCK_RESTAURANTS.find((r) => r.restaurantId === restId);
        for (const cat of menu.categories) {
          for (const item of cat.items) {
            if (
              item.name.toLowerCase().includes(args.query.toLowerCase()) ||
              item.description.toLowerCase().includes(args.query.toLowerCase())
            ) {
              results.push({ ...item, restaurantId: restId, restaurantName: restaurant.name });
            }
          }
        }
      }
      return { query: args.query, results, total: results.length };
    },

    get_food_cart: async () => {
      await delay(200);
      const total = mockCart.items.reduce((s, i) => s + i.price * i.quantity, 0);
      return { cart: mockCart, subtotal: total, deliveryFee: total >= 399 ? 0 : 49 };
    },

    update_food_cart: async () => {
      await delay(300);
      mockCart.restaurantId = args.restaurantId;
      mockCart.addressId = args.addressId;
      for (const newItem of args.items) {
        const existing = mockCart.items.find((i) => i.itemId === newItem.itemId);
        if (existing) {
          existing.quantity += newItem.quantity || 1;
        } else {
          const menu = MOCK_MENUS[args.restaurantId];
          const allItems = menu?.categories.flatMap((c) => c.items) || [];
          const menuItem = allItems.find((i) => i.itemId === newItem.itemId);
          if (menuItem) {
            mockCart.items.push({ ...menuItem, quantity: newItem.quantity || 1, orderedBy: newItem.orderedBy });
          }
        }
      }
      const total = mockCart.items.reduce((s, i) => s + i.price * i.quantity, 0);
      return { cart: mockCart, subtotal: total };
    },

    flush_food_cart: async () => {
      await delay(200);
      mockCart = { restaurantId: null, items: [], addressId: null };
      return { success: true, message: "Cart cleared" };
    },

    fetch_food_coupons: async () => {
      await delay(300);
      return {
        coupons: [
          { code: "OFFICE50", discount: "50% off up to ₹100", minOrder: 299 },
          { code: "NEWUSER", discount: "Flat ₹150 off", minOrder: 499 },
        ],
      };
    },

    apply_food_coupon: async () => {
      await delay(300);
      return { success: true, couponCode: args.couponCode, discountApplied: 100, message: `Coupon ${args.couponCode} applied!` };
    },

    place_food_order: async () => {
      await delay(800);
      const orderId = `ORD-${uuidv4().slice(0, 8).toUpperCase()}`;
      const restaurant = MOCK_RESTAURANTS.find((r) => r.restaurantId === mockCart.restaurantId);
      const subtotal = mockCart.items.reduce((s, i) => s + i.price * i.quantity, 0);
      const deliveryFee = subtotal >= 399 ? 0 : 49;
      const taxes = Math.round(subtotal * 0.05);
      const grandTotal = subtotal + deliveryFee + taxes;
      const eta = new Date(Date.now() + (restaurant?.deliveryTime || 35) * 60000)
        .toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

      // Clear cart after order
      mockCart = { restaurantId: null, items: [], addressId: null };

      return {
        orderId,
        status: "confirmed",
        restaurant: restaurant?.name || "Restaurant",
        estimatedDelivery: `${restaurant?.deliveryTime || 35} mins (~${eta})`,
        pricing: { subtotal, deliveryFee, taxes, grandTotal, currency: "INR" },
        trackingUrl: `https://swiggy.com/track/${orderId}`,
      };
    },

    get_food_orders: async () => {
      await delay(300);
      return { orders: [], message: "No active orders in mock mode" };
    },

    get_food_order_details: async () => {
      await delay(300);
      return { orderId: args.orderId, status: "delivered", items: [], pricing: {} };
    },

    track_food_order: async () => {
      await delay(300);
      const statuses = ["confirmed", "preparing", "out_for_delivery"];
      return {
        orderId: args.orderId,
        status: statuses[Math.floor(Math.random() * statuses.length)],
        updatedAt: new Date().toISOString(),
      };
    },

    report_error: async () => {
      await delay(200);
      return { reportId: `ERR-${Date.now()}`, message: "Error report generated (mock)" };
    },
  };

  const handler = handlers[toolName];
  if (!handler) throw new Error(`Unknown tool: ${toolName}`);
  return handler();
}

module.exports = { call };
