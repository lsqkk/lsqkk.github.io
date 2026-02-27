import click

@click.command()
def cli():
    """显示帮助信息"""
    click.echo("""
Quark 博客管理工具 - 帮助

基本命令:
  quark serve [--port PORT]      启动本地服务器
  quark updateposts              更新博客文章
  quark checkassets              检查未被 HTML 引用的 CSS/JS
  quark map                      生成网站地图
  quark push MESSAGE [--remote REMOTE] [--branch BRANCH]
  quark ds [QUERY]               与DeepSeek对话

DeepSeek对话 (quark ds):
  基本用法:
    quark ds "你的问题"
    quark ds                     # 进入交互模式
  
  文件附件语法:
    @文件路径*                   附加文件
    例如:
      @posts/about.md*          附加 about.md 文件
      @./my_article.html*       附加当前目录下的文件
      @../other/post.txt*       附加上级目录的文件
  
  选项:
    -n, --new-session           开始新会话
    -s, --session SESSION_ID    加载指定会话
    -l, --list-sessions         列出所有会话
    -k, --skill SKILL           应用特定技能
    --list-skills               列出所有可用技能
    --set-key API_KEY           设置DeepSeek API密钥
    --config                    显示当前配置
  
  交互模式命令:
    help/?                      显示帮助
    quit/exit/q                 退出
    save                        保存当前会话
    clear                       清空当前上下文
    sessions                    列出所有会话
    skills                      列出可用技能

示例:
  quark ds "如何优化博客？"
  quark ds "@posts/about.md* 请帮我优化这篇文章"
  quark ds -n "开始新对话"
  quark ds --skill blog_writing "写一篇技术博客"
""")
