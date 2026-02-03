import os
import json
from pathlib import Path
from flask import Flask, render_template, request, jsonify, send_from_directory
import traceback

def create_app(json_dir):
    """创建Flask应用"""
    
    app = Flask(
        __name__,
        template_folder=os.path.join(os.path.dirname(__file__), 'templates'),
        static_folder=os.path.join(os.path.dirname(__file__), 'static')
    )
    
    # 确保JSON目录存在
    json_dir = Path(json_dir)
    if not json_dir.exists():
        json_dir.mkdir(parents=True, exist_ok=True)
    
    @app.route('/')
    def index():
        """主页面"""
        return render_template('index.html')
    
    @app.route('/api/files')
    def list_files():
        """获取所有JSON文件列表"""
        try:
            files = []
            for file_path in sorted(json_dir.glob('*.json')):
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        # 尝试解析以验证JSON格式
                        data = json.loads(content)
                        
                        files.append({
                            'name': file_path.name,
                            'path': str(file_path),
                            'size': file_path.stat().st_size,
                            'lastModified': file_path.stat().st_mtime,
                            'keys': list(data.keys()) if isinstance(data, dict) else ['array']
                        })
                except Exception as e:
                    # 即使是损坏的JSON也列出，但标记为错误
                    files.append({
                        'name': file_path.name,
                        'path': str(file_path),
                        'size': file_path.stat().st_size,
                        'lastModified': file_path.stat().st_mtime,
                        'error': str(e),
                        'keys': []
                    })
            
            return jsonify({
                'success': True,
                'data': files,
                'count': len(files),
                'directory': str(json_dir)
            })
        except Exception as e:
            return jsonify({
                'success': False,
                'error': str(e),
                'traceback': traceback.format_exc()
            }), 500
    
    @app.route('/api/file/<filename>')
    def get_file(filename):
        """获取单个JSON文件内容"""
        try:
            # 安全检查：防止目录遍历
            if '..' in filename or '/' in filename:
                return jsonify({'success': False, 'error': '无效的文件名'}), 400
            
            file_path = json_dir / filename
            
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
    
    @app.route('/api/file/<filename>', methods=['POST'])
    def save_file(filename):
        """保存JSON文件"""
        try:
            # 安全检查
            if '..' in filename or '/' in filename:
                return jsonify({'success': False, 'error': '无效的文件名'}), 400
            
            file_path = json_dir / filename
            
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
    
    @app.route('/api/file/<filename>', methods=['DELETE'])
    def delete_file(filename):
        """删除JSON文件"""
        try:
            # 安全检查
            if '..' in filename or '/' in filename:
                return jsonify({'success': False, 'error': '无效的文件名'}), 400
            
            file_path = json_dir / filename
            
            if not file_path.exists():
                return jsonify({'success': False, 'error': '文件不存在'}), 404
            
            # 备份到回收站或直接删除
            backup_dir = json_dir / '.deleted'
            backup_dir.mkdir(exist_ok=True)
            
            import shutil
            import time
            timestamp = int(time.time())
            backup_path = backup_dir / f"{filename}.{timestamp}.bak"
            
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
            
            # 安全检查
            if '..' in filename or '/' in filename:
                return jsonify({'success': False, 'error': '无效的文件名'}), 400
            
            file_path = json_dir / filename
            
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
    
    @app.route('/api/validate/<filename>')
    def validate_file(filename):
        """验证JSON文件格式"""
        try:
            if '..' in filename or '/' in filename:
                return jsonify({'success': False, 'error': '无效的文件名'}), 400
            
            file_path = json_dir / filename
            
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
        json_dir = Path.cwd() / 'json'
    
    app = create_app(json_dir)
    
    # 禁用Flask启动日志
    import logging
    log = logging.getLogger('werkzeug')
    log.setLevel(logging.ERROR)
    
    # 运行服务器
    app.run(host=host, port=port, debug=debug, use_reloader=False)