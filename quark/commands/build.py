import click
import subprocess
import shutil
from pathlib import Path
from ..utils import get_blog_root


def _export_artifact(blog_root: Path, artifact_dir: str) -> Path:
    dist_dir = blog_root / "dist"
    if not dist_dir.exists():
        raise FileNotFoundError("未找到 dist 目录，请先执行构建。")

    target = (blog_root / artifact_dir).resolve()
    if target == dist_dir.resolve():
        raise ValueError("artifact 导出目录不能是 dist。")
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(dist_dir, target)
    return target


def run_build_pipeline(mode: str, artifact_dir: str | None = None) -> Path | None:
    blog_root = Path(get_blog_root())
    cmd = "npm run build"
    click.echo(f"执行命令: {cmd}")
    subprocess.run(cmd, cwd=blog_root, check=True, shell=True)

    if mode == "artifact":
        export_dir = artifact_dir or ".quark-artifact"
        return _export_artifact(blog_root, export_dir)
    return None


@click.command()
@click.option(
    "--mode",
    type=click.Choice(["source", "artifact"], case_sensitive=False),
    default="source",
    show_default=True,
    help="构建模式：source 仅生成 dist，artifact 额外导出独立产物目录。",
)
@click.option(
    "--artifact-dir",
    default=".quark-artifact",
    show_default=True,
    help="artifact 模式导出目录（相对仓库根目录）。",
)
def cli(mode: str, artifact_dir: str):
    """构建站点（支持 source / artifact 双模式）"""
    try:
        mode = mode.lower()
        out_dir = run_build_pipeline(mode, artifact_dir)
        if mode == "artifact":
            click.echo(f"√ 构建完成（dist 已导出到 {out_dir}）")
        else:
            click.echo("√ 构建完成（已构建 Astro 到 dist）")
    except Exception as e:
        click.echo(f"构建失败: {e}", err=True)
