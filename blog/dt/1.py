import pandas as pd
import re
from datetime import datetime
import os

class ExcelToMDConverter:
    def __init__(self, input_file, output_file=None):
        """
        初始化转换器
        
        Args:
            input_file (str): Excel文件路径
            output_file (str, optional): 输出的Markdown文件路径
        """
        self.input_file = input_file
        if output_file is None:
            base_name = os.path.splitext(input_file)[0]
            self.output_file = f"{base_name}.md"
        else:
            self.output_file = output_file
        
    def convert_date_format(self, date_str):
        """
        转换日期格式
        
        Args:
            date_str (str): 原始日期字符串
            
        Returns:
            str: 格式化后的日期字符串
        """
        date_str = str(date_str).strip()
        
        # 定义可能的日期格式
        date_formats = [
            '%Y年%m月%d日 %H:%M:%S',
            '%Y-%m-%d %H:%M:%S',
            '%Y/%m/%d %H:%M:%S',
            '%Y年%m月%d日',
            '%Y-%m-%d',
            '%Y/%m/%d',
            '%Y%m%d %H:%M:%S'
        ]
        
        # 尝试解析日期
        for fmt in date_formats:
            try:
                date_obj = datetime.strptime(date_str, fmt)
                return date_obj.strftime('%Y-%m-%d')
            except:
                continue
        
        # 如果无法解析，返回原始字符串
        return date_str
    
    def process_content(self, content):
        """
        处理动态内容
        
        Args:
            content (str): 原始内容
            
        Returns:
            str: 处理后的内容
        """
        content = str(content).strip()
        
        # 如果内容为空
        if not content or content.lower() == 'nan':
            return ''
        
        # 处理换行：确保多个连续换行变成两个换行
        content = re.sub(r'\n\s*\n', '\n\n', content)
        
        return content
    
    def process_images(self, image_links):
        """
        处理图片链接
        
        Args:
            image_links (str): 原始图片链接字符串
            
        Returns:
            list: 处理后的图片链接列表
        """
        if not image_links or str(image_links).lower() == 'nan':
            return []
        
        # 分割链接并清理空白
        links = [link.strip() for link in str(image_links).split(',')]
        
        # 过滤空链接
        return [link for link in links if link]
    
    def convert(self):
        """
        执行转换
        """
        try:
            # 读取Excel文件
            print(f"正在读取文件: {self.input_file}")
            df = pd.read_excel(self.input_file)
            
            # 检查数据列数
            if df.shape[1] < 3:
                print("警告：Excel文件少于三列，将使用可用列进行转换")
            
            # 统计信息
            total_rows = len(df)
            success_rows = 0
            
            print(f"找到 {total_rows} 条记录")
            
            # 创建输出目录（如果需要）
            output_dir = os.path.dirname(self.output_file)
            if output_dir and not os.path.exists(output_dir):
                os.makedirs(output_dir)
            
            # 写入Markdown文件
            with open(self.output_file, 'w', encoding='utf-8') as f:
                for index, row in df.iterrows():
                    try:
                        # 获取数据
                        date_time = row[0] if df.shape[1] > 0 else ''
                        content = row[1] if df.shape[1] > 1 else ''
                        images = row[2] if df.shape[1] > 2 else ''
                        
                        # 处理数据
                        formatted_date = self.convert_date_format(date_time)
                        processed_content = self.process_content(content)
                        image_list = self.process_images(images)
                        
                        # 写入Markdown
                        f.write("# 今日更新\n\n")
                        f.write(f"## 日期：{formatted_date}\n\n")
                        
                        if processed_content:
                            f.write(f"{processed_content}\n\n\n")
                        
                        # 写入图片
                        if image_list:
                            for i, img_link in enumerate(image_list):
                                f.write(f"![img_{i+1}]({img_link})\n")
                            f.write("\n")  # 图片后添加空行
                        
                        success_rows += 1
                        
                        # 添加分隔线（除了最后一条）
                        if index < total_rows - 1:
                            f.write("---\n\n")
                            
                    except Exception as e:
                        print(f"警告：处理第 {index+1} 行时出错: {str(e)}")
                        continue
            
            print(f"转换完成！")
            print(f"成功处理: {success_rows}/{total_rows} 条记录")
            print(f"输出文件: {self.output_file}")
            
        except FileNotFoundError:
            print(f"错误：找不到文件 {self.input_file}")
        except pd.errors.EmptyDataError:
            print("错误：Excel文件为空")
        except Exception as e:
            print(f"转换过程中出现错误: {str(e)}")

def main():
    """
    主函数：处理命令行参数或交互式输入
    """
    import sys
    
    if len(sys.argv) > 1:
        # 从命令行参数获取文件路径
        input_file = sys.argv[1]
        output_file = sys.argv[2] if len(sys.argv) > 2 else None
    else:
        # 交互式输入
        input_file = input("请输入Excel文件路径: ").strip()
        if not os.path.exists(input_file):
            print("文件不存在！")
            return
        
        output_file = input("请输入输出Markdown文件路径（直接回车使用默认名称）: ").strip()
        if not output_file:
            output_file = None
    
    # 执行转换
    converter = ExcelToMDConverter(input_file, output_file)
    converter.convert()

if __name__ == "__main__":
    main()