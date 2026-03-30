import click
import re
from pathlib import Path

@click.command()
@click.option('--year', '-y', help='按年份筛选')
@click.option('--drafts', is_flag=True, help='只显示草稿')
@click.option('--count', '-c', is_flag=True, help='只显示数量')
def cli(year, drafts, count):
    """列出所有JSON配置文件"""
    
    try:
        from ..utils import get_blog_root
        blog_root = Path(get_blog_root())
        json_dir = blog_root / 'src' / 'config' / 'json'
        
        if not json_dir.exists():
            click.echo("📂 配置目录不存在")
            click.echo("💡 请先创建配置目录：mkdir -p src/config/json")
            return
        
        json_files = list(json_dir.glob('*.json'))
        
        if count:
            click.echo(f"📊 JSON文件总数: {len(json_files)}")
            return
        
        if not json_files:
            click.echo("📂 配置目录中没有JSON文件")
            return
        
        click.echo(f"📁 找到 {len(json_files)} 个JSON文件:")
        for i, file_path in enumerate(sorted(json_files), 1):
            file_size = file_path.stat().st_size
            mod_time = datetime.fromtimestamp(file_path.stat().st_mtime)
            click.echo(f"  {i}. {file_path.name}")
            click.echo(f"     大小: {file_size:,} bytes")
            click.echo(f"     修改: {mod_time.strftime('%Y-%m-%d %H:%M:%S')}")
            
            # 尝试读取并显示基本信息
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    keys = list(data.keys())[:3]  # 显示前3个键
                    click.echo(f"     键: {', '.join(keys)}{'...' if len(data) > 3 else ''}")
            except Exception as e:
                click.echo(f"     错误: 无法解析JSON - {e}")
            click.echo()
        
    except Exception as e:
        click.echo(f"❌ 列出JSON文件失败: {e}", err=True)