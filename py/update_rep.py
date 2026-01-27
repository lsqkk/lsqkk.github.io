import requests
import json
from datetime import datetime

def get_all_repositories(username, token=None):
    """
    获取指定用户的所有GitHub仓库信息
    """
    repos = []
    page = 1
    per_page = 100  # 每页最多100个
    
    headers = {
        'Accept': 'application/vnd.github.v3+json',
    }
    
    # 如果有token，添加到headers中（用于提高API限制）
    if token:
        headers['Authorization'] = f'token {token}'
    
    while True:
        url = f'https://api.github.com/users/{username}/repos'
        params = {
            'page': page,
            'per_page': per_page,
            'sort': 'updated',
            'direction': 'desc'
        }
        
        try:
            response = requests.get(url, headers=headers, params=params)
            response.raise_for_status()
            
            page_repos = response.json()
            
            if not page_repos:
                break
                
            for repo in page_repos:
                repo_info = {
                    'name': repo['name'],
                    'description': repo['description'] or '无描述',
                    'url': repo['html_url']
                }
                repos.append(repo_info)
            
            # 检查是否还有更多页面
            if 'Link' in response.headers:
                links = response.headers['Link']
                if 'rel="next"' not in links:
                    break
            elif len(page_repos) < per_page:
                break
                
            page += 1
            
        except requests.exceptions.RequestException as e:
            print(f"请求失败: {e}")
            break
        except json.JSONDecodeError as e:
            print(f"JSON解析失败: {e}")
            break
    
    return repos

def create_markdown_table(repositories):
    """
    将仓库信息转换为Markdown表格
    """
    if not repositories:
        return "未找到任何仓库"
    
    # 创建Markdown表格
    markdown = "| 名称 | 描述 | 地址 |\n"
    markdown += "|------|------|------|\n"
    
    for repo in repositories:
        # 处理特殊字符，避免破坏Markdown格式
        name = str(repo['name']).replace('|', '\\|')
        description = str(repo['description']).replace('|', '\\|').replace('\n', ' ')
        url = repo['url']
        
        # 创建Markdown链接格式
        link = f"[项目地址]({url})"
        
        markdown += f"| {name} | {description} | {link} |\n"
    
    return markdown

def save_to_file(content, username):
    """
    将内容保存到文件
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"github_repos_{username}_{timestamp}.md"
    
    try:
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"文件已保存为: {filename}")
        return filename
    except IOError as e:
        print(f"保存文件失败: {e}")
        return None

def main():
    # 配置信息
    username = "lsqkk"  # 目标GitHub用户名
    github_token = ""   # 可选：填写你的GitHub token以提高API限制
    
    print(f"正在获取 {username} 的GitHub仓库信息...")
    
    # 获取仓库信息
    repositories = get_all_repositories(username, github_token)
    
    if repositories:
        print(f"共找到 {len(repositories)} 个仓库")
        
        # 创建Markdown表格
        markdown_content = f"# {username} 的GitHub仓库列表\n\n"
        markdown_content += f"**生成时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
        markdown_content += f"**仓库总数**: {len(repositories)}\n\n"
        markdown_content += create_markdown_table(repositories)
        
        # 保存到文件
        filename = save_to_file(markdown_content, username)
        
        # 在控制台显示前10个仓库信息
        print("\n前10个仓库信息预览:")
        print("-" * 80)
        for i, repo in enumerate(repositories[:10]):
            print(f"{i+1}. {repo['name']}")
            print(f"   描述: {repo['description']}")
            print(f"   地址: {repo['url']}")
            print()
        
        if filename:
            print(f"完整列表已保存到: {filename}")
    else:
        print("未找到任何仓库或获取失败")

if __name__ == "__main__":
    main()