import click
from pathlib import Path
import subprocess
import sys

def open_in_vscode(file_path: Path):
    """用VSCode打开文件"""
    try:
        if sys.platform == 'win32':
            subprocess.run(['code', str(file_path)], shell=True, check=False)
        else:
            subprocess.run(['code', str(file_path)], check=False)
        click.echo(f"📂 正在用VSCode打开: {file_path.name}")
    except FileNotFoundError:
        click.echo("⚠️  未找到VSCode命令行工具")
        try:
            if sys.platform == 'win32':
                import os
                os.startfile(file_path)
            elif sys.platform == 'darwin':
                subprocess.run(['open', str(file_path)], check=False)
            else:
                subprocess.run(['xdg-open', str(file_path)], check=False)
        except:
            pass
    except Exception as e:
        click.echo(f"⚠️  打开文件失败: {e}")

@click.command()
@click.option('--last', '-l', is_flag=True, help='编辑最近的文章')
@click.option('--draft', is_flag=True, help='编辑最近的草稿')
@click.option('--year', '-y', help='指定年份')
@click.option('--number', '-n', type=int, help='指定文章序号（如25年的第5篇：2505）')
def cli(last, draft, year, number):
    """编辑博客文章"""
    
    try:
        from ..utils import get_blog_root
        blog_root = Path(get_blog_root())
        
        if draft:
            base_dir = blog_root / 'posts/drafts'
        else:
            base_dir = blog_root / 'posts'
        
        if not base_dir.exists():
            click.echo("没有找到文章目录")
            return
        
        # 如果指定了年份和序号
        if year and number:
            year_dir = base_dir / str(year)
            if not year_dir.exists():
                click.echo(f"❌ 年份目录不存在: {year}")
                return
            
            # 构造文件名
            year_suffix = str(year)[-2:]
            filename = f"{year_suffix}{number:02d}.md"
            file_path = year_dir / filename
            
            if file_path.exists():
                open_in_vscode(file_path)
                return
            else:
                click.echo(f"❌ 文章不存在: {file_path}")
                return
        
        # 查找所有文章
        articles = []
        for year_dir in sorted(base_dir.glob('*'), reverse=True):
            if year_dir.is_dir() and year_dir.name.isdigit():
                if year and year_dir.name != str(year):
                    continue
                for article in sorted(year_dir.glob('*.md'), reverse=True):
                    articles.append(article)
        
        if not articles:
            click.echo("没有找到文章")
            return
        
        if last:
            # 编辑最近的文章
            latest_article = articles[0]
            open_in_vscode(latest_article)
            click.echo(f"📝 正在编辑最新文章: {latest_article.relative_to(blog_root)}")
        else:
            # 显示最近的文章供选择
            click.echo("最近的文章:")
            for i, article in enumerate(articles[:10], 1):
                click.echo(f"  {i}. {article.relative_to(blog_root)}")
            
            choice = click.prompt("请输入要编辑的文章编号", type=int, default=1)
            if 1 <= choice <= len(articles[:10]):
                selected_article = articles[choice - 1]
                open_in_vscode(selected_article)
                click.echo(f"📝 正在编辑: {selected_article.relative_to(blog_root)}")
            else:
                click.echo("❌ 选择无效")
    
    except Exception as e:
        click.echo(f"❌ 编辑文章失败: {e}", err=True)