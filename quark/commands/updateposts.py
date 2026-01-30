import click
from ..utils import run_python_script

@click.command()
def cli():
    """更新博客文章"""
    try:
        run_python_script('generate_posts.py')
        click.echo("✅ 文章更新完成")
    except Exception as e:
        click.echo(f"更新文章失败: {e}", err=True)