import click
import os
import sys
import json
from typing import Optional
from pathlib import Path

# 添加父目录到路径以便导入utils
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from quark.utils.deepseek_client import DeepSeekClient
from quark.utils.context_manager import ContextManager
from quark.utils.file_processor import FileProcessor
from quark.utils.skills_manager import SkillsManager
from quark.utils.stream_handler import StreamHandler
from quark.utils.markdown_renderer import MarkdownRenderer

@click.command()
@click.argument('query', required=False)
@click.option('--session', '-s', help='指定会话ID')
@click.option('--new-session', '-n', is_flag=True, help='开始新会话')
@click.option('--list-sessions', '-l', is_flag=True, help='列出所有会话')
@click.option('--skill', '-k', help='应用特定技能')
@click.option('--list-skills', is_flag=True, help='列出所有可用技能')
@click.option('--set-key', help='设置DeepSeek API密钥')
@click.option('--config', is_flag=True, help='显示当前配置')
@click.option('--no-stream', is_flag=True, help='禁用流式输出')
@click.option('--no-markdown', is_flag=True, help='禁用Markdown渲染')
@click.option('--fast', '-f', is_flag=True, help='快速模式（无动画）')
def cli(query, session, new_session, list_sessions, skill, list_skills, 
        set_key, config, no_stream, no_markdown, fast):
    """
    与DeepSeek对话
    
    QUERY: 对话内容，可以包含文件引用 @文件路径*
    
    示例:
      quark ds "如何优化博客的SEO？"
      quark ds "@posts/about.md* 请帮我优化这篇文章"
      quark ds -n "开始新对话"
      quark ds --no-stream "禁用流式输出"
      quark ds --fast "快速模式"
    """
    
    # 初始化各个管理器
    try:
        client = DeepSeekClient()
        context = ContextManager()
        file_processor = FileProcessor()
        skills = SkillsManager()
    except Exception as e:
        click.echo(f"初始化失败: {e}", err=True)
        return
    
    # 处理设置API密钥
    if set_key:
        try:
            client.set_api_key(set_key)
            click.echo("✅ API密钥已设置")
        except Exception as e:
            click.echo(f"设置API密钥失败: {e}", err=True)
        return
    
    # 显示配置
    if config:
        click.echo("当前配置:")
        config_display = client.config.copy()
        if 'api_key' in config_display and config_display['api_key']:
            config_display['api_key'] = config_display['api_key'][:4] + '...' + config_display['api_key'][-4:]
        click.echo(json.dumps(config_display, indent=2, ensure_ascii=False))
        return
    
    # 列出技能
    if list_skills:
        all_skills = skills.get_all_skills()
        if not all_skills:
            click.echo("暂无可用技能")
        else:
            click.echo("可用技能:")
            for name, skill_info in all_skills.items():
                desc = skill_info.get('description', '无描述').split('\n')[0][:50]
                click.echo(f"  {name}: {desc}")
        return
    
    # 列出会话
    if list_sessions:
        sessions = context.list_sessions()
        if not sessions:
            click.echo("暂无会话记录")
        else:
            click.echo(f"找到 {len(sessions)} 个会话:")
            for s in sessions:
                from datetime import datetime
                dt = datetime.fromtimestamp(s['created_at'])
                click.echo(f"  {s['id']}: {dt.strftime('%Y-%m-%d %H:%M:%S')} ({s['message_count']} 条消息)")
        return
    
    # 加载或创建会话
    if new_session or not session:
        session_id = context.start_new_session()
        click.echo(f"🆕 新会话: {session_id}")
    elif session:
        if context.load_session(session):
            click.echo(f"📂 加载会话: {session}")
        else:
            click.echo(f"❌ 找不到会话: {session}", err=True)
            session_id = context.start_new_session()
            click.echo(f"🆕 已创建新会话: {session_id}")
    
    # 设置流式和Markdown选项
    use_stream = not no_stream
    use_markdown = not no_markdown
    show_thinking = not fast
    
    # 更新配置
    if no_stream:
        client.set_stream(False)
    if no_markdown:
        client.set_markdown(False)
    
    # 如果没有查询内容，进入交互模式
    if not query:
        click.echo("💬 进入交互模式，输入 'quit' 或 'exit' 退出，'help' 查看帮助")
        click.echo("📎 支持文件附件: @文件路径*")
        
        while True:
            try:
                user_input = click.prompt("\n> ", prompt_suffix="")
                
                if user_input.lower() in ['quit', 'exit', 'q']:
                    context.save_session()
                    click.echo("👋 会话已保存，再见！")
                    break
                elif user_input.lower() in ['help', '?']:
                    click.echo("""
可用命令:
  help/?       显示此帮助
  quit/exit/q  退出
  save         保存当前会话
  clear        清空当前上下文
  sessions     列出所有会话
  skills       列出可用技能
  stream on/off 切换流式输出
  markdown on/off 切换Markdown渲染

文件附件:
  使用 @文件路径* 格式引用文件
                    """)
                    continue
                elif user_input.lower() == 'save':
                    context.save_session()
                    click.echo("💾 会话已保存")
                    continue
                elif user_input.lower() == 'clear':
                    old_id = context.current_session_id
                    context.start_new_session(old_id)
                    click.echo("🧹 上下文已清空")
                    continue
                elif user_input.lower() == 'sessions':
                    sessions = context.list_sessions()
                    if sessions:
                        click.echo("历史会话:")
                        for s in sessions[:5]:
                            click.echo(f"  {s['id']}")
                    continue
                elif user_input.lower() == 'skills':
                    all_skills = skills.get_all_skills()
                    if all_skills:
                        click.echo("可用技能:")
                        for name in all_skills.keys():
                            click.echo(f"  {name}")
                    continue
                elif user_input.lower().startswith('stream '):
                    mode = user_input[7:].strip().lower()
                    if mode in ['on', 'true', '1']:
                        client.set_stream(True)
                        use_stream = True
                        click.echo("✅ 已启用流式输出")
                    elif mode in ['off', 'false', '0']:
                        client.set_stream(False)
                        use_stream = False
                        click.echo("✅ 已禁用流式输出")
                    continue
                elif user_input.lower().startswith('markdown '):
                    mode = user_input[9:].strip().lower()
                    if mode in ['on', 'true', '1']:
                        client.set_markdown(True)
                        use_markdown = True
                        click.echo("✅ 已启用Markdown渲染")
                    elif mode in ['off', 'false', '0']:
                        client.set_markdown(False)
                        use_markdown = False
                        click.echo("✅ 已禁用Markdown渲染")
                    continue
                
                # 处理用户输入
                process_and_respond(user_input, client, context, file_processor, 
                                  skills, skill, use_stream, use_markdown, show_thinking)
                
            except KeyboardInterrupt:
                click.echo("\n\n👋 中断，会话已自动保存")
                context.save_session()
                break
            except EOFError:
                click.echo("\n\n👋 退出")
                context.save_session()
                break
    else:
        # 处理单次查询
        process_and_respond(query, client, context, file_processor, 
                          skills, skill, use_stream, use_markdown, show_thinking)

def process_and_respond(query: str, client, context, file_processor, skills, 
                       skill_name: Optional[str], use_stream: bool, 
                       use_markdown: bool, show_thinking: bool):
    """处理查询并响应"""
        # 获取终端宽度
    try:
        width = click.get_terminal_size()[0] - 2
    except:
        width = 78
    
    # 初始化流式处理器
    stream_handler = StreamHandler(
        use_markdown=use_markdown, 
        show_thinking=show_thinking,
        width=width
    )
    
    # 应用技能
    if skill_name:
        query = skills.apply_skill(skill_name, query)
        click.echo(f"🎯 应用技能: {skill_name}")
    
    # 处理文件附件
    processed_query, attachments = file_processor.process_message(query)
    
    if attachments:
        click.echo(f"📎 发现 {len(attachments)} 个附件:")
        for att in attachments:
            if att['type'] == 'text_file':
                click.echo(f"  📄 {att.get('display_path', att['filename'])} ({att['size']} 字符)")
            elif att['type'] == 'directory':
                click.echo(f"  📁 {att.get('display_path', att['name'])} ({att['file_count']} 个文件)")
        
        # 将附件内容添加到查询中
        attachments_text = file_processor.format_attachments_for_ai(attachments)
        final_query = f"{processed_query}\n\n附件内容:\n{attachments_text}"
    else:
        final_query = processed_query
    
    # 添加用户消息到上下文
    context.add_message("user", final_query)
    
    # 显示思考状态
    if show_thinking:
        stream_handler.start_thinking()
    
    try:
        if use_stream:
            # 流式响应
            stream_handler.stop_thinking()
            stream_handler.start_stream()
            
            full_response = ''
            for chunk in client.stream_chat(context.get_messages()):
                rendered = stream_handler.process_chunk(chunk)
                full_response += chunk
            
            stream_handler.end_stream()
            
            # 添加AI响应到上下文
            context.add_message("assistant", full_response)
            
        else:
            # 非流式响应
            response = client.chat(context.get_messages(), stream=False)
            stream_handler.stop_thinking()
            
            # 渲染响应
            if use_markdown:
                renderer = MarkdownRenderer(use_color=True, width=width)
                rendered_response = renderer.render(response)
                click.echo("\n" + "═" * width)
                click.echo(rendered_response)
                click.echo("═" * width)
            else:
                click.echo("\n" + "═" * width)
                click.echo(response)
                click.echo("═" * width)
            
            # 添加AI响应到上下文
            context.add_message("assistant", response)
        
        # 自动保存会话
        context.save_session()
        
    except Exception as e:
        stream_handler.stop_thinking()
        click.echo(f"\n❌ 请求失败: {e}", err=True)

if __name__ == '__main__':
    cli()