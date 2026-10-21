import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource/playfair-display/latin-900.css";
import "@fontsource/source-serif-4/latin-400.css";
import "@fontsource/source-serif-4/latin-600.css";
import "./styles.css";
import { wagmiConfig } from "./wallet/config";
import { DataProvider } from "./lib/store";
import { App } from "./App";

const queryClient = new QueryClient();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <DataProvider><App /></DataProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
);
