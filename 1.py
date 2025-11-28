#!/usr/bin/env python3
"""
博客字体样式统一管理脚本
功能：
1. 删除所有HTML和CSS文件中的font-family定义
2. 创建统一的CSS文件
3. 在所有HTML文件的header中添加CSS引用
"""

import os
import re
import glob
from pathlib import Path

class FontFamilyUnifier:
    def __init__(self, root_dir):
        self.root_dir = Path(root_dir)
        self.css_file = self.root_dir / "css" / "basic.css"
        self.css_content = """/* 统一字体样式定义 */
body, html {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

* {
    font-family: inherit;
}
"""
        
    def create_css_directory(self):
        """创建CSS目录和基本CSS文件"""
        css_dir = self.root_dir / "css"
        css_dir.mkdir(exist_ok=True)
        
        # 如果CSS文件不存在，则创建
        if not self.css_file.exists():
            with open(self.css_file, 'w', encoding='utf-8') as f:
                f.write(self.css_content)
            print(f"已创建CSS文件: {self.css_file}")
        else:
            print(f"CSS文件已存在: {self.css_file}")
    
    def remove_font_family_from_css(self, file_path):
        """从CSS文件中删除font-family定义"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # 匹配font-family属性并删除
            pattern = r'font-family\s*:\s*[^;}]+\s*;?\s*'
            new_content = re.sub(pattern, '', content, flags=re.IGNORECASE)
            
            # 删除可能因此产生的空规则
            new_content = re.sub(r'[^{}]+\{\s*\}', '', new_content)
            new_content = re.sub(r'\n\s*\n', '\n', new_content)  # 删除多余空行
            
            if new_content != content:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                print(f"已清理font-family: {file_path}")
                
        except Exception as e:
            print(f"处理CSS文件时出错 {file_path}: {e}")
    
    def remove_font_family_from_html(self, file_path):
        """从HTML文件中删除font-family定义"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            original_content = content
            
            # 1. 删除style属性中的font-family
            style_pattern = r'style="[^"]*font-family[^"]*"'
            def remove_font_from_style(match):
                style_content = match.group(0)
                # 移除font-family属性
                new_style = re.sub(r'font-family\s*:\s*[^;]+;?\s*', '', style_content, flags=re.IGNORECASE)
                # 如果style属性为空，则删除整个属性
                if new_style.strip() == 'style=""':
                    return ''
                return new_style
            
            content = re.sub(style_pattern, remove_font_from_style, content)
            
            # 2. 删除<style>标签中的font-family规则
            def remove_font_from_style_tag(match):
                style_content = match.group(1)
                # 移除font-family属性
                new_style = re.sub(r'font-family\s*:\s*[^;}]+[;}]\s*', '', style_content, flags=re.IGNORECASE)
                return f'<style>{new_style}</style>'
            
            content = re.sub(r'<style>(.*?)</style>', remove_font_from_style_tag, content, flags=re.DOTALL)
            
            # 3. 添加CSS引用（如果还没有）
            css_link = '<link rel="stylesheet" href="/css/basic.css">'
            head_pattern = r'<head[^>]*>'
            
            if css_link not in content:
                # 在head标签后添加CSS引用
                def add_css_link(match):
                    return match.group(0) + '\n    ' + css_link
                
                content = re.sub(head_pattern, add_css_link, content, flags=re.IGNORECASE)
            
            if content != original_content:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                print(f"已处理HTML文件: {file_path}")
                
        except Exception as e:
            print(f"处理HTML文件时出错 {file_path}: {e}")
    
    def process_all_files(self):
        """处理所有文件"""
        print("开始统一字体样式管理...")
        
        # 创建CSS目录和文件
        self.create_css_directory()
        
        # 查找所有HTML文件
        html_files = list(self.root_dir.rglob("*.html"))
        print(f"找到 {len(html_files)} 个HTML文件")
        
        # 处理HTML文件
        for html_file in html_files:
            self.remove_font_family_from_html(html_file)
        
        # 查找所有CSS文件（除了我们要创建的basic.css）
        css_files = list(self.root_dir.rglob("*.css"))
        css_files = [f for f in css_files if f != self.css_file]
        print(f"找到 {len(css_files)} 个CSS文件")
        
        # 处理CSS文件
        for css_file in css_files:
            self.remove_font_family_from_css(css_file)
        
        print("\n处理完成！")
        print("=" * 50)
        print("总结:")
        print(f"- 已创建统一CSS文件: {self.css_file}")
        print(f"- 已处理 {len(html_files)} 个HTML文件")
        print(f"- 已处理 {len(css_files)} 个CSS文件")
        print("- 所有文件中的font-family定义已被移除")
        print("- 所有HTML文件已添加对/css/basic.css的引用")
    
    def preview_changes(self):
        """预览将要进行的更改"""
        print("预览模式 - 将显示会进行的更改但不实际修改文件")
        
        html_files = list(self.root_dir.rglob("*.html"))
        css_files = list(self.root_dir.rglob("*.css"))
        css_files = [f for f in css_files if f != self.css_file]
        
        print(f"将创建CSS文件: {self.css_file}")
        print(f"将处理 {len(html_files)} 个HTML文件:")
        for html_file in html_files[:5]:  # 只显示前5个
            print(f"  - {html_file}")
        if len(html_files) > 5:
            print(f"  ... 和另外 {len(html_files) - 5} 个文件")
        
        print(f"将处理 {len(css_files)} 个CSS文件:")
        for css_file in css_files[:5]:
            print(f"  - {css_file}")
        if len(css_files) > 5:
            print(f"  ... 和另外 {len(css_files) - 5} 个文件")

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='统一博客字体样式管理')
    parser.add_argument('--root', default='.', help='根目录路径 (默认: 当前目录)')
    parser.add_argument('--preview', action='store_true', help='预览模式，不实际修改文件')
    
    args = parser.parse_args()
    
    unifier = FontFamilyUnifier(args.root)
    
    if args.preview:
        unifier.preview_changes()
    else:
        # 询问确认
        response = input("这将修改所有HTML和CSS文件，确定继续吗？(y/N): ")
        if response.lower() in ['y', 'yes']:
            unifier.process_all_files()
        else:
            print("操作已取消")

if __name__ == "__main__":
    main()