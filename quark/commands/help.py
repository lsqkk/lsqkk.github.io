import click

@click.command()
def cli():
    """显示帮助信息"""
    click.echo("""
Quark 博客管理工具 - 帮助

基本命令:
  quark serve [--port PORT]      启动本地服务器
  quark build [--mode MODE]      构建站点（默认 source，仅生成 dist）
                               artifact 模式导出到独立目录（默认 .quark-artifact）
  quark updateposts              兼容命令（等效 quark build --mode source）
  quark checkassets              检查未被 HTML 引用的 CSS/JS
  quark map                      兼容命令（已弃用；sitemap 随 build 自动生成）
  quark ppush [MESSAGE]          一键构建 + 推送
  quark push MESSAGE [--remote REMOTE] [--branch BRANCH]
""")
