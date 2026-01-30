import click
import subprocess
import os
from ..utils import get_blog_root

@click.command()
@click.option('--staged', is_flag=True, help='只显示暂存区的更改')
def cli(staged):
    """查看Git差异"""
    blog_root = get_blog_root()
    
    try:
        cmd = ['git', 'diff']
        if staged:
            cmd.append('--staged')
            
        result = subprocess.run(
            cmd,
            cwd=blog_root,
            capture_output=True,
            text=True
        )
        
        if result.returncode == 0:
            if result.stdout:
                click.echo(result.stdout)
            else:
                click.echo("没有更改")
        else:
            click.echo(f"Git差异检查失败: {result.stderr}", err=True)
            
    except Exception as e:
        click.echo(f"执行命令失败: {e}", err=True)