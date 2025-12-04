import os
import re
from pathlib import Path
import argparse

def find_html_files(root_dir, exclude_dirs=None):
    """查找所有HTML文件，跳过排除的目录"""
    if exclude_dirs is None:
        exclude_dirs = ['.venv']
    
    html_files = []
    
    for root, dirs, files in os.walk(root_dir):
        # 跳过排除的目录
        dirs[:] = [d for d in dirs if d not in exclude_dirs and not d.startswith('.')]
        
        for file in files:
            if file.lower().endswith('.html'):
                html_files.append(os.path.join(root, file))
    
    return html_files

def has_disable_script(file_path, script_src):
    """检查HTML文件是否已经包含指定的脚本标签"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # 使用正则表达式查找脚本标签
        pattern = re.compile(r'<script[^>]*src=["\']' + re.escape(script_src) + r'["\'][^>]*>', re.IGNORECASE)
        return bool(pattern.search(content))
    
    except Exception as e:
        print(f"读取文件 {file_path} 时出错: {e}")
        return False

def add_script_to_html(file_path, script_src):
    """在HTML文件的</body>标签前添加脚本标签"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 检查是否已经存在</body>标签
        if '</body>' in content.lower():
            # 在</body>前添加脚本
            new_content = re.sub(
                r'(</body>)',
                f'    <script src="{script_src}"></script>\n\\1',
                content,
                flags=re.IGNORECASE
            )
        elif '</head>' in content.lower():
            # 如果没有body标签，在</head>前添加
            new_content = re.sub(
                r'(</head>)',
                f'    <script src="{script_src}"></script>\n\\1',
                content,
                flags=re.IGNORECASE
            )
        else:
            # 如果既没有</body>也没有</head>，在文件末尾添加
            new_content = content + f'\n<script src="{script_src}"></script>'
        
        # 写入文件
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        
        return True
    
    except Exception as e:
        print(f"写入文件 {file_path} 时出错: {e}")
        return False

def process_html_files(dry_run=True, script_src="/js/disable-right-click.js"):
    """处理所有HTML文件"""
    current_dir = os.getcwd()
    html_files = find_html_files(current_dir)
    
    print(f"在 {current_dir} 中找到 {len(html_files)} 个HTML文件")
    print(f"要添加的脚本: {script_src}")
    print("-" * 50)
    
    files_to_fix = []
    files_ok = []
    
    for html_file in html_files:
        if has_disable_script(html_file, script_src):
            files_ok.append(html_file)
        else:
            files_to_fix.append(html_file)
    
    # 显示统计信息
    print(f"✓ 已经包含脚本的文件: {len(files_ok)}")
    print(f"✗ 需要添加脚本的文件: {len(files_to_fix)}")
    print("-" * 50)
    
    if files_to_fix:
        print("需要修复的文件列表:")
        for i, file_path in enumerate(files_to_fix, 1):
            rel_path = os.path.relpath(file_path, current_dir)
            print(f"  {i}. {rel_path}")
        
        if not dry_run:
            print("\n开始修复文件...")
            success_count = 0
            for file_path in files_to_fix:
                rel_path = os.path.relpath(file_path, current_dir)
                if add_script_to_html(file_path, script_src):
                    print(f"  ✓ 已修复: {rel_path}")
                    success_count += 1
                else:
                    print(f"  ✗ 修复失败: {rel_path}")
            
            print(f"\n修复完成！成功修复 {success_count}/{len(files_to_fix)} 个文件")
        else:
            print("\n这是模拟运行（dry run）。要实际修复文件，请使用 --apply 参数")
    else:
        print("所有HTML文件都已包含指定的脚本标签，无需修复。")

def main():
    parser = argparse.ArgumentParser(description='检测并修复HTML文件中缺失的脚本标签')
    parser.add_argument('--apply', action='store_true', help='实际应用修复（默认是模拟运行）')
    parser.add_argument('--script', default='/js/disable-right-click.js', 
                       help='要添加的脚本路径（默认: /js/disable-right-click.js）')
    parser.add_argument('--exclude', nargs='+', default=['.venv'], 
                       help='要排除的目录（默认: .venv）')
    
    args = parser.parse_args()
    
    print("HTML脚本检测与修复工具")
    print("=" * 50)
    
    # 这里可以扩展以支持exclude参数
    process_html_files(dry_run=not args.apply, script_src=args.script)

if __name__ == "__main__":
    main()