import click
import subprocess
import os
from ..utils import get_blog_root

@click.command()
@click.option('--remote', default='origin', help='Git远程仓库名称')
@click.option('--branch', default='main', help='Git分支名称')
@click.option('--rebase', is_flag=True, help='使用rebase而不是merge')
def cli(remote, branch, rebase):
    """拉取远程更改"""
    blog_root = get_blog_root()
    
    try:
        cmd = ['git', 'pull', remote, branch]
        if rebase:
            cmd.append('--rebase')
            
        result = subprocess.run(
            cmd,
            cwd=blog_root,
            capture_output=True,
            text=True,
            check=False
        )
        
        if result.returncode != 0:
            if "conflict" in result.stderr.lower():
                click.echo("存在冲突，请手动解决冲突")
            click.echo(f"拉取失败: {result.stderr}", err=True)
            return
            
        click.echo(result.stdout)
        
    except Exception as e:
        click.echo(f"执行命令失败: {e}", err=True)