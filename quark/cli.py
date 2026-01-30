#!/usr/bin/env python3
import sys
import os
import click
from importlib import import_module

# 添加当前目录到路径，确保可以导入其他脚本
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(current_dir))
sys.path.insert(0, project_root)

@click.group()
def cli():
    """Quark - 博客管理工具"""
    pass

def load_commands():
    """动态加载所有命令"""
    commands_dir = os.path.join(os.path.dirname(__file__), 'commands')
    
    if not os.path.exists(commands_dir):
        click.echo(f"警告: 命令目录不存在: {commands_dir}")
        return
    
    for filename in os.listdir(commands_dir):
        if filename.endswith('.py') and filename != '__init__.py':
            command_name = filename[:-3]  # 移除 .py 后缀
            try:
                module = import_module(f'.commands.{command_name}', package='quark')
                if hasattr(module, 'cli'):
                    cli.add_command(module.cli, name=command_name)
            except ImportError as e:
                click.echo(f"警告: 无法导入命令模块 {command_name}: {e}")
            except Exception as e:
                click.echo(f"警告: 加载命令 {command_name} 时出错: {e}")

# 加载命令
load_commands()

if __name__ == '__main__':
    cli()