#!/usr/bin/env python3
"""Export ABI and reproducibility evidence after forge build. No network, signing, or secrets."""

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write_json(relative, value):
    destination = ROOT / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(value, indent=2) + "\n")


def main():
    contracts = {}
    sources = {}
    for name in ("IMDDailyVault", "IMDDaily"):
        artifact = json.loads((ROOT / "out" / (name + ".sol") / (name + ".json")).read_text())
        metadata = artifact["metadata"]
        if isinstance(metadata, str):
            metadata = json.loads(metadata)
        assert metadata["compiler"]["version"].startswith("0.8.26+"), "Wrong compiler"
        settings = metadata["settings"]
        assert settings["optimizer"] == {"enabled": True, "runs": 200}, "Wrong optimizer settings"
        assert settings["evmVersion"] == "cancun", "Wrong EVM version"
        assert settings["metadata"]["bytecodeHash"] == "none", "Wrong metadata setting"
        assert not settings.get("viaIR", False), "Unexpected viaIR"
        creation = artifact["bytecode"]
        runtime = artifact["deployedBytecode"]
        assert not creation.get("linkReferences"), "Unlinked creation code"
        assert not runtime.get("linkReferences"), "Unlinked runtime code"
        creation_bytes = bytes.fromhex(creation["object"].removeprefix("0x"))
        runtime_bytes = bytes.fromhex(runtime["object"].removeprefix("0x"))
        argument_bytes = 32 if name == "IMDDaily" else 0
        assert len(runtime_bytes) <= 24576, "EIP-170 limit"
        assert len(creation_bytes) + argument_bytes <= 49152, "Initcode limit"
        abi = artifact["abi"]
        write_json("abi/" + name + ".json", abi)
        contracts[name] = {
            "compiler": metadata["compiler"]["version"],
            "settings": settings,
            "creation_bytes_excluding_arguments": len(creation_bytes),
            "constructor_argument_bytes": argument_bytes,
            "runtime_bytes": len(runtime_bytes),
            "creation_template_sha256": digest(creation_bytes),
            "runtime_template_sha256": digest(runtime_bytes),
            "immutable_references": runtime.get("immutableReferences", {}),
            "abi_sha256": digest((ROOT / "abi" / (name + ".json")).read_bytes()),
        }
        for source in metadata["sources"]:
            # Source names are repository-relative compiler inputs.
            path = (ROOT / source).resolve()
            assert path.is_relative_to(ROOT), "Source outside repository"
            sources[source] = digest(path.read_bytes())
    for source in ("foundry.toml", "remappings.txt", "dependencies.json"):
        sources[source] = digest((ROOT / source).read_bytes())
    payment_abi = json.loads((ROOT / "out/IERC20Metadata.sol/IERC20Metadata.json").read_text())["abi"]
    write_json("abi/IMD-payment.json", payment_abi)
    write_json("evidence/build.json", {
        "hash_algorithm": "sha256",
        "note": "Compiled templates, not deployment evidence. The collection runtime has a vault immutable.",
        "contracts": contracts,
        "source_sha256": dict(sorted(sources.items())),
    })
    print("Exported three ABIs and evidence/build.json; no deployment performed.")


if __name__ == "__main__":
    main()

