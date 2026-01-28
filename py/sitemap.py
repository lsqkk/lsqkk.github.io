#!/usr/bin/env python3
"""
一键生成sitemap.xml脚本
注意生成后替换左右斜杠
"""

import os
import xml.etree.ElementTree as ET
from xml.dom import minidom
from datetime import datetime
from pathlib import Path
import webbrowser

def generate_sitemap():
    """
    一键生成sitemap.xml
    自动检测当前目录作为网站根目录
    """
    
    # 自动获取当前目录作为网站根目录
    root_dir = "D:\git\lsqkk\lsqkk.github.io"
    base_url = "https://lsqkk.github.io/"
    
    # 默认排除的目录
    exclude_dirs = [
        '.git', '.vscode', '__pycache__', 'node_modules',
        '.idea', '.venv','venv', 'env', '.github', 'dist', 'build',
        'cache', '.svn', '.hg', 'test', 'tests', 'temp', 'rubbish', 'template'
    ]
    
    # 默认排除的文件
    exclude_files = [
        'sitemap.xml', 'robots.txt', '.gitignore', 'CNAME',
        'README.md', 'LICENSE', 'readme.md',  '404.html', 'auth.html'
    ]
    
    # 创建XML根元素
    urlset = ET.Element('urlset')
    urlset.set('xmlns', 'http://www.sitemaps.org/schemas/sitemap/0.9')
    
    # 扫描所有HTML文件
    html_files = []
    
    for root, dirs, files in os.walk(root_dir):
        # 排除不需要的目录
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        
        for file in files:
            if file.endswith('.html') or file.endswith('.htm'):
                # 排除不需要的文件
                if file in exclude_files:
                    continue
                
                file_path = os.path.join(root, file)
                html_files.append(file_path)
    
    print(f"✅ 找到 {len(html_files)} 个HTML文件")
    print("-" * 40)
    
    if len(html_files) == 0:
        print("❌ 未找到任何HTML文件！")
        print("请确保脚本放在网站根目录下，且网站包含HTML文件")
        return
    
    # 为每个HTML文件创建URL条目
    url_count = 0
    
    for file_path in html_files:
        # 获取相对路径
        rel_path = os.path.relpath(file_path, root_dir)
        
        # 计算文件夹深度（用于确定优先级）
        depth = rel_path.count(os.sep)
        
        # 优先级的计算：根目录为1.0，每深一级减少0.1，最低0.1
        priority = max(1.0 - (depth * 0.1), 0.1)
        
        # 对于index.html文件，深度减1（因为index.html通常代表当前目录）
        file_name = os.path.basename(rel_path)
        if file_name == 'index.html' or file_name == 'index.htm':
            depth = max(0, depth - 1)
            priority = max(1.0 - (depth * 0.1), 0.1)
        
        # 构建完整URL
        # 如果是index.html，使用目录路径
        if file_name == 'index.html' or file_name == 'index.htm':
            dir_path = os.path.dirname(rel_path)
            if dir_path == '.':
                url_path = '/'
            else:
                url_path = f'/{dir_path}/'
        else:
            # 移除.html或.htm后缀，创建更友好的URL
            base_name = rel_path[:-5] if rel_path.endswith('.html') else rel_path[:-4]
            url_path = f'/{base_name}/'
        
        full_url = base_url.rstrip('/') + url_path
        
        # 获取文件最后修改时间
        try:
            lastmod = datetime.fromtimestamp(os.path.getmtime(file_path)).strftime('%Y-%m-%d')
        except:
            lastmod = datetime.now().strftime('%Y-%m-%d')
        
        # 创建URL元素
        url_elem = ET.SubElement(urlset, 'url')
        
        # 添加子元素
        loc = ET.SubElement(url_elem, 'loc')
        loc.text = full_url
        
        lastmod_elem = ET.SubElement(url_elem, 'lastmod')
        lastmod_elem.text = lastmod
        
        changefreq = ET.SubElement(url_elem, 'changefreq')
        changefreq.text = 'monthly'  # 默认更新频率
        
        priority_elem = ET.SubElement(url_elem, 'priority')
        priority_elem.text = f"{priority:.1f}"
        
        url_count += 1
        
        # 显示进度
        if url_count <= 3:  # 只显示前3个URL
            print(f"  {url_count:3d}. {full_url} (优先级: {priority:.1f})")
        elif url_count == 4:
            print(f"  ... 还有 {len(html_files) - 10} 个URL未显示")
    
    # 生成XML字符串
    xml_string = ET.tostring(urlset, encoding='utf-8')
    
    # 美化XML输出
    reparsed = minidom.parseString(xml_string)
    pretty_xml = reparsed.toprettyxml(indent='  ', encoding='utf-8')
    
    # 写入文件
    output_path = os.path.join(root_dir, 'sitemap.xml')
    with open(output_path, 'wb') as f:
        f.write(pretty_xml)
    
    print("-" * 30)
    print(f"sitemap.xml 生成成功，位于 {output_path} ，包含 {url_count} 个URL")
    
    # 返回输出路径供后续处理使用
    return output_path


def post_generation_replace(file_path):
    """
    生成后替换功能：
    1. 将所有右斜杠"\"替换成左斜杠"/"
    2. 将"io//"替换为"io/"
    
    Args:
        file_path: 要处理的文件路径
    """
    print("\n" + "=" * 60)
    print("开始执行生成后替换功能...")
    
    try:
        # 读取文件内容
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 统计原始内容中的斜杠数量
        original_backslashes = content.count('\\')
        original_double_slashes = content.count('io//')
        
        print(f"原始内容统计:")
        print(f"  - 右斜杠(\\)数量: {original_backslashes}")
        print(f"  - 'io//'出现次数: {original_double_slashes}")
        
        # 执行替换
        # 1. 将所有右斜杠替换为左斜杠
        content = content.replace('\\', '/')
        
        # 2. 将"io//"替换为"io/"
        content = content.replace('io//', 'io/')
        
        # 统计替换后的斜杠数量
        new_backslashes = content.count('\\')
        new_double_slashes = content.count('io//')
        
        print(f"\n替换后内容统计:")
        print(f"  - 右斜杠(\\)数量: {new_backslashes}")
        print(f"  - 'io//'出现次数: {new_double_slashes}")
        
        # 计算替换数量
        replaced_backslashes = original_backslashes - new_backslashes
        replaced_double_slashes = original_double_slashes - new_double_slashes
        
        # 保存替换后的内容
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        print(f"\n✅ 替换完成:")
        print(f"  - 替换右斜杠数量: {replaced_backslashes}")
        print(f"  - 替换'io//'数量: {replaced_double_slashes}")
        print(f"  - 文件已更新: {file_path}")
        
        # 显示替换示例（如果有替换的话）
        if replaced_backslashes > 0 or replaced_double_slashes > 0:
            print(f"\n📝 替换示例:")
            
            # 查找替换后的示例
            lines = content.split('\n')
            for i, line in enumerate(lines[:5]):  # 显示前5行中的示例
                if 'io/' in line and 'loc' in line:
                    print(f"  第{i+1}行: {line.strip()[:80]}...")
        
        return True
        
    except Exception as e:
        print(f"❌ 替换过程中出错: {e}")
        return False


def main():
    """主函数 - 直接运行"""
    try:
        # 生成sitemap
        output_path = generate_sitemap()
        
        if output_path and os.path.exists(output_path):
            # 执行生成后替换
            success = post_generation_replace(output_path)
            
            if success:
                print("\n" + "=" * 60)
                print("🎉 所有操作已完成！")
            else:
                print("\n⚠️  生成完成，但替换功能执行失败")
        else:
            print("\n⚠️  生成失败或输出文件不存在")

    except Exception as e:
        print(f"生成过程中出错: {e}")
    
    # 等待用户按任意键退出
    input("\n按回车键退出...")

if __name__ == '__main__':
    main()