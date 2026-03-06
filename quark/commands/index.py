import click
from .build import run_build_pipeline


@click.command()
def cli():
    """兼容命令：请改用 quark build"""
    try:
        click.echo("提示: `quark index` 已并入 `quark build`，正在执行构建流程...")
        run_build_pipeline("source")
        click.echo("√ 构建完成")
    except Exception as e:
        click.echo(f"更新失败: {e}", err=True)
