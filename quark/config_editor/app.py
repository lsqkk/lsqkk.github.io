import os
import json
from pathlib import Path
from flask import Flask, render_template, request, jsonify, send_from_directory
import traceback
import subprocess
import sys

def create_app(json_dir):
    """创建Flask应用"""
    
    app = Flask(
        __name__,
        template_folder=os.path.join(os.path.dirname(__file__), 'templates'),
        static_folder=os.path.join(os.path.dirname(__file__), 'static')
    )
    
    # 确保JSON目录存在
    json_dir = Path(json_dir)
    project_root = json_dir.parents[2] if len(json_dir.parents) >= 3 else Path.cwd()
    editable_roots = [
        json_dir,
        project_root / 'assets' / 'pages' / 'a',
        project_root / 'assets' / 'pages' / 'blog',
        project_root / 'assets' / 'pages' / 'games',
        project_root / 'assets' / 'pages' / 'tool'
    ]
    command_map = {
        'build': ['npm', 'run', 'build'],
        'typecheck': ['npm', 'run', 'typecheck'],
        'syntax': ['npm', 'run', 'check:syntax'],
        'updateposts': [sys.executable, '-m', 'quark.cli', 'updateposts'],
        'updatelog': [sys.executable, '-m', 'quark.cli', 'updatelog'],
        'status': ['git', 'status', '--short']
    }

    if not json_dir.exists():
        json_dir.mkdir(parents=True, exist_ok=True)

    def encode_file_id(file_path):
        try:
            return file_path.relative_to(project_root).as_posix()
        except ValueError:
            return file_path.name

    def resolve_file(file_id):
        if '..' in file_id or file_id.startswith('/') or file_id.startswith('\\'):
            raise ValueError('无效的文件名')
        target = (project_root / file_id).resolve()
        if target.suffix.lower() != '.json':
            raise ValueError('仅允许编辑 JSON 文件')
        allowed = any(
            target == root.resolve() or root.resolve() in target.parents
            for root in editable_roots
        )
        if not allowed:
            raise ValueError('文件不在可编辑目录中')
        return target
    
    @app.route('/')
    def index():
        """主页面"""
        return render_template('index.html')
    
    @app.route('/api/files')
    def list_files():
        """获取所有JSON文件列表"""
        try:
            files = []
            for root in editable_roots:
                if not root.exists():
                    continue
                for file_path in sorted(root.rglob('*.json')):
                    if any(part.startswith('.') for part in file_path.relative_to(root).parts):
                        continue
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            content = f.read()
                            data = json.loads(content)
                        rel = encode_file_id(file_path)
                        files.append({
                            'name': file_path.name,
                            'id': rel,
                            'path': str(file_path),
                            'group': str(file_path.parent.relative_to(project_root)),
                            'size': file_path.stat().st_size,
                            'lastModified': file_path.stat().st_mtime,
                            'keys': list(data.keys()) if isinstance(data, dict) else ['array']
                        })
                    except Exception as e:
                        rel = encode_file_id(file_path)
                        files.append({
                            'name': file_path.name,
                            'id': rel,
                            'path': str(file_path),
                            'group': str(file_path.parent.relative_to(project_root)),
                            'size': file_path.stat().st_size,
                            'lastModified': file_path.stat().st_mtime,
                            'error': str(e),
                            'keys': []
                        })
            
            return jsonify({
                'success': True,
                'data': files,
                'count': len(files),
                'directory': str(project_root),
                'roots': [str(root.relative_to(project_root)) for root in editable_roots if root.exists()]
            })
        except Exception as e:
            return jsonify({
                'success': False,
                'error': str(e),
                'traceback': traceback.format_exc()
            }), 500
    
    @app.route('/api/file/<path:filename>')
    def get_file(filename):
        """获取单个JSON文件内容"""
        try:
            file_path = resolve_file(filename)
            
            if not file_path.exists():
                return jsonify({'success': False, 'error': '文件不存在'}), 404
            
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # 验证JSON格式
            try:
                data = json.loads(content)
                return jsonify({
                    'success': True,
                    'data': data,
                    'raw': content,
                    'filename': filename,
                    'size': len(content)
                })
            except json.JSONDecodeError as e:
                return jsonify({
                    'success': False,
                    'error': f'JSON格式错误: {e}',
                    'raw': content,
                    'filename': filename
                }), 400
                
        except Exception as e:
            return jsonify({
                'success': False,
                'error': str(e),
                'traceback': traceback.format_exc()
            }), 500
    
    @app.route('/api/file/<path:filename>', methods=['POST'])
    def save_file(filename):
        """保存JSON文件"""
        try:
            file_path = resolve_file(filename)
            
            # 获取JSON数据
            data = request.get_json()
            if data is None:
                return jsonify({'success': False, 'error': '无效的JSON数据'}), 400
            
            # 验证数据
            if 'data' not in data:
                return jsonify({'success': False, 'error': '缺少data字段'}), 400
            
            # 格式化JSON
            try:
                formatted = json.dumps(data['data'], indent=2, ensure_ascii=False)
            except Exception as e:
                return jsonify({'success': False, 'error': f'JSON序列化失败: {e}'}), 400
            
            # 写入文件
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(formatted)
            
            return jsonify({
                'success': True,
                'message': '文件保存成功',
                'filename': filename,
                'size': len(formatted)
            })
            
        except Exception as e:
            return jsonify({
                'success': False,
                'error': str(e),
                'traceback': traceback.format_exc()
            }), 500
    
    @app.route('/api/file/<path:filename>', methods=['DELETE'])
    def delete_file(filename):
        """删除JSON文件"""
        try:
            file_path = resolve_file(filename)
            
            if not file_path.exists():
                return jsonify({'success': False, 'error': '文件不存在'}), 404
            
            # 备份到回收站或直接删除
            backup_dir = file_path.parent / '.deleted'
            backup_dir.mkdir(exist_ok=True)
            
            import shutil
            import time
            timestamp = int(time.time())
            backup_path = backup_dir / f"{file_path.name}.{timestamp}.bak"
            
            shutil.move(file_path, backup_path)
            
            return jsonify({
                'success': True,
                'message': '文件已移动到回收站',
                'filename': filename,
                'backup': str(backup_path.name)
            })
            
        except Exception as e:
            return jsonify({
                'success': False,
                'error': str(e),
                'traceback': traceback.format_exc()
            }), 500
    
    @app.route('/api/file/new', methods=['POST'])
    def create_file():
        """创建新的JSON文件"""
        try:
            data = request.get_json()
            if not data or 'filename' not in data:
                return jsonify({'success': False, 'error': '缺少文件名'}), 400
            
            filename = data['filename']
            if not filename.endswith('.json'):
                filename += '.json'

            target_root = data.get('root') or 'src/config/json'
            if '..' in target_root:
                return jsonify({'success': False, 'error': '无效的目录'}), 400
            base_dir = (project_root / target_root).resolve()
            if not any(base_dir == root.resolve() for root in editable_roots):
                return jsonify({'success': False, 'error': '不允许在该目录创建文件'}), 400
            if '..' in filename or '/' in filename or '\\' in filename:
                return jsonify({'success': False, 'error': '无效的文件名'}), 400

            file_path = base_dir / filename
            
            if file_path.exists():
                return jsonify({'success': False, 'error': '文件已存在'}), 400
            
            # 默认内容
            default_content = data.get('content', {})
            if not default_content:
                default_content = {
                    "name": filename.replace('.json', ''),
                    "description": "新建的配置文件",
                    "version": "1.0.0",
                    "settings": {}
                }
            
            # 写入文件
            formatted = json.dumps(default_content, indent=2, ensure_ascii=False)
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(formatted)
            
            return jsonify({
                'success': True,
                'message': '文件创建成功',
                'filename': filename,
                'size': len(formatted)
            })
            
        except Exception as e:
            return jsonify({
                'success': False,
                'error': str(e),
                'traceback': traceback.format_exc()
            }), 500
    
    @app.route('/api/validate/<path:filename>')
    def validate_file(filename):
        """验证JSON文件格式"""
        try:
            file_path = resolve_file(filename)
            
            if not file_path.exists():
                return jsonify({'success': False, 'error': '文件不存在'}), 404
            
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            try:
                data = json.loads(content)
                return jsonify({
                    'success': True,
                    'valid': True,
                    'message': 'JSON格式正确',
                    'size': len(content),
                    'structure': describe_structure(data)
                })
            except json.JSONDecodeError as e:
                return jsonify({
                    'success': True,
                    'valid': False,
                    'message': f'JSON格式错误: {e}',
                    'error': str(e),
                    'position': e.pos
                })
                
        except Exception as e:
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    @app.route('/api/commands')
    def list_commands():
        return jsonify({
            'success': True,
            'data': [
                {'id': 'build', 'label': 'npm run build', 'description': '完整构建'},
                {'id': 'typecheck', 'label': 'npm run typecheck', 'description': '类型检查'},
                {'id': 'syntax', 'label': 'npm run check:syntax', 'description': '脚本语法检查'},
                {'id': 'updateposts', 'label': 'quark updateposts', 'description': '刷新文章数据'},
                {'id': 'updatelog', 'label': 'quark updatelog', 'description': '刷新更新日志'},
                {'id': 'status', 'label': 'git status --short', 'description': '查看工作区状态'}
            ]
        })

    @app.route('/api/commands/<command_id>', methods=['POST'])
    def run_command(command_id):
        if command_id not in command_map:
            return jsonify({'success': False, 'error': '未知命令'}), 400
        try:
            result = subprocess.run(
                command_map[command_id],
                cwd=project_root,
                text=True,
                capture_output=True,
                timeout=180
            )
            output = (result.stdout or '') + (('\n' + result.stderr) if result.stderr else '')
            return jsonify({
                'success': result.returncode == 0,
                'returnCode': result.returncode,
                'output': output[-12000:] if output else '(无输出)'
            })
        except subprocess.TimeoutExpired as e:
            output = ((e.stdout or '') + '\n' + (e.stderr or '')).strip()
            return jsonify({'success': False, 'error': '命令超时', 'output': output[-12000:]}), 408
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500
    
    def describe_structure(data, depth=0):
        """描述JSON结构"""
        if isinstance(data, dict):
            result = {'type': 'object', 'keys': {}}
            for key, value in data.items():
                result['keys'][key] = describe_structure(value, depth + 1)
            return result
        elif isinstance(data, list):
            if data:
                # 检查数组元素是否类型一致
                types = set(type(item).__name__ for item in data[:5])  # 检查前5个元素
                element_type = describe_structure(data[0], depth + 1) if data else {'type': 'unknown'}
                return {'type': 'array', 'length': len(data), 'element_type': element_type, 'sample_types': list(types)}
            else:
                return {'type': 'array', 'length': 0, 'element_type': 'unknown'}
        else:
            return {'type': type(data).__name__, 'value': str(data)[:50]}
    
    @app.errorhandler(404)
    def not_found(e):
        """404错误处理"""
        return jsonify({'success': False, 'error': '资源未找到'}), 404
    
    @app.errorhandler(500)
    def server_error(e):
        """500错误处理"""
        return jsonify({'success': False, 'error': '服务器内部错误'}), 500
    
    return app

def run_server(host='127.0.0.1', port=5050, debug=False, json_dir=None):
    """运行Flask服务器"""
    if json_dir is None:
        # 默认使用当前目录下的json文件夹
        json_dir = Path.cwd() / 'src' / 'config' / 'json'
    
    app = create_app(json_dir)
    
    # 禁用Flask启动日志
    import logging
    log = logging.getLogger('werkzeug')
    log.setLevel(logging.ERROR)
    
    # 运行服务器
    app.run(host=host, port=port, debug=debug, use_reloader=False)
