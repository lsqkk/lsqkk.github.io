import click
import subprocess
import os
from ..utils import get_blog_root

@click.command()
@click.option('--short', is_flag=True, help='简洁模式')
def cli(short):
    """查看Git状态"""
    blog_root = get_blog_root()
    
    try:
        cmd = ['git', 'status']
        if short:
            cmd.append('--short')
            
        result = subprocess.run(
            cmd,
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