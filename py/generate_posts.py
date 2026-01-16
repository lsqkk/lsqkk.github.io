import json
import os
import markdown
from markdown.extensions.toc import TocExtension

# 配置路径
POSTS_JSON_PATH = 'json/posts.json'
TEMPLATE_FILE = 'template/post_template.html'
OUTPUT_BASE_DIR = 'posts' 
MD_SOURCE_ROOT = 'posts' 

def load_posts_data(file_path):
    try:
        # 使用 utf-8-sig 处理 JSON 文件，防止 JSON 解析因 BOM 报错
        with open(file_path, 'r', encoding='utf-8-sig') as f:
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
    
    # 核心修复点：使用 utf-8-sig 自动剔除可能存在的 BOM (U+FEFF)
    with open(md_full_path, 'r', encoding='utf-8-sig') as f:
        text = f.read()
    
    # 渲染 Markdown
    html = markdown.markdown(text, extensions=[
        'extra',           
        'nl2br',           
        'sane_lists',      
        TocExtension(),     
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
        # 输出文件保持 utf-8 (标准不带 BOM)，利于浏览器解析
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

    # 读取模板也使用 utf-8-sig 以防万一
    with open(TEMPLATE_FILE, 'r', encoding='utf-8-sig') as f:
        template_content = f.read()

    print(f"开始生成 {len(posts_data)} 个预渲染页面...")
    for post in posts_data:
        generate_html_file(post, template_content)
    print("生成完毕！")

if __name__ == '__main__':
    main()