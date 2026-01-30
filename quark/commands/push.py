import click
import subprocess
import os
from ..utils import get_blog_root

@click.command()
@click.argument('message')
@click.option('--remote', default='origin', help='Git远程仓库名称')
@click.option('--branch', default='main', help='Git分支名称')
@click.option('--force', is_flag=True, help='强制推送')
def cli(message, remote, branch, force):
    """Git提交并推送更改"""
    blog_root = get_blog_root()
    
    # 检查是否在git仓库中
    if not os.path.exists(os.path.join(blog_root, '.git')):
        click.echo("错误: 当前目录不是Git仓库", err=True)
        return
    
    # 1. 执行 git add .
    try:
        result = subprocess.run(
            ['git', 'add', '.'],
            cwd=blog_root,
            capture_output=True,
            text=True,
            check=False
        )
        
        if result.returncode != 0 and "warning:" not in result.stderr:
            # 如果不是警告，则报错
            click.echo(f"添加文件失败: {result.stderr}", err=True)
            return
        
        if result.stdout:
            click.echo(result.stdout.strip())
    except Exception as e:
        click.echo(f"执行git add失败: {e}", err=True)
        return
    
    # 2. 执行 git commit
    commit_success = True
    try:
        result = subprocess.run(
            ['git', 'commit', '-m', message],
            cwd=blog_root,
            capture_output=True,
            text=True,
            check=False
        )
        
        if result.returncode != 0:
            # 检查是否确实没有更改可提交
            if "nothing to commit" in result.stdout or "nothing to commit" in result.stderr:
                click.echo("没有新的更改可提交，跳过提交步骤")
                commit_success = False
            else:
                # 其他错误
                click.echo(f"提交失败: {result.stderr}", err=True)
                return
        else:
            if result.stdout:
                click.echo(result.stdout.strip())
    except Exception as e:
        click.echo(f"执行git commit失败: {e}", err=True)
        return
    
    # 3. 执行 git push
    try:
        push_cmd = ['git', 'push', remote, branch]
        if force:
            push_cmd.append('--force')
            
        result = subprocess.run(
            push_cmd,
            cwd=blog_root,
            capture_output=True,
            text=True,
            check=False
        )
        
        if result.returncode != 0:
            # 检查是否需要先拉取
            if "non-fast-forward" in result.stderr or "fetch first" in result.stderr:
                click.echo("需要先拉取远程更改，使用 --force 参数强制推送或先执行 git pull")
                return
            else:
                click.echo(f"推送失败: {result.stderr}", err=True)
                return
        
        # 检查是否有警告信息
        if "warning:" in result.stderr:
            click.echo(f"警告: {result.stderr.split('warning:')[-1].strip()}")
        
        if result.stdout:
            click.echo(result.stdout.strip())
            
        click.echo("✅ 推送完成!")
        
        # 如果提交成功但推送时没有新内容，给出提示
        if commit_success and "Everything up-to-date" in result.stdout:
            click.echo("已提交本地更改，但远程已是最新状态")
        
    except Exception as e:
        click.echo(f"执行git push失败: {e}", err=True)
        return