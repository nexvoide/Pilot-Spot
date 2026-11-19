import { expect, it } from "vitest";
import { getWalletTrackingStatus } from "./wallet-tracking.js";
it("returns the approved collection with unique addresses and historical capital labels", async () => {
    const result = await getWalletTrackingStatus();
    expect(result.wallets).toHaveLength(12);
    expect(new Set(result.wallets).size).toBe(12);
    expect(Object.keys(result.walletCapital)).toHaveLength(1);
    expect(result.walletNames["0x85ecf584f25db6f146718b86d493e33c5af72052"]).toBeUndefined();
    expect(result.walletNames["0x52a139ec4940ac130b0e50de39da8a696ba6633a"]).toBe("Muna Bhai");
    expect(result.walletNames["0x5b5d51203a0f9079f8aeb098a6523a13f298c060"]).toBe("Abraxas Solo");
    expect(result.walletNames["0xb83de012dba672c76a7dbbbf3e459cb59d7d6e36"]).toBe("Abraxas Duo");
    expect(result).not.toHaveProperty("enabled");
});
