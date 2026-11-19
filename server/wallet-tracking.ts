import { trackedWallets } from "../src/features/wallet-tracking/wallets.js";

const wallets = trackedWallets.map(({ address }) => address);
const walletSet = new Set(wallets);
if (
  walletSet.size !== wallets.length ||
  trackedWallets.some(
    ({ address, name, capitalSnapshot }) =>
      !/^0x[0-9a-f]{40}$/.test(address) ||
      !name.trim() ||
      name !== name.trim() ||
      name.length > 100 ||
      /\p{Cc}/u.test(name) ||
      (capitalSnapshot &&
        (!Number.isFinite(capitalSnapshot.valueUsd) ||
          capitalSnapshot.valueUsd < 0 ||
          !Number.isFinite(Date.parse(capitalSnapshot.asOf)))),
  )
)
  throw new Error("Invalid tracked wallet collection.");
const collection = {
  wallets,
  walletNames: Object.fromEntries(
    trackedWallets.map(({ address, name }) => [address, name]),
  ),
  walletCapital: Object.fromEntries(
    trackedWallets.flatMap(({ address, capitalSnapshot }) =>
      capitalSnapshot ? [[address, capitalSnapshot]] : [],
    ),
  ),
};

export function isTrackedWallet(address: string): boolean {
  return walletSet.has(address);
}

export function getWalletTrackingStatus(): typeof collection {
  return collection;
}
