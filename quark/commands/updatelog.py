from __future__ import annotations

import json
import re
import subprocess
from datetime import date
from pathlib import Path

import click

from ..utils import get_blog_root

GITHUB_REPO = "https://github.com/lsqkk/lsqkk.github.io"

FORMATTED_ENTRY_RE = re.compile(r"^(新增|更新|优化|修复)\s*-\s*(.+)$")
PREFIX_SPLIT_RE = re.compile(
    r"^(?P<prefix>新增|更新|优化|修复|add|feat|feature|new|update|upgrade|bump|opt|optimize|optimization|improve|perf|refactor|fix|bugfix|hotfix|docs?)"
    r"(?:\s*[-_:：]\s*|\s+)?(?P<detail>.*)$",
    re.IGNORECASE,
)

PREFIX_MAP = {
    "新增": "新增",
    "add": "新增",
    "feat": "新增",
    "feature": "新增",
    "new": "新增",
    "更新": "更新",
    "update": "更新",
    "upgrade": "更新",
    "bump": "更新",
    "doc": "更新",
    "docs": "更新",
    "优化": "优化",
    "opt": "优化",
    "optimize": "优化",
    "optimization": "优化",
    "improve": "优化",
    "perf": "优化",
    "refactor": "优化",
    "修复": "修复",
    "fix": "修复",
    "bugfix": "修复",
    "hotfix": "修复",
}

DEFAULT_DETAIL = "未补充说明"

LOG_HEADER_TITLE = "更新日志说明"
LOG_HEADER_CONTENT = (
    "基于仓库 `commits` 记录整理，部分更新可能不及时。\n\n"
    "查看完整仓库 `commits` 记录，请前往"
    f"[博客仓库]({GITHUB_REPO})"
)


def read_log_file(path: Path) -> tuple[str, list[tuple[str, list[dict]]]]:
    """
    读取 log.json，返回 (header_text, [(date, structured_entries), ...])。

    structured_entries = [{ type, description, commit }, ...]
    header_text 是标题为"更新日志说明"的节的内容。
    """
    if not path.exists():
        return "", []

    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    header_text = ""
    sections: list[tuple[str, list[dict]]] = []

    for item in data:
        title = item.get("title", "")
        if item.get("entries"):
            # New format: { date, entries: [{type, description, commit}] }
            date_str = item.get("date", "")
            if re.match(r"^\d{4}-\d{2}-\d{2}$", date_str):
                sections.append((date_str, item["entries"]))
        elif re.match(r"^\d{4}-\d{2}-\d{2}$", title):
            # Old format: { title: date, content: raw_text } → parse entries from text
            entries = _parse_entries_from_text(item.get("content", ""))
            if entries:
                sections.append((title, entries))
        elif not header_text:
            header_text = item.get("content", "")

    return header_text, sections


def _parse_entries_from_text(text: str) -> list[dict]:
    """Parse structured entries from raw text like 'type - desc [`hash`](url)'."""
    entries = []
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue
        entry_match = re.match(r"^([一-龥A-Za-z]+)\s*-\s*(.+)$", line)
        if not entry_match:
            continue
        entry_type = entry_match.group(1).strip()
        detail = entry_match.group(2).strip()
        # Extract trailing commit hash
        hash_match = re.search(r"\[`([a-f0-9]{6})`\]\([^)]+\)\s*$", detail)
        commit = hash_match.group(1) if hash_match else ""
        if hash_match:
            detail = detail[: hash_match.start()].strip()
        entries.append({"type": entry_type, "description": detail, "commit": commit})
    return entries


def latest_logged_date(sections: list[tuple[str, list[dict]]]) -> str | None:
    for log_date, _ in sections:
        return log_date
    return None


def _normalize_commit(message: str) -> tuple[str, str] | None:
    """
    Normalize a commit message to (type, description) pair.
    Returns None if the message should be skipped (e.g. merge commits).
    """
    text = re.sub(r"\s+", " ", message.strip())
    if not text:
        return None

    lowered = text.lower()
    if lowered.startswith("merge ") or lowered.startswith("merge pull request"):
        return None

    formatted_match = FORMATTED_ENTRY_RE.match(text)
    if formatted_match:
        entry_type = formatted_match.group(1)
        detail = _clean_detail(formatted_match.group(2))
        return (entry_type, detail)

    prefix_match = PREFIX_SPLIT_RE.match(text)
    if prefix_match:
        raw_prefix = prefix_match.group("prefix").lower()
        entry_type = PREFIX_MAP.get(raw_prefix, "更新")
        detail = _clean_detail(prefix_match.group("detail"))
        return (entry_type, detail)

    return ("更新", _clean_detail(text))


def _clean_detail(detail: str) -> str:
    cleaned = re.sub(r"\s+", " ", detail.strip(" -_:："))
    return cleaned or DEFAULT_DETAIL


def fetch_git_commits(blog_root: Path, since_date: str, until_date: str) -> list[tuple[str, str, str]]:
    command = [
        "git",
        "log",
        f"--since={since_date} 00:00:00",
        f"--until={until_date} 23:59:59",
        "--pretty=format:%h\t%ad\t%s",
        "--date=short",
        "--abbrev=6",
    ]
    result = subprocess.run(
        command,
        cwd=blog_root,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )

    if result.returncode != 0:
        raise click.ClickException(result.stderr.strip() or "git log 执行失败")

    commits: list[tuple[str, str, str]] = []
    for line in result.stdout.splitlines():
        parts = line.split("\t", 2)
        if len(parts) < 3:
            continue
        commit_hash, commit_date, subject = parts
        commits.append((commit_hash.strip(), commit_date.strip(), subject.strip()))
    return commits


def build_generated_sections(commits: list[tuple[str, str, str]]) -> list[tuple[str, list[dict]]]:
    """Build structured entries grouped by date: [(date, [{type, description, commit}])]"""
    grouped: dict[str, list[dict]] = {}
    seen: set[tuple[str, str]] = set()

    for commit_hash, commit_date, subject in commits:
        normalized = _normalize_commit(subject)
        if not normalized:
            continue
        entry_type, description = normalized
        unique_key = (commit_date, commit_hash)
        if unique_key in seen:
            continue
        seen.add(unique_key)
        grouped.setdefault(commit_date, []).append(
            {"type": entry_type, "description": description, "commit": commit_hash}
        )

    return [(date_str, entries) for date_str, entries in grouped.items() if entries]


def merge_sections(
    generated: list[tuple[str, list[dict]]],
    existing: list[tuple[str, list[dict]]],
) -> list[tuple[str, list[dict]]]:
    replaced_dates = {date_str for date_str, _ in generated}
    merged = list(generated)
    merged.extend(
        (date_str, entries)
        for date_str, entries in existing
        if date_str not in replaced_dates
    )
    return merged


def write_log_json(path: Path, header_text: str, sections: list[tuple[str, list[dict]]]) -> None:
    """Write log data to log.json: [{title,content}, ...] + [{date, entries}, ...]"""
    data: list[dict] = []

    stored_header = header_text.strip() or LOG_HEADER_CONTENT
    data.append({"title": LOG_HEADER_TITLE, "content": stored_header})

    for log_date, entries in sections:
        if not entries:
            continue
        data.append({"date": log_date, "entries": entries})

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


@click.command()
@click.option("--since", "since_date", help="起始日期，格式 YYYY-MM-DD；默认从 log.json 最新日期开始刷新。")
@click.option("--until", "until_date", help="截止日期，格式 YYYY-MM-DD；默认今天。")
@click.option("--dry-run", is_flag=True, help="仅预览，不写入 log.json。")
@click.option("--stdout", "print_stdout", is_flag=True, help="将合并后的 log 内容以 JSON 形式输出到终端。")
@click.option(
    "--log-file",
    default="assets/data/log.json",
    show_default=True,
    help="更新日志 JSON 文件路径。",
)
def cli(since_date: str | None, until_date: str | None, dry_run: bool, print_stdout: bool, log_file: str):
    """
    根据 Git 提交记录更新 assets/data/log.json

    默认会读取现有 log.json 的最新日期，并从该日期开始重新生成，避免重复。
    """

    blog_root = Path(get_blog_root())
    log_path = (blog_root / log_file).resolve()
    header_text, existing_sections = read_log_file(log_path)

    final_until = until_date or date.today().isoformat()
    final_since = since_date or latest_logged_date(existing_sections) or final_until

    commits = fetch_git_commits(blog_root, final_since, final_until)
    generated_sections = build_generated_sections(commits)

    if not generated_sections:
        click.echo(f"没有找到 {final_since} 到 {final_until} 之间可写入日志的新提交。")
        return

    merged_sections = merge_sections(generated_sections, existing_sections)

    click.echo(
        f"已整理 {len(generated_sections)} 个日期、"
        f"{sum(len(entries) for _, entries in generated_sections)} 条提交记录。"
    )
    click.echo(f"更新范围: {generated_sections[-1][0]} 至 {generated_sections[0][0]}")
    click.echo(f"目标文件: {log_path.relative_to(blog_root)}")

    if print_stdout:
        output_data = []
        output_data.append({"title": LOG_HEADER_TITLE, "content": header_text.strip() or LOG_HEADER_CONTENT})
        for log_date, entries in merged_sections:
            output_data.append({"date": log_date, "entries": entries})
        click.echo(json.dumps(output_data, ensure_ascii=False, indent=2))

    if dry_run:
        click.echo("dry-run 模式：未写入文件。")
        return

    write_log_json(log_path, header_text, merged_sections)
    click.echo("√ 更新日志已写入。")
