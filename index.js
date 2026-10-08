// index.js

const crypto = require("crypto");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { Telegraf } = require("telegraf");

const config = require("./config");

const {
  telegram,
  server,
  links: linkConfig,
  reports: reportConfig,
  security
} = config;

if (
  !telegram.botToken ||
  telegram.botToken === "PUT_YOUR_BOT_TOKEN_HERE"
) {
  throw new Error("Set telegram.botToken in config.js");
}

if (
  !telegram.ownerId ||
  telegram.ownerId === "PUT_OWNER_TELEGRAM_ID_HERE"
) {
  throw new Error("Set telegram.ownerId in config.js");
}

if (!server.publicUrl) {
  throw new Error("Set server.publicUrl in config.js");
}

const bot = new Telegraf(telegram.botToken);
const app = express();

app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

app.use(
  express.json({
    limit: server.jsonLimit
  })
);

const reportLimiter = rateLimit({
  windowMs: security.rateLimitWindowMs,
  max: security.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false
});

/*
 * In-memory storage.
 *
 * For production with many users, replace these Maps
 * with PostgreSQL, SQLite, Redis, etc.
 */
const links = new Map();
const reports = new Map();

/*
 * Helpers
 */

function makeToken() {
  return crypto
    .randomBytes(linkConfig.tokenBytes)
    .toString("hex");
}

function makeId() {
  return crypto.randomUUID();
}

function isOwner(ctx) {
  return String(ctx.from?.id) === String(telegram.ownerId);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function linkExpired(link) {
  if (!linkConfig.expiryMs) {
    return false;
  }

  return Date.now() - link.createdAt >= linkConfig.expiryMs;
}

function deleteExpiredLinks() {
  for (const [token, link] of links) {
    if (linkExpired(link)) {
      links.delete(token);
    }
  }
}

/*
 * Telegram commands
 */

bot.start(async (ctx) => {
  await ctx.reply(
    [
      "📡 Consent Tracker",
      "",
      "/link — create a sharing link",
      "/listusers — view reports",
      "/help — show commands"
    ].join("\n")
  );
});

bot.command("help", async (ctx) => {
  await ctx.reply(
    [
      "Available commands:",
      "",
      "/link",
      "Generate a unique consent-based sharing link.",
      "",
      "/listusers",
      "View collected consented reports."
    ].join("\n")
  );
});

/*
 * Generate a unique link.
 */
bot.command("link", async (ctx) => {
  if (!isOwner(ctx)) {
    return ctx.reply("Not authorized.");
  }

  deleteExpiredLinks();

  const token = makeToken();

  links.set(token, {
    token,
    ownerTelegramId: String(ctx.from.id),
    createdAt: Date.now(),
    used: false
  });

  const url =
    `${server.publicUrl.replace(/\/$/, "")}/share/${token}`;

  await ctx.reply(
    [
      "🔗 Sharing link created",
      "",
      url,
      "",
      "The recipient must explicitly approve sharing.",
      linkConfig.expiryMs
        ? `Expires in ${Math.round(
            linkConfig.expiryMs / 60000
          )} minutes.`
        : "No expiration configured."
    ].join("\n")
  );
});

/*
 * List reports.
 */
bot.command("listusers", async (ctx) => {
  if (!isOwner(ctx)) {
    return ctx.reply("Not authorized.");
  }

  if (!reportConfig.enabled || reports.size === 0) {
    return ctx.reply("No consented reports available.");
  }

  const entries = [...reports.values()];

  let output = "📋 Consent Reports\n\n";

  for (const report of entries) {
    const location = report.location
      ? `${report.location.latitude}, ${report.location.longitude}`
      : "Not shared";

    const entry = [
      `ID: ${report.id}`,
      `Time: ${new Date(report.createdAt).toISOString()}`,
      `Platform: ${report.device?.platform || "Unknown"}`,
      `Timezone: ${report.device?.timezone || "Unknown"}`,
      `Location: ${location}`,
      `User-Agent: ${report.device?.userAgent || "Unknown"}`
    ].join("\n");

    if ((output + entry).length > 3500) {
      await ctx.reply(output);
      output = "";
    }

    output += entry + "\n\n";
  }

  if (output.trim()) {
    await ctx.reply(output);
  }
});

/*
 * Consent page.
 */
app.get("/share/:token", (req, res) => {
  deleteExpiredLinks();

  const token = req.params.token;
  const link = links.get(token);

  if (!link) {
    return res.status(404).send(
      "<h1>Invalid or expired sharing link.</h1>"
    );
  }

  if (linkConfig.singleUse && link.used) {
    return res.status(410).send(
      "<h1>This sharing link has already been used.</h1>"
    );
  }

  const safeToken = escapeHtml(token);

  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<title>Information Sharing</title>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 20px;
  background: #101010;
  color: #f5f5f5;
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

.card {
  width: min(100%, 520px);
  padding: 28px;
  border-radius: 18px;
  background: #1c1c1c;
  box-shadow: 0 25px 80px rgba(0,0,0,.45);
}

h1 {
  margin-top: 0;
}

p {
  line-height: 1.6;
  color: #cfcfcf;
}

button {
  width: 100%;
  padding: 15px;
  border: 0;
  border-radius: 12px;
  background: white;
  color: black;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
}

button:disabled {
  opacity: .5;
}

#status {
  margin-top: 15px;
}
</style>
</head>

<body>

<main class="card">

<h1>Information Sharing</h1>

<p>
This page can share browser/device information with
the person who created this link.
</p>

${
  reportConfig.collectLocation
    ? `
<p>
If you choose to continue, your browser may also ask
for permission to share your current location.
</p>
`
    : ""
}

<p>
Nothing is submitted until you press
<strong>Allow & Share</strong>.
</p>

<button id="share">
Allow & Share
</button>

<p id="status"></p>

</main>

<script>

const token = ${JSON.stringify(safeToken)};

const button =
  document.getElementById("share");

const status =
  document.getElementById("status");

function collectDeviceInfo() {

  return {
    userAgent:
      navigator.userAgent || null,

    language:
      navigator.language || null,

    platform:
      navigator.platform || null,

    screen: {
      width:
        window.screen?.width || null,

      height:
        window.screen?.height || null,

      pixelRatio:
        window.devicePixelRatio || null
    },

    timezone:
      Intl.DateTimeFormat()
        .resolvedOptions()
        .timeZone || null
  };
}

function requestLocation() {

  return new Promise((resolve) => {

    if (!navigator.geolocation) {
      return resolve(null);
    }

    navigator.geolocation.getCurrentPosition(

      position => {

        resolve({
          latitude:
            position.coords.latitude,

          longitude:
            position.coords.longitude,

          accuracy:
            position.coords.accuracy
        });

      },

      () => resolve(null),

      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 60000
      }
    );

  });
}

button.addEventListener(
  "click",
  async () => {

    button.disabled = true;

    status.textContent =
      "Requesting permission…";

    const device =
      ${reportConfig.collectDeviceInfo
        ? "collectDeviceInfo()"
        : "null"};

    const location =
      ${reportConfig.collectLocation
        ? "await requestLocation()"
        : "null"};

    const payload = {
      token,
      consent: true,
      device,
      location
    };

    try {

      const response =
        await fetch("/api/report", {

          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(payload)
        });

      if (!response.ok) {
        throw new Error(
          "Submission failed"
        );
      }

      status.textContent =
        "Information shared successfully.";

    } catch (error) {

      status.textContent =
        "The report could not be submitted.";

      button.disabled = false;
    }
  }
);

</script>

</body>
</html>`);
});

/*
 * Report endpoint.
 */
app.post(
  "/api/report",
  reportLimiter,
  async (req, res) => {

    const {
      token,
      consent,
      device,
      location
    } = req.body || {};

    if (consent !== true) {
      return res.status(400).json({
        error:
          "Explicit consent is required."
      });
    }

    const link = links.get(token);

    if (!link) {
      return res.status(404).json({
        error: "Invalid sharing token."
      });
    }

    if (
      linkConfig.singleUse &&
      link.used
    ) {
      return res.status(409).json({
        error:
          "This link has already been used."
      });
    }

    if (linkExpired(link)) {
      links.delete(token);

      return res.status(410).json({
        error:
          "This sharing link has expired."
      });
    }

    if (linkConfig.singleUse) {
      link.used = true;
    }

    /*
     * Keep memory bounded.
     */
    while (
      reports.size >=
      reportConfig.maxReports
    ) {
      const oldest =
        reports.keys().next().value;

      reports.delete(oldest);
    }

    const report = {
      id: makeId(),
      token,
      createdAt: Date.now(),

      device:
        reportConfig.collectDeviceInfo &&
        device
          ? {
              userAgent:
                String(
                  device.userAgent || ""
                ).slice(0, 500),

              language:
                String(
                  device.language || ""
                ).slice(0, 100),

              platform:
                String(
                  device.platform || ""
                ).slice(0, 100),

              screen:
                device.screen || null,

              timezone:
                String(
                  device.timezone || ""
                ).slice(0, 100)
            }
          : null,

      location:
        reportConfig.collectLocation &&
        location &&
        Number.isFinite(
          location.latitude
        ) &&
        Number.isFinite(
          location.longitude
        )
          ? {
              latitude:
                location.latitude,

              longitude:
                location.longitude,

              accuracy:
                Number.isFinite(
                  location.accuracy
                )
                  ? location.accuracy
                  : null
            }
          : null
    };

    reports.set(
      report.id,
      report
    );

    /*
     * IP collection intentionally remains
     * disabled by default.
     */
    const locationText =
      report.location
        ? [
            `Latitude: ${report.location.latitude}`,
            `Longitude: ${report.location.longitude}`,
            `Accuracy: ${
              report.location.accuracy ??
              "unknown"
            }m`
          ].join("\n")
        : "Not shared";

    try {

      await bot.telegram.sendMessage(
        link.ownerTelegramId,
        [
          "📱 New consented report",
          "",
          `Report ID: ${report.id}`,
          `Time: ${
            new Date(
              report.createdAt
            ).toISOString()
          }`,
          "",
          `Platform: ${
            report.device?.platform ||
            "Unknown"
          }`,
          `Language: ${
            report.device?.language ||
            "Unknown"
          }`,
          `Timezone: ${
            report.device?.timezone ||
            "Unknown"
          }`,
          "",
          "Location:",
          locationText
        ].join("\n")
      );

    } catch (error) {

      console.error(
        "Telegram notification failed:",
        error.message
      );
    }

    res.json({
      success: true
    });
  }
);

/*
 * Health check.
 */
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "consent-tracker"
  });
});

/*
 * Start server.
 */
app.listen(
  server.port,
  () => {
    console.log(
      `Web server running on port ${server.port}`
    );
  }
);

/*
 * Start Telegram bot.
 */
bot.launch().then(() => {
  console.log(
    "Telegram bot started successfully."
  );
});

/*
 * Graceful shutdown.
 */
process.once(
  "SIGINT",
  () => bot.stop("SIGINT")
);

process.once(
  "SIGTERM",
  () => bot.stop("SIGTERM")
);