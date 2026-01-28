import json
import os
import hashlib
import re
import markdown
import yaml
from markdown.extensions.toc import TocExtension
from datetime import datetime

# 配置路径
POSTS_JSON_PATH = 'json/posts.json'
TEMPLATE_FILE = 'template/post_template.html'
OUTPUT_BASE_DIR = 'posts'
MD_SOURCE_ROOT = 'posts'
HASH_STORAGE_FILE = 'private/file_hashes.json'

def ensure_private_dir():
    """确保private目录存在"""
    private_dir = os.path.dirname(HASH_STORAGE_FILE)
    if private_dir and not os.path.exists(private_dir):
        os.makedirs(private_dir)

def load_hashes():
    """加载之前存储的文件hash值"""
    ensure_private_dir()
    if os.path.exists(HASH_STORAGE_FILE):
        with open(HASH_STORAGE_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {"template": "", "md_files": {}, "json": ""}

def save_hashes(hashes):
    """保存文件hash值"""
    ensure_private_dir()
    with open(HASH_STORAGE_FILE, 'w', encoding='utf-8') as f:
        json.dump(hashes, f, indent=2)

def calculate_file_hash(file_path):
    """计算文件的MD5 hash"""
    try:
        with open(file_path, 'rb') as f:
            return hashlib.md5(f.read()).hexdigest()
    except FileNotFoundError:
        return None

def extract_yaml_frontmatter(content):
    """从Markdown文件中提取YAML frontmatter"""
    # 匹配YAML frontmatter（介于---之间的内容）
    yaml_pattern = r'^---\s*\n(.*?)\n---\s*\n'
    match = re.match(yaml_pattern, content, re.DOTALL)
    
    if match:
        yaml_content = match.group(1)
        try:
            return yaml.safe_load(yaml_content)
        except yaml.YAMLError:
            print(f"警告：YAML解析失败，内容：{yaml_content[:100]}...")
            return {}
    return {}

def extract_title_from_markdown(content):
    """从Markdown内容中提取第一个h1标题"""
    # 移除YAML frontmatter
    content_without_yaml = re.sub(r'^---\s*\n.*?\n---\s*\n', '', content, flags=re.DOTALL)
    
    # 查找第一个#开头的标题
    lines = content_without_yaml.strip().split('\n')
    for line in lines:
        line = line.strip()
        if line.startswith('# '):
            return line[2:].strip()
    
    # 如果没有找到h1标题，返回None
    return None

def find_all_md_files():
    """查找posts目录下的所有md文件"""
    md_files = []
    for root, dirs, files in os.walk(MD_SOURCE_ROOT):
        for file in files:
            if file.endswith('.md'):
                # 获取相对于MD_SOURCE_ROOT的路径
                rel_path = os.path.relpath(os.path.join(root, file), MD_SOURCE_ROOT)
                # 确保路径使用正斜杠，保持跨平台兼容性
                rel_path = rel_path.replace('\\', '/')
                md_files.append(rel_path)
    return sorted(md_files)

def normalize_date(date_value):
    """标准化日期格式，确保返回YYYY-MM-DD格式的字符串"""
    if not date_value:
        return "1970-01-01"
    
    # 如果已经是字符串，尝试解析并标准化
    if isinstance(date_value, str):
        # 尝试解析常见日期格式
        date_formats = [
            "%Y-%m-%d",       # 2025-06-21
            "%Y/%m/%d",       # 2025/06/21
            "%Y-%m-%d %H:%M:%S",  # 2025-06-21 14:30:00
            "%Y/%m/%d %H:%M:%S",  # 2025/06/21 14:30:00
            "%Y年%m月%d日",    # 2025年06月21日
        ]
        
        for fmt in date_formats:
            try:
                dt = datetime.strptime(date_value, fmt)
                return dt.strftime("%Y-%m-%d")
            except ValueError:
                continue
        
        # 如果无法解析，尝试提取日期部分
        date_match = re.search(r'(\d{4})[-\/年](\d{1,2})[-\/月](\d{1,2})', date_value)
        if date_match:
            year = date_match.group(1)
            month = date_match.group(2).zfill(2)
            day = date_match.group(3).zfill(2)
            return f"{year}-{month}-{day}"
        
        # 仍然无法解析，返回原始值（可能会有问题）
        print(f"警告：无法解析日期格式: {date_value}")
        return date_value
    
    # 如果是datetime.date或datetime.datetime对象
    elif hasattr(date_value, 'strftime'):
        return date_value.strftime("%Y-%m-%d")
    
    # 其他类型，转换为字符串
    return str(date_value)

def process_md_file(md_file_path):
    """处理单个md文件，提取元数据和内容"""
    full_path = os.path.join(MD_SOURCE_ROOT, md_file_path)
    
    if not os.path.exists(full_path):
        print(f"警告：找不到文件 {full_path}")
        return None
    
    try:
        with open(full_path, 'r', encoding='utf-8-sig') as f:
            content = f.read()
        
        # 提取YAML frontmatter
        frontmatter = extract_yaml_frontmatter(content)
        
        # 提取标题
        title = extract_title_from_markdown(content)
        if not title:
            # 如果没有h1标题，使用文件名（不含扩展名）
            base_name = os.path.splitext(os.path.basename(md_file_path))[0]
            # 尝试从文件名中提取有意义的标题
            title = base_name.replace('-', ' ').replace('_', ' ').title()
        
        # 获取日期并标准化
        date = normalize_date(frontmatter.get('date'))
        
        # 处理tags
        tags = frontmatter.get('tags', [])
        if isinstance(tags, str):
            # 如果tags是逗号分隔的字符串，转换为列表
            tags = [tag.strip() for tag in tags.split(',') if tag.strip()]
        
        # 确保tags是列表且无重复
        if not isinstance(tags, list):
            tags = []
        # 移除可能存在的空标签
        tags = [tag for tag in tags if tag]
        
        # 计算字数（字符数）
        # 移除YAML frontmatter以计算正文字数
        content_without_yaml = re.sub(r'^---\s*\n.*?\n---\s*\n', '', content, flags=re.DOTALL)
        word_count = len(content_without_yaml.strip())
        
        return {
            "title": title,
            "file": md_file_path,
            "date": date,
            "tags": tags,
            "wordCount": word_count
        }
    except Exception as e:
        print(f"处理文件 {md_file_path} 时出错: {e}")
        import traceback
        traceback.print_exc()
        return None

def generate_json_from_md_files():
    """从所有md文件生成JSON数据"""
    md_files = find_all_md_files()
    posts = []
    
    print(f"找到 {len(md_files)} 个md文件")
    
    for md_file in md_files:
        post_data = process_md_file(md_file)
        if post_data:
            posts.append(post_data)
    
    # 按日期倒序排序（现在日期都是YYYY-MM-DD格式的字符串）
    try:
        posts.sort(key=lambda x: x['date'], reverse=True)
    except Exception as e:
        print(f"排序时出错: {e}")
        # 如果排序失败，至少按文件名排序
        posts.sort(key=lambda x: x['file'], reverse=True)
    
    return posts

def get_rendered_content(md_relative_path):
    """读取MD文件并渲染为HTML，去掉YAML标签"""
    md_full_path = os.path.join(MD_SOURCE_ROOT, md_relative_path)
    if not os.path.exists(md_full_path):
        print(f"警告：找不到MD文件 {md_full_path}")
        return "<p>文章内容文件丢失。</p>"
    
    with open(md_full_path, 'r', encoding='utf-8-sig') as f:
        text = f.read()
    
    # 移除YAML frontmatter（如果存在）
    # 匹配格式：以---开头和结尾的YAML块
    text_without_yaml = re.sub(r'^---\s*\n.*?\n---\s*\n', '', text, flags=re.DOTALL)
    
    # 渲染Markdown
    html = markdown.markdown(text_without_yaml, extensions=[
        'extra',
        'nl2br',
        'sane_lists',
        TocExtension(),
    ])
    return html

def generate_html_file(post_data, template_content):
    """生成单个HTML文件"""
    title = post_data.get('title', '无标题文章')
    file_path = post_data.get('file')
    
    if not file_path:
        return False
    
    print(f"正在生成: {title}")
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
        return True
    except Exception as e:
        print(f"保存文件失败: {e}")
        return False

def main():
    print("开始检查文件变动...")
    
    # 加载之前的hash值
    old_hashes = load_hashes()
    new_hashes = {"template": "", "md_files": {}, "json": ""}
    
    # 计算当前hash值
    # 1. 检查模板文件
    template_hash = calculate_file_hash(TEMPLATE_FILE)
    new_hashes["template"] = template_hash if template_hash else ""
    
    # 2. 检查所有md文件
    md_files = find_all_md_files()
    for md_file in md_files:
        full_path = os.path.join(MD_SOURCE_ROOT, md_file)
        file_hash = calculate_file_hash(full_path)
        if file_hash:
            new_hashes["md_files"][md_file] = file_hash
    
    # 3. 检查JSON文件
    json_hash = calculate_file_hash(POSTS_JSON_PATH)
    new_hashes["json"] = json_hash if json_hash else ""
    
    # 判断是否需要重新生成
    template_changed = old_hashes.get("template") != new_hashes["template"]
    json_changed = old_hashes.get("json") != new_hashes["json"]
    
    # 检查md文件变化
    changed_md_files = []
    for md_file in md_files:
        old_hash = old_hashes.get("md_files", {}).get(md_file)
        new_hash = new_hashes["md_files"].get(md_file)
        
        if old_hash != new_hash:
            changed_md_files.append(md_file)
    
    # 如果没有任何变化，则跳过
    if not template_changed and not changed_md_files and not json_changed:
        print("所有文件均无变动，跳过生成。")
        return
    
    print("检测到文件变动，开始生成...")
    
    # 从md文件生成新的JSON数据
    posts_data = generate_json_from_md_files()
    
    if not posts_data:
        print("错误：未能生成任何文章数据")
        return
    
    # 保存JSON文件
    try:
        os.makedirs(os.path.dirname(POSTS_JSON_PATH), exist_ok=True)
        with open(POSTS_JSON_PATH, 'w', encoding='utf-8') as f:
            json.dump(posts_data, f, ensure_ascii=False, indent=4)
        print(f"已更新JSON文件: {POSTS_JSON_PATH}")
    except Exception as e:
        print(f"保存JSON文件失败: {e}")
    
    # 加载模板
    if not os.path.exists(TEMPLATE_FILE):
        print(f"错误：模板文件 {TEMPLATE_FILE} 不存在")
        return
    
    with open(TEMPLATE_FILE, 'r', encoding='utf-8-sig') as f:
        template_content = f.read()
    
    # 决定需要生成哪些HTML文件
    if template_changed:
        # 模板变化，重新生成所有文章
        print("模板文件有变动，重新生成所有文章...")
        html_files_to_generate = [post["file"] for post in posts_data]
    else:
        # 只生成有变化的文章
        html_files_to_generate = changed_md_files
    
    # 生成HTML文件
    generated_count = 0
    for md_file in html_files_to_generate:
        # 找到对应的文章数据
        post_data = None
        for post in posts_data:
            if post["file"] == md_file:
                post_data = post
                break
        
        if post_data:
            if generate_html_file(post_data, template_content):
                generated_count += 1
    
    # 保存新的hash值
    save_hashes(new_hashes)
    
    print(f"生成完毕！共生成 {generated_count} 个HTML文件。")

if __name__ == '__main__':
    main()