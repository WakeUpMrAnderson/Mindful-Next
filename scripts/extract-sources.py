#!/usr/bin/env python3
"""Recover the original sources of m.js from its webpack-1 source map.

Reads legacy/m.js.map (all 387 sources carry complete sourcesContent) and
writes them into src/ with sanitized paths:

    webpack:///src/**                -> src/src/**
    webpack:///mindful/**            -> src/mindful/**
    webpack:///index.js              -> src/index.js
    webpack:///./~/<pkg>/**          -> src/vendor/<pkg>/**
    webpack:///(webpack)/buildin/**  -> src/vendor/webpack/buildin/**
    webpack:///webpack/bootstrap*    -> src/vendor/webpack/bootstrap.js

Relative './...' asset sources (scss/font loader modules) map by stripping
the leading './' and any '?<loaderhash>' query. Trailing '//' WEBPACK FOOTER
blocks are stripped. A MANIFEST.json records every mapping; duplicate
collisions are allowed only when content is byte-identical.
"""
import hashlib
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
MAP_PATH = REPO / "legacy" / "m.js.map"
OUT_DIR = REPO / "src"

FOOTER_MARK = "// WEBPACK FOOTER //"


def strip_footer(text):
    idx = text.rfind(FOOTER_MARK)
    if idx == -1:
        return text
    # Footer lives in a short tail; if the match sits deeper, leave the file alone.
    if len(text) - idx > 400:
        return text
    return text[:idx].rstrip() + "\n"


def classify(source):
    """Map a webpack source name to a repo-relative output path."""
    assert source.startswith("webpack:///"), f"unexpected source: {source!r}"
    p = source[len("webpack:///"):]
    base = p.partition("?")[0]

    if base == "index.js":
        return "index.js"
    if p.startswith("webpack/bootstrap"):
        return "vendor/webpack/bootstrap.js"
    if p.startswith("(webpack)/buildin/"):
        return "vendor/webpack/buildin/" + p[len("(webpack)/buildin/"):]
    if base.startswith("./~/"):
        return "vendor/" + base[len("./~/"):]
    if base.startswith("~/"):
        return "vendor/" + base[len("~/"):]
    if base.startswith("./"):
        return base[len("./"):]
    if base.startswith(("src/", "mindful/")):
        return base
    return None


def main():
    data = json.loads(MAP_PATH.read_text(encoding="utf-8"))
    sources = data["sources"]
    contents = data["sourcesContent"]
    assert len(sources) == len(contents), "sources/sourcesContent length mismatch"

    OUT_DIR.mkdir(exist_ok=True)

    # out_path -> {content, sha1, bytes, origins: [source names]}
    written = {}
    duplicates = []
    unresolved = []

    for src, content in zip(sources, contents):
        rel = classify(src)
        if rel is None:
            unresolved.append(src)
            continue
        assert "\\.\\/" not in rel and ".." not in Path(rel).parts, f"unsafe path: {rel}"
        entry = {
            "content": strip_footer(content),
            "origins": [src],
            "queried": "?" in src,
        }
        if rel in written:
            prev = written[rel]
            if prev["content"] == entry["content"]:
                prev["origins"].append(src)
                duplicates.append({"output": rel, "origins": prev["origins"]})
                continue
            # Prefer the non-query variant on a content mismatch; keep full origin log.
            if prev["queried"] and not entry["queried"]:
                duplicates.append({"output": rel, "replaced_content_from": src, "previous_origins": list(prev["origins"])})
                prev["content"], prev["queried"] = entry["content"], False
                prev["origins"].append(src)
            else:
                print(f"CONFLICT at {rel}: keeping first, other source {src!r} differs "
                      f"({len(prev['content'])} vs {len(entry['content'])} bytes)", file=sys.stderr)
                duplicates.append({"output": rel, "conflict_dropped": src})
            continue
        written[rel] = entry

    assert not unresolved, f"unclassified sources: {unresolved}"
    n_origins = sum(len(e["origins"]) for e in written.values())
    assert n_origins == len(sources), f"accounting: {n_origins} != {len(sources)}"

    manifest_files = []
    for rel, entry in sorted(written.items()):
        out_path = OUT_DIR / rel
        out_path.parent.mkdir(parents=True, exist_ok=True)
        data_bytes = entry["content"].encode("utf-8")
        out_path.write_bytes(data_bytes)
        manifest_files.append({
            "output": rel,
            "origins": entry["origins"],
            "bytes": len(data_bytes),
            "sha1": hashlib.sha1(data_bytes).hexdigest(),
        })

    manifest = {
        "generated_from": "m.js.map",
        "map_sources": len(sources),
        "files_written": len(manifest_files),
        "duplicates": duplicates,
        "files": manifest_files,
    }
    (OUT_DIR / "MANIFEST.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    print(f"map sources: {len(sources)}")
    print(f"files written: {len(manifest_files)}")
    print(f"duplicate/collision entries: {len(duplicates)}")
    total = sum(f["bytes"] for f in manifest_files)
    print(f"total bytes: {total:,}")
    js = sum(1 for f in manifest_files if f["output"].endswith(".js"))
    print(f"of which .js: {js}")


if __name__ == "__main__":
    main()
