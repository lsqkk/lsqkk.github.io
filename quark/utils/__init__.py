"""
Quark工具模块包
"""
import os
import sys
from pathlib import Path

# 基本路径函数（不依赖其他模块）
def get_blog_root():
    """获取博客根目录"""
    # quark/utils/__init__.py -> quark/utils -> quark -> 博客根目录
    current_dir = Path(__file__).parent.parent
    return str(current_dir)

def get_py_dir():
    """获取py目录"""
    return os.path.join(get_blog_root(), 'py')

def get_script_path(script_name):
    """获取脚本路径"""
    return os.path.join(get_py_dir(), script_name)

def run_python_script(script_name, *args):
    """运行Python脚本"""
    script_path = get_script_path(script_name)
    
    if not os.path.exists(script_path):
        raise FileNotFoundError(f"找不到脚本: {script_path}")
    
    import subprocess
    cmd = [sys.executable, script_path] + list(args)
    return subprocess.run(cmd, cwd=get_blog_root(), check=True)

# 导出所有函数
__all__ = [
    'get_blog_root',
    'get_py_dir',
    'get_script_path',
    'run_python_script',
]

# 注意：DeepSeek相关模块不在这里导出，因为它们只在ds命令中使用
# 这些模块在ds命令中通过绝对路径导入