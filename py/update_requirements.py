#!/usr/bin/env python3
"""
简化版requirements生成器
"""

import os
import re
import sys
import subprocess
from pathlib import Path
from typing import Dict, List

def extract_imports_simple(filepath: Path) -> List[str]:
    """简单提取导入的模块"""
    imports = []
    import_pattern = re.compile(r'^\s*(?:import|from)\s+([a-zA-Z_][a-zA-Z0-9_]*)')
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                match = import_pattern.match(line)
                if match:
                    imports.append(match.group(1))
    except:
        pass
    
    return imports

def generate_simple_requirements():
    """简化版生成函数"""
    # 标准库列表（部分）
    std_libs = {
        'os', 'sys', 're', 'json', 'datetime', 'time', 'math', 
        'collections', 'itertools', 'functools', 'pathlib', 'typing'
    }
    
    # 查找所有Python文件
    py_files = []
    for root, dirs, files in os.walk('.'):
        # 跳过虚拟环境等目录
        dirs[:] = [d for d in dirs if not d.startswith(('.', '__'))]
        
        for file in files:
            if file.endswith('.py'):
                py_files.append(Path(root) / file)
    
    # 收集导入信息
    package_files: Dict[str, List[str]] = {}
    
    for py_file in py_files:
        imports = extract_imports_simple(py_file)
        for pkg in imports:
            if pkg not in std_libs:
                if pkg not in package_files:
                    package_files[pkg] = []
                rel_path = str(py_file.relative_to('.'))
                if rel_path not in package_files[pkg]:
                    package_files[pkg].append(rel_path)
    
    # 生成requirements.txt
    with open('requirements.txt', 'w', encoding='utf-8') as f:
        for pkg in sorted(package_files.keys()):
            files = package_files[pkg][:3]  # 最多显示3个文件
            file_list = ', '.join(files)
            if len(package_files[pkg]) > 3:
                file_list += f", ...等{len(package_files[pkg])}个文件"
            f.write(f"{pkg:<20}  # {file_list}\n")
        f.write("click>=8.0.0\nflask>=2.0.0\n")

if __name__ == '__main__':
    generate_simple_requirements()