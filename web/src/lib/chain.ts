import { createPublicClient, fallback, http, type PublicClient } from "viem";
import { mainnet } from "viem/chains";
import { RPC_URLS } from "../config";

export const publicClient: PublicClient = createPublicClient({
  chain: mainnet,
  batch: { multicall: true },
  transport: fallback(RPC_URLS.map((u) => http(u, { retryCount: 1, timeout: 15_000 }))),
}) as PublicClient;

/** Offset between chain time and this device's clock, so countdowns follow the latest block. */
let offset = 0n;
let synced = false;
export async function syncChainTime(client: PublicClient = publicClient): Promise<bigint> {
  const block = await client.getBlock({ blockTag: "latest" });
  offset = block.timestamp - BigInt(Math.floor(Date.now() / 1000));
  synced = true;
  return block.timestamp;
}
export const chainNow = () => BigInt(Math.floor(Date.now() / 1000)) + offset;
export const chainTimeSynced = () => synced;
