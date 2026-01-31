import os
import re
import base64
import time
from typing import List, Dict, Any, Tuple, Optional
from pathlib import Path

class FileProcessor:
    def __init__(self, config_path: str = None):
        if config_path is None:
            current_dir = Path(__file__).parent.parent.parent
            config_path = current_dir / 'private' / 'ds' / 'config.json'
        
        self.config_path = Path(config_path)
        self.config = self.load_config()
        
        # 附件缓存目录
        self.attachments_dir = current_dir / 'private' / 'ds' / 'attachments'
        self.attachments_dir.mkdir(parents=True, exist_ok=True)
        
        # 获取博客根目录
        self.blog_root = current_dir
    
    def load_config(self) -> Dict[str, Any]:
        """加载配置文件"""
        if self.config_path.exists():
            import json
            with open(self.config_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        return {}
    
    def extract_file_references(self, text: str) -> List[str]:
        """提取文本中的文件引用（@开头，*结尾）"""
        # 支持两种格式：@/path/to/file* 或 @path/to/file*
        pattern = r'@([^*]+)\*'
        matches = re.findall(pattern, text)
        return matches
    
    def resolve_file_path(self, file_ref: str) -> Path:
        """解析文件路径"""
        file_ref = file_ref.strip()
        
        # 移除开头的斜杠（如果用户输入了 @/path，我们只需要 path）
        if file_ref.startswith('/'):
            file_ref = file_ref[1:]
        
        # 尝试作为相对于博客根目录的路径
        path = Path(self.blog_root) / file_ref
        
        # 如果不存在，尝试其他可能的路径
        if not path.exists():
            # 尝试在当前目录下查找
            cwd_path = Path.cwd() / file_ref
            if cwd_path.exists():
                path = cwd_path
            else:
                # 尝试在 posts 目录下查找（常用情况）
                posts_path = Path(self.blog_root) / 'posts' / file_ref
                if posts_path.exists():
                    path = posts_path
                else:
                    # 尝试作为绝对路径
                    abs_path = Path(file_ref)
                    if abs_path.exists():
                        path = abs_path
        
        return path
    
    def process_message(self, message: str) -> Tuple[str, List[Dict[str, str]]]:
        """
        处理消息中的文件引用
        
        Returns:
            Tuple[处理后的消息, 文件附件列表]
        """
        file_references = self.extract_file_references(message)
        attachments = []
        
        # 移除文件引用标记，保留原始路径作为上下文
        processed_message = message
        for file_ref in file_references:
            # 解析路径
            try:
                file_path = self.resolve_file_path(file_ref)
                if not file_path.exists():
                    raise FileNotFoundError(f"文件不存在: {file_path}")
                
                # 处理文件
                file_info = self.process_file(file_path)
                if file_info:
                    attachments.append(file_info)
                
                # 从消息中移除@和*标记，但保留路径作为上下文
                # 显示相对路径
                try:
                    rel_path = file_path.relative_to(self.blog_root)
                    display_path = str(rel_path)
                except ValueError:
                    display_path = str(file_path)
                    
                processed_message = processed_message.replace(f"@{file_ref}*", f"[文件: {display_path}]")
                
            except Exception as e:
                # 如果文件处理失败，在消息中添加错误信息
                error_msg = f"[错误: 无法读取文件 {file_ref} - {str(e)}]"
                processed_message = processed_message.replace(f"@{file_ref}*", error_msg)
        
        return processed_message, attachments
    
    def process_file(self, file_path: Path) -> Optional[Dict[str, Any]]:
        """处理单个文件"""
        try:
            if not file_path.exists():
                raise FileNotFoundError(f"文件不存在: {file_path}")
            
            # 检查文件大小限制
            max_size_mb = self.config.get('max_attachment_size_mb', 10)
            file_size_mb = file_path.stat().st_size / (1024 * 1024)
            if file_size_mb > max_size_mb:
                raise ValueError(f"文件过大: {file_size_mb:.2f}MB > {max_size_mb}MB限制")
            
            # 检查文件类型
            allowed_extensions = self.config.get('supported_file_types', [])
            if allowed_extensions and file_path.suffix.lower() not in allowed_extensions:
                # 如果不是支持的类型，尝试读取为文本
                pass
            
            # 读取文件内容
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                encoding = 'utf-8'
            except UnicodeDecodeError:
                # 如果utf-8失败，尝试其他编码
                try:
                    with open(file_path, 'r', encoding='gbk') as f:
                        content = f.read()
                    encoding = 'gbk'
                except:
                    # 如果都失败，读取为二进制并编码为base64
                    with open(file_path, 'rb') as f:
                        content = base64.b64encode(f.read()).decode('ascii')
                    encoding = 'base64'
            
            # 如果是目录，读取目录下所有支持的文件
            if file_path.is_dir():
                return self.process_directory(file_path)
            
            # 获取相对路径
            try:
                rel_path = file_path.relative_to(self.blog_root)
                display_path = str(rel_path)
            except ValueError:
                display_path = str(file_path)
            
            return {
                "type": "text_file",
                "path": str(file_path),
                "display_path": display_path,
                "filename": file_path.name,
                "content": content,
                "size": len(content),
                "encoding": encoding,
                "last_modified": file_path.stat().st_mtime
            }
            
        except Exception as e:
            print(f"处理文件出错: {e}")
            return None
    
    def process_directory(self, dir_path: Path) -> Dict[str, Any]:
        """处理目录"""
        file_contents = []
        total_size = 0
        
        # 获取目录下所有支持的文件
        allowed_extensions = self.config.get('supported_file_types', [])
        
        for file_path in dir_path.rglob("*"):
            if file_path.is_file():
                if allowed_extensions and file_path.suffix.lower() not in allowed_extensions:
                    continue
                
                try:
                    # 获取相对路径
                    rel_to_dir = file_path.relative_to(dir_path)
                    rel_to_blog = file_path.relative_to(self.blog_root) if file_path.is_relative_to(self.blog_root) else file_path
                    
                    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()
                    
                    file_contents.append({
                        "path": str(rel_to_dir),
                        "blog_path": str(rel_to_blog),
                        "name": file_path.name,
                        "content": content,
                        "size": len(content)
                    })
                    total_size += len(content)
                    
                except Exception as e:
                    print(f"读取文件 {file_path} 出错: {e}")
        
        return {
            "type": "directory",
            "path": str(dir_path),
            "display_path": str(dir_path.relative_to(self.blog_root)) if dir_path.is_relative_to(self.blog_root) else str(dir_path),
            "name": dir_path.name,
            "files": file_contents,
            "total_size": total_size,
            "file_count": len(file_contents)
        }
    
    def format_attachments_for_ai(self, attachments: List[Dict[str, Any]]) -> str:
        """将附件格式化为AI可理解的文本"""
        if not attachments:
            return ""
        
        formatted_parts = []
        for attachment in attachments:
            if attachment["type"] == "text_file":
                formatted_parts.append(f"""
文件: {attachment['filename']}
路径: {attachment['display_path']}
大小: {attachment['size']} 字符
编码: {attachment['encoding']}
最后修改: {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(attachment['last_modified']))}
内容:
{attachment['content']}
""")
            elif attachment["type"] == "directory":
                formatted_parts.append(f"""
目录: {attachment['name']}
路径: {attachment['display_path']}
包含 {attachment['file_count']} 个文件，总大小: {attachment['total_size']} 字符
文件列表:
""")
                for file_info in attachment['files']:
                    formatted_parts.append(f"  - {file_info['path']} ({file_info['size']} 字符)")
                
                # 添加前几个文件的内容预览
                preview_count = min(3, len(attachment['files']))
                for i in range(preview_count):
                    file_info = attachment['files'][i]
                    formatted_parts.append(f"""
文件 {file_info['path']} 的内容预览:
{file_info['content'][:500]}{'...' if len(file_info['content']) > 500 else ''}
""")
        
        return "\n".join(formatted_parts)