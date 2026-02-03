import click
import os
import re
from pathlib import Path
from datetime import datetime
import subprocess
import sys

@click.command()
@click.argument('title', required=False)
@click.option('--date', '-d', help='指定文章日期（格式：YYYY-MM-DD）')
@click.option('--tags', '-t', help='文章标签，多个用逗号分隔')
@click.option('--draft', is_flag=True, help='创建为草稿（保存到drafts目录）')
@click.option('--no-open', '-n', is_flag=True, help='创建后不要自动打开VSCode')
@click.option('--force', '-f', is_flag=True, help='强制创建，即使存在相同标题的文章')
def cli(title, date, tags, draft, no_open, force):  # 参数名改为 open_editor
    """
    创建新的博客文章
    
    TITLE: 文章标题（可选）
    
    示例:
      quark new "我的新文章"
      quark new --date 2025-01-15 "带有日期的文章"
      quark new --tags "Python,博客,技术" "技术文章"
      quark new --draft --open-editor  # 创建草稿并立即打开
    """
    
    try:
        # 获取博客根目录
        from ..utils import get_blog_root
        blog_root = Path(get_blog_root())
        
        # 确定文章存放目录
        if draft:
            posts_dir = blog_root / 'posts/drafts'
        else:
            posts_dir = blog_root / 'posts'
        
        # 确保目录存在
        posts_dir.mkdir(exist_ok=True)
        
        # 获取当前日期
        if date:
            try:
                article_date = datetime.strptime(date, '%Y-%m-%d')
            except ValueError:
                click.echo(f"❌ 日期格式错误，请使用 YYYY-MM-DD 格式: {date}", err=True)
                return
        else:
            article_date = datetime.now()
        
        # 确定年份文件夹
        year = article_date.year
        year_dir = posts_dir / str(year)
        year_dir.mkdir(exist_ok=True)
        
        # 生成文件名
        new_filename = generate_next_filename(year_dir, year)
        if not new_filename:
            click.echo("❌ 无法生成文件名，可能已达到最大文件数（99）", err=True)
            return
        
        # 创建文件内容
        file_content = generate_file_content(title, article_date, tags)
        
        # 完整文件路径
        file_path = year_dir / new_filename
        
        # 检查文件是否已存在（如果是强制创建则跳过）
        if file_path.exists() and not force:
            click.echo(f"⚠️ 文件已存在: {file_path}")
            if not click.confirm("是否覆盖？"):
                click.echo("操作已取消")
                return
        
        # 写入文件
        with open(file_path, 'w', encoding='utf-8') as f:  # 这里使用内置的 open 函数
            f.write(file_content)
        
        # 显示成功信息
        click.echo(f"✅ 已创建文章: {file_path.relative_to(blog_root)}")
        click.echo(f"📅 日期: {article_date.strftime('%Y-%m-%d')}")
        click.echo(f"📝 标题: {title if title else '文章标题（请修改）'}")
        if tags:
            click.echo(f"🏷️  标签: {tags}")
        
        # 如果需要用VSCode打开
        if not no_open:  # 如果没有指定 --no-open，则打开
            open_in_vscode(file_path)
        
        # 如果是草稿，给出提示
        if draft:
            click.echo("\n💡 这是草稿文章，发布时请移动到对应的年份目录")
            
    except Exception as e:
        click.echo(f"❌ 创建文章失败: {e}", err=True)

def generate_next_filename(year_dir: Path, year: int) -> str:
    """
    生成下一个文件名
    
    规则：
    1. 文件名格式：YYNN.md（YY=年份后两位，NN=序号）
    2. 查找当前目录下最大的序号
    3. 序号从01开始，最大到99
    """
    
    # 获取年份的后两位
    year_suffix = str(year)[-2:]
    
    # 查找所有符合格式的文件
    pattern = re.compile(rf'^{year_suffix}(\d{{2}})\.md$')
    max_number = 0
    
    for file in year_dir.glob('*.md'):
        match = pattern.match(file.name)
        if match:
            number = int(match.group(1))
            if number > max_number:
                max_number = number
    
    # 生成下一个序号
    next_number = max_number + 1
    
    # 检查是否超过99
    if next_number > 99:
        # 尝试查找其他可能的命名
        click.echo(f"⚠️  {year}年的文章数量已达到99篇，建议使用其他命名方式")
        return None
    
    # 格式化序号（两位数字）
    number_str = f"{next_number:02d}"
    
    return f"{year_suffix}{number_str}.md"

def generate_file_content(title: str, date: datetime, tags: str = None) -> str:
    """生成文章内容模板"""
    
    # 格式化日期
    date_str = date.strftime('%Y-%m-%d')
    
    # 构建标签字符串
    if tags:
        # 清理标签，确保格式正确
        tag_list = [tag.strip() for tag in tags.split(',')]
        tags_line = f"tags: {', '.join(tag_list)}"
    else:
        tags_line = "tags: "
    
    # 构建内容
    content = f"""---
date: {date_str}
{tags_line}
---

# {title if title else '文章标题'}

"""
    
    return content

def open_in_vscode(file_path: Path):
    """用VSCode打开文件"""
    
    try:
        # 尝试使用code命令（VSCode的命令行工具）
        if sys.platform == 'win32':
            # Windows
            subprocess.run(['code', str(file_path)], shell=True, check=False)
        else:
            # macOS/Linux
            subprocess.run(['code', str(file_path)], check=False)
        
        click.echo(f"📂 正在用VSCode打开: {file_path.name}")
        
    except FileNotFoundError:
        # code命令不存在
        click.echo("⚠️  未找到VSCode命令行工具，请确保已安装并配置")
        click.echo("   或在VSCode中手动打开文件")
        
        # 尝试其他方式打开
        try:
            if sys.platform == 'win32':
                os.startfile(file_path)
            elif sys.platform == 'darwin':
                subprocess.run(['open', str(file_path)], check=False)
            else:
                subprocess.run(['xdg-open', str(file_path)], check=False)
        except:
            pass
    except Exception as e:
        click.echo(f"⚠️  打开文件失败: {e}")