import os
import json
from typing import List, Dict, Any, Optional
from pathlib import Path

class SkillsManager:
    def __init__(self, skills_dir: str = None):
        if skills_dir is None:
            current_dir = Path(__file__).parent.parent.parent
            skills_dir = current_dir / 'private' / 'ds' / 'skills'
        
        self.skills_dir = Path(skills_dir)
        self.skills_dir.mkdir(parents=True, exist_ok=True)
        self.skills = {}
        self.load_all_skills()
    
    def load_all_skills(self):
        """加载所有技能"""
        for file_path in self.skills_dir.glob("*.md"):
            skill_name = file_path.stem
            self.skills[skill_name] = self.load_skill(file_path)
    
    def load_skill(self, file_path: Path) -> Dict[str, Any]:
        """加载单个技能文件"""
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 解析技能文件（Markdown格式）
        lines = content.strip().split('\n')
        skill = {
            "name": file_path.stem,
            "description": "",
            "examples": [],
            "prompts": [],
            "content": content
        }
        
        current_section = None
        for line in lines:
            line = line.strip()
            if line.startswith('# '):
                skill["name"] = line[2:].strip()
            elif line.startswith('## 描述'):
                current_section = "description"
            elif line.startswith('## 示例'):
                current_section = "examples"
            elif line.startswith('## 提示词'):
                current_section = "prompts"
            elif current_section == "description" and line:
                skill["description"] += line + "\n"
            elif current_section == "examples" and line and not line.startswith('#'):
                skill["examples"].append(line)
            elif current_section == "prompts" and line and not line.startswith('#'):
                skill["prompts"].append(line)
        
        return skill
    
    def get_skill(self, skill_name: str) -> Optional[Dict[str, Any]]:
        """获取指定技能"""
        return self.skills.get(skill_name)
    
    def get_all_skills(self) -> Dict[str, Dict[str, Any]]:
        """获取所有技能"""
        return self.skills
    
    def create_skill(self, skill_name: str, description: str, examples: List[str], prompts: List[str]):
        """创建新技能"""
        content = f"""# {skill_name}

## 描述
{description}

## 示例
{chr(10).join(examples)}

## 提示词
{chr(10).join(prompts)}
"""
        
        skill_file = self.skills_dir / f"{skill_name}.md"
        with open(skill_file, 'w', encoding='utf-8') as f:
            f.write(content)
        
        # 重新加载
        self.load_all_skills()
    
    def apply_skill(self, skill_name: str, user_input: str) -> str:
        """应用技能到用户输入"""
        skill = self.get_skill(skill_name)
        if not skill:
            return user_input
        
        # 这里可以根据技能类型添加特定的提示词
        enhanced_input = f"[应用技能: {skill_name}]\n{skill['description']}\n\n用户输入: {user_input}"
        
        return enhanced_input