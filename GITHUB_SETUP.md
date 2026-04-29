# 🐙 Hosting on GitHub — Step by Step

This guide walks you through pushing the Corporate Lunch Bot to GitHub and setting it up for the community.

---

## Step 1 — Create a GitHub Repository

1. Go to [github.com/new](https://github.com/new)
2. Fill in:
   - **Repository name:** `corporate-lunch-bot`
   - **Description:** `AI-powered corporate lunch coordinator for Slack & WhatsApp, built on Swiggy MCP`
   - **Visibility:** Public ✅ (so the community can see it)
   - ❌ Do NOT initialize with README (we already have one)
3. Click **Create repository**

---

## Step 2 — Initialize Git Locally

Open your terminal in the project folder:

```bash
cd corporate-lunch-bot

# Initialize git
git init

# Add all files
git add .

# First commit
git commit -m "feat: initial commit — Corporate Lunch Bot with Swiggy MCP"
```

---

## Step 3 — Connect to GitHub & Push

Copy the remote URL from GitHub (looks like `https://github.com/YOUR_USERNAME/corporate-lunch-bot.git`)

```bash
# Add the remote
git remote add origin https://github.com/YOUR_USERNAME/corporate-lunch-bot.git

# Set main branch
git branch -M main

# Push to GitHub
git push -u origin main
```

---

## Step 4 — Protect Your Secrets

Your `.env` file is already in `.gitignore` so it will never be pushed.

Verify this before pushing:
```bash
cat .gitignore
# Should show: .env
```

For GitHub Actions CI to run in mock mode, secrets are **not needed** — the CI workflow sets `USE_MOCK=true` automatically.

For production secrets (Slack tokens, Twilio, Swiggy), use **GitHub Secrets**:

1. Go to your repo → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret** and add:

| Secret Name | Value |
|-------------|-------|
| `SWIGGY_CLIENT_ID` | Your Swiggy client ID |
| `SWIGGY_ACCESS_TOKEN` | Your OAuth token |
| `SLACK_BOT_TOKEN` | xoxb-... |
| `SLACK_SIGNING_SECRET` | From Slack app settings |
| `SLACK_APP_TOKEN` | xapp-... |
| `TWILIO_ACCOUNT_SID` | From Twilio console |
| `TWILIO_AUTH_TOKEN` | From Twilio console |

---

## Step 5 — Verify CI Passes

After pushing:
1. Go to your repo → **Actions** tab
2. You should see the **Corporate Lunch Bot — CI** workflow running
3. It will install dependencies, start the server, and run all tests in mock mode
4. Green ✅ = all good!

---

## Step 6 — Add a Good README Badge

The CI badge is already in README.md. Update the URL:

```markdown
[![CI](https://github.com/YOUR_USERNAME/corporate-lunch-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/corporate-lunch-bot/actions)
```

Replace `YOUR_USERNAME` with your actual GitHub username.

---

## Step 7 — Tag a Release

```bash
git tag -a v1.0.0 -m "Phase 1: Mock Swiggy MCP + Slack + WhatsApp"
git push origin v1.0.0
```

On GitHub: **Releases** → **Create release from tag** → add release notes.

---

## Step 8 — Share with the Community

Once published, share in:
- **Swiggy Builders Club** — submit via [mcp.swiggy.com/builders/access](https://mcp.swiggy.com/builders/access/)
- **LinkedIn** — post with `#SwiggyMCP #BuildersClub #AIAgents`
- **Twitter/X** — tag `@Swiggy`
- **GitHub Topics** — add topics to your repo: `swiggy-mcp`, `slack-bot`, `whatsapp-bot`, `nodejs`, `mcp`

---

## Optional: Deploy to a Public URL

To make the WhatsApp webhook accessible, deploy to a free service:

### Render (recommended — free tier)
1. Go to [render.com](https://render.com) → New Web Service
2. Connect your GitHub repo
3. Set:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Add environment variables from `.env.example`
5. Your URL: `https://corporate-lunch-bot.onrender.com`
6. Set Twilio webhook to: `https://corporate-lunch-bot.onrender.com/whatsapp/webhook`

### Railway (alternative)
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

---

## Daily Git Workflow (for future changes)

```bash
# Create a feature branch
git checkout -b feature/redis-persistence

# Make changes, then:
git add .
git commit -m "feat: add Redis for session persistence"
git push origin feature/redis-persistence

# Open a Pull Request on GitHub
# Merge after CI passes
```

---

*That's it! Your Corporate Lunch Bot is now live on GitHub and ready to share with the Swiggy Builders community.* 🎉
