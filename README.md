# The IMD Daily

Independent, non-upgradeable ERC1155 newspaper collectibles on Ethereum. The collection is named **The IMD Daily**, symbol **IMDDAILY**. Deployment creates zero issues and zero copies. The frontend reads the existing Ethereum contracts; this redesign creates no token, pool or contract and makes no change to UNLOCK.

The contract-release notes below are the original handoff. The later website source is in `web/`, and its finished static export is in `dist/`. It connects to the already deployed Ethereum contracts documented in `web/src/config.ts`; this frontend revision deploys no contracts.

The deployed collection is `0xb8fd2b7fb37cbf03a26b4c4688ed5cce86c0a9c5` and its vault is `0x3343692c3667852a1d4a7d8052c24862e6c523c0` on Ethereum mainnet. This revision starts from accepted frontend commit `bd592f73cce24af973c6d2c67069be392db5bdb9`. Contracts, ABIs, economics, issue content, immutable hashes and publication windows remain unchanged.

The redesigned site is a midnight independent newsroom, with original frog reporter artwork and a real first-page PDF cover. [DESIGN.md](DESIGN.md) describes the implemented design; [artwork prompts and assets](docs/ARTWORK.md) records the illustrations and font licenses.

## Fixed configuration

| Setting | Value |
| --- | --- |
| Chain | Ethereum mainnet, chain ID `1` |
| Publisher and sole withdrawal recipient | `0x48E4E74fE1d0c14404cEB57B9fec5b21329C6ec9` |
| Existing IMD token | `0xD34a99Bc0f67aE1bbd63C660e6d0b0dd03E263B7` |
| IMD decimals | `18`, read onchain at block `26239078` |
| Price per copy | `100000000000000000` base units = exactly `0.1 IMD` |
| Mint window | `86400` seconds from successful publication |
| Issue numbering | `1, 2, 3, ...`; `0` is never an issue |
| Supply | Zero at deployment; no configured issue, quantity, or wallet cap |

The authority and token are hardcoded in [DailyAuthority.sol](src/DailyAuthority.sol); price and window are constants. `owner()` always returns the publisher. Neither factory nor deployment sender receives authority. There is no ownership transfer, initializer, pause, upgrade, free mint, burn, royalty, price setter, metadata setter, or reopening function.

## Behavior and accounting

The publisher calls `createIssue` with the title, editorial timestamp, PDF URL, cover URL, metadata URI, and SHA-256 hashes of the three files. The resulting publication timestamp and closing timestamp are immutable. Editorial dates can be past or future and do not affect eligibility. Publication creates no copies. The later dashboard must validate public files and metadata before sending the transaction; the contracts record commitments and cannot fetch URLs.

Collectors approve **the collection**, then call `mint(id, quantity, recipient, deadline)`. The caller pays `quantity * PRICE` directly into the distinct vault. The contract requires `publishedAt <= block.timestamp < closesAt`, positive quantity, a nonzero recipient, and `block.timestamp <= deadline`. Arithmetic is checked. A receiver must accept the safe ERC1155 mint. Failed payment or receiver acceptance reverts the payment, allowance spend, supply, counters, and transaction logs. A caller may buy repeatedly or gift copies; the publisher pays under the same rules.

All entry points are nonpayable. ETH is used only for transaction gas. Transfers and immutable metadata remain available after expiry. A collectible conveys neither copyright nor financial-return entitlement.

The two contracts intentionally have one-way deployment dependencies:

| View | Meaning |
| --- | --- |
| `IMDDaily.totalCollected()` | Gross IMD paid by successful mints only |
| `IMDDaily.totalSupply(id)` | Copies of that issue; zero for unpublished or unminted IDs |
| `IMDDaily.totalSupply()` | Copies across all issues |
| `IMDDailyVault.totalWithdrawn()` | All IMD withdrawn, including donated IMD |
| `IMDDailyVault.balance()` | Actual current IMD balance |

The vault does not expose a donation-sensitive revenue counter or a public function that fabricates collection receipts. Revenue is recorded at the only paid mint entry point. The vault can therefore deploy first without registering a collection afterward. Only the publisher can call `withdraw(amount)`, and payment always goes to that same publisher. Partial withdrawals and withdrawal of donations are allowed. `totalWithdrawn` can exceed `totalCollected` after donations; subtracting those counters does **not** calculate remaining mint revenue. For the expected exact-transfer token, `vault balance + totalWithdrawn = totalCollected + direct vault donations` when this deployment's collection is the only mint source.

## Build and check

The compiler is pinned to Solidity `0.8.26`, Cancun, optimizer enabled with 200 runs, metadata bytecode hash `none`. Libraries are vendored as ordinary files; no install, submodule, FFI, or filesystem cheatcode permission is needed. [dependencies.json](dependencies.json) pins the OpenZeppelin v5.4.0 subset and forge-std v1.9.7 archives with SHA-256 digests and licenses.

```sh
forge build
forge test
forge fmt --check
```

The requested fuzz seed is pinned in `foundry.toml`:
`0x354f27bfc473c2676f533ebe69e5382260d1329e4a45ec587dafe391a300dc83`.
The ordinary test run is offline and skips the fork suite explicitly. Tests do not read or set environment variables. Run the real-token suite separately:

```sh
forge test --match-contract IMDDailyForkTest \
  --fork-url https://eth.drpc.org \
  --fork-block-number 26239078
```

This uses real IMD code and storage, with test collector balances changed **only in the local fork** using Foundry `deal`. The publisher is impersonated locally. There are no real purchases, broadcasts, or mainnet publications. An archival Ethereum endpoint can replace the public endpoint. [Onchain evidence](evidence/imd-mainnet.json) includes the block hash, raw calls, and token runtime. [Review](docs/SECURITY_REVIEW.md) explains test coverage, trust assumptions, and release limitations.

## Integration and operations

Use [the exact integration guide](docs/INTEGRATION.md), [metadata JSON schema](docs/metadata.schema.json), and [ABIs](abi/). `python3 scripts/export_artifacts.py` refreshes ABI and build hashes after `forge build`. The later website obtains collection and vault addresses from the confirmed deployment handoff; test addresses must never be used.

After launch, no contract setup transaction is required. The publisher is responsible for retaining the fixed wallet's signing access, preparing files, running URL/hash checks, publishing future issues, and withdrawing funds. Lost signing access cannot be repaired by a factory or administrator. Hosting, DNS, TLS, backups, and permanent availability remain the publisher's responsibility. Server/CDN origins may migrate behind the same public hostname, preserving every published URL path and byte. Published URL strings cannot be changed onchain. No domain, files, credentials, or first issue is required to deploy these contracts.

Only send mint payments through `mint`. IMD sent directly to the collection, unrelated tokens, and forcibly delivered ETH have no recovery function. Direct IMD donations to the vault can be withdrawn by the publisher and are not mint revenue.


## Website: install, preview and rebuild

Use Node.js 24. From the repository root:

```sh
cd web
npm ci
npm run typecheck
npm test
npm run build
npm run preview -- --host 127.0.0.1
```

Open the local URL printed by Vite. The production build writes `dist/` at the repository root, with relative asset URLs and a bundled PDF.js worker. Keep that complete export with the source and the existing lockfile. Hash routes support static hosting and gateway subpaths.

The requested delivery label is **the-imd-daily**, at `https://the-imd-daily.sites.imd.fun`. Hosting status and any naming blocker are recorded in [validation](artifacts/validation.md). The previous site is kept in place. The shipped upload default is the existing **https://the-imd-daily.duckdns.org** service; a valid origin previously saved in the same browser still wins. Wallet authorization, upload hashes and publication recovery remain intact. Browser storage belongs to each origin; a new hostname cannot read the old hostname’s browser settings or wallet session, so a visitor may need to reconnect or save a custom origin again.

The frontend needs Node.js 24. Install with the existing `web/package-lock.json`, preview with the command above, and rebuild with `npm run build`. Vite writes relative URLs to the root `dist/`, including the PDF worker, local fonts and artwork. Serve the whole directory on a static host. Routes use hashes, so no server rewrite is needed. The uploaded PDF and immutable cover remain on the existing VPS and are not replaced by generated artwork.

## Validation for this redesign

See [artifacts/validation.md](artifacts/validation.md) for actual results, live versus mocked coverage, browser limitations and screenshots. Unit tests include exact arithmetic, mint deadlines, expiry latching, indexing, saved service settings, failed authentication and hash verification.

Repeat the local checks:

```sh
cd web
npm ci
npm run typecheck
npm test
npm run check:abi
npm run build
```

Browser tools are installed outside the repository. To repeat the isolated regression suite after building:

```sh
npm install --prefix /tmp/imd-browser playwright
PLAYWRIGHT_BROWSERS_PATH=/tmp/imd-browsers /tmp/imd-browser/node_modules/.bin/playwright install chromium webkit
cd web
IMD_PLAYWRIGHT=/tmp/imd-browser/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/tmp/imd-browsers node scripts/validate-revision.mjs
```

That suite uses only local fixtures and blocks external traffic. It validates exact approvals, transaction rejection/reverts, pending and receipt UI, expiry, reader controls and large PDFs, narrow vault layouts, and publisher preparation/recovery. It sends no real transaction and publishes no real issue. It closes its browsers and foreground server on completion. Missing WebKit host libraries are reported explicitly.

The separate read-only integration suite uses real chain state and issue files:

```sh
cd web
IMD_PLAYWRIGHT=/tmp/imd-browser/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/tmp/imd-browsers node scripts/validate-live.mjs
```

It locally serves the production export at the requested HTTPS origin inside the test browser to verify the existing service’s actual CORS and login boundary. It does not prove that the hostname is hosted. Set `IMD_HOSTED=1` to check the actual hosted site instead. `IMD_BROWSER=webkit` selects WebKit. An optional `IMD_RPC_URL` selects a contributor RPC for read-only tests; the shipped site retains the public Ethereum endpoints. No wallet signature, purchase, upload, content write or publication is performed by this live suite.

Service and restore checks use temporary data only:

```sh
cd server
npm ci
npm test
```
