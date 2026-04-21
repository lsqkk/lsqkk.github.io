from __future__ import annotations

import re
import subprocess
from datetime import date
from pathlib import Path

import click

from ..utils import get_blog_root

DATE_HEADING_RE = re.compile(r"^#\s+(\d{4}-\d{2}-\d{2})\s*$")
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


def read_log_file(path: Path) -> tuple[str, list[tuple[str, str]]]:
    if not path.exists():
        return "", []

    content = path.read_text(encoding="utf-8")
    pattern = re.compile(r"(?m)^#\s+(\d{4}-\d{2}-\d{2})\s*$")
    matches = list(pattern.finditer(content))

    if not matches:
        return content, []

    header = content[: matches[0].start()]
    sections: list[tuple[str, str]] = []

    for index, match in enumerate(matches):
        section_start = match.start()
        section_end = matches[index + 1].start() if index + 1 < len(matches) else len(content)
        section_date = match.group(1)
        raw_section = content[section_start:section_end].rstrip()
        sections.append((section_date, raw_section))

    return header, sections


def latest_logged_date(sections: list[tuple[str, str]]) -> str | None:
    for log_date, _ in sections:
        return log_date
    return None


def normalize_commit_message(message: str) -> str | None:
    text = re.sub(r"\s+", " ", message.strip())
    if not text:
        return None

    lowered = text.lower()
    if lowered.startswith("merge ") or lowered.startswith("merge pull request"):
        return None

    formatted_match = FORMATTED_ENTRY_RE.match(text)
    if formatted_match:
        entry_type = formatted_match.group(1)
        detail = clean_detail(formatted_match.group(2))
        return f"{entry_type} - {detail}"

    prefix_match = PREFIX_SPLIT_RE.match(text)
    if prefix_match:
        raw_prefix = prefix_match.group("prefix").lower()
        entry_type = PREFIX_MAP.get(raw_prefix, "更新")
        detail = clean_detail(prefix_match.group("detail"))
        return f"{entry_type} - {detail}"

    return f"更新 - {clean_detail(text)}"


def clean_detail(detail: str) -> str:
    cleaned = re.sub(r"\s+", " ", detail.strip(" -_:："))
    return cleaned or DEFAULT_DETAIL


def fetch_git_commits(blog_root: Path, since_date: str, until_date: str) -> list[tuple[str, str]]:
    command = [
        "git",
        "log",
        f"--since={since_date} 00:00:00",
        f"--until={until_date} 23:59:59",
        "--pretty=format:%ad\t%s",
        "--date=short",
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

    commits: list[tuple[str, str]] = []
    for line in result.stdout.splitlines():
        if "\t" not in line:
            continue
        commit_date, subject = line.split("\t", 1)
        commits.append((commit_date.strip(), subject.strip()))
    return commits


def build_generated_sections(commits: list[tuple[str, str]]) -> list[tuple[str, list[str]]]:
    grouped: dict[str, list[str]] = {}
    seen: set[tuple[str, str]] = set()

    for commit_date, subject in commits:
        normalized = normalize_commit_message(subject)
        if not normalized:
            continue
        unique_key = (commit_date, normalized)
        if unique_key in seen:
            continue
        seen.add(unique_key)
        grouped.setdefault(commit_date, []).append(normalized)

    return [(commit_date, entries) for commit_date, entries in grouped.items() if entries]


def render_generated_sections(generated_sections: list[tuple[str, list[str]]]) -> list[tuple[str, str]]:
    rendered_sections: list[tuple[str, str]] = []
    for log_date, entries in generated_sections:
        if not entries:
            continue
        rendered_sections.append((log_date, f"# {log_date}\n\n" + "\n\n".join(entries)))
    return rendered_sections


def merge_sections(
    generated_sections: list[tuple[str, str]],
    existing_sections: list[tuple[str, str]],
) -> list[tuple[str, str]]:
    replaced_dates = {section_date for section_date, _ in generated_sections}
    merged = list(generated_sections)
    merged.extend(
        (section_date, raw_section)
        for section_date, raw_section in existing_sections
        if section_date not in replaced_dates
    )
    return merged


def render_log_markdown(header_text: str, sections: list[tuple[str, str]]) -> str:
    chunks: list[str] = []

    if header_text.strip():
        chunks.append(header_text.rstrip())

    for _, raw_section in sections:
        if not raw_section.strip():
            continue
        chunks.append(raw_section.rstrip())

    return "\n\n".join(chunk for chunk in chunks if chunk).rstrip() + "\n"


@click.command()
@click.option("--since", "since_date", help="起始日期，格式 YYYY-MM-DD；默认从 log.md 最新日期开始刷新。")
@click.option("--until", "until_date", help="截止日期，格式 YYYY-MM-DD；默认今天。")
@click.option("--dry-run", is_flag=True, help="仅预览，不写入 log.md。")
@click.option("--stdout", "print_stdout", is_flag=True, help="将合并后的 log.md 内容输出到终端。")
@click.option(
    "--log-file",
    default="assets/md/log.md",
    show_default=True,
    help="更新日志文件路径。",
)
def cli(since_date: str | None, until_date: str | None, dry_run: bool, print_stdout: bool, log_file: str):
    """
    根据 Git 提交记录更新 assets/md/log.md

    默认会读取现有 log.md 的最新日期，并从该日期开始重新生成，避免重复手工复制粘贴。
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

    rendered_generated_sections = render_generated_sections(generated_sections)
    merged_sections = merge_sections(rendered_generated_sections, existing_sections)
    rendered = render_log_markdown(header_text, merged_sections)

    click.echo(
        f"已整理 {len(generated_sections)} 个日期、"
        f"{sum(len(entries) for _, entries in generated_sections)} 条提交记录。"
    )
    click.echo(f"更新范围: {generated_sections[-1][0]} 至 {generated_sections[0][0]}")
    click.echo(f"目标文件: {log_path.relative_to(blog_root)}")

    if print_stdout:
        click.echo()
        click.echo(rendered.rstrip())

    if dry_run:
        click.echo("dry-run 模式：未写入文件。")
        return

    log_path.write_text(rendered, encoding="utf-8")
    click.echo("√ 更新日志已写入。")
