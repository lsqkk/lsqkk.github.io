"""
Quark工具模块包
"""
import os
import sys
from pathlib import Path

def get_blog_root():
    """获取博客根目录"""
    current_file = Path(__file__).resolve()
    quark_dir = current_file.parent.parent
    return str(quark_dir.parent)

def get_py_dir():
    """兼容旧命名：返回首选脚本目录"""
    root = get_blog_root()
    script_dir = Path(root) / "quark" / "scripts"
    if script_dir.exists():
        return str(script_dir)
    return str(Path(root) / "py")

def get_script_path(script_name):
    """获取脚本路径"""
    root = Path(get_blog_root())
    candidates = [
        root / "quark" / "scripts" / script_name,
        root / "py" / script_name,
        root / script_name,
    ]
    for path in candidates:
        if path.exists():
            return str(path)
    return str(candidates[0])

def run_python_script(script_name, *args):
    """运行Python脚本"""
    script_path = get_script_path(script_name)
    
    if not os.path.exists(script_path):
        root = Path(get_blog_root())
        script_dir = root / "quark" / "scripts"
        py_dir = root / "py"
        
        error_msg = f"""
找不到脚本: {script_name}

搜索位置:
  1. {script_dir}/
  2. {py_dir}/
  3. {root}/

实际路径: {script_path}

请确保:
  1. 脚本文件存在且名称正确
  2. 优先放在 quark/scripts 目录
  3. 或兼容放在 py 目录/仓库根目录
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
