# IMD launch handoff

This deliverable is ready for the network's manifest and independent-review stages. It is **not an Ethereum mainnet deployment**. No factory was called, transaction signed, funded test purchase made, or issue published on mainnet. No GitHub repository was pushed and no source verification request was submitted. The worker does not have confirmed application addresses or a final committed source revision. This repository's `.git` and `.github` are outside the permitted editing scope.

The task's launch workflow supplies deployment execution after acceptance. The remaining release blockers are the accepted-source commit/publication, supported manifest, independent contributor review, factory deployment, and Etherscan verification. They are explicitly pending in [release-status.json](../evidence/release-status.json), not represented by guessed addresses or simulated receipts. No requester key, domain, sample file, or first issue is required for this handoff.

## Manifest inputs and dependency order

Only the subsequent manifest assignment writes `launch.json`. This project deliberately contains none. Its supported `evm_contracts` entries must use this order:

| Order | Solidity contract | Constructor | Manifest arguments |
| --- | --- | --- | --- |
| 1 | `IMDDailyVault` | `constructor()` | Empty array |
| 2 | `IMDDaily` | `constructor(address vault_)` | One address word, `$contract:IMDDailyVault` |

Use chain ID `1`. Both contracts hardcode the requested publisher and existing IMD token; there is no `$owner` argument to populate, no dynamic constructor argument, and no post-deployment transaction. Do not deploy `DailyAuthority` (abstract), `FactoryRehearsal`, `MockIMD`, `Receiver`, or other tests. Neither application creates another contract. No ETH accompanies deployment.

The constructor does not call IMD or the vault, query balances/decimals, or require dependency code. The collection validates the configured vault's authority/token getters and IMD decimals on mint. This permits the protected empty-chain construction check while retaining fail-closed behavior at use. Those getters are sanity checks, not proof of a vault's bytecode: the manifest/reviewer must reference the actual reviewed `IMDDailyVault` deployment.

The real CREATE2 factory rehearsal in `test/Deployment.t.sol` deploys both from initcode in one call, checks the fixed authority and dependency, rehearses size limits, and scans reachable runtime instructions for prohibited opcodes. The launch's protected harness is still the independent authority; this rehearsal is local evidence only. The supplied owner wrapper imports an additional network-owned floor file, so it is not copied into this deliverable.

## Reproducible build

```sh
forge build --sizes
forge test
forge fmt --check
python3 scripts/export_artifacts.py
```

Use Solidity `0.8.26`, optimizer 200, Cancun, `bytecode_hash = "none"`, no via-IR. Vendored dependency sources and their MIT/Apache licenses are ordinary repository files. No network installation is needed for the verifier that already carries the pinned compiler. `dependencies.json` records upstream archive versions and SHA-256 hashes.

`evidence/build.json` records exact creation/runtime-template byte sizes and hashes, source hashes, compiler settings, and immutable-reference offsets. The collection's constructor argument adds 32 bytes to its initcode. The runtime template hash is **not** a hash of a deployed collection: its vault immutable must first be populated. `scripts/export_artifacts.py` regenerates the evidence from compiled artifacts and checks that no link references or size violations remain.

The source file hashes identify the built files without claiming a Git commit. The acceptance/publication stage must commit the final project, including dependencies, record its real commit SHA and GitHub URL, and freeze the reviewed revision before attestation. Never substitute an initial repository commit or an artifact digest for the final source commit.

## Mainnet facts already checked

At finalized Ethereum block `26239078`, hash
`0x2eb384e699e4f5f36c43251ce418a7984392eee8c7a73d5dffbdfcefaeeeadd2`,
IMD `decimals()` returned 18, `symbol()` returned `IMD`, and `name()` returned `Identity.md`.
The existing token had 22,990 runtime bytes. Exact raw results and code are in
[imd-mainnet.json](../evidence/imd-mainnet.json). These are read-only observations of the existing payment token, not deployment receipts for this project.

The fork suite runs against that block and changes only local fork balances, timestamp, and test actor code where an adversarial callback requires it. It does not mint live IMD or purchase live collectibles. Recheck live IMD decimals and runtime compatibility during the launch simulation.

## Evidence required to complete release

The deployment service must append the actual factory transaction receipt(s), transaction hash(es), confirmed deployment block and block hash, named application addresses, and constructor arguments. Confirm chain ID 1, receipt status 1, deployed code, the vault reference, fixed publisher/token/price, and zero `issueCount`, `totalSupply`, `totalCollected`, and `totalWithdrawn` immediately after deployment. A balance may include independently sent donations; a zero issue count and zero collection supply are mandatory. Do not create an issue or make a paid test mint on mainnet.

Verify both contracts on Etherscan from the accepted source revision, with the exact compiler/settings and constructor arguments. No proxy verification is involved. In a release environment whose addresses are populated from confirmed receipts, the verification commands have this form:

```sh
forge verify-contract "$VAULT_ADDRESS" src/IMDDailyVault.sol:IMDDailyVault \
  --chain 1 --compiler-version v0.8.26+commit.8a97fa7a --watch

forge verify-contract "$COLLECTION_ADDRESS" src/IMDDaily.sol:IMDDaily \
  --chain 1 --compiler-version v0.8.26+commit.8a97fa7a \
  --constructor-args "$(cast abi-encode 'constructor(address)' "$VAULT_ADDRESS")" --watch
```

The release service supplies its explorer authentication through its own supported mechanism. It must not change the compiler configuration to make verification pass. Save the resulting verified `https://etherscan.io/address/<confirmed-address>#code` links and source-publication URL with the receipt evidence, then replace the pending release status with real values. A successfully uploaded source file alone is neither a deployed contract nor successful explorer verification.

## After launch

There are no configuration setters. No initialization or handover call is required. The publisher may later upload files and publish the first issue from the specified wallet using the integration guide. Keep this launch independent of UNLOCK and any website work. Durable hosting and the future dashboard remain separate operational responsibilities.

