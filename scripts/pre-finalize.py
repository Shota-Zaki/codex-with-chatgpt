from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_COMMIT = "fa23243ab0f5b7c63c32f83f86c2de55dd42bd54"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


manifest_path = ROOT / "docs/rules/manifest.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
targets = ["docs/rules/manifest.json"]
targets.extend(manifest["rule_owners"].values())
targets.extend(entry["target"] for entry in manifest["support_files"])
files = {path: sha256(ROOT / path) for path in targets}
record = {
    "schema_version": 1,
    "rules_version": manifest["rules_version"],
    "source_repository": "Shota-Zaki/development-rules",
    "source_branch": "main",
    "source_commit": SOURCE_COMMIT,
    "synced_at": datetime.now(timezone(timedelta(hours=9))).isoformat(timespec="seconds"),
    "files": files,
}
source_path = ROOT / "docs/rules/RULES_SOURCE.md"
source_path.write_text(
    "# Rules Source\n\n```json\n"
    + json.dumps(record, ensure_ascii=False, indent=2)
    + "\n```\n",
    encoding="utf-8",
)

# The finalizer writes the Work Unit record. Add this incomplete-snapshot repair
# to that record only in the ephemeral workflow checkout; the finalizer itself
# is removed from the completed baseline.
finalizer_path = ROOT / "scripts/finalize-baseline.py"
text = finalizer_path.read_text(encoding="utf-8")
needle = '            {"kind": "resume", "paths": ["docs/project/AI_WORK_STATE.md"]},\n            {"kind": "verification",'
replacement = '            {"kind": "resume", "paths": ["docs/project/AI_WORK_STATE.md"]},\n            {"kind": "rules", "paths": ["docs/rules/RULES_SOURCE.md"]},\n            {"kind": "verification",'
if needle not in text:
    raise SystemExit("unable to patch finalizer Work Unit classification")
finalizer_path.write_text(text.replace(needle, replacement, 1), encoding="utf-8")

# Do not leave this helper in the final baseline.
Path(__file__).unlink(missing_ok=True)
