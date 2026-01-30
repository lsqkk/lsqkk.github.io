import click
import subprocess
import os
from ..utils import get_blog_root

@click.command()
def cli():
    """检查Git状态"""
    blog_root = get_blog_root()
    
    try:
        result = subprocess.run(
            ['git', 'status'],
            cwd=blog_root,
            capture_output=True,
            text=True
        )
        
        if result.returncode == 0:
            click.echo(result.stdout)
        else:
            click.echo(f"Git状态检查失败: {result.stderr}", err=True)
            
    except Exception as e:
        click.echo(f"执行命令失败: {e}", err=True)