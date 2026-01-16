import json
import os
import markdown
from markdown.extensions.toc import TocExtension, slugify # 引入默认的 slugify

# 配置路径
POSTS_JSON_PATH = 'json/posts.json'
TEMPLATE_FILE = 'template/post_template.html'
OUTPUT_BASE_DIR = 'posts' 
MD_SOURCE_ROOT = 'posts' 

def load_posts_data(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"错误：无法加载 {file_path}: {e}")
        return []

def get_rendered_content(md_relative_path):
    """读取 MD 文件并渲染为 HTML"""
    md_full_path = os.path.join(MD_SOURCE_ROOT, md_relative_path)
    if not os.path.exists(md_full_path):
        print(f"警告：找不到 MD 文件 {md_full_path}")
        return "<p>文章内容文件丢失。</p>"
    
    with open(md_full_path, 'r', encoding='utf-8') as f:
        text = f.read()
    
    # 修复点：移除了 slugify=None
    # 使用 TocExtension() 将使用默认 ID 生成逻辑，对中文支持友好
    html = markdown.markdown(text, extensions=[
        'extra',           
        'nl2br',           
        'sane_lists',      
        TocExtension(),     # 使用默认配置即可支持目录锚点生成
    ])
    return html

def generate_html_file(post_data, template_content):
    title = post_data.get('title', '无标题文章')
    file_path = post_data.get('file') 

    if not file_path:
        return

    print(f"正在处理: {title}")
    article_html = get_rendered_content(file_path)

    base_name = os.path.splitext(file_path)[0] 
    output_path = os.path.join(OUTPUT_BASE_DIR, base_name + '.html')

    html_content = template_content
    html_content = html_content.replace('POST_TITLE_PLACEHOLDER', f'{title} - 夸克博客')
    html_content = html_content.replace('POST_CONTENT_PLACEHOLDER', article_html)
    
    date_str = post_data.get('date', '')
    tags_str = json.dumps(post_data.get('tags', []), ensure_ascii=False) 
    word_count = post_data.get('wordCount', 0)
    
    metadata_string = (
        f'data-md-file="{os.path.basename(file_path)}"'
        f' data-date="{date_str}"'
        f' data-word-count="{word_count}"'
        f" data-tags='{tags_str}'"
    )
    
    html_content = html_content.replace('POST_METADATA_ATTRIBUTES_PLACEHOLDER', metadata_string)
    
    try:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(html_content)
    except Exception as e:
        print(f"保存文件失败: {e}")

def main():
    posts_data = load_posts_data(POSTS_JSON_PATH)
    if not posts_data: return

    if not os.path.exists(TEMPLATE_FILE):
        print(f"错误：模板文件 {TEMPLATE_FILE} 不存在")
        return

    with open(TEMPLATE_FILE, 'r', encoding='utf-8') as f:
        template_content = f.read()

    print(f"开始生成 {len(posts_data)} 个预渲染页面...")
    for post in posts_data:
        generate_html_file(post, template_content)
    print("生成完毕！")

if __name__ == '__main__':
    main()