import click
import subprocess
from pathlib import Path
from ..utils import get_blog_root


def run_build_pipeline() -> None:
    blog_root = Path(get_blog_root())
    commands = [
        "npm run gen:posts-json",
        "npm run build",
        "npm run publish:astro-posts",
    ]

    for cmd in commands:
        click.echo(f"执行命令: {cmd}")
        subprocess.run(cmd, cwd=blog_root, check=True, shell=True)


@click.command()
def cli():
    """构建站点（生成 posts.json + Astro build + 发布到根目录）"""
    try:
        run_build_pipeline()
        click.echo("√ 构建完成（已生成 posts.json、构建 Astro 并发布到根目录）")
    except Exception as e:
        click.echo(f"构建失败: {e}", err=True)
