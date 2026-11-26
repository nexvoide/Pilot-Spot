import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { TrackerStatus } from "./tracker";

class ManagerError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request(path: string, options?: RequestInit): Promise<unknown> {
  const response = await fetch(`/api/wallet-manager${path}`, {
    credentials: "same-origin",
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error =
      result && typeof result === "object" && "error" in result
        ? result.error
        : null;
    throw new ManagerError(
      error &&
        typeof error === "object" &&
        "message" in error &&
        typeof error.message === "string"
        ? error.message
        : "Wallet manager is temporarily unavailable.",
      response.status,
    );
  }
  return result;
}

export function WalletManager({
  status,
  onClose,
  alertWallet,
}: {
  status: TrackerStatus;
  onClose: () => void;
  alertWallet?: string;
}) {
  const queryClient = useQueryClient();
  const dialog = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState<{
    configured: boolean;
    authenticated: boolean;
  } | null>(null);
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog.current?.focus();
    request("/status")
      .then((value) => {
        if (
          !value ||
          typeof value !== "object" ||
          !("configured" in value) ||
          typeof value.configured !== "boolean" ||
          !("authenticated" in value) ||
          typeof value.authenticated !== "boolean"
        )
          throw new Error("Wallet manager is temporarily unavailable.");
        if (active)
          setSession({
            configured: value.configured,
            authenticated: value.authenticated,
          });
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Wallet manager is temporarily unavailable.",
          );
      });
    return () => {
      active = false;
      previous?.focus();
    };
  }, []);

  async function action(run: () => Promise<void>) {
    setPending(true);
    setError("");
    try {
      await run();
    } catch (reason) {
      if (
        reason instanceof ManagerError &&
        reason.status === 401 &&
        session?.authenticated
      )
        setSession({ configured: true, authenticated: false });
      setError(
        reason instanceof Error
          ? reason.message
          : "Wallet manager is temporarily unavailable.",
      );
    } finally {
      setPending(false);
    }
  }

  function unlock(event: FormEvent) {
    event.preventDefault();
    void action(async () => {
      await request("/unlock", {
        method: "POST",
        body: JSON.stringify({ pin }),
      });
      setPin("");
      setSession({ configured: true, authenticated: true });
    });
  }

  function addWallet(event: FormEvent) {
    event.preventDefault();
    void action(async () => {
      const updated = await request("/wallets", {
        method: "POST",
        body: JSON.stringify({ name, address }),
      });
      setName("");
      setAddress("");
      if (
        !updated ||
        typeof updated !== "object" ||
        !("wallets" in updated) ||
        !Array.isArray(updated.wallets) ||
        !("walletNames" in updated) ||
        !updated.walletNames ||
        typeof updated.walletNames !== "object"
      )
        throw new Error(
          "Wallet was added, but the list could not be refreshed.",
        );
      queryClient.setQueryData(["wallet-tracking"], updated);
    });
  }

  function removeWallet(wallet: string) {
    void action(async () => {
      const updated = await request(
        `/wallets?address=${encodeURIComponent(wallet)}`,
        { method: "DELETE" },
      );
      setConfirmDelete(null);
      if (
        !updated ||
        typeof updated !== "object" ||
        !("wallets" in updated) ||
        !Array.isArray(updated.wallets) ||
        !("walletNames" in updated) ||
        !updated.walletNames ||
        typeof updated.walletNames !== "object"
      )
        throw new Error(
          "Wallet was removed, but the list could not be refreshed.",
        );
      queryClient.setQueryData(["wallet-tracking"], updated);
    });
  }

  function toggleAlerts(wallet: string) {
    void action(async () => {
      const updated = await request("/alerts", {
        method: "POST",
        body: JSON.stringify({
          address: wallet,
          enabled: !status.walletAlerts?.[wallet],
        }),
      });
      if (
        !updated ||
        typeof updated !== "object" ||
        !("walletAlerts" in updated) ||
        !updated.walletAlerts ||
        typeof updated.walletAlerts !== "object" ||
        !("wallets" in updated) ||
        !Array.isArray(updated.wallets)
      )
        throw new Error("Alert setting could not be refreshed.");
      queryClient.setQueryData(["wallet-tracking"], updated);
    });
  }

  function alertButton(wallet: string) {
    const enabled = Boolean(status.walletAlerts?.[wallet]);
    return (
      <button
        type="button"
        className="wallet-alert-switch"
        role="switch"
        aria-checked={enabled}
        aria-label={`WhatsApp alerts for ${status.walletNames[wallet] ?? wallet}`}
        disabled={pending}
        onClick={() => toggleAlerts(wallet)}
      >
        WhatsApp alerts {enabled ? "on" : "off"}
      </button>
    );
  }

  return (
    <div
      className="wallet-manager-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="wallet-manager"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-manager-title"
        ref={dialog}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
          if (event.key !== "Tab") return;
          const focusable = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
            ),
          );
          if (!focusable.length) {
            event.preventDefault();
            return;
          }
          const index = focusable.indexOf(
            document.activeElement as HTMLElement,
          );
          if (event.shiftKey && index <= 0) {
            event.preventDefault();
            focusable[focusable.length - 1].focus();
          } else if (
            !event.shiftKey &&
            (index === -1 || index === focusable.length - 1)
          ) {
            event.preventDefault();
            focusable[0].focus();
          }
        }}
      >
        <header className="wallet-manager-header">
          <div>
            <p className="eyebrow">WALLET TRACKING</p>
            <h2 id="wallet-manager-title">Manage wallets</h2>
          </div>
          <button
            type="button"
            className="wallet-manager-close"
            onClick={onClose}
            aria-label="Close wallet manager"
          >
            ×
          </button>
        </header>
        {error && (
          <p className="wallet-manager-error" role="alert">
            {error}
          </p>
        )}
        {session === null && !error && (
          <p className="wallet-manager-muted" role="status">
            Checking wallet storage…
          </p>
        )}
        {session && !session.configured && (
          <p className="wallet-manager-muted">
            Wallet storage and a management PIN need to be configured on the
            server first.
          </p>
        )}
        {session?.configured && !session.authenticated && (
          <form className="wallet-manager-form" onSubmit={unlock}>
            <p className="wallet-manager-muted">
              Enter your PIN to manage wallets and WhatsApp alerts.
            </p>
            <label>
              PIN
              <input
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                minLength={4}
                maxLength={32}
                required
              />
            </label>
            <button type="submit" disabled={pending}>
              Unlock
            </button>
          </form>
        )}
        {session?.authenticated && (
          <>
            {alertWallet && status.wallets.includes(alertWallet) && (
              <div className="wallet-alert-selected">
                <strong>
                  {status.walletNames[alertWallet] ?? alertWallet}
                </strong>
                {alertButton(alertWallet)}
                <p>
                  Requires the configured WhatsApp alert worker. The first check
                  establishes a baseline; later new and closed positions are
                  sent to the configured group.
                </p>
              </div>
            )}
            <form
              className="wallet-manager-form wallet-manager-add"
              onSubmit={addWallet}
            >
              <label>
                Wallet name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={100}
                  required
                />
              </label>
              <label>
                Wallet address
                <input
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="0x…"
                  pattern="0[xX][0-9a-fA-F]{40}"
                  maxLength={42}
                  required
                />
              </label>
              <button type="submit" disabled={pending}>
                Add wallet
              </button>
            </form>
            <div className="wallet-manager-list-heading">
              <h3>
                Tracked wallets <span>{status.wallets.length}</span>
              </h3>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  void action(async () => {
                    await request("/lock", { method: "POST" });
                    setSession({ configured: true, authenticated: false });
                  })
                }
              >
                Lock
              </button>
            </div>
            <ul className="wallet-manager-list">
              {status.wallets.map((wallet) => (
                <li key={wallet}>
                  <div>
                    <strong>{status.walletNames[wallet] ?? "Wallet"}</strong>
                    <code>{wallet}</code>
                  </div>
                  <div className="wallet-manager-actions">
                    {wallet !== alertWallet && alertButton(wallet)}
                    {confirmDelete === wallet ? (
                      <div className="wallet-manager-actions">
                        <button
                          type="button"
                          className="wallet-manager-confirm-delete"
                          disabled={pending}
                          onClick={() => removeWallet(wallet)}
                        >
                          Confirm delete
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => setConfirmDelete(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setConfirmDelete(wallet)}
                        aria-label={`Delete ${status.walletNames[wallet] ?? wallet}`}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
