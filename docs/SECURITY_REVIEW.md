# Implementation review and validation

This is the implementing contributor's adversarial review, **not an independent audit**. The separate network contributor review remains a release prerequisite. Scope: the three files in `src/`, their pinned OpenZeppelin dependencies, tests, constructor ordering, ABI, and integration assumptions. The supplied pinned eth-security reference was read as background; no external account, key, or machine configuration was inspected for release credentials.

## Access and custody review

The complete application mutation surface is `createIssue`, `mint`, vault `withdraw`, and inherited ERC1155 transfers/operator approvals. `createIssue` and `withdraw` check the same fixed publisher; neither factory caller nor origin affects that authority. `mint` is permissionless and always spends `msg.sender`'s IMD approval. There is no exposed internal mint overload, batch mint, burn, refund, sweep, alternate payout, ownership transfer, or delegatecall/upgrade path. The runtime opcode rehearsal checks both applications, and the full ABI permits inspection of all exposed functions.

The vault has no function that can spend collectors' allowances. Payments go directly from the mint caller to the fixed constructor vault address. A public "record revenue" function is unnecessary: successful mints update the collection's own `totalCollected`. Donations cannot manufacture mint revenue. The vault records actual successful withdrawals and always transfers to the publisher. Partial withdrawals work; overdraw and zero withdrawals revert. Its counter includes withdrawn donations by design.

## Arithmetic, eligibility, and immutability

Onchain IMD decimals were read as 18 at the pinned Ethereum block; `PRICE = 10^17` is exactly one tenth of one token with no division or rounding. The mint also checks decimals at use. All multiplication, collection counters, publication IDs, and timestamp addition use checked Solidity arithmetic. There is no configured cap, but uint256 representability, real token balances, and transaction gas are physical limits. A zero quantity never creates a free copy.

Only successful publication records `block.timestamp`; the caller cannot supply opening/closing times. Eligibility is `[publishedAt, publishedAt + 86400)`, and the caller's inclusive transaction deadline cannot extend it. Past/future editorial dates are presentation data. The only issue storage write creates a fresh sequential ID. There is no path to replace content, hashes, URIs, dates, or a window. The inherited URI setter is internal and used only by the constructor with an empty string; the public `uri(id)` always reads the permanent per-issue URI. ERC1155 supply changes only in the guarded paid mint. Transfers after close preserve supply.

## Calls, callbacks, and atomicity

Both state-changing contracts use OpenZeppelin ReentrancyGuard. Publication and mint share the collection guard; withdrawal has the vault's guard. SafeERC20 checks false returns and supports tokens returning no data. Mint verifies both the payer's exact debit and vault's exact credit; withdrawal checks both vault debit and publisher credit. Sender fees, receiver fees, no movement, false returns, and explicit token reverts are rejected atomically. No refund queue is needed because token transfer, mint state, and receiver acceptance share a transaction.

`totalCollected` is updated before the token interaction. Supply/balances are updated by ERC1155Supply before receiver acceptance. A successful ERC1155 receiver callback sees the paid copies and corresponding accounting; it cannot reenter mint. It can transfer copies it already owns, which preserves supply. A token callback cannot reenter mint or an active withdrawal. The publisher can legitimately withdraw during its own receiver callback; if it then rejects the mint, the outer revert also undoes that withdrawal and its counter. Rejected or malformed receivers cannot lock future unrelated mints.

Views can be called during external token execution; transient values are not a cross-contract price oracle. The fixed token is still an external trust dependency: no wrapper can make a wholly malicious token's fabricated `balanceOf` reports trustworthy. Fork tests validate the real token's behavior at the recorded block, not arbitrary future token behavior.

## Tests and evidence

The default offline suite includes success/failure tests, three fuzz tests with the task's pinned seed, a real CREATE2 factory rehearsal, and a stateful invariant campaign (128 runs of depth 48, 6,144 handler calls). Two invariants run in a single Foundry invariant group: conservation of payments/donations/withdrawals, and ownership/supply/immutable content/expired supply. State transitions publish independent issues, repeatedly mint, advance time, transfer copies, donate, withdraw, and try expired mints. Handler reverts are forbidden.

The common behavior suite also runs against actual Ethereum IMD code in `IMDDailyForkTest`. It covers price arithmetic, repeated and multiple-copy purchases, publication/start/close boundaries, arbitrary editorial dates, independent issues, fixed authority, donations, partial withdrawals, malicious receivers, rollback, ETH rejection, immutable fields, absent bypass selectors, and post-expiry transfers. Default tests explicitly skip this suite rather than require network or environment variables. The fork run uses no mock payment token; `deal` only supplies local collector balances. Mock-only tests separately exercise hostile token behavior, absent token code, incorrect decimals, and invalid vault configuration.

See [checks.json](../evidence/checks.json) for exact commands and exit codes, alongside build, local test, fork test, and coverage outputs. Coverage is instrumentation of local tests, not a security guarantee. The fork block and raw read-only IMD evidence are in [imd-mainnet.json](../evidence/imd-mainnet.json). No real-fund tests were performed.

The reviewed final applications have runtime sizes 9,942 bytes (collection) and 1,632 bytes (vault), below EIP-170's 24,576 bytes. Collection initcode including its one static address argument is 10,643 bytes; vault initcode is 1,664 bytes, below 49,152. No external library links, constructor external calls, initializer, or hidden created contract is needed.

Forge's remaining application lint warnings are intentional timestamp comparisons and exact balance comparisons. Timestamp comparisons implement the requested eligibility rule; block producers/inclusion timing still affect when a pending transaction lands. Exact balance checks enforce the fixed full payment and payout amounts, rather than using a balance as an entitlement. A donation before a mint is included in its pre-transfer baseline and does not disable it. The immutable token is expected to be an exact-transfer non-rebasing ERC20, as exercised on the fork.

Slither, Mythril, formal verification, and an independent human audit were not run as part of this contributor's checks. No claim of their results is made.

## Operational limitations and remaining release work

- The publisher is trusted to choose truthful metadata and publish authentic files. The contract cannot fetch URLs, validate JSON, or prove a supplied digest corresponds to content. The later UI must check the documented schema, relationships, and public bytes before submitting. Zero hashes/empty required strings are rejected, but the contract cannot validate their meaning.
- The metadata's predicted next issue ID can become stale if the publisher uses concurrent sessions. The dashboard must serialize publications and recheck the count. There is no privileged edit to repair a published mismatch.
- Immutable URLs/hashes do not provide storage availability. The publisher must retain the hostname, file paths, exact bytes, DNS, TLS, and backups through migrations. A lost domain cannot be repaired by an admin setter.
- The fixed publisher can publish arbitrary future issues and withdraw all vault IMD, including donations. It cannot increase expired supply, mint free copies, alter prior issues, change the price, or redirect withdrawals. Loss or compromise of that wallet has no recovery mechanism in this design.
- The manifest must choose the reviewed vault deployment. Getter checks alone cannot authenticate arbitrary malicious contracts supplied as constructor dependencies. The release service and independent reviewer must check the backward dependency, runtime, and receipts.
- Both contracts reject ordinary ETH payments. Ethereum can still force ETH to an address; such ETH and unrelated assets have no sweep path. Directly sending IMD to the collection bypasses mint and has no recovery path. Only direct IMD donations to the vault are withdrawable.
- Final source publication/commit pinning, independent review, mainnet deployment receipts/addresses, and Etherscan verification are pending network release work. Fork deployments and ABI exports are not substitutes for these artifacts.
