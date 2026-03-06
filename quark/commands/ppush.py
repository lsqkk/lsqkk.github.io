import click
import subprocess
import sys
import os
from pathlib import Path
import locale

# 获取系统编码
def get_system_encoding():
    """获取系统编码，处理Windows中文编码问题"""
    try:
        # Windows常用编码：GBK, GB2312, UTF-8
        # 尝试获取系统locale
        encoding = locale.getpreferredencoding()
        if not encoding:
            encoding = 'gbk'  # Windows中文默认
        return encoding.lower().replace('-', '')
    except:
        return 'gbk'

@click.command()
@click.argument('message', required=False)
@click.option('--no-update', is_flag=True, help='跳过更新文章步骤')
@click.option('--no-map', is_flag=True, help='兼容参数（已无独立网站地图步骤）')
@click.option('--no-push', is_flag=True, help='跳过Git推送步骤')
@click.option('--dry-run', '-n', is_flag=True, help='只显示将要执行的命令，不实际执行')
@click.option('--force', '-f', is_flag=True, help='强制推送（添加--force参数）')
def cli(message, no_update, no_map, no_push, dry_run, force):
    """
    一键更新博客并推送
    
    执行顺序：
    1. quark build          (构建站点，除非使用 --no-update)
    2. quark push MESSAGE   (推送更改，除非使用 --no-push)
    
    如果未提供MESSAGE，则使用默认消息"更新 - 更新了文章"
    """
    
    # 确定提交消息
    if not message:
        message = "更新 - 更新了文章"
    
    # 获取系统编码
    system_encoding = get_system_encoding()
    
    commands = []
    
    # 1. 构建站点
    if not no_update:
        commands.append(('构建站点', ['build']))
    
    # 2. 推送更改
    if not no_push:
        push_cmd = ['push', message]
        if force:
            push_cmd.append('--force')
        commands.append(('推送更改', push_cmd))
    
    if not commands:
        click.echo("警告: 没有要执行的命令，所有步骤都被跳过了")
        return
    
    # 显示将要执行的操作
    click.echo("准备执行以下操作:")
    for i, (description, cmd) in enumerate(commands, 1):
        click.echo(f"  {i}. {description}: quark {' '.join(cmd)}")
    
    if dry_run:
        click.echo("\n√ 干跑模式完成，没有实际执行命令")
        return
    
    # 询问确认
    if not click.confirm("\n确定要执行以上操作吗？"):
        click.echo("操作已取消")
        return
    
    # 执行命令
    click.echo("\n" + "="*50)
    
    for description, cmd_args in commands:
        click.echo(f"\n开始: {description}")
        click.echo(f"   命令: quark {' '.join(cmd_args)}")
        click.echo("-" * 40)
        
        try:
            # 直接调用quark命令（通过pip安装的）
            full_cmd = ['quark'] + cmd_args
            
            # 执行命令，使用系统编码
            result = subprocess.run(
                full_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                shell=True  # 在Windows上使用shell=True确保正确执行
            )
            
            # 解码输出，尝试多种编码
            stdout_text = decode_output(result.stdout, system_encoding)
            stderr_text = decode_output(result.stderr, system_encoding)
            
            # 输出结果
            if stdout_text and stdout_text.strip():
                click.echo(stdout_text.strip())
            
            if stderr_text and stderr_text.strip():
                # 检查是否是警告信息而不是错误
                stderr_lines = stderr_text.strip().split('\n')
                for line in stderr_lines:
                    line = line.strip()
                    if not line:
                        continue
                    # 判断是否为错误
                    if ('错误:' in line or 'error' in line.lower() or 
                        'failed' in line.lower() or 'fatal' in line.lower()):
                        click.echo(f"错误: {line}")
                    elif '警告:' in line or 'warning' in line.lower():
                        click.echo(f"警告: {line}")
                    else:
                        # 其他信息正常输出
                        click.echo(line)
            
            # 检查执行结果
            if result.returncode != 0:
                # 检查是否是"没有更改可提交"这类可以忽略的错误
                push_cmd_error = (cmd_args[0] == 'push' and 
                                 ("nothing to commit" in stdout_text or 
                                  "nothing to commit" in stderr_text or
                                  "没有更改可提交" in stdout_text or
                                  "没有更改可提交" in stderr_text))
                
                if push_cmd_error:
                    click.echo("提示: 没有新的更改可提交，继续执行下一个步骤")
                else:
                    click.echo(f"错误: {description} 执行失败 (返回码: {result.returncode})")
                    if not click.confirm("是否继续执行后续步骤？"):
                        click.echo("操作中止")
                        return
            
            click.echo(f"√ {description} 完成")
            
        except FileNotFoundError:
            # 如果quark命令找不到，尝试使用python -m的方式
            try:
                python_executable = sys.executable
                full_cmd = [python_executable, '-m', 'quark.cli'] + cmd_args
                
                result = subprocess.run(
                    full_cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    shell=True
                )
                
                # 解码输出
                stdout_text = decode_output(result.stdout, system_encoding)
                stderr_text = decode_output(result.stderr, system_encoding)
                
                if stdout_text and stdout_text.strip():
                    click.echo(stdout_text.strip())
                
                if stderr_text and stderr_text.strip():
                    click.echo(stderr_text.strip())
                
                if result.returncode == 0:
                    click.echo(f"√ {description} 完成")
                else:
                    click.echo(f"错误: {description} 执行失败")
                    if not click.confirm("是否继续执行后续步骤？"):
                        return
                        
            except Exception as e:
                click.echo(f"错误: 执行命令时出错: {e}")
                if not click.confirm("是否继续执行后续步骤？"):
                    click.echo("操作中止")
                    return
        except Exception as e:
            click.echo(f"错误: 执行命令时出错: {e}")
            if not click.confirm("是否继续执行后续步骤？"):
                click.echo("操作中止")
                return
    
    click.echo("\n" + "="*50)
    click.echo("所有操作已完成！")
    
    # 总结
    click.echo("\n📊 操作总结:")
    click.echo(f"  站点构建: {'√' if not no_update else '❌ 跳过'}")
    click.echo("  网站地图: 自动（由 Astro build 生成）")
    click.echo(f"  Git推送: {'√' if not no_push else '❌ 跳过'}")
    if not no_push:
        click.echo(f"  提交消息: {message}")

def decode_output(data: bytes, default_encoding: str = 'gbk') -> str:
    """解码输出，尝试多种编码"""
    if not data:
        return ""
    
    # 尝试的编码顺序
    encodings = ['utf-8', default_encoding, 'gb2312', 'gbk', 'utf-16', 'ascii']
    
    for encoding in encodings:
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    
    # 如果所有编码都失败，使用错误忽略模式
    try:
        return data.decode('utf-8', errors='ignore')
    except:
        return "无法解码的输出"

# 可选：添加一个检查命令
@click.command()
@click.option('--verbose', '-v', is_flag=True, help='显示详细信息')
def check(verbose):
    """检查ppush命令的依赖项"""
    
    click.echo("🔍 检查ppush命令的依赖项...")
    
    # 检查quark命令
    try:
        result = subprocess.run(
            ['quark', '--help'],
            capture_output=True,
            text=True,
            shell=True,
            timeout=5
        )
        if result.returncode == 0:
            click.echo("√ quark命令可用")
            if verbose:
                lines = result.stdout.split('\n')
                commands = []
                for line in lines:
                    if line.strip() and not line.startswith('  ') and not line.startswith('Usage:'):
                        cmd_match = re.search(r'^\s*(\w+)\s+', line)
                        if cmd_match:
                            commands.append(cmd_match.group(1))
                if commands:
                    click.echo(f"   支持的子命令: {', '.join(commands[:10])}")
        else:
            click.echo("❌ quark命令不可用")
    except Exception as e:
        click.echo(f"❌ 检查quark命令时出错: {e}")
    
    # 检查系统编码
    encoding = get_system_encoding()
    click.echo(f"√ 系统编码: {encoding}")
    
    click.echo("\n💡 建议:")
    click.echo("  1. 使用 'quark ppush --dry-run' 测试命令")
    click.echo("  2. 如果仍有编码问题，请检查系统区域设置")
