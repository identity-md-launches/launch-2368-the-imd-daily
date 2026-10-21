import { createConfig, http, fallback } from "wagmi";
import { mainnet } from "wagmi/chains";
import { coinbaseWallet, injected } from "wagmi/connectors";
import { RPC_URLS, SITE_NAME } from "../config";

// No relay and no project ID: EIP-6963 extensions, wallet in-app browsers, Coinbase Smart Wallet.
export const wagmiConfig = createConfig({
  chains: [mainnet],
  multiInjectedProviderDiscovery: true,
  connectors: [injected(), coinbaseWallet({ appName: SITE_NAME })],
  transports: { [mainnet.id]: fallback(RPC_URLS.map((u) => http(u))) },
});
