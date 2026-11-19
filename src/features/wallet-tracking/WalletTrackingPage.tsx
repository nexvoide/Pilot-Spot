import { useState, type FormEvent } from "react";
import {
  addressPattern,
  isDiscordWebhook,
  MAX_WALLETS,
  trackerRequest,
  testWebhook,
  type TrackerSettings,
} from "./tracker";

const CONNECTION_KEY = "spot-ladder-analyzer:tracker-connection";
function loadConnection(): { url: string; token: string } {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(CONNECTION_KEY) || "null",
    );
    if (
      value &&
      typeof value === "object" &&
      "url" in value &&
      "token" in value &&
      typeof value.url === "string" &&
      typeof value.token === "string"
    )
      return { url: value.url, token: value.token };
  } catch {
    /* Storage is optional. */
  }
  return { url: "", token: "" };
}

export function WalletTrackingPage() {
  const [connection, setConnection] = useState(loadConnection);
  const [connected, setConnected] = useState<{
    url: string;
    token: string;
  } | null>(null);
  const [settings, setSettings] = useState<TrackerSettings | null>(null);
  const [address, setAddress] = useState("");
  const [webhook, setWebhook] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  async function connect(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFeedback("");
    try {
      const credentials = {
        url: connection.url.trim(),
        token: connection.token.trim(),
      };
      const result = await trackerRequest(credentials.url, credentials.token);
      setSettings(result);
      setConnected(credentials);
      try {
        localStorage.setItem(CONNECTION_KEY, JSON.stringify(credentials));
      } catch {
        setFeedback(
          "Connected, but this browser could not save the connection.",
        );
      }
    } catch (error) {
      setConnected(null);
      setSettings(null);
      setFeedback(
        error instanceof Error ? error.message : "Connection failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function update(
    next: { wallets: string[]; enabled: boolean; webhook?: string },
    success: string,
  ) {
    if (!connected) return false;
    setBusy(true);
    setFeedback("");
    try {
      setSettings(await trackerRequest(connected.url, connected.token, next));
      setFeedback(success);
      return true;
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Could not save settings.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addWallet(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    const value = address.trim().toLowerCase();
    if (!addressPattern.test(value)) {
      setFeedback("Enter a valid 0x wallet address.");
      return;
    }
    if (settings.wallets.includes(value)) {
      setFeedback("This wallet is already in the list.");
      return;
    }
    if (settings.wallets.length >= MAX_WALLETS) {
      setFeedback(`You can track up to ${MAX_WALLETS} wallets.`);
      return;
    }
    if (
      await update(
        { wallets: [...settings.wallets, value], enabled: settings.enabled },
        "Wallet added.",
      )
    )
      setAddress("");
  }

  async function sendTest() {
    if (!connected) return;
    setBusy(true);
    setFeedback("");
    try {
      await testWebhook(connected.url, connected.token);
      setFeedback("Test message sent to Discord.");
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Could not send the test message.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveWebhook() {
    if (!settings) return;
    const value = webhook.trim();
    if (!isDiscordWebhook(value)) {
      setFeedback("Enter a valid Discord webhook URL.");
      return;
    }
    if (
      await update(
        {
          wallets: settings.wallets,
          enabled: settings.enabled,
          webhook: value,
        },
        "Discord webhook saved.",
      )
    )
      setWebhook("");
  }

  return (
    <section
      className="calculator-page wallet-page"
      aria-labelledby="wallet-title"
    >
      <p className="eyebrow">Hyperliquid</p>
      <h1 id="wallet-title">Whale wallet tracking</h1>
      <p className="calculator-intro">
        Receive Discord alerts when a tracked wallet opens a new long or short
        on Hyperliquid, even when Spot Ladder is closed.
      </p>
      <p className="wallet-note">
        A free Cloudflare Worker checks wallets every five minutes. One-time
        setup is required; see the wallet tracking instructions in the project
        README. Alerts can be delayed if a provider is unavailable.
      </p>
      <form
        className="calculator-card wallet-card"
        onSubmit={(event) => void connect(event)}
      >
        <h2>Connect your tracker</h2>
        <label className="calculator-field" htmlFor="worker-url">
          <span>Cloudflare Worker URL</span>
          <input
            id="worker-url"
            type="url"
            autoComplete="url"
            value={connection.url}
            onChange={(event) =>
              setConnection({ ...connection, url: event.target.value })
            }
            placeholder="https://your-worker.workers.dev"
          />
        </label>
        <label className="calculator-field" htmlFor="worker-token">
          <span>Admin token</span>
          <input
            id="worker-token"
            type="password"
            autoComplete="off"
            value={connection.token}
            onChange={(event) =>
              setConnection({ ...connection, token: event.target.value })
            }
          />
        </label>
        <p className="field-help">
          Your admin token is stored in this browser. Keep it private.
        </p>
        <div>
          <button className="primary-action" type="submit" disabled={busy}>
            {busy ? "Connecting…" : "Connect"}
          </button>
        </div>
      </form>
      {settings && connected && (
        <>
          <div className="calculator-card wallet-card">
            <h2>Discord webhook</h2>
            <p className="field-help">
              {settings.webhookConfigured
                ? "A webhook is saved. Enter a new URL to replace it."
                : "Add your Discord channel webhook."}
            </p>
            <label className="calculator-field" htmlFor="wallet-webhook">
              <span>Webhook URL</span>
              <input
                id="wallet-webhook"
                type="password"
                autoComplete="off"
                value={webhook}
                onChange={(event) => setWebhook(event.target.value)}
                placeholder="https://discord.com/api/webhooks/…"
              />
            </label>
            <div className="wallet-actions">
              <button
                className="primary-action"
                type="button"
                disabled={busy}
                onClick={() => void saveWebhook()}
              >
                Save webhook
              </button>
              <button
                className="wallet-secondary"
                type="button"
                disabled={busy || !settings.webhookConfigured}
                onClick={() => void sendTest()}
              >
                Send test message
              </button>
            </div>
          </div>
          <div className="calculator-card wallet-card">
            <h2>
              Wallet addresses{" "}
              <small>
                ({settings.wallets.length}/{MAX_WALLETS})
              </small>
            </h2>
            <form
              onSubmit={(event) => void addWallet(event)}
              className="wallet-add"
            >
              <label className="calculator-field" htmlFor="wallet-address">
                <span>Hyperliquid wallet address</span>
                <input
                  id="wallet-address"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="0x…"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <button className="primary-action" type="submit" disabled={busy}>
                Add wallet
              </button>
            </form>
            {settings.wallets.length > 0 ? (
              <ul className="wallet-list">
                {settings.wallets.map((wallet) => (
                  <li key={wallet}>
                    <code>{wallet}</code>
                    <button
                      className="wallet-secondary"
                      type="button"
                      disabled={busy}
                      aria-label={`Remove ${wallet}`}
                      onClick={() =>
                        void update(
                          {
                            wallets: settings.wallets.filter(
                              (item) => item !== wallet,
                            ),
                            enabled:
                              settings.wallets.length > 1 && settings.enabled,
                          },
                          "Wallet removed.",
                        )
                      }
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="field-help">No wallets added yet.</p>
            )}
          </div>
          <div className="wallet-controls">
            <button
              className="primary-action"
              type="button"
              disabled={busy}
              onClick={() =>
                void update(
                  { wallets: settings.wallets, enabled: !settings.enabled },
                  settings.enabled ? "Tracking stopped." : "Tracking started.",
                )
              }
            >
              {settings.enabled ? "Stop tracking" : "Start tracking"}
            </button>
            <strong>
              {settings.enabled ? "Tracking enabled" : "Tracking off"}
            </strong>
          </div>
          {settings.lastChecked && (
            <p className="field-help">
              Last check: {new Date(settings.lastChecked).toLocaleString()}
            </p>
          )}
          {settings.lastError && (
            <p className="field-help" role="alert">
              Last check reported an error: {settings.lastError}. The next check
              will retry.
            </p>
          )}
        </>
      )}
      {feedback && (
        <p className="field-help" role="status">
          {feedback}
        </p>
      )}
    </section>
  );
}
