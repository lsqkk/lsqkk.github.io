import click
import subprocess
import os
from ..utils import get_blog_root

@click.command()
@click.argument('message')
@click.option('--remote', default='origin', help='Git远程仓库名称')
@click.option('--branch', default='main', help='Git分支名称')
def cli(message, remote, branch):
    """Git提交并推送更改"""
    blog_root = get_blog_root()
    
    # 检查是否在git仓库中
    if not os.path.exists(os.path.join(blog_root, '.git')):
        click.echo("错误: 当前目录不是Git仓库", err=True)
        return
    
    # 执行Git命令
    commands = [
        ['git', 'add', '.'],
        ['git', 'commit', '-m', message],
        ['git', 'push', remote, branch]
    ]
    
    for cmd in commands:
        try:
            result = subprocess.run(
                cmd, 
                cwd=blog_root, 
                capture_output=True, 
                text=True,
                check=False
            )
            
            if result.returncode != 0:
                # 如果只是没有更改可提交，不算错误
                if "nothing to commit" in result.stdout or "nothing to commit" in result.stderr:
                    click.echo("没有更改可提交")
                else:
                    click.echo(f"错误: {result.stderr}", err=True)
                    return
            
            if result.stdout and result.stdout.strip():
                click.echo(result.stdout.strip())
                
        except Exception as e:
            click.echo(f"执行Git命令失败: {e}", err=True)
            return
    
    click.echo("✅ 推送完成!")