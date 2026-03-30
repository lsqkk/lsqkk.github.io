import click
import os
import sys
import webbrowser
import threading
import time
from pathlib import Path
import json
import shutil
from datetime import datetime
import re

@click.command()
@click.option('--port', '-p', default=5050, help='服务器端口 (默认: 5050)')
@click.option('--no-browser', '-n', is_flag=True, help='不自动打开浏览器')
@click.option('--host', '-h', default='127.0.0.1', help='服务器主机 (默认: 127.0.0.1)')
@click.option('--debug', '-d', is_flag=True, help='调试模式')
def cli(port, no_browser, host, debug):
    """
    启动JSON配置编辑器Web界面
    
    打开浏览器访问 http://localhost:5050 查看和编辑 src/config/json/ 目录下的所有JSON文件
    """
    
    try:
        # 检查json目录是否存在
        from ..utils import get_blog_root
        blog_root = Path(get_blog_root())
        json_dir = blog_root / 'src' / 'config' / 'json'
        
        if not json_dir.exists():
            click.echo(f"❌ 找不到json目录: {json_dir}")
            click.echo("💡 请先创建 src/config/json 目录，或确保路径正确")
            return
        
        # 尝试导入Flask
        try:
            from ..config_editor.app import run_server
        except ImportError as e:
            click.echo(f"❌ 导入配置编辑器失败: {e}")
            click.echo("💡 请确保已安装必要依赖，运行: pip install flask")
            return
        
        # 显示启动信息
        click.echo("🚀 启动JSON配置编辑器...")
        click.echo(f"📂 JSON目录: {json_dir}")
        click.echo(f"🌐 访问地址: http://{host}:{port}")
        click.echo("🛑 按 Ctrl+C 停止服务器")
        
        # 在后台线程中启动服务器
        server_thread = threading.Thread(
            target=run_server,
            args=(host, port, debug, json_dir),
            daemon=True
        )
        server_thread.start()
        
        # 等待服务器启动
        time.sleep(1.5)
        
        # 打开浏览器
        if not no_browser:
            url = f"http://{host}:{port}"
            try:
                webbrowser.open(url)
                click.echo(f"🌍 已自动打开浏览器")
            except Exception as e:
                click.echo(f"⚠️  无法自动打开浏览器: {e}")
                click.echo(f"💡 请手动访问: {url}")
        
        # 保持主线程运行
        try:
            while server_thread.is_alive():
                server_thread.join(1)
        except KeyboardInterrupt:
            click.echo("\n🛑 服务器正在关闭...")
            
    except Exception as e:
        click.echo(f"❌ 启动配置编辑器失败: {e}", err=True)