import { SubscribeLink } from "./SubscribeLink";

/** Compact, in-flow subscription note that separates free reading, collecting and subscribing. */
export function SubscribeSection() {
  return <section className="subscribe" id="subscribe" aria-labelledby="subscribe-h">
    <div className="subscribe-copy">
      <h2 id="subscribe-h" className="h-section">Subscribe to The IMD Daily<span className="section-dot" aria-hidden="true">.</span></h2>
      <p>Subscriptions are available through Paper Route. Visit the subscription page to review current pricing, delivery details and subscription terms.</p>
      <SubscribeLink className="btn btn-subscribe">Subscribe via Paper Route <span aria-hidden="true">↗</span></SubscribeLink>
    </div>
    <dl className="ways">
      <div><dt>Read free</dt><dd>Every edition is free to read and download here. No wallet, no account.</dd></div>
      <div><dt>Collect one edition</dt><dd>Copies of a single edition cost 0.1 IMD each, paid from your wallet on Ethereum during its 24-hour window.</dd></div>
      <div><dt>Subscribe</dt><dd>Handled by Paper Route on its own website. This newspaper asks for no signature, approval or payment.</dd></div>
    </dl>
  </section>;
}
