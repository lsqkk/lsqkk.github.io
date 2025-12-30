# 用于生成每篇文章的 对应名称.html
# 需要先在/json/posts.json中添加文章信息

import json
import os
from datetime import datetime

# 假设 posts.json 在脚本的同一目录下
POSTS_JSON_PATH = 'json/posts.json'
# HTML 模板文件名
TEMPLATE_FILE = 'template/post_template.html'
# 目标文章存放的根目录。根据你的文件路径 '2025/2502.md'，HTML文件应放在 /posts/2025/ 下
OUTPUT_BASE_DIR = 'posts' 

def load_posts_data(file_path):
    """加载 posts.json 数据"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"错误：未找到文件 {file_path}")
        return []
    except json.JSONDecodeError:
        print(f"错误：文件 {file_path} JSON 格式错误")
        return []

def generate_html_file(post_data, template_content):
    """
    根据文章数据和模板内容生成单个 HTML 文件
    """
    title = post_data.get('title', '无标题文章')
    file_path = post_data.get('file')

    if not file_path:
        print(f"警告：跳过缺少 'file' 字段的文章: {title}")
        return

    # 1. 确定输出路径
    base_name = os.path.splitext(file_path)[0] 
    output_path = os.path.join(OUTPUT_BASE_DIR, base_name + '.html')

    # 2. 准备替换内容
    
    # 替换页面标题 (使用新的占位符名称)
    html_content = template_content.replace(
        'POST_TITLE_PLACEHOLDER', 
        f'{title} - 夸克博客'
    )

    # 构造元数据属性字符串
    date_str = post_data.get('date', '')
    # 使用 json.dumps 确保标签数组能正确嵌入，并转义特殊字符
    tags_str = json.dumps(post_data.get('tags', [])) 
    word_count = post_data.get('wordCount', 0)
    
    # 构造 HTML data 属性字符串
    metadata_string = (
        f'data-md-file="{os.path.basename(file_path)}"'
        f' data-date="{date_str}"'
        f' data-word-count="{word_count}"'
        f" data-tags='{tags_str}'" # 使用单引号包裹JSON字符串
    )
    
    # 替换元数据属性占位符 (使用新的占位符名称)
    html_content = html_content.replace('POST_METADATA_ATTRIBUTES_PLACEHOLDER', metadata_string)
    
    # 3. 写入文件
    try:
        # 确保目录存在
        output_dir = os.path.dirname(output_path)
        os.makedirs(output_dir, exist_ok=True)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(html_content)
        print(f"成功生成文件: {output_path}")

    except Exception as e:
        print(f"生成文件 {output_path} 失败: {e}")


def main():
    """主函数"""
    posts_data = load_posts_data(POSTS_JSON_PATH)
    if not posts_data:
        return

    try:
        with open(TEMPLATE_FILE, 'r', encoding='utf-8') as f:
            template_content = f.read()
    except FileNotFoundError:
        print(f"错误：未找到 HTML 模板文件 {TEMPLATE_FILE}，请先创建。")
        return

    print(f"--- 开始生成 {len(posts_data)} 个文章的独立 HTML 文件 ---")
    for post in posts_data:
        generate_html_file(post, template_content)
    print("--- 所有 HTML 文件生成完毕 ---")

if __name__ == '__main__':
    main()