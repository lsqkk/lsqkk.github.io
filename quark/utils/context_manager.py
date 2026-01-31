import os
import json
import time
from typing import List, Dict, Any, Optional
from pathlib import Path
import hashlib

class ContextManager:
    def __init__(self, storage_dir: str = None):
        if storage_dir is None:
            current_dir = Path(__file__).parent.parent.parent
            storage_dir = current_dir / 'private' / 'ds' / 'conversations'
        
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        
        # 当前会话
        self.current_session_id = None
        self.current_messages = []
        self.max_context = 10  # 最大上下文条数
    
    def start_new_session(self, session_name: str = None):
        """开始新的会话"""
        timestamp = int(time.time())
        if session_name:
            session_id = f"{timestamp}_{session_name}"
        else:
            session_id = f"session_{timestamp}"
        
        self.current_session_id = session_id
        self.current_messages = []
        
        # 加载系统提示词
        system_prompt = self.load_system_prompt()
        if system_prompt:
            self.add_message("system", system_prompt)
        
        return session_id
    
    def load_system_prompt(self) -> str:
        """加载系统提示词"""
        prompt_path = Path(__file__).parent.parent.parent / 'private' / 'ds' / 'system_prompt.md'
        if prompt_path.exists():
            with open(prompt_path, 'r', encoding='utf-8') as f:
                return f.read()
        return "你是一个有帮助的AI助手。"
    
    def add_message(self, role: str, content: str):
        """添加消息到上下文"""
        message = {
            "role": role,
            "content": content,
            "timestamp": time.time()
        }
        
        self.current_messages.append(message)
        
        # 限制上下文长度，但保留系统消息
        if len(self.current_messages) > self.max_context:
            # 找到第一个非系统消息的索引
            system_messages = [i for i, msg in enumerate(self.current_messages) if msg['role'] == 'system']
            if system_messages:
                first_non_system = system_messages[-1] + 1
                # 保留系统消息和最新的n条消息
                self.current_messages = self.current_messages[:first_non_system] + self.current_messages[-self.max_context+first_non_system:]
            else:
                self.current_messages = self.current_messages[-self.max_context:]
    
    def get_messages(self) -> List[Dict[str, Any]]:
        """获取当前会话的所有消息"""
        return [{"role": msg["role"], "content": msg["content"]} for msg in self.current_messages]
    
    def save_session(self):
        """保存当前会话"""
        if not self.current_session_id:
            return
        
        session_file = self.storage_dir / f"{self.current_session_id}.json"
        session_data = {
            "session_id": self.current_session_id,
            "messages": self.current_messages,
            "created_at": time.time(),
            "updated_at": time.time()
        }
        
        with open(session_file, 'w', encoding='utf-8') as f:
            json.dump(session_data, f, indent=2, ensure_ascii=False, default=str)
    
    def load_session(self, session_id: str) -> bool:
        """加载指定会话"""
        session_file = self.storage_dir / f"{session_id}.json"
        if not session_file.exists():
            return False
        
        with open(session_file, 'r', encoding='utf-8') as f:
            session_data = json.load(f)
        
        self.current_session_id = session_data['session_id']
        self.current_messages = session_data['messages']
        return True
    
    def list_sessions(self) -> List[Dict[str, Any]]:
        """列出所有会话"""
        sessions = []
        for file_path in self.storage_dir.glob("*.json"):
            with open(file_path, 'r', encoding='utf-8') as f:
                session_data = json.load(f)
            
            sessions.append({
                "id": file_path.stem,
                "created_at": session_data.get('created_at', 0),
                "message_count": len(session_data.get('messages', [])),
                "file_size": file_path.stat().st_size
            })
        
        # 按创建时间排序
        sessions.sort(key=lambda x: x['created_at'], reverse=True)
        return sessions