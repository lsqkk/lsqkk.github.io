import json
import re
from bs4 import BeautifulSoup

def extract_questions_from_html(html_content):
    """从HTML中提取题目信息"""
    soup = BeautifulSoup(html_content, 'html.parser')
    
    questions = []
    
    # 方法1：尝试查找题目容器
    question_containers = soup.find_all('div', class_='bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200')
    
    # 如果方法1找不到，尝试更通用的方法
    if not question_containers:
        # 查找所有包含题目的div
        all_divs = soup.find_all('div')
        question_containers = []
        for div in all_divs:
            if 'rounded-lg' in div.get('class', []) and 'shadow-lg' in div.get('class', []):
                question_containers.append(div)
    
    print(f"找到 {len(question_containers)} 个题目容器")
    
    for idx, container in enumerate(question_containers, 1):
        try:
            # 查找题目文本
            question_text = ""
            
            # 方法1：查找h3标签
            h3_tag = container.find('h3')
            if h3_tag:
                question_text = h3_tag.text.strip()
                # 移除前面的序号部分
                question_text = re.sub(r'^\d+', '', question_text).strip()
            else:
                # 方法2：查找所有文本内容，尝试识别题目
                all_text = container.get_text()
                lines = [line.strip() for line in all_text.split('\n') if line.strip()]
                for line in lines:
                    if line and line[0].isdigit() and len(line) > 1:
                        question_text = re.sub(r'^\d+', '', line).strip()
                        break
            
            if not question_text:
                print(f"警告：第{idx}个容器未找到题目文本")
                continue
            
            # 提取选项
            options = []
            correct_answer = None
            
            # 查找所有可能的选项div
            potential_options = container.find_all('div', class_=lambda x: x and 'p-4 rounded-lg border' in x)
            
            # 如果上面没找到，尝试其他方式
            if not potential_options:
                # 查找包含选项字母的div
                potential_options = container.find_all('div', recursive=True)
                potential_options = [div for div in potential_options 
                                   if div.find('span') and div.find('span').text.strip() in ['A', 'B', 'C', 'D']]
            
            for option_div in potential_options:
                # 提取选项字母
                option_letter = ""
                span_tag = option_div.find('span', class_='leading-none')
                if span_tag:
                    option_letter = span_tag.text.strip()
                else:
                    # 尝试其他方式查找字母
                    for span in option_div.find_all('span'):
                        text = span.text.strip()
                        if text in ['A', 'B', 'C', 'D']:
                            option_letter = text
                            break
                
                if not option_letter:
                    continue
                
                # 提取选项文本
                option_text = ""
                # 查找选项文本
                p_tags = option_div.find_all('p', class_=lambda x: not x or 'text-lg' in x)
                for p in p_tags:
                    text = p.text.strip()
                    if text and text not in ['A', 'B', 'C', 'D']:
                        option_text = text
                        break
                
                if not option_text:
                    # 尝试其他方式获取文本
                    all_text = option_div.get_text()
                    # 移除字母部分
                    option_text = re.sub(r'^[A-D]\.?\s*', '', all_text).strip()
                
                # 检查是否为正确答案
                is_correct = False
                # 通过类名判断
                classes = option_div.get('class', [])
                if any('green' in str(cls).lower() for cls in classes):
                    is_correct = True
                # 通过勾选图标判断
                elif option_div.find('svg'):
                    is_correct = True
                # 通过字体颜色判断
                elif option_div.find('p', class_=lambda x: x and 'green' in x):
                    is_correct = True
                
                option_data = {
                    'letter': option_letter,
                    'text': option_text,
                    'is_correct': is_correct
                }
                options.append(option_data)
                
                if is_correct:
                    correct_answer = option_letter
            
            # 如果没找到正确答案，尝试通过文本颜色判断
            if not correct_answer and options:
                for opt in options:
                    # 在原始HTML中查找这个选项
                    opt_text_lower = opt['text'].lower()
                    for option_div in potential_options:
                        if opt_text_lower in option_div.get_text().lower():
                            if option_div.find('font', color='green') or '正确答案' in option_div.get_text():
                                opt['is_correct'] = True
                                correct_answer = opt['letter']
                                break
            
            # 确保选项按字母顺序排序
            options.sort(key=lambda x: x['letter'])
            
            question_data = {
                'id': idx,
                'question': question_text,
                'options': options,
                'correct_answer': correct_answer
            }
            questions.append(question_data)
            
            print(f"提取第{idx}题: {question_text[:30]}...")
            
        except Exception as e:
            print(f"处理第{idx}个容器时出错: {e}")
            continue
    
    return questions

def save_to_json(questions, output_file='microsoft.json'):
    """将题目保存为JSON文件"""
    if not questions:
        print("没有提取到任何题目")
        return None
    
    quiz_data = {
        'quiz_title': '微软公司知识问答',
        'description': '微软公司知识问答：通过我们包含比尔·盖茨、产品历史、Windows、Office、Xbox等问题的微软问答集，测试您对这家软件巨头的了解！',
        'total_questions': len(questions),
        'questions_per_quiz': 20,
        'questions': questions
    }
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(quiz_data, f, ensure_ascii=False, indent=2)
    
    print(f"\n已成功提取 {len(questions)} 道题目并保存到 {output_file}")
    return quiz_data

def main():
    # 读取HTML文件
    try:
        with open('li.html', 'r', encoding='utf-8') as f:
            html_content = f.read()
    except FileNotFoundError:
        print("错误：未找到 li.html 文件")
        print("请确保 li.html 文件在当前目录下")
        return
    
    # 提取题目
    questions = extract_questions_from_html(html_content)
    
    if not questions:
        print("未在HTML中找到题目")
        return
    
    # 保存为JSON
    save_to_json(questions)
    
    # 打印统计信息
    print("\n=== 提取结果统计 ===")
    print(f"总题目数: {len(questions)}")
    
    # 检查每道题的完整性
    incomplete_questions = []
    for i, q in enumerate(questions, 1):
        if not q['options']:
            incomplete_questions.append((i, "没有选项"))
        elif not q['correct_answer']:
            incomplete_questions.append((i, "没有正确答案"))
    
    if incomplete_questions:
        print(f"不完整的题目: {len(incomplete_questions)}")
        for qid, reason in incomplete_questions:
            print(f"  第{qid}题: {reason}")
    
    # 打印示例（前3题）
    if questions:
        print("\n=== 题目示例（前3题）===")
        for i, q in enumerate(questions[:3], 1):
            print(f"\n{i}. {q['question']}")
            for opt in q['options']:
                correct_mark = "✓" if opt['is_correct'] else " "
                print(f"   {correct_mark} {opt['letter']}. {opt['text']}")
            print(f"   正确答案: {q.get('correct_answer', '未识别')}")

if __name__ == "__main__":
    main()