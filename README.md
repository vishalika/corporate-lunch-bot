# 🍽️ Corporate Lunch Bot

> AI-powered corporate lunch coordinator for Slack & WhatsApp, built on the **Swiggy MCP Food API**.

[![CI](https://github.com/YOUR_USERNAME/corporate-lunch-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/corporate-lunch-bot/actions)

---

## What It Does

1. **Start a lunch session** on Slack (`/lunch start`) or WhatsApp (`lunch start`)
2. **Poll the team** — bot fetches nearby restaurants via Swiggy MCP and shows options
3. **Each person adds their order** — bot searches the menu, adds to session
4. **Bot consolidates all orders** into one Swiggy cart, applies best coupon, places order via COD
5. **Bill split sent** — every member sees exactly what they owe

---

## Architecture

```
Slack (/lunch commands)         WhatsApp (Twilio webhook)
        │                               │
        └──────────┬────────────────────┘
                   ▼
         Express Server (Node.js)
                   │
         ┌─────────┴──────────┐
         │  Order Aggregator  │   ← collects team orders
         │  (in-memory store) │
         └─────────┬──────────┘
                   │
         ┌─────────▼──────────┐
         │  Swiggy MCP Client │   ← 14 Food API tools
         │  mcp.swiggy.com    │
         │  /food             │
         └────────────────────┘
```

### Swiggy MCP Tools Used

| Stage | Tool | Purpose |
|-------|------|---------|
| Discover | `get_addresses` | Fetch saved office delivery address |
| Discover | `search_restaurants` | List restaurants near office |
| Discover | `get_restaurant_menu` | Full paginated menu for selected restaurant |
| Discover | `search_menu` | Find a dish when member types a name |
| Cart | `flush_food_cart` | Clear before building consolidated cart |
| Cart | `update_food_cart` | Add all member items to one cart |
| Cart | `fetch_food_coupons` | Get available discounts |
| Cart | `apply_food_coupon` | Apply best coupon automatically |
| Order | `place_food_order` | Place the consolidated order (COD) |
| Track | `track_food_order` | Real-time delivery tracking |

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm
- (Phase 2+) Slack app credentials
- (Phase 3+) Twilio account
- (Production) Swiggy MCP access — apply at [mcp.swiggy.com/builders/access](https://mcp.swiggy.com/builders/access/)

### 1. Clone & install

```bash
git clone https://github.com/YOUR_USERNAME/corporate-lunch-bot.git
cd corporate-lunch-bot
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — for mock mode, no changes needed
```

### 3. Run in mock mode

```bash
npm start
# Server starts at http://localhost:3000
```

### 4. Test the full flow

```bash
# In a new terminal:
npm test
```

---

## Swiggy MCP OAuth Setup (for production)

> Skip this section while `USE_MOCK=true`. Do this once you receive your `client_id` from Swiggy.

### Step 1 — Apply for access

Go to [mcp.swiggy.com/builders/access](https://mcp.swiggy.com/builders/access/) and submit:
- Integration name: `Corporate Lunch Bot`
- Redirect URI: `http://localhost:3000/auth/callback`
- Servers needed: `food`
- Use case: Consolidate team lunch orders into one Swiggy order

### Step 2 — Add credentials to .env

```env
SWIGGY_CLIENT_ID=your_client_id_from_swiggy
SWIGGY_REDIRECT_URI=http://localhost:3000/auth/callback
USE_MOCK=false
```

### Step 3 — Run OAuth flow

```bash
npm run auth
# Opens browser → Swiggy login (phone + OTP)
# Token saved to .env automatically (valid 5 days)
```

### Step 4 — Restart server

```bash
npm start
# Now using live Swiggy MCP API
```

> **Token lifecycle:** Access tokens are valid for 5 days. Re-run `npm run auth` when expired.

---

## Slack Setup

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → Create New App → From Scratch
2. Enable **Socket Mode** under Settings
3. Under **OAuth & Permissions**, add Bot Token Scopes: `commands`, `chat:write`
4. Create slash command `/lunch` pointing to your server
5. Install app to workspace
6. Copy tokens to `.env`:
   ```env
   SLACK_BOT_TOKEN=xoxb-...
   SLACK_SIGNING_SECRET=...
   SLACK_APP_TOKEN=xapp-...
   ```

### Slack Commands

| Command | Action |
|---------|--------|
| `/lunch start` | Start a session, show restaurant poll |
| `/lunch order <item>` | Add your item (e.g. `/lunch order Chicken Biryani`) |
| `/lunch status` | See who has ordered |
| `/lunch done` | Place the consolidated Swiggy order |

---

## WhatsApp Setup (Twilio)

1. Create account at [console.twilio.com](https://console.twilio.com)
2. Enable WhatsApp Sandbox under Messaging
3. Set Webhook URL: `https://your-domain.com/whatsapp/webhook`
4. Copy credentials to `.env`:
   ```env
   TWILIO_ACCOUNT_SID=...
   TWILIO_AUTH_TOKEN=...
   TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
   ```

### WhatsApp Commands

| Message | Action |
|---------|--------|
| `lunch start` | Start session, show restaurant list |
| `pick 1` | Select restaurant by number |
| `order Chicken Biryani` | Add your order |
| `lunch status` | See current orders |
| `lunch done` | Place the order |

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Server health + auth status |
| GET | `/api/addresses` | Saved delivery addresses |
| GET | `/api/restaurants` | Nearby restaurants |
| GET | `/api/restaurants/:id/menu` | Full menu |
| GET | `/api/menu/search?q=...` | Search menu items |
| POST | `/api/sessions` | Create a lunch session |
| GET | `/api/sessions/:id` | Session summary |
| PATCH | `/api/sessions/:id/restaurant` | Set restaurant |
| POST | `/api/sessions/:id/orders` | Add a member's order |
| POST | `/api/sessions/:id/place-order` | Consolidate + place order |
| POST | `/whatsapp/webhook` | Twilio webhook receiver |

---


## Roadmap

- [x] Phase 1 — Mock Swiggy API + Order Aggregator
- [x] Phase 2 — Slack Bot (slash commands + interactive polls)
- [x] Phase 3 — WhatsApp Bot (Twilio)
- [ ] Phase 4 — Redis persistence (replace in-memory store)
- [ ] Phase 5 — Real Swiggy MCP (swap `USE_MOCK=false`)
- [ ] Phase 6 — UPI payment integration for bill split

---

## License

MIT — built for the Swiggy Builders Club community.

*Built by Vishalika | Powered by [Swiggy MCP](https://mcp.swiggy.com/builders/)*
