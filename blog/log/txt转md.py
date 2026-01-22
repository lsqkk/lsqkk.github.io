def process_commits(input_file='commits.txt', output_file='output_commits.txt'):
    # 读取文件内容
    with open(input_file, 'r', encoding='utf-8') as f:
        lines = [line.strip() for line in f if line.strip()]
    
    seen = set()
    grouped_results = {}
    
    for line in lines:
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

if __name__ == "__main__":
    process_commits()