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

def get_current_directory():
    """获取脚本所在的目录"""
    return os.path.dirname(os.path.abspath(__file__))

def generate_sitemap():
    """
    一键生成sitemap.xml
    自动检测当前目录作为网站根目录
    """
    
    # 自动获取当前目录作为网站根目录
    root_dir = get_current_directory()
    base_url = "https://lsqkk.github.io/"
    
    print("=" * 60)
    print("         🚀 一键生成 sitemap.xml")
    print("=" * 60)
    print(f"📁 网站根目录: {root_dir}")
    print(f"🌐 基础URL: {base_url}")
    print("=" * 60)
    
    # 默认排除的目录
    exclude_dirs = [
        '.git', '.vscode', '__pycache__', 'node_modules',
        '.idea', 'venv', 'env', '.github', 'dist', 'build',
        'cache', '.svn', '.hg', 'test', 'tests', 'temp'
    ]
    
    # 默认排除的文件
    exclude_files = [
        'sitemap.xml', 'robots.txt', '.gitignore', 'CNAME',
        'sitemap_generator.py', 'generate_sitemap.py',
        'README.md', 'LICENSE', '.DS_Store'
    ]
    
    # 创建XML根元素
    urlset = ET.Element('urlset')
    urlset.set('xmlns', 'http://www.sitemaps.org/schemas/sitemap/0.9')
    
    # 扫描所有HTML文件
    html_files = []
    
    print("🔍 正在扫描HTML文件...")
    
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
        if url_count <= 10:  # 只显示前10个URL
            print(f"  {url_count:3d}. {full_url} (优先级: {priority:.1f})")
        elif url_count == 11:
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
    
    print("=" * 60)
    print(f"✅ sitemap.xml 生成成功！")
    print(f"📄 文件位置: {output_path}")
    print(f"🔗 总共添加了 {url_count} 个URL")
    
    # 显示生成的sitemap文件内容预览
    print("-" * 40)
    print("📋 sitemap.xml 内容预览:")
    print("-" * 40)
    
    # 读取并显示前20行
    try:
        with open(output_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            for i, line in enumerate(lines[:20]):
                print(line.rstrip())
            if len(lines) > 20:
                print(f"... 还有 {len(lines) - 20} 行未显示")
    except:
        # 如果是二进制文件，用不同方式读取
        try:
            with open(output_path, 'rb') as f:
                content = f.read().decode('utf-8')
                lines = content.split('\n')
                for i, line in enumerate(lines[:20]):
                    print(line.rstrip())
                if len(lines) > 20:
                    print(f"... 还有 {len(lines) - 20} 行未显示")
        except:
            print("无法显示文件内容预览")
    
    print("=" * 60)
    
    # 询问是否打开生成的sitemap文件
    open_file = input("是否在浏览器中打开sitemap.xml？(y/n): ").lower()
    if open_file == 'y' or open_file == 'yes':
        try:
            webbrowser.open(f'file://{output_path}')
            print("🌐 正在在浏览器中打开sitemap.xml...")
        except:
            print("⚠️  无法在浏览器中打开文件")
    
    return True

def create_robots_txt():
    """同时创建robots.txt文件"""
    root_dir = get_current_directory()
    robots_path = os.path.join(root_dir, 'robots.txt')
    
    if not os.path.exists(robots_path):
        robots_content = f"""# robots.txt for {root_dir}
User-agent: *
Allow: /
Sitemap: /sitemap.xml

# Crawl-delay: 10
# Disallow: /private/
# Disallow: /tmp/
"""
        with open(robots_path, 'w', encoding='utf-8') as f:
            f.write(robots_content)
        print(f"📄 已创建 robots.txt 文件")
    else:
        print(f"📄 robots.txt 文件已存在")

def main():
    """主函数 - 直接运行"""
    try:
        # 生成sitemap
        success = generate_sitemap()
        
        if success:
            # 询问是否创建robots.txt
            create_robots = input("\n是否创建robots.txt文件？(y/n): ").lower()
            if create_robots == 'y' or create_robots == 'yes':
                create_robots_txt()
            
            print("\n" + "🎉 完成！".center(60))
            print("=" * 60)
            print("💡 提示：")
            print("  • 将sitemap.xml提交到GitHub仓库")
            print("  • 在搜索引擎站长工具中提交sitemap")
            print("  • 定期运行此脚本更新sitemap")
            
    except Exception as e:
        print(f"❌ 生成过程中出错: {e}")
        print("\n💡 可能的原因：")
        print("  • 没有写入权限")
        print("  • 当前目录不是网站根目录")
        print("  • Python环境问题")
        
        # 等待用户按任意键退出
        input("\n按回车键退出...")

if __name__ == '__main__':
    # 显示欢迎信息
    print("\n" + "🌟 sitemap生成器 🌟".center(60))
    main()