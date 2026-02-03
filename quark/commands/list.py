import click
import re
from pathlib import Path

@click.command()
@click.option('--year', '-y', help='按年份筛选')
@click.option('--drafts', is_flag=True, help='只显示草稿')
@click.option('--count', '-c', is_flag=True, help='只显示数量')
def cli(year, drafts, count):
    """列出所有博客文章"""
    
    try:
        from ..utils import get_blog_root
        blog_root = Path(get_blog_root())
        
        if drafts:
            base_dir = blog_root / 'posts/drafts'
        else:
            base_dir = blog_root / 'posts'
        
        if not base_dir.exists():
            click.echo("没有找到文章目录")
            return
        
        articles = []
        
        # 收集所有文章
        for year_dir in sorted(base_dir.glob('*')):
            if year_dir.is_dir() and year_dir.name.isdigit():
                if year and year_dir.name != year:
                    continue
                
                for article in sorted(year_dir.glob('*.md')):
                    # 读取文章标题
                    with open(article, 'r', encoding='utf-8') as f:
                        content = f.read()
                        # 提取标题（第一个#后的内容）
                        title_match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
                        title = title_match.group(1) if title_match else "无标题"
                    
                    articles.append({
                        'year': year_dir.name,
                        'filename': article.name,
                        'title': title,
                        'path': article.relative_to(blog_root)
                    })
        
        if count:
            click.echo(f"📊 文章总数: {len(articles)}")
            return
        
        if not articles:
            click.echo("没有找到文章")
            return
        
        # 显示文章列表
        click.echo(f"📚 共找到 {len(articles)} 篇文章:")
        click.echo("-" * 60)
        
        current_year = None
        for article in articles:
            if article['year'] != current_year:
                current_year = article['year']
                click.echo(f"\n📅 {current_year}年:")
            
            click.echo(f"  {article['filename']} - {article['title']}")
        
    except Exception as e:
        click.echo(f"❌ 列出文章失败: {e}", err=True)