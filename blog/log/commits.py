#!/usr/bin/env python3
import subprocess
import sys
import os
from datetime import datetime

def run_git_commit_fetch(since_date, until_date):
    """运行git命令获取提交记录"""
    try:
        # 构建git命令
        git_cmd = [
            'git', 'log',
            f'--since={since_date}',
            f'--until={until_date}',
            '--pretty=format:%ad | %s',
            '--date=short'
        ]
        
        # 执行git命令
        result = subprocess.run(git_cmd, capture_output=True, text=True, check=True, encoding='utf-8', errors='ignore')
        return result.stdout.strip().split('\n')
        
    except subprocess.CalledProcessError as e:
        print(f"Git命令执行失败: {e}")
        print(f"错误输出: {e.stderr}")
        return []
    except FileNotFoundError:
        print("未找到git命令，请确保git已安装并在PATH中")
        return []

def process_commits(commits, output_file='output_commits.txt'):
    """处理提交记录并写入文件"""
    if not commits or (len(commits) == 1 and not commits[0]):
        print("没有找到指定时间范围内的提交记录")
        return
    
    seen = set()
    grouped_results = {}
    
    for line in commits:
        line = line.strip()
        if not line:
            continue
            
        if ' | ' in line:
            date, content = line.split(' | ', 1)
            key = f"{date}|{content}"
            
            if key not in seen:
                seen.add(key)
                if date not in grouped_results:
                    grouped_results[date] = []
                grouped_results[date].append(content)
    
    # 写入文件
    with open(output_file, 'w', encoding='utf-8') as f:
        for date in sorted(grouped_results.keys(), reverse=True):
            f.write(f"# {date}\n")
            for content in grouped_results[date]:
                f.write(f"{content}\n")
            f.write("\n")
    
    print(f"处理完成！结果已保存到 {output_file}")
    print(f"共处理了 {len(seen)} 条不重复的提交记录")

def main():
    # 设置日期范围（可以修改这里的时间）
    since_date = "2026-01-23"
    until_date = "2026-01-24"
    
    # 或者使用命令行参数（如果提供了的话）
    if len(sys.argv) > 2:
        since_date = sys.argv[1]
        until_date = sys.argv[2]
        print(f"使用命令行参数: 从 {since_date} 到 {until_date}")
    else:
        print(f"使用默认日期: 从 {since_date} 到 {until_date}")
        print("提示: 你可以通过命令行参数指定日期，例如: python script.py 2026-01-23 2026-01-24")
    
    print(f"正在获取从 {since_date} 到 {until_date} 的提交记录...")
    
    # 获取提交记录
    commits = run_git_commit_fetch(since_date, until_date)
    
    if commits:
        # 处理提交记录
        output_file = f'blog\log\commits_{since_date}_to_{until_date}.txt'
        process_commits(commits, output_file)
        
        # 可选：在控制台显示结果
        print("\n前5条提交记录:")
        for i, commit in enumerate(commits[:5]):
            print(f"  {i+1}. {commit}")
        if len(commits) > 5:
            print(f"  ... 还有 {len(commits) - 5} 条记录")

if __name__ == "__main__":
    main()