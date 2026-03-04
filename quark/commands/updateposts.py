import click
import subprocess
from pathlib import Path
from ..utils import get_blog_root

@click.command()
def cli():
    """更新博客文章"""
    try:
        blog_root = Path(get_blog_root())
        commands = [
            "npm run gen:posts-json",
            "npm run build",
            "npm run publish:astro-posts",
        ]

        for cmd in commands:
            click.echo(f"执行命令: {cmd}")
            subprocess.run(cmd, cwd=blog_root, check=True, shell=True)

        click.echo("√ 文章更新完成（已生成 posts.json、执行 Astro build 并发布到根目录 posts）")
    except Exception as e:
        click.echo(f"更新文章失败: {e}", err=True)
