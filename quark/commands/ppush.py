import click
import subprocess
import sys
import os
from pathlib import Path

@click.command()
@click.argument('message', required=False)
@click.option('--no-update', is_flag=True, help='跳过更新文章步骤')
@click.option('--no-map', is_flag=True, help='跳过分步网站地图步骤')
@click.option('--no-push', is_flag=True, help='跳过Git推送步骤')
@click.option('--dry-run', '-n', is_flag=True, help='只显示将要执行的命令，不实际执行')
@click.option('--force', '-f', is_flag=True, help='强制推送（添加--force参数）')
def cli(message, no_update, no_map, no_push, dry_run, force):
    """
    一键更新博客并推送
    
    执行顺序：
    1. quark updateposts    (更新文章，除非使用 --no-update)
    2. quark map            (生成网站地图，除非使用 --no-map)
    3. quark push MESSAGE   (推送更改，除非使用 --no-push)
    
    如果未提供MESSAGE，则使用默认消息"更新 - 更新了文章"
    """
    
    # 确定提交消息
    if not message:
        message = "更新 - 更新了文章"
    
    # 获取quark命令的路径
    # 这里我们使用当前Python解释器执行quark模块
    python_executable = sys.executable
    
    # 由于我们是通过pip安装的，可以直接调用'quark'命令
    # 但为了兼容性，我们使用模块调用的方式
    quark_cmd = [python_executable, '-m', 'quark.cli']
    
    commands = []
    
    # 1. 更新文章
    if not no_update:
        commands.append(('更新文章', ['updateposts']))
    
    # 2. 生成网站地图
    if not no_map:
        commands.append(('生成网站地图', ['map']))
    
    # 3. 推送更改
    if not no_push:
        push_cmd = ['push', message]
        if force:
            push_cmd.append('--force')
        commands.append(('推送更改', push_cmd))
    
    if not commands:
        click.echo("⚠️  没有要执行的命令，所有步骤都被跳过了")
        return
    
    # 显示将要执行的操作
    click.echo("🚀 准备执行以下操作:")
    for i, (description, cmd) in enumerate(commands, 1):
        click.echo(f"  {i}. {description}: quark {' '.join(cmd)}")
    
    if dry_run:
        click.echo("\n✅ 干跑模式完成，没有实际执行命令")
        return
    
    # 询问确认
    if not click.confirm("\n确定要执行以上操作吗？"):
        click.echo("操作已取消")
        return
    
    # 执行命令
    click.echo("\n" + "="*50)
    
    for description, cmd_args in commands:
        click.echo(f"\n▶️  开始: {description}")
        click.echo(f"   命令: quark {' '.join(cmd_args)}")
        click.echo("-" * 40)
        
        try:
            # 构建完整命令
            full_cmd = quark_cmd + cmd_args
            
            # 执行命令
            result = subprocess.run(
                full_cmd,
                capture_output=True,
                text=True,
                encoding='utf-8'
            )
            
            # 输出结果
            if result.stdout:
                click.echo(result.stdout)
            
            if result.stderr:
                # 检查是否是警告信息而不是错误
                stderr_lines = result.stderr.strip().split('\n')
                for line in stderr_lines:
                    if line.startswith('警告:') or 'warning' in line.lower():
                        click.echo(f"⚠️  {line}")
                    elif line:
                        click.echo(f"❌ {line}")
            
            # 检查执行结果
            if result.returncode != 0:
                # 检查是否是"没有更改可提交"这类可以忽略的错误
                if (cmd_args[0] == 'push' and 
                    ("nothing to commit" in result.stdout or 
                     "nothing to commit" in result.stderr)):
                    click.echo("ℹ️  没有新的更改可提交，继续执行下一个步骤")
                else:
                    click.echo(f"❌ {description} 执行失败 (返回码: {result.returncode})")
                    if not click.confirm("是否继续执行后续步骤？"):
                        click.echo("操作中止")
                        return
            
            click.echo(f"✅ {description} 完成")
            
        except FileNotFoundError:
            click.echo(f"❌ 无法找到quark命令，请确保已正确安装")
            return
        except Exception as e:
            click.echo(f"❌ 执行命令时出错: {e}")
            if not click.confirm("是否继续执行后续步骤？"):
                click.echo("操作中止")
                return
    
    click.echo("\n" + "="*50)
    click.echo("🎉 所有操作已完成！")
    
    # 总结
    click.echo("\n📊 操作总结:")
    click.echo(f"  文章更新: {'✅' if not no_update else '❌ 跳过'}")
    click.echo(f"  网站地图: {'✅' if not no_map else '❌ 跳过'}")
    click.echo(f"  Git推送: {'✅' if not no_push else '❌ 跳过'}")
    if not no_push:
        click.echo(f"  提交消息: {message}")

# 可选：添加一个检查命令，验证所有步骤是否可以正常执行
@click.command()
@click.option('--verbose', '-v', is_flag=True, help='显示详细信息')
def check(verbose):
    """检查ppush命令的依赖项"""
    
    click.echo("🔍 检查ppush命令的依赖项...")
    
    # 检查quark命令
    python_executable = sys.executable
    try:
        result = subprocess.run(
            [python_executable, '-m', 'quark.cli', '--help'],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            click.echo("✅ quark命令可用")
            if verbose:
                # 提取支持的子命令
                lines = result.stdout.split('\n')
                commands = []
                in_commands_section = False
                for line in lines:
                    if 'Commands:' in line:
                        in_commands_section = True
                        continue
                    if in_commands_section and line.strip() and not line.startswith('  '):
                        break
                    if in_commands_section and line.strip():
                        cmd_name = line.strip().split()[0]
                        commands.append(cmd_name)
                
                click.echo(f"   支持的子命令: {', '.join(commands)}")
                
                # 检查需要的子命令是否存在
                required_cmds = ['updateposts', 'map', 'push']
                missing_cmds = [cmd for cmd in required_cmds if cmd not in commands]
                if missing_cmds:
                    click.echo(f"❌ 缺少必要的子命令: {', '.join(missing_cmds)}")
                else:
                    click.echo("✅ 所有必要的子命令都存在")
        else:
            click.echo("❌ quark命令不可用")
    except Exception as e:
        click.echo(f"❌ 检查quark命令时出错: {e}")
    
    # 检查Git
    try:
        result = subprocess.run(
            ['git', '--version'],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            click.echo("✅ Git可用")
            if verbose:
                click.echo(f"   版本: {result.stdout.strip()}")
        else:
            click.echo("❌ Git不可用")
    except FileNotFoundError:
        click.echo("❌ Git未安装")
    
    # 检查当前目录是否是Git仓库
    try:
        result = subprocess.run(
            ['git', 'rev-parse', '--git-dir'],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            click.echo("✅ 当前目录是Git仓库")
        else:
            click.echo("❌ 当前目录不是Git仓库")
    except Exception:
        click.echo("❌ 无法确定当前目录是否是Git仓库")
    
    click.echo("\n💡 建议:")
    click.echo("  1. 确保所有依赖项都通过检查")
    click.echo("  2. 使用 'quark ppush --dry-run' 测试命令")
    click.echo("  3. 使用 'quark ppush --help' 查看所有选项")