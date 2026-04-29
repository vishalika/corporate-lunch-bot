// ══════════════════════════════════════════════════════════════
// Swiggy MCP — OAuth 2.1 with PKCE Authentication
// Implements the exact flow documented at:
// https://mcp.swiggy.com/builders/docs/start/authenticate/
//
// Flow:
//  1. Generate PKCE verifier + challenge
//  2. Redirect user → /auth/authorize (phone + OTP in browser)
//  3. Receive ?code= at redirect_uri
//  4. POST /auth/token → access_token (valid 5 days)
//  5. Use Bearer token for all MCP calls
// ══════════════════════════════════════════════════════════════

const crypto = require("crypto");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const AUTH_BASE = process.env.SWIGGY_AUTH_BASE || "https://mcp.swiggy.com";
const CLIENT_ID = process.env.SWIGGY_CLIENT_ID;
const REDIRECT_URI = process.env.SWIGGY_REDIRECT_URI || "http://localhost:3000/auth/callback";

// ── Step 1: Generate PKCE verifier + challenge ────────────────
// Exactly as shown in Swiggy docs
function generatePKCE() {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}

// ── Step 2: Build the /auth/authorize URL ─────────────────────
function buildAuthUrl(codeChallenge, state) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    scope: "mcp:tools mcp:resources mcp:prompts",
  });
  return `${AUTH_BASE}/auth/authorize?${params.toString()}`;
}

// ── Step 3: Exchange auth code for access token ───────────────
// POST /auth/token as documented
async function exchangeCodeForToken(code, codeVerifier) {
  const response = await axios.post(`${AUTH_BASE}/auth/token`, {
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
  });

  // Response: { access_token, token_type, expires_in, scope }
  return response.data;
}

// ── Token storage (secure in production — use OS keychain/vault) ──
function saveToken(tokenData) {
  const envPath = path.join(__dirname, "../../.env");
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";

  const expiresAt = Date.now() + tokenData.expires_in * 1000;

  // Update or add SWIGGY_ACCESS_TOKEN
  if (envContent.includes("SWIGGY_ACCESS_TOKEN=")) {
    envContent = envContent.replace(
      /SWIGGY_ACCESS_TOKEN=.*/,
      `SWIGGY_ACCESS_TOKEN=${tokenData.access_token}`
    );
  } else {
    envContent += `\nSWIGGY_ACCESS_TOKEN=${tokenData.access_token}`;
  }

  if (envContent.includes("SWIGGY_TOKEN_EXPIRES_AT=")) {
    envContent = envContent.replace(
      /SWIGGY_TOKEN_EXPIRES_AT=.*/,
      `SWIGGY_TOKEN_EXPIRES_AT=${expiresAt}`
    );
  } else {
    envContent += `\nSWIGGY_TOKEN_EXPIRES_AT=${expiresAt}`;
  }

  fs.writeFileSync(envPath, envContent);
  console.log("✅ Token saved to .env");
  console.log(`   Expires: ${new Date(expiresAt).toLocaleString("en-IN")}`);
}

// ── Check if current token is valid ──────────────────────────
function isTokenValid() {
  const token = process.env.SWIGGY_ACCESS_TOKEN;
  const expiresAt = parseInt(process.env.SWIGGY_TOKEN_EXPIRES_AT || "0");
  const bufferMs = 60 * 1000; // 60 second buffer as recommended in docs

  return token && token.length > 10 && Date.now() < expiresAt - bufferMs;
}

// ── Re-auth wrapper (as documented for 401 handling) ─────────
async function callWithReauth(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e?.response?.status === 401) {
      console.warn("[Auth] Token expired or revoked — re-auth required");
      console.warn("       Run: npm run auth");
      throw new Error("SWIGGY_AUTH_REQUIRED: Please run npm run auth to re-authenticate");
    }
    throw e;
  }
}

// ── OAuth flow runner (CLI) ───────────────────────────────────
// Run: node src/auth/oauth-flow.js
if (require.main === module) {
  const express = require("express");
  const app = express();
  let server;

  const { codeVerifier, codeChallenge } = generatePKCE();
  const state = crypto.randomBytes(16).toString("hex");
  const authUrl = buildAuthUrl(codeChallenge, state);

  // Listen for the OAuth callback
  app.get("/auth/callback", async (req, res) => {
    const { code, state: returnedState, error } = req.query;

    if (error) {
      res.send(`<h2>❌ Auth failed: ${error}</h2>`);
      server.close();
      return;
    }

    if (returnedState !== state) {
      res.send("<h2>❌ Invalid state — possible CSRF</h2>");
      server.close();
      return;
    }

    try {
      const tokenData = await exchangeCodeForToken(code, codeVerifier);
      saveToken(tokenData);
      res.send(`
        <h2>✅ Swiggy MCP Authentication Successful!</h2>
        <p>Access token saved. Valid for 5 days.</p>
        <p>You can close this window and restart the bot server.</p>
        <pre>${JSON.stringify({ scope: tokenData.scope, expires_in: tokenData.expires_in }, null, 2)}</pre>
      `);
    } catch (err) {
      res.send(`<h2>❌ Token exchange failed: ${err.message}</h2>`);
    } finally {
      setTimeout(() => server.close(), 2000);
    }
  });

  server = app.listen(3000, async () => {
    console.log("\n🔐 Swiggy MCP OAuth 2.1 Flow\n");
    console.log("Opening browser for authentication...");
    console.log(`Auth URL: ${authUrl}\n`);

    // Try to open browser automatically
    try {
      const { default: open } = await import("open");
      await open(authUrl);
    } catch {
      console.log("Could not open browser automatically.");
      console.log("Please open this URL manually:\n");
      console.log(authUrl);
    }
  });
}

module.exports = { generatePKCE, buildAuthUrl, exchangeCodeForToken, isTokenValid, callWithReauth };
