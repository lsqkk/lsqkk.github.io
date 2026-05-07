import click
from .config import cli as config_cli


@click.command()
@click.option('--port', '-p', default=5050, help='服务器端口 (默认: 5050)')
@click.option('--no-browser', '-n', is_flag=True, help='不自动打开浏览器')
@click.option('--host', '-h', default='127.0.0.1', help='服务器主机 (默认: 127.0.0.1)')
@click.option('--debug', '-d', is_flag=True, help='调试模式')
def cli(port, no_browser, host, debug):
    """启动 Quark 管理面板 Web UI"""
    config_cli.callback(port=port, no_browser=no_browser, host=host, debug=debug)
