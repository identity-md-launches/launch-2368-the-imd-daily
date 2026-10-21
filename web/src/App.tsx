import { useEffect, useState } from "react";
import { Artwork } from "./components/Artwork";
import { ConnectSheet } from "./wallet/ConnectSheet";
import { FrontPage } from "./pages/FrontPage";
import { IssuePage } from "./pages/IssuePage";
import { ReadPage } from "./pages/ReadPage";
import { About } from "./pages/About";
import { Collection } from "./pages/Collection";
import { VaultPage } from "./pages/VaultPage";
import { Publisher } from "./pages/Publisher";

/** Hash routes: the export is static, so no server has to rewrite paths. */
function useRoute() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => { setHash(location.hash); window.scrollTo(0, 0); };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return hash.replace(/^#\/?/, "").split("/").filter(Boolean);
}

const NAV = [
  { href: "#/", label: "Today", key: "" },
  { href: "#/archive", label: "Archive", key: "archive" },
  { href: "#/collection", label: "My Collection", key: "collection" },
  { href: "#/about", label: "About", key: "about" },
];

export function App() {
  const route = useRoute();
  const head = route[0] ?? "";

  useEffect(() => {
    const main = document.getElementById("main");
    if (main && head) main.focus({ preventScroll: true });
  }, [head, route[1]]);

  if (head === "read" && route[1]) return <ReadPage id={route[1]} />;

  return (
    <div className="frame">
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>
      <div className="paper">
        <header className="masthead">
          <a href="#/" className="nameplate" aria-label="The IMD Daily, home">
            <Artwork name="emblem" className="brand-emblem" eager />
            <h1>The IMD Daily</h1>
          </a>
          <nav aria-label="Sections" className="nav">
            {NAV.map((n) => (
              <a key={n.key} href={n.href} aria-current={head === n.key || (n.key === "" && head === "issue") ? "page" : undefined}>{n.label}</a>
            ))}
          </nav>
          <div className="header-wallet"><ConnectSheet /></div>
        </header>
        <main id="main" tabIndex={-1}>
          {head === "" && <FrontPage />}
          {head === "archive" && <FrontPage archiveOnly />}
          {head === "issue" && <IssuePage id={route[1] ?? ""} />}
          {head === "about" && <About />}
          {head === "collection" && <Collection />}
          {head === "vault" && <VaultPage />}
          {head === "publisher" && <Publisher />}
          {!["", "archive", "issue", "about", "collection", "vault", "publisher"].includes(head) && (
            <section className="page-narrow"><h2 className="h-section">Page not found</h2><p><a href="#/">Return to today's edition</a></p></section>
          )}
        </main>
        <footer className="foot">
          <div><span className="footer-brand">The IMD Daily</span><span>Independent community press · Ethereum</span></div>
          <nav aria-label="More"><a href="#/about">About the paper</a><a href="#/vault">Vault</a><a href="#/publisher">Publisher desk</a></nav>
        </footer>
      </div>
    </div>
  );
}
