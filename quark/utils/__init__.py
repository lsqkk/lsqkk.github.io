"""
Quark工具模块包
"""
import os
import sys
from pathlib import Path

def get_blog_root():
    """获取博客根目录"""
    # 方法1：从当前文件位置计算
    # quark/utils/__init__.py -> quark/utils -> quark -> 博客根目录
    current_file = Path(__file__).resolve()
    quark_dir = current_file.parent.parent  # quark目录
    blog_root = quark_dir.parent  # 博客根目录
    
    # 验证路径
    if (blog_root / 'py').exists():
        return str(blog_root)
    
    # 方法2：尝试从当前工作目录查找
    cwd = Path.cwd()
    if (cwd / 'py').exists():
        return str(cwd)
    
    # 方法3：尝试从上级目录查找
    for i in range(3):
        parent = cwd.parents[i] if i < len(cwd.parents) else None
        if parent and (parent / 'py').exists():
            return str(parent)
    
    # 默认返回quark父目录
    return str(blog_root)

def get_py_dir():
    """获取py目录"""
    root = get_blog_root()
    py_dir = Path(root) / 'py'
    
    # 如果py目录不存在，尝试创建或查找其他可能的位置
    if not py_dir.exists():
        # 检查scripts、scripts、src等常见目录
        for alt_name in ['scripts', 'src', 'bin', 'tools']:
            alt_dir = Path(root) / alt_name
            if alt_dir.exists():
                return str(alt_dir)
        
        # 如果都不存在，返回默认路径（即使不存在）
        return str(py_dir)
    
    return str(py_dir)

def get_script_path(script_name):
    """获取脚本路径"""
    py_dir = get_py_dir()
    script_path = Path(py_dir) / script_name
    
    # 如果脚本不存在，尝试在博客根目录直接查找
    if not script_path.exists():
        # 检查是否在博客根目录
        root_script = Path(get_blog_root()) / script_name
        if root_script.exists():
            return str(root_script)
        
        # 检查是否在子目录中
        for ext in ['', '.py', '.sh', '.bat']:
            full_name = script_name + ext
            alt_path = Path(py_dir) / full_name
            if alt_path.exists():
                return str(alt_path)
    
    return str(script_path)

def run_python_script(script_name, *args):
    """运行Python脚本"""
    script_path = get_script_path(script_name)
    
    if not os.path.exists(script_path):
        # 提供更详细的错误信息
        root = get_blog_root()
        py_dir = get_py_dir()
        
        error_msg = f"""
找不到脚本: {script_name}

搜索位置:
  1. {py_dir}/
  2. {root}/

实际路径: {script_path}

请确保:
  1. 脚本文件存在且名称正确
  2. py目录位于博客根目录下
  3. 或者脚本在博客根目录中
        """
        raise FileNotFoundError(error_msg)
    
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