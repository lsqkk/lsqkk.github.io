import os
import re
from pathlib import Path

def find_html_files(root_dir):
    """查找所有HTML文件，排除.venv目录"""
    html_files = []
    
    for root, dirs, files in os.walk(root_dir):
        # 排除.venv目录
        if '.venv' in root.split(os.sep):
            continue
        
        for file in files:
            if file.lower().endswith('.html'):
                html_files.append(os.path.join(root, file))
    
    return html_files

def extract_title(html_content):
    """从HTML内容中提取<title>标签内容"""
    pattern = r'<title[^>]*>(.*?)</title>'
    match = re.search(pattern, html_content, re.IGNORECASE | re.DOTALL)
    
    if match:
        return match.group(1).strip()
    return None

def modify_title(html_content, new_title):
    """修改HTML中的<title>标签内容"""
    pattern = r'(<title[^>]*>)(.*?)(</title>)'
    
    def replace_title(match):
        return f"{match.group(1)}{new_title}{match.group(3)}"
    
    return re.sub(pattern, replace_title, html_content, flags=re.IGNORECASE | re.DOTALL)

def process_html_files():
    # 获取当前目录
    current_dir = os.getcwd()
    print(f"正在扫描目录: {current_dir}")
    
    # 查找所有HTML文件
    html_files = find_html_files(current_dir)
    
    if not html_files:
        print("未找到HTML文件")
        return
    
    print(f"找到 {len(html_files)} 个HTML文件\n")
    
    # 存储需要修改的文件和标题
    files_to_modify = []
    
    # 扫描所有文件，找出需要修改的标题
    for file_path in html_files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            title = extract_title(content)
            
            if title:
                # 检查标题是否以" - 夸克博客"结尾
                if not title.endswith(" - 夸克博客"):
                    files_to_modify.append((file_path, title))
        except Exception as e:
            print(f"读取文件 {file_path} 时出错: {e}")
    
    if not files_to_modify:
        print("所有标题都已符合要求（以' - 夸克博客'结尾）")
        return
    
    print(f"发现 {len(files_to_modify)} 个需要修改的标题：\n")
    
    # 处理每个需要修改的文件
    for i, (file_path, old_title) in enumerate(files_to_modify):
        print(f"文件 {i+1}/{len(files_to_modify)}: {file_path}")
        print(f"当前标题: {old_title}")
        print(f"建议格式: [你的标题] - 夸克博客")
        
        # 获取用户输入
        user_input = input("请输入新标题（直接回车跳过，输入A使用原标题加后缀）: ").strip()
        
        if user_input == "":
            print("跳过此文件\n")
            continue
        
        # 确定新标题
        if user_input.upper() == "A":
            new_title = f"{old_title} - 夸克博客"
        else:
            # 如果用户输入已经包含后缀，直接使用
            if user_input.endswith(" - 夸克博客"):
                new_title = user_input
            else:
                new_title = f"{user_input} - 夸克博客"
        
        print(f"新标题: {new_title}")
        
        # 确认修改
        confirm = 'y'
        
        if confirm == 'y':
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # 修改标题
                modified_content = modify_title(content, new_title)
                
                # 写回文件
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(modified_content)
                
                print("修改成功！\n")
            except Exception as e:
                print(f"修改文件时出错: {e}\n")


if __name__ == "__main__":
    print("=== HTML标题检查与修改工具 ===")
    print("功能：检查HTML文件<title>标签是否以' - 夸克博客'结尾")
    print("说明：")
    print("1. 输入新标题 → 修改为'[输入内容] - 夸克博客'")
    print("2. 输入A → 在原标题后添加' - 夸克博客'")
    print("3. 直接回车 → 跳过不修改")
    print("=" * 40)
    
    process_html_files()
    print("处理完成！")