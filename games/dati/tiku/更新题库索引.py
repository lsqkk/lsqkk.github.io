import json
import os
import glob
from datetime import datetime

def create_json_index():
    """
    将当前目录下所有JSON文件更新到ti_index.json中，并记录头部信息
    """
    # 获取当前目录下所有的json文件（排除ti_index.json本身）
    json_files = glob.glob("*.json")
    if "ti_index.json" in json_files:
        json_files.remove("ti_index.json")
    
    if not json_files:
        print("未找到任何JSON文件（除了ti_index.json）")
        return
    
    print(f"找到 {len(json_files)} 个JSON文件: {json_files}")
    
    # 加载或创建索引文件
    index_file = "ti_index.json"
    index_data = {
        "index_info": {
            "created_at": datetime.now().isoformat(),
            "last_updated": datetime.now().isoformat(),
            "total_quizzes": 0
        },
        "quizzes": []
    }
    
    # 如果索引文件已存在，则加载它
    if os.path.exists(index_file):
        try:
            with open(index_file, 'r', encoding='utf-8') as f:
                index_data = json.load(f)
            print(f"已加载现有的索引文件，包含 {len(index_data.get('quizzes', []))} 个测验")
            # 更新最后修改时间
            index_data["index_info"]["last_updated"] = datetime.now().isoformat()
        except Exception as e:
            print(f"读取索引文件时出错: {e}")
            print("将创建新的索引文件")
    
    # 获取现有测验的标题列表，避免重复添加
    existing_titles = [quiz.get("quiz_title", "") for quiz in index_data.get("quizzes", [])]
    
    # 处理每个JSON文件
    added_count = 0
    updated_count = 0
    
    for json_file in json_files:
        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # 提取头部信息
            quiz_info = {
                "source_file": json_file,
                "last_modified": datetime.fromtimestamp(os.path.getmtime(json_file)).isoformat(),
                "file_size": os.path.getsize(json_file),
                "quiz_title": data.get("quiz_title", ""),
                "description": data.get("description", ""),
                "total_questions": data.get("total_questions", 0),
                "questions_per_quiz": data.get("questions_per_quiz", 0),
                "actual_questions": len(data.get("questions", [])),
                "added_at": datetime.now().isoformat()
            }
            
            # 检查是否已存在相同的测验
            existing_index = -1
            for i, quiz in enumerate(index_data.get("quizzes", [])):
                if quiz.get("quiz_title") == quiz_info["quiz_title"]:
                    existing_index = i
                    break
            
            if existing_index >= 0:
                # 更新现有记录
                index_data["quizzes"][existing_index] = quiz_info
                updated_count += 1
                print(f"✓ 更新: {json_file} -> {quiz_info['quiz_title']}")
            else:
                # 添加新记录
                index_data["quizzes"].append(quiz_info)
                added_count += 1
                print(f"✓ 添加: {json_file} -> {quiz_info['quiz_title']}")
                
        except json.JSONDecodeError as e:
            print(f"✗ 错误: {json_file} - JSON格式错误: {e}")
        except Exception as e:
            print(f"✗ 错误: {json_file} - {e}")
    
    # 更新索引信息
    index_data["index_info"]["total_quizzes"] = len(index_data.get("quizzes", []))
    
    # 按标题排序
    index_data["quizzes"] = sorted(
        index_data.get("quizzes", []),
        key=lambda x: x.get("quiz_title", "").lower()
    )
    
    # 保存索引文件
    try:
        with open(index_file, 'w', encoding='utf-8') as f:
            json.dump(index_data, f, ensure_ascii=False, indent=2)
        
        print(f"\n{'='*50}")
        print("索引文件已成功更新!")
        print(f"总测验数: {index_data['index_info']['total_quizzes']}")
        print(f"新增: {added_count} 个测验")
        print(f"更新: {updated_count} 个测验")
        print(f"索引文件: {index_file}")
        
        # 显示所有测验的简要信息
        print(f"\n所有测验列表:")
        print("-"*50)
        for i, quiz in enumerate(index_data["quizzes"], 1):
            print(f"{i:3d}. {quiz['quiz_title'][:40]:40s} | 问题: {quiz['actual_questions']:3d}/{quiz['total_questions']:3d} | 文件: {quiz['source_file']}")
        
    except Exception as e:
        print(f"保存索引文件时出错: {e}")

def show_index_stats():
    """显示索引文件的统计信息"""
    if os.path.exists("ti_index.json"):
        try:
            with open("ti_index.json", 'r', encoding='utf-8') as f:
                index_data = json.load(f)
            
            print(f"{'='*50}")
            print("当前索引文件统计:")
            print(f"{'='*50}")
            print(f"创建时间: {index_data.get('index_info', {}).get('created_at', 'N/A')}")
            print(f"最后更新: {index_data.get('index_info', {}).get('last_updated', 'N/A')}")
            print(f"测验总数: {index_data.get('index_info', {}).get('total_quizzes', 0)}")
            
            if index_data.get("quizzes"):
                print(f"\n测验详细信息:")
                for quiz in index_data["quizzes"]:
                    print(f"  - {quiz.get('quiz_title', '未命名')}")
                    print(f"    描述: {quiz.get('description', '')[:60]}...")
                    print(f"    文件: {quiz.get('source_file')}")
                    print(f"    问题数: {quiz.get('actual_questions')}/{quiz.get('total_questions')}")
                    print(f"    最后修改: {quiz.get('last_modified')}")
                    print()
            
        except Exception as e:
            print(f"读取索引文件时出错: {e}")

if __name__ == "__main__":
    print("JSON文件索引生成器")
    print("="*50)
    
    # 更新索引
    create_json_index()
    
    print("\n")
    
    # 显示统计信息
    show_index_stats()