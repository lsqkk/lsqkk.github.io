import click
import subprocess
from pathlib import Path
from ..utils import get_blog_root


def run_build_pipeline(mode: str) -> None:
    blog_root = Path(get_blog_root())
    commands = [
        "npm run build",
    ]
    if mode == "artifact":
        commands.append("npm run publish:astro-posts")

    for cmd in commands:
        click.echo(f"执行命令: {cmd}")
        subprocess.run(cmd, cwd=blog_root, check=True, shell=True)


@click.command()
@click.option(
    "--mode",
    type=click.Choice(["source", "artifact"], case_sensitive=False),
    default="artifact",
    show_default=True,
    help="构建模式：source 仅生成 dist，artifact 额外发布到根目录。",
)
def cli(mode: str):
    """构建站点（支持 source / artifact 双模式）"""
    try:
        mode = mode.lower()
        run_build_pipeline(mode)
        if mode == "artifact":
            click.echo("√ 构建完成（已构建 Astro 并发布到根目录）")
        else:
            click.echo("√ 构建完成（已构建 Astro 到 dist）")
    except Exception as e:
        click.echo(f"构建失败: {e}", err=True)
