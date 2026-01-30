import click
import os
import sys
from ..utils import run_python_script

@click.command()
@click.option('--port', default=8000, help='服务器端口')
def cli(port):
    """启动本地服务器"""
    try:
        run_python_script('serve.py', str(port))
        click.echo(f"服务器已启动在端口 {port}")
    except Exception as e:
        click.echo(f"启动服务器失败: {e}", err=True)