import json
import os

def split_json_and_generate_index():
    # 读取 a.json 文件
    with open('a.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    index_entries = []
    
    # 处理每个题目
    for problem in data:
        problem_id = problem.get('id')
        if problem_id is None:
            print(f"警告：发现一个没有 id 的题目，已跳过：{problem.get('title', '未知标题')}")
            continue
        
        # 生成单个题目文件
        filename = f"{problem_id}.json"
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(problem, f, ensure_ascii=False, indent=4)
        
        print(f"已创建文件：{filename}")
        
        # 为索引文件准备数据
        index_entry = {
            "id": problem_id,
            "title": problem.get('title', ''),
            "difficulty": problem.get('difficulty', '未知'),
            "time_limit": problem.get('time_limit', ''),
            "memory_limit": problem.get('memory_limit', '')
        }
        
        index_entries.append(index_entry)
    
    # 生成索引文件
    with open('index2.json', 'w', encoding='utf-8') as f:
        json.dump(index_entries, f, ensure_ascii=False, indent=4)
    
    print(f"\n已创建索引文件：index2.json，包含 {len(index_entries)} 个题目")

if __name__ == "__main__":
    split_json_and_generate_index()