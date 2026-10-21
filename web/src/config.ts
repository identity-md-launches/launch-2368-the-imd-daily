import type { Abi, Address } from "viem";
import dailyAbiJson from "../../abi/IMDDaily.json";
import vaultAbiJson from "../../abi/IMDDailyVault.json";
import tokenAbiJson from "../../abi/IMD-payment.json";

// Every address and chain fact below comes from .imd/reads/deployment.json and network.json
// for launch 2368 (source commit d5063fa05882a292f2dccf9defeb57c09bcb9387).
export const CHAIN_ID = 1;
export const CHAIN_NAME = "Ethereum";
export const DAILY = "0xb8fd2b7fb37cbf03a26b4c4688ed5cce86c0a9c5" as Address;
export const VAULT = "0x3343692c3667852a1d4a7d8052c24862e6c523c0" as Address;
export const IMD = "0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7" as Address;
export const PUBLISHER = "0x48E4E74fE1d0c14404cEB57B9fec5b21329C6ec9" as Address;
export const DEPLOY_BLOCK = 26239377n;
export const DEPLOY_TX = "0x972fe515154dbc48a4373e625201034a59ff379223dbaa34a95fcfe5bf8fa17d";
export const RPC_URLS = ["https://ethereum-rpc.publicnode.com", "https://eth.drpc.org"];
export const EXPLORER = "https://etherscan.io";
export const IMD_DECIMALS = 18;

/** Exactly 0.1 IMD in base units, as the contract's PRICE constant. Re-read on chain before use. */
export const EXPECTED_PRICE = 100_000_000_000_000_000n;
export const EXPECTED_WINDOW = 86_400n;

export const SITE_NAME = "The IMD Daily";
export const SITE_DESCRIPTION =
  "Read The IMD Daily free, page by page, and collect a copy of each edition on Ethereum during its 24-hour window.";

export const dailyAbi = dailyAbiJson as Abi;
export const vaultAbi = vaultAbiJson as Abi;
export const tokenAbi = tokenAbiJson as Abi;

export const WALLET_ADD_CHAIN = {
  chainId: "0x1",
  chainName: "Ethereum",
  rpcUrls: RPC_URLS,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  blockExplorerUrls: [EXPLORER],
};

export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const addressUrl = (a: string) => `${EXPLORER}/address/${a}`;
export const tokenUrl = (id: bigint) => `${EXPLORER}/nft/${DAILY}/${id.toString()}`;

/**
 * The publishing service runs on the publisher's own server. Its origin is not baked into
 * the build: the dashboard reads ./service.json (the existing VPS) and lets the publisher store an
 * origin in this browser, so a server move never needs a site rebuild.
 */
export const SERVICE_STORAGE_KEY = "imd-daily:service-origin";
