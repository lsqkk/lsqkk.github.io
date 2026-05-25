import click
import os
import subprocess
import sys

@click.command()
@click.option('--port', default=4321, help='开发服务器端口（默认 4321）')
@click.option('--host', is_flag=True, help='监听局域网（0.0.0.0）')
def cli(port, host):
    """启动 Astro 开发服务器（热更新 HMR）"""
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    args = ["dev", "--port", str(port)]
    if host:
        args.append("--host")
    try:
        click.echo(f"启动 Astro 开发服务器 (http://localhost:{port})")
        click.echo("按 Ctrl+C 停止")
        subprocess.run(["npx", "astro", *args], cwd=root, check=True, shell=True)
    except KeyboardInterrupt:
        click.echo("\n服务器已停止")
    except Exception as e:
        click.echo(f"启动服务器失败: {e}", err=True)
        click.echo("提示：请确保已执行 npm install", err=True)
