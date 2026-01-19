import re
import sys

def reverse_markdown_sections(markdown_text):
    """
    将Markdown中不同#标题下的部分进行倒序
    """
    # 使用正则表达式按标题分割内容
    # 正则解释：匹配以#开头的标题行（可以包含空格），后跟内容直到下一个标题或结尾
    pattern = r'(^# .+?)(?=\n# |\Z)'
    sections = re.findall(pattern, markdown_text, re.DOTALL | re.MULTILINE)
    
    # 如果没有找到任何章节，直接返回原文本
    if not sections:
        return markdown_text
    
    # 反转章节
    reversed_sections = sections[::-1]
    
    # 重新组合成文本
    result = '\n\n'.join(section.strip() for section in reversed_sections)
    
    return result

def process_markdown_file(input_file, output_file=None):
    """
    处理Markdown文件
    """
    try:
        # 读取输入文件
        with open(input_file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 处理内容
        processed_content = reverse_markdown_sections(content)
        
        # 确定输出文件
        if output_file is None:
            output_file = input_file
        
        # 写入输出文件
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(processed_content)
        
        print(f"处理完成！结果已保存到: {output_file}")
        
    except FileNotFoundError:
        print(f"错误：找不到文件 '{input_file}'")
    except Exception as e:
        print(f"处理过程中发生错误: {e}")

def main():
    """
    主函数：处理命令行参数或直接使用
    """
    # 如果提供了命令行参数
    if len(sys.argv) > 1:
        input_file = sys.argv[1]
        output_file = sys.argv[2] if len(sys.argv) > 2 else None
        process_markdown_file(input_file, output_file)
    else:
        # 直接使用示例文本
        example_text = """# 今日更新111
内容1

# 今日更新222
内容222

# 今日更新333
内容333
这是多行内容
第三行内容"""

        print("输入文本:")
        print(example_text)
        print("\n" + "="*50 + "\n")
        
        result = reverse_markdown_sections(example_text)
        
        print("输出文本:")
        print(result)

if __name__ == "__main__":
    main()