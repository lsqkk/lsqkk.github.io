document.addEventListener('DOMContentLoaded', function () {
    // 设置当前年份
    document.getElementById('current-year').textContent = new Date().getFullYear();

    // 文献类型切换
    const typeButtons = document.querySelectorAll('.type-btn');
    const forms = document.querySelectorAll('.card div[id$="-form"]');

    typeButtons.forEach(button => {
        button.addEventListener('click', function () {
            const type = this.getAttribute('data-type');

            // 更新活动按钮
            typeButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');

            // 显示对应的表单
            forms.forEach(form => {
                form.style.display = 'none';
            });

            document.getElementById(`${type}-form`).style.display = 'block';

            // 隐藏结果区域
            document.getElementById('result-container').style.display = 'none';
        });
    });

    // 生成参考文献逻辑
    const generateButtons = document.querySelectorAll('.generate-btn');

    // 存储生成的文献
    let references = [];
    let isUnorderedMode = document.getElementById('unordered-mode').checked;

    generateButtons.forEach(button => {
        button.addEventListener('click', function () {
            const formId = this.closest('div').id;
            const referenceType = formId.replace('-form', '');
            const form = document.getElementById(formId);
            const inputs = form.querySelectorAll('input');
            const output = document.getElementById('reference-output');

            // 必填项验证
            let isValid = true;
            form.querySelectorAll('input').forEach(input => {
                const label = input.previousElementSibling;
                const hasRequired = label.classList.contains('required');

                if (hasRequired && !input.value.trim()) {
                    isValid = false;
                    input.style.borderColor = 'var(--accent-color)';
                } else {
                    input.style.borderColor = 'var(--border-color)';
                }
            });

            if (!isValid) {
                alert('请填写所有必填项！');
                return;
            }

            // 生成参考文献
            let reference = '';

            switch (referenceType) {
                case 'monograph':
                    reference = `[1] ${document.getElementById('monograph-author').value}.${document.getElementById('monograph-title').value}[M]. ${document.getElementById('monograph-place').value}：${document.getElementById('monograph-publisher').value}，${document.getElementById('monograph-year').value}${document.getElementById('monograph-pages').value ? `：${document.getElementById('monograph-pages').value}` : ''}.`;
                    break;
                case 'anthology':
                    reference = `[1] ${document.getElementById('anthology-author').value}.${document.getElementById('anthology-title').value}[C]. ${document.getElementById('anthology-place').value}：${document.getElementById('anthology-publisher').value}，${document.getElementById('anthology-year').value}${document.getElementById('anthology-pages').value ? `：${document.getElementById('anthology-pages').value}` : ''}.`;
                    break;
                case 'newspaper':
                    reference = `[1] ${document.getElementById('newspaper-author').value}.${document.getElementById('newspaper-title').value}[N]. ${document.getElementById('newspaper-name').value}，${document.getElementById('newspaper-date').value}(${document.getElementById('newspaper-edition').value}).`;
                    break;
                case 'journal':
                    reference = `[1] ${document.getElementById('journal-author').value}.${document.getElementById('journal-title').value}[J]. ${document.getElementById('journal-name').value}，${document.getElementById('journal-year').value}，${document.getElementById('journal-volume').value}(${document.getElementById('journal-issue').value})${document.getElementById('journal-pages').value ? `：${document.getElementById('journal-pages').value}` : ''}.`;
                    break;
                case 'thesis':
                    reference = `[1] ${document.getElementById('thesis-author').value}.${document.getElementById('thesis-title').value}[D]. ${document.getElementById('thesis-place').value}：${document.getElementById('thesis-publisher').value}，${document.getElementById('thesis-year').value}${document.getElementById('thesis-pages').value ? `：${document.getElementById('thesis-pages').value}` : ''}.`;
                    break;
                case 'report':
                    reference = `[1] ${document.getElementById('report-author').value}.${document.getElementById('report-title').value}[R]. ${document.getElementById('report-place').value}：${document.getElementById('report-publisher').value}，${document.getElementById('report-year').value}${document.getElementById('report-pages').value ? `：${document.getElementById('report-pages').value}` : ''}.`;
                    break;
                case 'standard':
                    reference = `[1] ${document.getElementById('standard-number').value},${document.getElementById('standard-name').value}[S].`;
                    break;
                case 'patent':
                    reference = `[1] ${document.getElementById('patent-owner').value}.${document.getElementById('patent-title').value}[P]. ${document.getElementById('patent-country').value}专利:${document.getElementById('patent-number').value},${document.getElementById('patent-date').value.replace(/-/g, '.')}.`;
                    break;
                case 'regulation':
                    reference = `[1] ${document.getElementById('regulation-issuer').value}.${document.getElementById('regulation-name').value}[Z].${document.getElementById('regulation-date').value.replace(/-/g, '-')}`;
                    break;
                case 'translation':
                    reference = `[1] ${document.getElementById('translation-author').value}.${document.getElementById('translation-title').value}[M].${document.getElementById('translation-translator').value}，译.${document.getElementById('translation-place').value}：${document.getElementById('translation-publisher').value}，${document.getElementById('translation-year').value}${document.getElementById('translation-pages').value ? `：${document.getElementById('translation-pages').value}` : ''}.`;
                    break;
                case 'electronic':
                    reference = `[1] ${document.getElementById('electronic-author').value}.${document.getElementById('electronic-title').value}[EB/OL].${document.getElementById('electronic-url').value},${document.getElementById('electronic-date').value.replace(/-/g, '-')}.`;
                    break;
            }

            // 添加或更新参考文献
            if (isUnorderedMode) {
                references.push(reference.replace('[1] ', ''));
            } else {
                references.push(reference);
            }

            // 显示参考文献
            output.textContent = references.join('\n\n');

            // 显示结果区域
            document.getElementById('result-container').style.display = 'block';

            // 滚动到结果区域
            output.scrollIntoView({ behavior: 'smooth' });
        });
    });

    // 继续添加按钮
    document.getElementById('continue-adding').addEventListener('click', function () {
        document.getElementById('result-container').style.display = 'none';
        document.querySelector('.type-btn.active').click();
    });

    // 清空按钮
    document.getElementById('clear-all').addEventListener('click', function () {
        if (confirm('确定要清空所有生成的参考文献吗？')) {
            references = [];
            document.getElementById('reference-output').textContent = '';
            document.getElementById('result-container').style.display = 'none';
        }
    });

    // 无序号模式切换
    document.getElementById('unordered-mode').addEventListener('change', function () {
        isUnorderedMode = this.checked;
        if (isUnorderedMode) {
            // 转换为无序号模式
            const numberedReferences = references.slice();
            references = [];
            numberedReferences.forEach(ref => {
                if (ref.startsWith('[1] ')) {
                    references.push(ref.replace('[1] ', ''));
                } else {
                    references.push(ref);
                }
            });
        } else {
            // 转换为有序号模式
            const unorderedReferences = references.slice();
            references = [];
            unorderedReferences.forEach((ref, index) => {
                if (ref.startsWith('[1] ')) {
                    references.push(ref);
                } else {
                    references.push(`[1] ${ref}`);
                }
            });
        }

        if (references.length > 0) {
            document.getElementById('reference-output').textContent = references.join('\n\n');
        }
    });

    // 复制功能
    document.getElementById('reference-output').addEventListener('click', function () {
        const textToCopy = this.textContent;
        navigator.clipboard.writeText(textToCopy).then(function () {
            alert('已复制到剪贴板！');
        }, function () {
            alert('复制失败，请手动选择并复制文本！');
        });
    });
});