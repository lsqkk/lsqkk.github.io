import sys
import time
import threading
from typing import Callable, Optional
import click
from .markdown_renderer import MarkdownRenderer

class StreamHandler:
    """处理流式输出"""
    
    def __init__(self, use_markdown: bool = True, show_thinking: bool = True, width: int = 80):
        self.use_markdown = use_markdown
        self.show_thinking = show_thinking
        self.width = width
        self.renderer = MarkdownRenderer(use_color=True, width=width) if use_markdown else None
        self.buffer = ''
        self.is_streaming = False
        self.thinking_thread = None
        self.is_thinking = False
    
    def start_thinking(self):
        """显示思考动画"""
        if not self.show_thinking:
            return
        
        self.is_thinking = True
        self.thinking_thread = threading.Thread(target=self._thinking_animation)
        self.thinking_thread.daemon = True
        self.thinking_thread.start()
    
    def _thinking_animation(self):
        """思考动画线程"""
        animations = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
        i = 0
        while self.is_thinking:
            sys.stdout.write(f'\r{animations[i]} 思考中...')
            sys.stdout.flush()
            i = (i + 1) % len(animations)
            time.sleep(0.1)
    
    def stop_thinking(self):
        """停止思考动画"""
        self.is_thinking = False
        if self.thinking_thread:
            self.thinking_thread.join(timeout=0.5)
        sys.stdout.write('\r' + ' ' * 30 + '\r')
        sys.stdout.flush()
    
    def start_stream(self):
        """开始流式输出"""
        self.is_streaming = True
        self.buffer = ''
        click.echo()  # 空行
    
    def process_chunk(self, chunk: str) -> str:
        """
        处理一个流式chunk
        
        Returns:
            渲染后的文本（如果有）
        """
        if not self.is_streaming:
            return ''
        
        if self.use_markdown and self.renderer:
            rendered, self.buffer = self.renderer.render_stream_chunk(chunk, self.buffer)
            if rendered:
                # 输出渲染后的文本（不换行，让后续内容继续）
                sys.stdout.write(rendered)
                sys.stdout.flush()
                return rendered
        else:
            # 普通文本输出
            sys.stdout.write(chunk)
            sys.stdout.flush()
            return chunk
        
        return ''
    
    def end_stream(self):
        """结束流式输出"""
        if self.is_streaming:
            # 处理剩余的buffer
            if self.buffer and self.use_markdown and self.renderer:
                rendered = self.renderer.render(self.buffer)
                if rendered:
                    # 确保以换行结束
                    if not rendered.endswith('\n'):
                        rendered += '\n'
                    click.echo(rendered)
            elif self.buffer:
                click.echo(self.buffer)
            
            self.is_streaming = False
            self.buffer = ''