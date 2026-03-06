import click

@click.command()
def cli():
    """兼容命令：Astro 构建会自动生成网站地图"""
    try:
        click.echo("提示: `quark map` 已弃用。请使用 `quark build`，sitemap 会在 Astro 构建时自动生成。")
        click.echo("√ 无需单独生成 sitemap")
    except Exception as e:
        click.echo(f"生成网站地图失败: {e}", err=True)
