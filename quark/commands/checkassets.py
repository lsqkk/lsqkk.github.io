import click
from ..utils import run_python_script


@click.command()
def cli():
    """检查未被 HTML 引用的 CSS/JS 资源"""
    try:
        run_python_script('check_assets_usage.py')
        click.echo("√ 资源引用检查完成")
    except Exception as e:
        click.echo(f"资源引用检查失败: {e}", err=True)
