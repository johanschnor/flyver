// === Gmail OAuth + Multi-account background.js ===
//
// Login uses chrome.identity.launchWebAuthFlow with the OAuth 2.0 implicit flow
// (response_type=token). No client secret is needed or stored. Access tokens
// last about 1 hour and are renewed silently (prompt=none + login_hint) without
// showing a window, as long as the user is still signed in to Google in the
// auth flow's session. If silent renewal fails, the user is asked to sign in again.
//
// The client ID is public by design (it identifies the app, it is not a secret).
const CLIENT_ID = "775986012534-eaev1eh0iq1rrj999o1ulai7eukdpabt.apps.googleusercontent.com";
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email"
].join(" ");
const REDIRECT_URI = chrome.identity.getRedirectURL();

// Don't hammer Google with silent renewals for an account that keeps failing.
const RENEW_RETRY_MS = 5 * 60 * 1000;
const renewInFlight = new Map();   // email -> Promise<string|null>
const lastRenewFailure = new Map(); // email -> timestamp

function buildAuthUrl({ interactive, loginHint }) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "token",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    include_granted_scopes: "true",
    prompt: interactive ? "select_account" : "none"
  });
  if (loginHint) params.set("login_hint", loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// Runs the auth flow and returns { accessToken, expiresAt } or null.
async function runAuthFlow({ interactive, loginHint }) {
  let redirectedTo;
  try {
    redirectedTo = await chrome.identity.launchWebAuthFlow({
      url: buildAuthUrl({ interactive, loginHint }),
      interactive,
      ...(interactive ? {} : { abortOnLoadForNonInteractive: false, timeoutMsForNonInteractive: 10000 })
    });
  } catch (err) {
    if (interactive) console.error("OAuth fejl:", err?.message || err);
    return null;
  }
  if (!redirectedTo) return null;

  const fragment = new URLSearchParams(new URL(redirectedTo).hash.slice(1));
  if (fragment.get("error")) {
    if (interactive) console.error("OAuth fejl:", fragment.get("error"));
    return null;
  }
  const accessToken = fragment.get("access_token");
  if (!accessToken) return null;
  const expiresIn = parseInt(fragment.get("expires_in") || "3600", 10);
  return { accessToken, expiresAt: Date.now() + expiresIn * 1000 };
}

async function saveAccount(email, accessToken, expiresAt) {
  const { accounts = [] } = await chrome.storage.local.get("accounts");
  const updated = accounts.filter(acc => acc.email !== email);
  updated.push({ email, accessToken, expiresAt });
  await chrome.storage.local.set({ accounts: updated });
}

async function updateStoredToken(email, accessToken, expiresAt) {
  const { accounts = [] } = await chrome.storage.local.get("accounts");
  const acc = accounts.find(a => a.email === email);
  if (!acc) return;
  acc.accessToken = accessToken;
  acc.expiresAt = expiresAt;
  delete acc.refreshToken; // left over from versions <= 1.0.5
  await chrome.storage.local.set({ accounts });
}

// === Start OAuth flow (called on install and from the popup) ===
async function startOAuthFlow() {
  const result = await runAuthFlow({ interactive: true });
  if (!result) return;

  try {
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${result.accessToken}` }
    });
    const profile = await profileRes.json();
    const email = profile?.email;
    if (!email) throw new Error("Manglende email i brugerprofil");

    await saveAccount(email, result.accessToken, result.expiresAt);
    lastRenewFailure.delete(email);
    console.log("✅ Konto tilføjet:", email);
    chrome.runtime.sendMessage({ type: "account-added" }).catch(() => {});
    updateUnreadCount();
  } catch (err) {
    console.error("Fejl ved hentning af profil:", err);
  }
}

// === Renew an access token for one account without user interaction ===
// Returns the new token, or null if the user has to sign in again.
async function renewAccessToken(email, { force = false } = {}) {
  if (renewInFlight.has(email)) return renewInFlight.get(email);
  const lastFail = lastRenewFailure.get(email);
  if (!force && lastFail && Date.now() - lastFail < RENEW_RETRY_MS) return null;

  const p = (async () => {
    const result = await runAuthFlow({ interactive: false, loginHint: email });
    if (!result) {
      lastRenewFailure.set(email, Date.now());
      console.warn("Kunne ikke forny token stille for:", email);
      return null;
    }
    lastRenewFailure.delete(email);
    await updateStoredToken(email, result.accessToken, result.expiresAt);
    console.log("🔁 Fornyet accessToken for:", email);
    return result.accessToken;
  })();

  renewInFlight.set(email, p);
  try {
    return await p;
  } finally {
    renewInFlight.delete(email);
  }
}

// Returns a valid token for the account, renewing it first if it is about to expire.
async function getValidToken(acc) {
  if (acc.accessToken && acc.expiresAt && acc.expiresAt - Date.now() > 60 * 1000) {
    return acc.accessToken;
  }
  return (await renewAccessToken(acc.email)) || acc.accessToken || null;
}

// === Badge update (shows total unread count) ===
async function fetchUnread(token) {
  return fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX", {
    headers: { Authorization: `Bearer ${token}` }
  });
}

async function updateUnreadCount() {
  const { accounts = [] } = await chrome.storage.local.get("accounts");
  let totalUnread = 0;

  for (const acc of accounts) {
    try {
      let token = await getValidToken(acc);
      if (!token) continue;
      let res = await fetchUnread(token);

      if (res.status === 401) {
        token = await renewAccessToken(acc.email);
        if (!token) continue;
        res = await fetchUnread(token);
      }

      if (res.ok) {
        const label = await res.json();
        totalUnread += label.messagesUnread || 0;
      }
    } catch (err) {
      console.warn("Fejl ved ulæst hentning for:", acc.email, err);
    }
  }

  chrome.action.setBadgeText({ text: totalUnread > 0 ? totalUnread.toString() : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#d93025" });
}

// === Update badge on startup and periodically ===
chrome.runtime.onStartup.addListener(updateUnreadCount);
setInterval(updateUnreadCount, 3 * 1000); // every 3 seconds

// === Messages from popup.js ===
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "start-oauth") {
    console.log("⏳ Starter OAuth-flow via popup");
    startOAuthFlow();
  }

  if (message.type === "renew-token" && message.email) {
    renewAccessToken(message.email, { force: true }).then(token => sendResponse({ token }));
    return true; // async response
  }

  if (message.type === "update-badge") {
    updateUnreadCount();
  }

  if (message.type === "open-tab" && message.url) {
    chrome.tabs.create({ url: message.url, active: true });
  }
});

// === On install: start login if there is no account. On update: drop old refresh tokens ===
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const { accounts = [] } = await chrome.storage.local.get("accounts");

  if (reason === "update" && accounts.some(acc => "refreshToken" in acc)) {
    accounts.forEach(acc => { delete acc.refreshToken; acc.expiresAt = 0; });
    await chrome.storage.local.set({ accounts });
    console.log("Fjernede gamle refresh tokens fra lagret data.");
  }

  if (accounts.length === 0) {
    console.log("Ingen konti fundet. Starter login-flow...");
    startOAuthFlow();
  }
});
