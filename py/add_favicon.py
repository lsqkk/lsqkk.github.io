import os
import re
from pathlib import Path

def process_html_file(filepath):
    """处理单个HTML文件"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except UnicodeDecodeError:
        try:
            with open(filepath, 'r', encoding='latin-1') as f:
                content = f.read()
        except Exception as e:
            print(f"无法读取文件 {filepath}: {e}")
            return False
    except Exception as e:
        print(f"无法读取文件 {filepath}: {e}")
        return False
    
    # 检查是否已经存在favicon链接
    has_favicon = re.search(r'<link\s+[^>]*rel\s*=\s*["\']icon["\']', content, re.IGNORECASE)
    
    # 检查是否有head标签
    head_match = re.search(r'(<head[^>]*>.*?)</head>', content, re.IGNORECASE | re.DOTALL)
    
    if head_match:
        if not has_favicon:
            # 在</head>前添加favicon链接
            head_content = head_match.group(1)
            new_head_content = head_content + '\n    <link rel="icon" href="/assets/img/logo_blue.png" type="image/png">'
            new_content = content.replace(head_content, new_head_content, 1)
            
            try:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                print(f"已更新: {filepath}")
                return True
            except Exception as e:
                print(f"无法写入文件 {filepath}: {e}")
                return False
        else:
            print(f"已存在favicon: {filepath}")
            return False
    else:
        print(f"没有找到<head>标签: {filepath}")
        return False

def find_html_files(root_path):
    """查找所有HTML文件"""
    html_files = []
    for root, dirs, files in os.walk(root_path):
        # 排除.venv目录
        if '.venv' in root.split(os.path.sep):
            continue
        
        for file in files:
            if file.lower().endswith('.html'):
                html_files.append(os.path.join(root, file))
    
    return html_files

def main():
    # 设置根目录（当前目录）
    root_dir = '.'
    
    print(f"开始扫描目录: {os.path.abspath(root_dir)}")
    
    # 查找所有HTML文件
    html_files = find_html_files(root_dir)
    
    print(f"找到 {len(html_files)} 个HTML文件")
    
    # 处理每个HTML文件
    updated_count = 0
    for filepath in html_files:
        if process_html_file(filepath):
            updated_count += 1
    
    print(f"\n处理完成!")
    print(f"总文件数: {len(html_files)}")
    print(f"已更新文件数: {updated_count}")

if __name__ == "__main__":
    main()