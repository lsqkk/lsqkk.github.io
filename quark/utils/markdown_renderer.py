import re
import sys
from typing import List, Optional, Dict, Tuple
import click
from textwrap import wrap

class MarkdownRenderer:
    """改进的Markdown渲染器，支持更好的格式化和渲染"""
    
    def __init__(self, use_color: bool = True, width: int = 80):
        self.use_color = use_color
        self.width = width
        
        # 更好的颜色方案
        if use_color:
            self.styles = {
                # 标题
                'h1': lambda x: click.style(x, fg='bright_cyan', bold=True),
                'h2': lambda x: click.style(x, fg='bright_magenta', bold=True),
                'h3': lambda x: click.style(x, fg='bright_blue', bold=True),
                'h4': lambda x: click.style(x, fg='bright_green', bold=True),
                
                # 文本样式
                'bold': lambda x: click.style(x, bold=True),
                'italic': lambda x: click.style(x, italic=True) if hasattr(click.style, '__call__') else f'_{x}_',
                'bold_italic': lambda x: click.style(x, bold=True, italic=True) if hasattr(click.style, '__call__') else f'*{x}*',
                'strikethrough': lambda x: click.style(x, strikethrough=True) if hasattr(click.style, '__call__') else f'~{x}~',
                
                # 特殊元素
                'code': lambda x: click.style(x, fg='bright_yellow', bg='black'),
                'code_block': lambda x: click.style(x, fg='bright_white', bg='black'),
                'quote': lambda x: click.style(x, fg='cyan'),
                'link': lambda x: click.style(x, fg='bright_blue', underline=True),
                
                # 列表和表格
                'list': lambda x: click.style(x, fg='white'),
                'table_header': lambda x: click.style(x, fg='bright_white', bold=True, bg='blue'),
                'table_border': lambda x: click.style(x, fg='blue'),
                'table_cell': lambda x: click.style(x, fg='white'),
                
                # 装饰性
                'emoji': lambda x: click.style(x, fg='yellow'),
                'success': lambda x: click.style(x, fg='green', bold=True),
                'warning': lambda x: click.style(x, fg='yellow', bold=True),
                'error': lambda x: click.style(x, fg='red', bold=True),
                'info': lambda x: click.style(x, fg='blue', bold=True),
                
                # 重置
                'reset': lambda x: click.style(x, reset=True)
            }
        else:
            # 无颜色模式 - 使用纯文本标记
            self.styles = {}
            for key in ['h1', 'h2', 'h3', 'h4', 'bold', 'italic', 'bold_italic', 
                       'strikethrough', 'code', 'code_block', 'quote', 'link',
                       'list', 'table_header', 'table_border', 'table_cell',
                       'emoji', 'success', 'warning', 'error', 'info', 'reset']:
                self.styles[key] = lambda x: x
    
    def _apply_style(self, style_name: str, text: str) -> str:
        """应用样式"""
        if style_name in self.styles:
            return self.styles[style_name](text)
        return text
    
    def render(self, text: str) -> str:
        """渲染Markdown文本"""
        lines = text.split('\n')
        rendered_lines = []
        
        in_code_block = False
        code_block_lang = ''
        in_table = False
        table_rows = []
        in_quote = False
        quote_level = 0
        in_list = False
        list_type = None  # 'ul' 或 'ol'
        
        i = 0
        while i < len(lines):
            line = lines[i]
            stripped = line.strip()
            
            # 跳过空行
            if not stripped and not in_code_block and not in_table:
                i += 1
                continue
            
            # 处理代码块
            if stripped.startswith('```'):
                if not in_code_block:
                    # 开始代码块
                    in_code_block = True
                    code_block_lang = stripped[3:].strip()
                    rendered_lines.append(self._render_code_block_start(code_block_lang))
                else:
                    # 结束代码块
                    in_code_block = False
                    rendered_lines.append(self._render_code_block_end())
                i += 1
                continue
            
            if in_code_block:
                rendered_lines.append(self._render_code_line(line))
                i += 1
                continue
            
            # 处理标题
            heading_match = re.match(r'^(#{1,6})\s+(.+)$', line)
            if heading_match:
                hashes, content = heading_match.groups()
                level = len(hashes)
                rendered_lines.append(self._render_heading(content, level))
                i += 1
                continue
            
            # 处理引用
            quote_match = re.match(r'^(>+)\s*(.*)$', line)
            if quote_match:
                quotes, content = quote_match.groups()
                current_level = len(quotes)
                
                if not in_quote or current_level != quote_level:
                    if in_quote and current_level < quote_level:
                        # 结束当前引用块
                        rendered_lines.append(self._render_quote_end())
                    
                    rendered_lines.append(self._render_quote_start(current_level))
                    in_quote = True
                    quote_level = current_level
                
                rendered_lines.append(self._render_quote_line(content, current_level))
                i += 1
                continue
            elif in_quote:
                # 引用块结束
                rendered_lines.append(self._render_quote_end())
                in_quote = False
                quote_level = 0
            
            # 处理列表
            list_match = re.match(r'^(\s*)([-*+]|\d+\.)\s+(.+)$', line)
            if list_match:
                indent, marker, content = list_match.groups()
                level = len(indent) // 2
                is_ordered = marker[-1] == '.'
                
                if not in_list:
                    rendered_lines.append('')  # 空行分隔
                
                rendered_lines.append(self._render_list_item(content, level, is_ordered, marker))
                in_list = True
                list_type = 'ol' if is_ordered else 'ul'
                i += 1
                continue
            elif in_list:
                # 检查下一行是否还是列表项
                next_is_list = i < len(lines) - 1 and re.match(r'^(\s*)([-*+]|\d+\.)\s+', lines[i + 1])
                if not next_is_list:
                    in_list = False
                    list_type = None
            
            # 处理表格
            if '|' in line and not stripped.startswith('|--'):
                # 收集表格行
                table_start = i
                table_rows = []
                
                while i < len(lines) and '|' in lines[i]:
                    table_rows.append(lines[i])
                    i += 1
                
                # 渲染表格
                if len(table_rows) >= 2:
                    rendered_lines.append(self._render_table(table_rows))
                    continue
                else:
                    i = table_start  # 回退
            
            # 处理分割线
            if re.match(r'^[-*_]{3,}$', stripped):
                rendered_lines.append(self._render_hr())
                i += 1
                continue
            
            # 处理普通段落
            if stripped:
                # 合并连续的行直到遇到空行或特殊元素
                paragraph_lines = []
                while i < len(lines) and lines[i].strip() and not self._is_special_line(lines[i]):
                    paragraph_lines.append(lines[i])
                    i += 1
                
                if paragraph_lines:
                    paragraph = ' '.join(paragraph_lines)
                    rendered_lines.append(self._render_paragraph(paragraph))
                continue
            
            # 默认：普通行
            if line:
                rendered_lines.append(self._apply_inline_styles(line))
            
            i += 1
        
        # 确保引用块被正确关闭
        if in_quote:
            rendered_lines.append(self._render_quote_end())
        
        return '\n'.join(rendered_lines)
    
    def _is_special_line(self, line: str) -> bool:
        """判断是否为特殊行（标题、列表、代码块等）"""
        stripped = line.strip()
        return (
            stripped.startswith('#') or
            re.match(r'^(\s*)([-*+]|\d+\.)\s+', line) or
            stripped.startswith('```') or
            stripped.startswith('>') or
            re.match(r'^[-*_]{3,}$', stripped) or
            '|' in line and len(stripped) > 1
        )
    
    def _render_heading(self, text: str, level: int) -> str:
        """渲染标题"""
        # 清理内联样式
        text = self._apply_inline_styles(text)
        
        if level == 1:
            styled = self._apply_style('h1', text)
            underline = '═' * min(len(text) + 2, self.width)
            return f"\n{styled}\n{self._apply_style('h1', underline)}\n"
        elif level == 2:
            styled = self._apply_style('h2', text)
            underline = '─' * min(len(text) + 2, self.width)
            return f"\n{styled}\n{self._apply_style('h2', underline)}\n"
        elif level == 3:
            styled = self._apply_style('h3', f"▶ {text}")
            return f"\n{styled}\n"
        else:
            styled = self._apply_style('h4', f"  • {text}")
            return f"\n{styled}\n"
    
    def _render_code_block_start(self, language: str) -> str:
        """渲染代码块开始"""
        lang_display = f" {language}" if language else ""
        top_border = f"╭{'─' * (self.width - 2)}╮"
        lang_line = f"│ 代码{lang_display}{' ' * (self.width - 6 - len(lang_display))}│"
        
        styled_border = self._apply_style('code_block', top_border)
        styled_lang = self._apply_style('code_block', lang_line)
        
        return f"\n{styled_border}\n{styled_lang}\n{self._apply_style('code_block', '├' + '─' * (self.width - 2) + '┤')}"
    
    def _render_code_block_end(self) -> str:
        """渲染代码块结束"""
        bottom_border = f"╰{'─' * (self.width - 2)}╯"
        return f"{self._apply_style('code_block', bottom_border)}\n"
    
    def _render_code_line(self, line: str) -> str:
        """渲染代码行"""
        # 保持原始缩进
        escaped = line.replace('\t', '    ')
        padded = escaped + ' ' * max(0, self.width - len(escaped) - 4)
        return f"{self._apply_style('code_block', '│ ' + padded + ' │')}"
    
    def _render_quote_start(self, level: int) -> str:
        """渲染引用块开始"""
        indent = '  ' * (level - 1)
        return f"\n{indent}{self._apply_style('quote', '┌')}"
    
    def _render_quote_line(self, text: str, level: int) -> str:
        """渲染引用行"""
        indent = '  ' * (level - 1)
        styled_text = self._apply_inline_styles(text)
        
        # 自动换行
        lines = wrap(styled_text, width=self.width - len(indent) - 4)
        if not lines:
            lines = ['']
        
        rendered = []
        for idx, line in enumerate(lines):
            prefix = '│' if idx == 0 else '│'
            rendered.append(f"{indent}{self._apply_style('quote', prefix)} {line}")
        
        return '\n'.join(rendered)
    
    def _render_quote_end(self) -> str:
        """渲染引用块结束"""
        return f"{self._apply_style('quote', '└')}\n"
    
    def _render_list_item(self, text: str, level: int, is_ordered: bool, marker: str) -> str:
        """渲染列表项"""
        indent = '  ' * level
        
        if is_ordered:
            bullet = f"{marker} "
        else:
            bullet_map = {'-': '•', '*': '•', '+': '➤'}
            bullet = f"{bullet_map.get(marker, '•')} "
        
        styled_text = self._apply_inline_styles(text)
        bullet_styled = self._apply_style('list', bullet)
        
        # 自动换行
        lines = wrap(styled_text, width=self.width - len(indent) - len(bullet))
        if not lines:
            lines = ['']
        
        rendered = []
        for idx, line in enumerate(lines):
            if idx == 0:
                rendered.append(f"{indent}{bullet_styled}{line}")
            else:
                # 续行缩进
                line_indent = ' ' * len(bullet)
                rendered.append(f"{indent}{line_indent}{line}")
        
        return '\n'.join(rendered)
    
    def _render_table(self, rows: List[str]) -> str:
        """渲染表格"""
        # 解析表格
        parsed_rows = []
        for row in rows:
            # 移除首尾的管道符
            cleaned = row.strip('| ')
            cells = [cell.strip() for cell in cleaned.split('|')]
            parsed_rows.append(cells)
        
        if len(parsed_rows) < 2:
            return self._apply_inline_styles(rows[0])
        
        # 计算列宽
        col_count = len(parsed_rows[0])
        col_widths = [0] * col_count
        
        for row in parsed_rows:
            for j, cell in enumerate(row):
                if j < col_count:
                    # 移除样式标记计算长度
                    clean_cell = re.sub(r'[*_`~]', '', cell)
                    col_widths[j] = max(col_widths[j], len(clean_cell))
        
        # 确保最小宽度
        col_widths = [max(w, 3) for w in col_widths]
        
        rendered_lines = []
        
        # 表头
        header_cells = parsed_rows[0]
        header_line = '│'
        for j, cell in enumerate(header_cells):
            if j < len(col_widths):
                styled_cell = self._apply_style('table_header', cell.center(col_widths[j]))
                header_line += f" {styled_cell} │"
        
        # 表格边框
        top_border = '┌'
        separator = '├'
        bottom_border = '└'
        
        for width in col_widths:
            top_border += '─' * (width + 2) + '┬'
            separator += '─' * (width + 2) + '┼'
            bottom_border += '─' * (width + 2) + '┴'
        
        top_border = top_border[:-1] + '┐'
        separator = separator[:-1] + '┤'
        bottom_border = bottom_border[:-1] + '┘'
        
        # 渲染
        rendered_lines.append(self._apply_style('table_border', top_border))
        rendered_lines.append(header_line)
        rendered_lines.append(self._apply_style('table_border', separator))
        
        # 数据行
        for i in range(1, len(parsed_rows)):
            if i == 1 and '---' in parsed_rows[i][0]:  # 分隔行
                continue
            
            row_cells = parsed_rows[i]
            row_line = '│'
            for j, cell in enumerate(row_cells):
                if j < len(col_widths):
                    styled_cell = self._apply_style('table_cell', cell.ljust(col_widths[j]))
                    row_line += f" {styled_cell} │"
            rendered_lines.append(row_line)
        
        rendered_lines.append(self._apply_style('table_border', bottom_border))
        
        return '\n'.join(rendered_lines)
    
    def _render_hr(self) -> str:
        """渲染水平分割线"""
        line = '─' * (self.width - 4)
        return f"\n  {self._apply_style('info', line)}\n"
    
    def _render_paragraph(self, text: str) -> str:
        """渲染段落"""
        styled_text = self._apply_inline_styles(text)
        
        # 检测特殊内容（如emoji、提示等）
        if '💡' in text or '提示' in text:
            styled_text = self._apply_style('info', styled_text)
        elif '⚠️' in text or '注意' in text:
            styled_text = self._apply_style('warning', styled_text)
        elif '√' in text or '正确' in text:
            styled_text = self._apply_style('success', styled_text)
        elif '❌' in text or '错误' in text:
            styled_text = self._apply_style('error', styled_text)
        
        # 自动换行
        lines = wrap(styled_text, width=self.width)
        return '\n'.join(lines) + '\n'
    
    def _apply_inline_styles(self, text: str) -> str:
        """应用内联样式（粗体、斜体、代码等）"""
        if not self.use_color:
            return text
        
        # 处理内联代码 `code`
        text = re.sub(
            r'`([^`]+)`',
            lambda m: self._apply_style('code', m.group(1)),
            text
        )
        
        # 处理粗体 **bold**
        text = re.sub(
            r'\*\*([^*]+)\*\*',
            lambda m: self._apply_style('bold', m.group(1)),
            text
        )
        
        # 处理斜体 *italic*
        text = re.sub(
            r'\*([^*]+)\*',
            lambda m: self._apply_style('italic', m.group(1)),
            text
        )
        
        # 处理粗斜体 ***bold italic***
        text = re.sub(
            r'\*\*\*([^*]+)\*\*\*',
            lambda m: self._apply_style('bold_italic', m.group(1)),
            text
        )
        
        # 处理删除线 ~~strikethrough~~
        text = re.sub(
            r'~~([^~]+)~~',
            lambda m: self._apply_style('strikethrough', m.group(1)),
            text
        )
        
        # 处理链接 [text](url)
        text = re.sub(
            r'\[([^\]]+)\]\(([^)]+)\)',
            lambda m: self._apply_style('link', m.group(1)),
            text
        )
        
        # 处理emoji（简单着色）
        emoji_pattern = r'[\U0001F300-\U0001F9FF]'
        text = re.sub(
            emoji_pattern,
            lambda m: self._apply_style('emoji', m.group(0)),
            text
        )
        
        return text
    
    def render_stream_chunk(self, chunk: str, buffer: str = '') -> Tuple[str, str]:
        """
        渲染流式输出的一个chunk
        
        Args:
            chunk: 新接收到的文本chunk
            buffer: 之前未完成的缓冲区
            
        Returns:
            (rendered_chunk, new_buffer)
        """
        # 将新chunk添加到缓冲区
        buffer += chunk
        
        # 尝试按段落分割
        rendered = ''
        
        # 按双换行分割（段落）
        paragraphs = buffer.split('\n\n')
        
        if len(paragraphs) > 1:
            # 处理完整的段落
            for para in paragraphs[:-1]:
                if para.strip():
                    rendered += self.render(para.strip()) + '\n\n'
            remaining = paragraphs[-1]
        else:
            remaining = buffer
        
        # 如果剩余部分包含完整的行，也渲染
        lines = remaining.split('\n')
        if len(lines) > 1:
            for line in lines[:-1]:
                if line.strip():
                    # 检查是否是特殊行
                    if self._is_special_line(line):
                        rendered += self.render(line.strip()) + '\n'
                    else:
                        rendered += self._apply_inline_styles(line.strip()) + '\n'
            remaining = lines[-1]
        
        return rendered, remaining