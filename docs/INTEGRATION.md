# Contract integration

This is a contract interface guide for the future publisher dashboard and public reading website. It does not deploy a website or require storage before contract deployment.

## Network configuration and ABI

Read the confirmed deployment handoff before enabling writes. Require chain ID `1`. Resolve `IMDDaily` and `IMDDailyVault` from its named contracts; **no production contract address is known yet**. Fail closed if either address or a successful receipt is missing. The supplied `evidence/release-status.json` deliberately has an empty deployments list. Never copy an address from a Forge trace.

Fixed values:

```text
publisher = 0x48E4E74fE1d0c14404cEB57B9fec5b21329C6ec9
paymentToken = 0xD34a99Bc0f67aE1bbd63C660e6d0b0dd03E263B7
paymentDecimals = 18
priceBaseUnits = 100000000000000000
chainId = 1
```

Use [IMDDaily.json](../abi/IMDDaily.json), [IMDDailyVault.json](../abi/IMDDailyVault.json), and [IMD-payment.json](../abi/IMD-payment.json). The last ABI is only the existing ERC20 payment interface; this project deploys no payment token. On startup check collection `vault()`, `owner()`, `PAYMENT_TOKEN()`, `PRICE()`, `PAYMENT_DECIMALS()`, and vault `owner()` / `PAYMENT_TOKEN()` against the handoff. Check IMD `decimals()` is 18. Confirm both application runtimes against the reviewed release, including the collection's immutable vault address.

## Data and hashes

`createIssue` takes **one tuple**, with these fields in this order:

| Field | Solidity type | Exact meaning |
| --- | --- | --- |
| `title` | `string` | Human-readable issue title; nonempty |
| `editorialDate` | `uint256` | Editorial Unix timestamp, conventionally 00:00:00 UTC on its date |
| `pdfURL` | `string` | Immutable absolute public PDF URL; nonempty |
| `coverURL` | `string` | Immutable absolute public image URL; nonempty |
| `metadataURI` | `string` | Immutable absolute public UTF-8 JSON URL; nonempty |
| `pdfHash` | `bytes32` | SHA-256 of the exact PDF file bytes |
| `coverHash` | `bytes32` | SHA-256 of the exact cover file bytes |
| `metadataHash` | `bytes32` | SHA-256 of the exact metadata file bytes |

All three hashes must be nonzero, represented as `0x` plus 64 hex digits. The hash algorithm is **SHA-256**, not Keccak-256, not a URL hash, and not the hash of a hex string. No contract-side hash calculation or network fetch is implied. Use one `hashlib.sha256(file_bytes).hexdigest()` / browser SHA-256 over the exact downloadable representation. HTTP transfer framing is not part of a file; a client decodes content encoding before hashing. Configure hosting to avoid dynamic image optimization or content rewriting. Do not hash a JSON object reserialized by a client: whitespace, key order, UTF-8 encoding, and trailing newlines change its hash. Commit the final file bytes.

The metadata contract is [metadata.schema.json](metadata.schema.json). Required cross-field checks beyond JSON Schema:

- `name` equals the issue's `title`.
- `image` equals `coverURL`.
- `external_url` and `properties.pdf_url` both equal `pdfURL`.
- `properties.issue_id` equals the next onchain ID, represented as a decimal string.
- `properties.collection_address` is the confirmed collection address, `chain_id` is 1, and the collection name/symbol match.
- `properties.editorial_timestamp` equals the decimal-string `editorialDate`; `editorial_date` is the matching UTC calendar date.
- `properties.pdf_sha256` and `cover_sha256` equal their input hashes.

The metadata identifies the issue and uses the cover as `image`. It links the publicly readable PDF independently of NFT ownership. Its description states that a copy gives no copyright or financial-return entitlement. The schema's decimal strings avoid JavaScript integer truncation; use `bigint` for onchain integers. The JSON deliberately does **not** contain its own hash or exact publication/closing timestamps: a self-hash is circular, and the publication timestamp is not known before the transaction. Obtain those timestamps from the contract.

For local hash inspection (paths are publisher-selected inputs, not files required by deployment):

```sh
sha256sum newspaper.pdf cover.png metadata.json
```

## Publisher workflow

1. Connect the fixed publisher wallet on Ethereum. Read `issueCount() + 1`. Serialize publication actions in the dashboard: another publication can consume this next ID before the pending one succeeds. Recheck immediately before submitting; coordinate all publisher sessions and queued transactions. The contract assigns the ID and cannot validate a JSON file's prediction.
2. Prepare the PDF and cover, choose permanent public paths, compute their hashes, and create the metadata conforming to the schema and cross-field checks. Upload all three finalized files. No transaction is needed for upload.
3. Fetch all three public URLs without cookies or authentication. Require successful responses, the correct media types, no expired signed links, matching final bytes/hashes, and matching metadata fields. The public URL must work for readers other than the publisher. Check the exact URL the contract will store, including any redirects. Serve metadata and assets with CORS suitable for browser verification.
4. Simulate `createIssue`, then send from the publisher with zero ETH value. Wait for a successful receipt and the `IssuePublished` event. The transaction's block timestamp is the start, regardless of upload time or edition date. Save the ID, receipt, and block hash. Require the event's ID to match metadata. If concurrent publication produced a mismatch, published fields cannot be edited: the UI must flag it rather than silently repoint the file.
5. Read `getIssue(id)` and `uri(id)` from the chain and compare every recorded field with the submitted values. Keep the served bytes unchanged forever. Publication creates no copies and collects no payment.

Canonical function signature:

```text
createIssue((string,uint256,string,string,string,bytes32,bytes32,bytes32))
```

The following are ethers v6-style integration examples for the **later application**; ethers is not a dependency of this Foundry project. `addresses` is populated only from the confirmed handoff. `provider`, wallet signers, final document values and ABI JSON are supplied by that application.

```js
const daily = new Contract(addresses.IMDDaily, dailyABI, publisherSigner);
if ((await provider.getNetwork()).chainId !== 1n) throw new Error("Wrong network");
if ((await publisherSigner.getAddress()).toLowerCase() !==
    "0x48e4e74fe1d0c14404ceb57b9fec5b21329c6ec9") throw new Error("Publisher required");

const content = {
  title,                         // verified metadata.name
  editorialDate: BigInt(editorialTimestamp),
  pdfURL, coverURL, metadataURI,  // public files verified in the preceding workflow
  pdfHash, coverHash, metadataHash
};
const predictedID = await daily.issueCount() + 1n;
await daily.createIssue.staticCall(content);
const publication = await daily.createIssue(content, {value: 0n});
const receipt = await publication.wait();
if (receipt.status !== 1) throw new Error("Publication reverted");
const published = receipt.logs
  .filter(log => log.address.toLowerCase() === addresses.IMDDaily.toLowerCase())
  .map(log => { try { return daily.interface.parseLog(log); } catch { return null; } })
  .find(log => log?.name === "IssuePublished");
if (!published || published.args.issueId !== predictedID) throw new Error("Issue ID mismatch");
const issue = await daily.getIssue(published.args.issueId);
// issue.content holds all eight input fields; issue.publishedAt and issue.closesAt are authoritative.
```

`editorialDate` is not validated as a real-world calendar date onchain. The dashboard should use UTC midnight and reject a date it cannot represent. The contract deliberately accepts past, future, duplicate, and zero editorial dates without changing mint eligibility. URLs and titles have no arbitrary length cap; oversized inputs can exceed gas limits. Preview transaction gas before signing.

## Collector approval and mint

Use `isAvailable(id)` or `issueStatus(id)` for presentation, then simulate the transaction. These are time-eligibility views, not guarantees of balance, allowance, receiver compatibility, or inclusion before expiry. Use the chain's latest block timestamp, not the browser clock. Transactions included at exactly `closesAt` revert, even if submitted earlier.

The caller pays for all copies and chooses the recipient. Only the caller's allowance can be spent. Approve the **collection address**, never the vault. Prefer exact approval amounts. ERC1155 `setApprovalForAll` authorizes NFT transfers; it does not authorize IMD payments. Token amounts and quantities use integers throughout.

```js
const daily = new Contract(addresses.IMDDaily, dailyABI, collectorSigner);
const imd = new Contract("0xD34a99Bc0f67aE1bbd63C660e6d0b0dd03E263B7", paymentABI, collectorSigner);
const quantity = BigInt(quantityInput);
if (quantity <= 0n) throw new Error("Positive quantity required");
const issue = await daily.getIssue(issueID);
const cost = await daily.quote(quantity); // checked quantity * 100000000000000000
const payer = await collectorSigner.getAddress();
if (await imd.balanceOf(payer) < cost) throw new Error("Insufficient IMD");
if (await imd.allowance(payer, addresses.IMDDaily) < cost) {
  const approval = await imd.approve(addresses.IMDDaily, cost);
  if ((await approval.wait()).status !== 1) throw new Error("Approval reverted");
}
const block = await provider.getBlock("latest");
const now = BigInt(block.timestamp);
if (now < issue.publishedAt || now >= issue.closesAt) throw new Error("Mint unavailable");
const shortDeadline = now + 600n;
const deadline = shortDeadline < issue.closesAt ? shortDeadline : issue.closesAt - 1n;
await daily.mint.staticCall(issueID, quantity, recipientAddress, deadline);
const purchase = await daily.mint(issueID, quantity, recipientAddress, deadline, {value: 0n});
if ((await purchase.wait()).status !== 1) throw new Error("Mint reverted");
```

Approval is a separate transaction; if the subsequent mint fails or expires, its previously approved allowance remains (the failed mint's attempted allowance spend is rolled back). The UI can offer `approve(collection, 0)` to revoke it. There is no permit, relayer, free-publisher mint, or owner allocation. A receiver contract must implement the standard ERC1155 acceptance hook. The mint callback data is empty. Repeated purchases are allowed until close; price never changes.

Canonical mint signature: `mint(uint256,uint256,address,uint256)`. `quote(quantity)` checks quantity and overflow but not issue availability. Typical mint errors are `UnknownIssue`, `MintClosed`, `ZeroQuantity`, `InvalidRecipient`, `DeadlineExpired`, `PaymentDecimalsMismatch`, `InvalidVault`, `InexactPayment`, ERC20 allowance/balance failures, and ERC1155 receiver errors. Decode the provided ABIs; do not label all failures "sold out" because editions have no supply cap.

## Withdraw and reconcile

```js
const vault = new Contract(addresses.IMDDailyVault, vaultABI, publisherSigner);
const amount = BigInt(amountBaseUnits); // positive; at most await vault.balance()
await vault.withdraw.staticCall(amount);
const withdrawal = await vault.withdraw(amount, {value: 0n});
if ((await withdrawal.wait()).status !== 1) throw new Error("Withdrawal reverted");
```

There is no destination argument. Only the fixed publisher can withdraw, and only to itself. Show the dashboard three separate values: `daily.totalCollected()`, `vault.totalWithdrawn()`, and `vault.balance()`. Withdrawal includes donated IMD and does not decrease `totalCollected`. The actual token balance can also be obtained with `IMD.balanceOf(vault)`. Never infer collected revenue from raw transfers, balance changes, or `balance + withdrawals` alone. Direct vault donations create ordinary IMD transfer events, not `CopiesMinted` events.

## Issue discovery and paginated indexing

Read `issueCount()` at a consistent block and page ID ranges `1..issueCount`, calling `getIssue(id)` / `issueStatus(id)` for each. There is intentionally no unbounded "get all" method. `issueExists` means publication exists; inherited ERC1155 `exists` means at least one copy exists. An unsold issue still has permanent metadata and can be discovered.

Index `IssuePublished` from the confirmed deployment block in bounded block ranges. Topic 1 is the issue ID, topic 2 the editorial timestamp. The event carries opening/closing timestamps, metadata URI, and all three hashes. Query `getIssue` for the immutable title/PDF/cover fields. `URI(string,uint256)` is also emitted once per publication.

Index `CopiesMinted` by issue, payer, or recipient; all three fields are indexed. Its nonindexed fields are quantity and paid IMD base units. Use standard `TransferSingle` and `TransferBatch` events for ownership changes and token creation. `CopiesMinted` precedes `TransferSingle` and receiver callbacks in a successful mint; a callback can immediately transfer its paid copies. Index only successful transactions. `Withdrawal` indexes the fixed publisher and carries amount plus the cumulative withdrawn value.

Persist `(chainId, contract, transactionHash, logIndex)` and block hashes, paginate by block/log position, and rewind orphaned logs on reorganization. Choose a confirmation/finality policy for the UI. The edition window follows the canonical publication block. A pending transaction and an unfinalized event do not guarantee permanent inclusion. Metadata cannot be edited by a reorganization handler; re-read canonical state.

## Hosting after deployment

Upload later; no hosting prerequisite exists in any constructor. Select a hostname the publisher can retain and use unique immutable paths per issue. Migration means switching the server/CDN origin or DNS while preserving that hostname, paths, and exact file bytes. TLS renewal, DNS/domain retention, backups, replication, and monitoring are the publisher's responsibilities. The contract cannot recover a lost domain or repair a broken URL. Do not use short-lived signed URLs or overwrite published files. Hashes detect changed content; they do not provide availability or storage.

