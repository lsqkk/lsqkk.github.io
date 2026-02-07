#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import os
from pathlib import Path

def load_config(config_path):
    """加载配置文件"""
    with open(config_path, 'r', encoding='utf-8') as f:
        return json.load(f)

def load_template(template_path):
    """加载模板文件"""
    with open(template_path, 'r', encoding='utf-8') as f:
        return f.read()

def assemble_main_content(config, template_dir):
    """组装主栏内容"""
    main_content_parts = []
    
    # 定义键名到模板文件名的映射
    main_template_mapping = {
        "avatar_nickname": "main_avatar_nickname.html",
        "social_links": "main_social_links.html",
        "welcome_section": "main_welcome.html",
        "typewriter": "main_typewriter.html",
        "recent_articles": "main_articles.html",
        "dynamic_feed": "main_dynamic.html"
    }
    
    # 收集所有需要显示的内容，按照JSON中的顺序
    for key in config["main_content"]:
        # 检查是否为模板键
        if key in main_template_mapping and config["main_content"].get(key, True):
            filename = main_template_mapping[key]
            template_path = os.path.join(template_dir, filename)
            if os.path.exists(template_path):
                main_content_parts.append(load_template(template_path))
            else:
                print(f"警告: 模板文件 {template_path} 不存在")
    
    return "\n".join(main_content_parts)



def assemble_sidebar_content(config, template_dir):
    """组装副栏内容"""
    sidebar_content_parts = []
    
    # 定义键名到模板文件名的映射
    sidebar_template_mapping = {
        "datetime_display": "sidebar_datetime.html",
        "ip_greeting": "sidebar_ip_greeting.html",
        "greeting_tip": "sidebar_greeting_tip.html",
        "github_promo": "sidebar_github_promo.html",
        "latest_features": "sidebar_features.html",
        "announcement": "sidebar_announcement.html",
        "latest_video": "sidebar_video.html",
        "comments": "sidebar_messages.html",
        "friend_links": "sidebar_friends.html"
    }
    
    # 收集所有需要显示的内容，按照JSON中的顺序
    displayed_contents = []
    for key in config["sidebar"]:
        # 检查是否为模板键（不是普通的布尔值配置）
        if key in sidebar_template_mapping and config["sidebar"].get(key, True):
            filename = sidebar_template_mapping[key]
            template_path = os.path.join(template_dir, filename)
            if os.path.exists(template_path):
                content = load_template(template_path)
                # 移除模板可能存在的首尾空白
                content = content.strip()
                if content:
                    displayed_contents.append(content)
            else:
                print(f"警告: 模板文件 {template_path} 不存在")
    
    # 在显示的内容之间添加分割线（不在最后一个元素后添加）
    for i, content in enumerate(displayed_contents):
        sidebar_content_parts.append(content)
        if i < len(displayed_contents) - 1:  # 如果不是最后一个元素
            sidebar_content_parts.append('<div class="index-divider"></div>')
    
    return "\n".join(sidebar_content_parts)
def assemble_footer_content(config, template_dir):
    """组装页脚内容"""
    footer_content_parts = []
    
    # 定义键名到模板文件名的映射
    footer_template_mapping = {
        "visitor_stats": "footer_visitor_stats.html",
        "copyright_info": "footer_copyright.html",
        "icp_record": "footer_icp.html"
    }
    
    # 收集所有需要显示的内容，按照JSON中的顺序
    for key in config["footer"]:
        # 检查是否为模板键
        if key in footer_template_mapping and config["footer"].get(key, True):
            filename = footer_template_mapping[key]
            template_path = os.path.join(template_dir, filename)
            if os.path.exists(template_path):
                content = load_template(template_path)
                # 移除模板可能存在的首尾空白
                content = content.strip()
                if content:
                    footer_content_parts.append(content)
            else:
                print(f"警告: 模板文件 {template_path} 不存在")
    
    return "\n".join(footer_content_parts)

def generate_index_html(config_path, template_dir, output_path):
    """生成完整的index.html文件"""
    # 加载配置
    config = load_config(config_path)
    
    # 加载基础模板
    base_template = load_template(os.path.join(template_dir, "base.html"))
    
    # 组装各部分内容
    main_content = assemble_main_content(config, template_dir)
    sidebar_content = assemble_sidebar_content(config, template_dir)
    footer_content = assemble_footer_content(config, template_dir)
    
    # 替换占位符
    html_content = base_template.replace(
        "<!-- MAIN_CONTENT_PLACEHOLDER -->", 
        main_content
    ).replace(
        "<!-- SIDEBAR_CONTENT_PLACEHOLDER -->", 
        sidebar_content
    ).replace(
        "<!-- FOOTER_CONTENT_PLACEHOLDER -->", 
        footer_content
    )
    
    # 确保输出目录存在
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    # 写入生成的HTML文件
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html_content)
    
    print(f"主页已成功生成: {output_path}")
    print(f"主栏包含 {len(main_content.split('</'))} 个HTML元素")
    print(f"副栏包含 {len(sidebar_content.split('</'))} 个HTML元素")
    print(f"页脚包含 {len(footer_content.split('</'))} 个HTML元素")

def main():
    """主函数"""
    # 定义路径
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    
    config_path = os.path.join(project_root, "json", "index_config.json")
    template_dir = os.path.join(project_root, "template", "index")
    output_path = os.path.join(project_root, "index.html")
    
    # 检查配置文件是否存在
    if not os.path.exists(config_path):
        print(f"错误: 配置文件不存在: {config_path}")
        print("请确保 /json/index_config.json 文件存在")
        return
    
    # 检查模板目录是否存在
    if not os.path.exists(template_dir):
        print(f"错误: 模板目录不存在: {template_dir}")
        print("请确保 /template/index/ 目录存在并包含必要的模板文件")
        return
    
    try:
        generate_index_html(config_path, template_dir, output_path)
    except Exception as e:
        print(f"生成主页时出错: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()