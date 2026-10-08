// config.js

module.exports = {
  telegram: {
    // Your Telegram BotFather token
    botToken: "8628620384:AAF4koF-JAqqAo1PpnxcjyfbSfX_yIC74uY",

    // Telegram ID of the bot owner
    ownerId: "6542862321"
  },

  server: {
    // Public HTTPS URL where the bot's sharing page is hosted
    publicUrl: "https://your-domain.com",

    // Port used by Express
    port: 3000,

    // Maximum JSON request body
    jsonLimit: "16kb"
  },

  links: {
    // Whether a generated sharing link can be used more than once
    singleUse: true,

    // Random token size in bytes
    tokenBytes: 32,

    // Optional expiry time.
    // Set to 0 to disable expiration.
    expiryMs: 24 * 60 * 60 * 1000
  },

  reports: {
    // Keep reports in memory.
    // Set to false if you later replace this with a database.
    enabled: true,

    // Whether browser/device information is stored
    collectDeviceInfo: true,

    // Whether browser-requested location can be stored
    collectLocation: true,

    // IP addresses are intentionally not stored.
    collectIp: false,

    // Maximum number of reports kept in memory
    maxReports: 1000
  },

  security: {
    // Maximum report submissions from one IP within the window
    rateLimitMax: 10,

    // Rate-limit window
    rateLimitWindowMs: 60 * 1000
  }
};