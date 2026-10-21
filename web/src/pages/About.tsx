import { addressUrl, DAILY, IMD, PUBLISHER, VAULT } from "../config";

export function About() {
  return (
    <section className="columns about" aria-labelledby="about-h">
      <h2 id="about-h" className="h-section">About The IMD Daily</h2>
      <div className="col-body">
        <p>The IMD Daily is a newspaper published as PDF editions. Every edition is free to read and download here, with no wallet and no account, for as long as its files stay online.</p>
        <p>Each edition is also an open ERC-1155 collectible on Ethereum. For 24 hours after the publication transaction, anyone can collect copies at exactly 0.1 IMD each, as many as they like and as often as they like. When the window ends it closes for good; the contract has no way to reopen it, and the edition stays readable.</p>
        <h3 className="h-sub">What a copy is</h3>
        <p>A copy supports the paper. It carries no copyright, no licence to the contents and no promise of profit, dividends or any other return. Payment is in IMD only; ETH pays the network's gas.</p>
        <h3 className="h-sub">How collecting works</h3>
        <p>Your wallet first approves the exact IMD total for the collection contract, then sends the mint. The mint carries a deadline, so a purchase that arrives after the window or after the quote expires is refused and nothing is charged.</p>
      </div>
      <aside className="col-side">
        <h3 className="h-sub">Contracts</h3>
        <dl className="record num">
          <dt>Collection</dt><dd className="hash"><a href={addressUrl(DAILY)} target="_blank" rel="noopener">{DAILY}</a></dd>
          <dt>Vault</dt><dd className="hash"><a href={addressUrl(VAULT)} target="_blank" rel="noopener">{VAULT}</a></dd>
          <dt>IMD token</dt><dd className="hash"><a href={addressUrl(IMD)} target="_blank" rel="noopener">{IMD}</a></dd>
          <dt>Publisher</dt><dd className="hash"><a href={addressUrl(PUBLISHER)} target="_blank" rel="noopener">{PUBLISHER}</a></dd>
        </dl>
        <p className="fine">Source: identity-md-launches/launch-2368-the-imd-daily, commit d5063fa.</p>
      </aside>
    </section>
  );
}
