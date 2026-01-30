import click
from ..utils import run_python_script

@click.command()
def cli():
    """生成网站地图"""
    try:
        run_python_script('sitemap.py')
        click.echo("✅ 网站地图生成完成")
    except Exception as e:
        click.echo(f"生成网站地图失败: {e}", err=True)