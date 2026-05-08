import click
from quark.qqexport.core import run as run_export


@click.command()
def cli():
    """从 QQ 空间导出说说并更新 assets/md/dt.md"""
    try:
        run_export()
    except Exception as e:
        click.echo(f"QQ 空间导出失败: {e}", err=True)
