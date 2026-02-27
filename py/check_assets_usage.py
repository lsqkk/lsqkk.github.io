#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path


CSS_ATTR_RE = re.compile(r'<link\b[^>]*\bhref=["\']([^"\']+)["\']', re.IGNORECASE)
JS_ATTR_RE = re.compile(r'<script\b[^>]*\bsrc=["\']([^"\']+)["\']', re.IGNORECASE)


def is_external_url(raw: str) -> bool:
    lower = raw.lower()
    return (
        "://" in lower
        or lower.startswith("//")
        or lower.startswith("data:")
        or lower.startswith("javascript:")
        or lower.startswith("mailto:")
    )


def normalize_asset_ref(html_file: Path, raw_ref: str, root: Path) -> Path | None:
    cleaned = raw_ref.split("?", 1)[0].split("#", 1)[0].strip()
    if not cleaned or is_external_url(cleaned):
        return None

    if cleaned.startswith("/"):
        return (root / cleaned.lstrip("/")).resolve()
    return (html_file.parent / cleaned).resolve()


def collect_html_refs(root: Path) -> tuple[set[Path], set[Path]]:
    css_refs: set[Path] = set()
    js_refs: set[Path] = set()

    for html_file in root.rglob("*.html"):
        try:
            content = html_file.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            content = html_file.read_text(encoding="utf-8", errors="ignore")

        for raw in CSS_ATTR_RE.findall(content):
            ref = normalize_asset_ref(html_file, raw, root)
            if ref is not None:
                css_refs.add(ref)

        for raw in JS_ATTR_RE.findall(content):
            ref = normalize_asset_ref(html_file, raw, root)
            if ref is not None:
                js_refs.add(ref)

    return css_refs, js_refs


def find_usage(asset_dir: Path, refs: set[Path], suffix: str) -> tuple[list[Path], list[Path]]:
    files = sorted([p.resolve() for p in asset_dir.glob(f"*{suffix}") if p.is_file()])
    used: list[Path] = []
    unused: list[Path] = []

    for file_path in files:
        if file_path in refs:
            used.append(file_path)
        else:
            unused.append(file_path)

    return used, unused


def print_result(kind: str, used: list[Path], unused: list[Path], root: Path) -> None:
    total = len(used) + len(unused)
    print(f"[{kind}] total={total}, used={len(used)}, unused={len(unused)}")
    if unused:
        print(f"Unused {kind} files:")
        for p in unused:
            print(f"  - {p.relative_to(root).as_posix()}")
    else:
        print(f"No unused {kind} files found.")
    print()


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    css_dir = root / "assets" / "css"
    js_dir = root / "assets" / "js"

    if not css_dir.exists():
        print(f"Missing directory: {css_dir}")
        return 1
    if not js_dir.exists():
        print(f"Missing directory: {js_dir}")
        return 1

    css_refs, js_refs = collect_html_refs(root)

    css_used, css_unused = find_usage(css_dir, css_refs, ".css")
    js_used, js_unused = find_usage(js_dir, js_refs, ".js")

    print_result("CSS", css_used, css_unused, root)
    print_result("JS", js_used, js_unused, root)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
