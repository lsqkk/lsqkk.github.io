import click
from ..utils import run_python_script

@click.command()
def cli():
    """更新博客主页组成"""
    try:
        run_python_script('generate_index.py')
        click.echo("√ 主页更新完成")
    except Exception as e:
        click.echo(f"更新失败: {e}", err=True)