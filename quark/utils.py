import os
import sys

def get_blog_root():
    """获取博客根目录"""
    # 从当前文件路径获取博客根目录
    # quark/utils.py 应该位于: 博客根目录/quark/utils.py
    current_dir = os.path.dirname(os.path.abspath(__file__))  # quark目录
    return os.path.dirname(current_dir)  # 博客根目录

def run_python_script(script_name, *args):
    """运行Python脚本"""
    blog_root = get_blog_root()
    script_path = os.path.join(blog_root, 'py', script_name)
    
    if not os.path.exists(script_path):
        raise FileNotFoundError(f"找不到脚本: {script_path}")
    
    import subprocess
    cmd = [sys.executable, script_path] + list(args)
    return subprocess.run(cmd, cwd=blog_root, check=True)