import click
from ..utils import run_python_script


@click.command()
@click.option(
    "--apply",
    is_flag=True,
    help="真正执行删除与覆盖（默认仅模拟，不修改文件）",
)
def cli(apply):
    """按 template/init 初始化仓库（默认 dry-run）"""
    try:
        args = ["--apply"] if apply else []
        run_python_script("init_from_template.py", *args)
        if apply:
            click.echo("√ 初始化已执行")
        else:
            click.echo("√ 初始化模拟完成（未修改文件）")
    except Exception as e:
        click.echo(f"初始化失败: {e}", err=True)
