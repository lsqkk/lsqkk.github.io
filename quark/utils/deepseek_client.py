import os
import json
import time
import requests
from typing import List, Dict, Any, Optional, Generator
from pathlib import Path

class DeepSeekClient:
    def __init__(self, config_path: str = None):
        if config_path is None:
            current_dir = Path(__file__).parent.parent.parent
            config_path = current_dir / 'private' / 'ds' / 'config.json'
        
        self.config_path = Path(config_path)
        self.config = self.load_config()
        self.api_key = self.config.get('api_key', '')
        self.model = self.config.get('model', 'deepseek-chat')
        self.api_base = self.config.get('api_base', 'https://api.deepseek.com')
        
        if not self.api_key:
            raise ValueError("API密钥未设置，请先在配置文件中设置api_key")
    
    def load_config(self) -> Dict[str, Any]:
        """加载配置文件"""
        if not self.config_path.exists():
            default_config = {
                "api_key": "",
                "model": "deepseek-chat",
                "api_base": "https://api.deepseek.com",
                "max_tokens": 4096,
                "temperature": 0.7,
                "context_window": 10,
                "stream": True,  # 默认启用流式
                "use_markdown": True  # 默认启用Markdown渲染
            }
            self.config_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.config_path, 'w', encoding='utf-8') as f:
                json.dump(default_config, f, indent=2, ensure_ascii=False)
            return default_config
        
        with open(self.config_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    
    def save_config(self):
        """保存配置文件"""
        with open(self.config_path, 'w', encoding='utf-8') as f:
            json.dump(self.config, f, indent=2, ensure_ascii=False)
    
    def chat(self, messages: List[Dict[str, str]], stream: bool = None) -> str:
        """发送聊天请求"""
        if stream is None:
            stream = self.config.get('stream', False)
        
        if stream:
            # 流式响应
            full_response = ''
            for chunk in self.stream_chat(messages):
                full_response += chunk
            return full_response
        else:
            # 非流式响应
            return self._chat_sync(messages)
    
    def _chat_sync(self, messages: List[Dict[str, str]]) -> str:
        """同步聊天请求"""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.model,
            "messages": messages,
            "max_tokens": self.config.get('max_tokens', 4096),
            "temperature": self.config.get('temperature', 0.7),
            "stream": False
        }
        
        try:
            response = requests.post(
                f"{self.api_base}/chat/completions",
                headers=headers,
                json=payload,
                timeout=60
            )
            
            if response.status_code == 200:
                result = response.json()
                return result['choices'][0]['message']['content']
            else:
                raise Exception(f"API请求失败: {response.status_code} - {response.text}")
                
        except requests.exceptions.Timeout:
            raise Exception("请求超时，请检查网络连接")
        except Exception as e:
            raise Exception(f"请求出错: {str(e)}")
    
    def stream_chat(self, messages: List[Dict[str, str]]) -> Generator[str, None, None]:
        """流式聊天响应"""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.model,
            "messages": messages,
            "max_tokens": self.config.get('max_tokens', 4096),
            "temperature": self.config.get('temperature', 0.7),
            "stream": True
        }
        
        try:
            response = requests.post(
                f"{self.api_base}/chat/completions",
                headers=headers,
                json=payload,
                stream=True,
                timeout=60
            )
            
            if response.status_code != 200:
                error_text = response.text
                try:
                    error_data = json.loads(error_text)
                    error_msg = error_data.get('error', {}).get('message', error_text)
                except:
                    error_msg = error_text
                raise Exception(f"API请求失败: {response.status_code} - {error_msg}")
            
            # 解析流式响应
            for line in response.iter_lines():
                if line:
                    line = line.decode('utf-8')
                    if line.startswith('data: '):
                        data = line[6:]
                        if data == '[DONE]':
                            break
                        
                        try:
                            json_data = json.loads(data)
                            if 'choices' in json_data and json_data['choices']:
                                choice = json_data['choices'][0]
                                if 'delta' in choice and 'content' in choice['delta']:
                                    content = choice['delta']['content']
                                    yield content
                        except json.JSONDecodeError:
                            continue
            
        except requests.exceptions.Timeout:
            raise Exception("请求超时，请检查网络连接")
        except Exception as e:
            raise Exception(f"请求出错: {str(e)}")
    
    def set_api_key(self, api_key: str):
        """设置API密钥"""
        self.api_key = api_key
        self.config['api_key'] = api_key
        self.save_config()
    
    def set_stream(self, enabled: bool):
        """设置流式模式"""
        self.config['stream'] = enabled
        self.save_config()
    
    def set_markdown(self, enabled: bool):
        """设置Markdown渲染"""
        self.config['use_markdown'] = enabled
        self.save_config()