const {
  QSTASH_TOKEN: token,
  WALLET_ALERTS_CRON_SECRET: secret,
  ALERTS_SITE_URL: site,
} = process.env;

if (!token || !secret || secret.length < 32 || !site) {
  console.error(
    "Set QSTASH_TOKEN, WALLET_ALERTS_CRON_SECRET (at least 32 characters), and ALERTS_SITE_URL in .env.local.",
  );
  process.exit(1);
}

let siteUrl;
try {
  siteUrl = new URL(site);
  if (
    siteUrl.protocol !== "https:" ||
    siteUrl.username ||
    siteUrl.password ||
    siteUrl.pathname !== "/" ||
    siteUrl.search ||
    siteUrl.hash
  )
    throw new Error("Invalid site URL");
} catch {
  console.error(
    "ALERTS_SITE_URL must be the HTTPS origin of your deployed site.",
  );
  process.exit(1);
}

try {
  const destination = new URL("/api/wallet-alerts", siteUrl).href;
  const response = await fetch(
    `https://qstash.upstash.io/v2/schedules/${destination}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Upstash-Cron": "*/5 * * * *",
        "Upstash-Schedule-Id": "spot-ladder-wallet-alerts",
        "Upstash-Method": "POST",
        "Upstash-Forward-Authorization": `Bearer ${secret}`,
        "Upstash-Redact-Fields": "header[Authorization]",
      },
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    },
  );
  if (!response.ok) throw new Error("QStash rejected the schedule");
  console.log("Wallet alert schedule configured to run every five minutes.");
} catch {
  console.error(
    "Unable to configure the schedule. Check the QStash token and try again.",
  );
  process.exitCode = 1;
}
