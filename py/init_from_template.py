#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
from pathlib import Path


def is_within_root(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def read_delete_list(delete_file: Path) -> list[str]:
    if not delete_file.exists():
        return []

    lines: list[str] = []
    for raw in delete_file.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        lines.append(line)
    return lines


def delete_targets(root: Path, delete_entries: list[str], apply_changes: bool) -> tuple[int, int]:
    deleted_count = 0
    skipped_count = 0

    for rel in delete_entries:
        target = (root / rel).resolve()
        if not is_within_root(target, root):
            print(f"[SKIP] 路径越界，已忽略: {rel}")
            skipped_count += 1
            continue

        if not target.exists():
            print(f"[SKIP] 不存在: {rel}")
            skipped_count += 1
            continue

        if target.is_dir():
            print(f"[DELETE-DIR] {rel}")
            if apply_changes:
                shutil.rmtree(target)
            deleted_count += 1
            continue

        print(f"[DELETE-FILE] {rel}")
        if apply_changes:
            target.unlink()
        deleted_count += 1

    return deleted_count, skipped_count


def copy_template_files(root: Path, template_init_dir: Path, apply_changes: bool) -> tuple[int, int]:
    copied_count = 0
    dir_prepared_count = 0

    for src in sorted(template_init_dir.rglob("*")):
        if src.name == "delete.txt":
            continue

        rel = src.relative_to(template_init_dir)
        dst = (root / rel).resolve()

        if not is_within_root(dst, root):
            print(f"[SKIP] 目标路径越界，已忽略: {rel.as_posix()}")
            continue

        if src.is_dir():
            print(f"[ENSURE-DIR] {rel.as_posix()}")
            if apply_changes:
                if dst.exists() and dst.is_file():
                    dst.unlink()
                dst.mkdir(parents=True, exist_ok=True)
            dir_prepared_count += 1
            continue

        if src.is_file():
            print(f"[COPY-FILE] {rel.as_posix()} -> {rel.as_posix()}")
            if apply_changes:
                if dst.exists() and dst.is_dir():
                    shutil.rmtree(dst)
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dst)
            copied_count += 1

    return copied_count, dir_prepared_count


def main() -> int:
    parser = argparse.ArgumentParser(
        description="根据 template/init 初始化仓库内容（默认仅模拟，不执行写入）"
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="真正执行删除/复制操作（默认仅模拟）",
    )
    args = parser.parse_args()

    root = Path(__file__).resolve().parent.parent
    template_init_dir = root / "template" / "init"
    delete_file = template_init_dir / "delete.txt"

    if not template_init_dir.exists():
        print(f"错误: 初始化模板目录不存在: {template_init_dir}")
        return 1

    apply_changes = args.apply
    mode = "APPLY" if apply_changes else "DRY-RUN"
    print(f"模式: {mode}")
    print(f"模板目录: {template_init_dir.relative_to(root).as_posix()}")
    print()

    delete_entries = read_delete_list(delete_file)
    print(f"将处理 delete 列表，共 {len(delete_entries)} 项")
    deleted_count, skipped_count = delete_targets(root, delete_entries, apply_changes)
    print()

    print("将覆盖/创建 template/init 中的文件到仓库根目录")
    copied_count, dir_prepared_count = copy_template_files(root, template_init_dir, apply_changes)
    print()

    print("结果统计:")
    print(f"- 删除项: {deleted_count}")
    print(f"- 删除跳过项: {skipped_count}")
    print(f"- 复制文件项: {copied_count}")
    print(f"- 准备目录项: {dir_prepared_count}")
    if not apply_changes:
        print("提示: 当前为模拟模式，未实际修改文件。使用 --apply 才会执行。")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
