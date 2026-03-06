// 添加数值积分功能
math.integrate = function (f, a, b, n = 1000) {
    const h = (b - a) / n;
    let sum = 0;
    for (let i = 0; i < n; i++) {
        const x1 = a + i * h;
        const x2 = a + (i + 1) * h;
        sum += (f(x1) + f(x2)) * h / 2;
    }
    return sum;
};

// 添加方程求解器
math.findRoot = function (f, x0, tol = 1e-6, maxIter = 100) {
    let x = parseFloat(x0);
    for (let i = 0; i < maxIter; i++) {
        const fx = f(x);
        if (Math.abs(fx) < tol) return x;

        // 数值导数
        const h = 0.0001;
        const dfx = (f(x + h) - f(x - h)) / (2 * h);

        if (Math.abs(dfx) < 1e-10) break; // 防止除零
        x = x - fx / dfx;
    }
    return x;
};

// 光标位置处理
let cursorPosition = 0;
const inputField = document.getElementById('main-input');

inputField.addEventListener('click', updateCursorPosition);
inputField.addEventListener('keyup', updateCursorPosition);
inputField.addEventListener('input', updateCursorPosition);

function updateCursorPosition() {
    cursorPosition = inputField.selectionStart;
    document.getElementById('cursorPos').textContent = `位置: ${cursorPosition}`;
}

function insertAtCursor(value, isBackspace = false) {
    const currentValue = inputField.value;
    const newValue = currentValue.substring(0, cursorPosition) + value + currentValue.substring(cursorPosition);
    inputField.value = newValue;

    // 更新光标位置
    if (isBackspace) {
        cursorPosition += value.length - 1; // 光标回退一格
    } else {
        cursorPosition += value.length;
    }

    inputField.setSelectionRange(cursorPosition, cursorPosition);
    updateCursorPosition();
    inputField.focus();
}



function clearInput() {
    inputField.value = '';
    cursorPosition = 0;
    updateCursorPosition();
    inputField.focus();
}

function backspace() {
    if (cursorPosition > 0) {
        const currentValue = inputField.value;
        const newValue = currentValue.substring(0, cursorPosition - 1) + currentValue.substring(cursorPosition);
        inputField.value = newValue;

        cursorPosition--;
        inputField.setSelectionRange(cursorPosition, cursorPosition);
        updateCursorPosition();
    }
    inputField.focus();
}

function calculate() {
    try {
        const input = inputField.value;
        if (!input) return;

        const result = math.evaluate(input);
        inputField.value = result.toString();
        showResult('计算结果: ' + result, false);

        // 将光标移到末尾
        cursorPosition = inputField.value.length;
        inputField.setSelectionRange(cursorPosition, cursorPosition);
        updateCursorPosition();
    } catch (e) {
        showResult('错误: ' + e.message, true);
    }
    inputField.focus();
}

// 模式切换
function toggleMode() {
    const mode = document.getElementById('modeSelect').value;
    document.querySelectorAll('.function-panel').forEach(panel => {
        panel.style.display = 'none';
    });
    document.getElementById(mode + 'Panel').style.display = 'block';

    // 特殊处理矩阵运算
    if (mode === 'matrix') {
        document.getElementById('matrixOperation').addEventListener('change', function () {
            const op = this.value;
            document.getElementById('matrixInputBGroup').style.display =
                (op === 'multiply' || op === 'add') ? 'block' : 'none';
        });
    }

    inputField.focus();
}

// 方程求解 - 支持多种方程
function solveEquation() {
    try {
        const equation = document.getElementById('equationInput').value;
        const variable = document.getElementById('equationVar').value;
        const guess = document.getElementById('equationGuess').value || '0';

        if (!equation || !variable) {
            throw new Error('请输入完整的方程和变量');
        }

        const sides = equation.split('=');
        if (sides.length !== 2) throw new Error('无效方程格式，请使用"="分隔两边');

        const expr = math.parse(`${sides[0].trim()} - (${sides[1].trim()})`);
        const simplified = math.simplify(expr);

        // 尝试解析多项式方程
        try {
            const poly = simplified.toString();
            const coeffs = getPolynomialCoefficients(poly, variable);

            if (coeffs.length > 1) {
                const roots = findPolynomialRoots(coeffs);
                let result = `方程 ${equation} 的解:\n`;
                roots.forEach((root, i) => {
                    result += `${variable}${i + 1} = ${root}\n`;
                });
                showResult(result, false);
                return;
            }
        } catch (e) {
            // 不是多项式方程，继续尝试其他方法
        }

        // 使用数值方法求解
        const f = math.compile(simplified.toString());
        const solution = math.findRoot(x => f.evaluate({ [variable]: x }), guess);

        showResult(`方程 ${equation} 的解:\n${variable} ≈ ${solution.toFixed(6)}`, false);
    } catch (e) {
        showResult('错误: ' + e.message, true);
    }
    inputField.focus();
}

// 获取多项式系数
function getPolynomialCoefficients(expr, variable) {
    const node = math.parse(expr);
    const degree = getPolynomialDegree(node, variable);
    const coeffs = new Array(degree + 1).fill(0);

    extractCoefficients(node, variable, coeffs);
    return coeffs;
}

function getPolynomialDegree(node, variable) {
    if (node.type === 'OperatorNode' && node.op === '+') {
        return Math.max(
            getPolynomialDegree(node.args[0], variable),
            getPolynomialDegree(node.args[1], variable)
        );
    }

    if (node.type === 'OperatorNode' && node.op === '-') {
        return Math.max(
            getPolynomialDegree(node.args[0], variable),
            getPolynomialDegree(node.args[1], variable)
        );
    }

    if (node.type === 'OperatorNode' && node.op === '*') {
        return getPolynomialDegree(node.args[0], variable) +
            getPolynomialDegree(node.args[1], variable);
    }

    if (node.type === 'OperatorNode' && node.op === '^' &&
        node.args[0].name === variable && node.args[1].type === 'ConstantNode') {
        return node.args[1].value;
    }

    if (node.type === 'SymbolNode' && node.name === variable) {
        return 1;
    }

    if (node.type === 'ConstantNode') {
        return 0;
    }

    throw new Error('无法解析多项式');
}

function extractCoefficients(node, variable, coeffs, sign = 1) {
    if (node.type === 'OperatorNode' && node.op === '+') {
        extractCoefficients(node.args[0], variable, coeffs, sign);
        extractCoefficients(node.args[1], variable, coeffs, sign);
        return;
    }

    if (node.type === 'OperatorNode' && node.op === '-') {
        extractCoefficients(node.args[0], variable, coeffs, sign);
        extractCoefficients(node.args[1], variable, coeffs, -sign);
        return;
    }

    if (node.type === 'OperatorNode' && node.op === '*') {
        // 简单处理单项式
        let coeff = 1;
        let degree = 0;

        for (const arg of node.args) {
            if (arg.type === 'ConstantNode') {
                coeff *= arg.value;
            } else if (arg.type === 'SymbolNode' && arg.name === variable) {
                degree += 1;
            } else if (arg.type === 'OperatorNode' && arg.op === '^' &&
                arg.args[0].name === variable && arg.args[1].type === 'ConstantNode') {
                degree += arg.args[1].value;
            }
        }

        coeffs[degree] += sign * coeff;
        return;
    }

    if (node.type === 'OperatorNode' && node.op === '^' &&
        node.args[0].name === variable && node.args[1].type === 'ConstantNode') {
        coeffs[node.args[1].value] += sign;
        return;
    }

    if (node.type === 'SymbolNode' && node.name === variable) {
        coeffs[1] += sign;
        return;
    }

    if (node.type === 'ConstantNode') {
        coeffs[0] += sign * node.value;
        return;
    }

    throw new Error('无法解析多项式项');
}

// 求多项式方程的根
function findPolynomialRoots(coeffs) {
    // 去除高阶零系数
    while (coeffs.length > 1 && math.abs(coeffs[coeffs.length - 1]) < 1e-10) {
        coeffs.pop();
    }

    const degree = coeffs.length - 1;
    if (degree === 0) {
        throw new Error('无效方程');
    } else if (degree === 1) {
        // ax + b = 0
        return [-coeffs[0] / coeffs[1]];
    } else if (degree === 2) {
        // ax² + bx + c = 0
        const [a, b, c] = coeffs.reverse();
        const discriminant = b * b - 4 * a * c;

        if (discriminant > 0) {
            const sqrtD = Math.sqrt(discriminant);
            return [(-b + sqrtD) / (2 * a), (-b - sqrtD) / (2 * a)];
        } else if (discriminant === 0) {
            return [-b / (2 * a)];
        } else {
            const real = -b / (2 * a);
            const imag = Math.sqrt(-discriminant) / (2 * a);
            return [`${real} + ${imag}i`, `${real} - ${imag}i`];
        }
    } else {
        // 高阶多项式使用数值方法
        const f = x => {
            let sum = 0;
            for (let i = 0; i < coeffs.length; i++) {
                sum += coeffs[i] * Math.pow(x, i);
            }
            return sum;
        };

        // 简单实现：在多个初始猜测值上尝试
        const roots = [];
        const guesses = [-10, -5, -2, -1, 0, 1, 2, 5, 10];

        for (const guess of guesses) {
            try {
                const root = math.findRoot(f, guess);

                // 检查是否已经找到过这个根（近似）
                const isNew = roots.every(r => Math.abs(r - root) > 0.01);
                if (isNew) {
                    roots.push(root);
                }
            } catch (e) {
                // 忽略收敛失败
            }
        }

        if (roots.length === 0) {
            throw new Error('未能找到实数解，请尝试复数解法');
        }

        return roots;
    }
}

// 积分计算
function calculateIntegral() {
    try {
        const expr = document.getElementById('integralExpr').value;
        const variable = document.getElementById('integralVar').value;
        const lower = document.getElementById('lowerLimit').value;
        const upper = document.getElementById('upperLimit').value;

        if (!expr || !variable) {
            throw new Error('请输入完整的表达式和变量');
        }

        if (lower && upper) {
            // 定积分 - 数值积分
            const f = math.compile(expr);
            const result = math.integrate(x => f.evaluate({ [variable]: x }),
                parseFloat(lower),
                parseFloat(upper));
            showResult(`定积分 ∫[${lower}, ${upper}] ${expr} d${variable} ≈ ${result.toFixed(6)}`, false);
        } else {
            // 不定积分 - 符号积分
            const result = math.derivative(expr, variable).toString();
            showResult(`不定积分 ∫ ${expr} d${variable} = ${result} + C`, false);
        }
    } catch (e) {
        showResult('错误: ' + e.message, true);
    }
    inputField.focus();
}

// 导数计算
function calculateDerivative() {
    try {
        const expr = document.getElementById('derivativeExpr').value;
        const variable = document.getElementById('derivativeVar').value;
        const order = parseInt(document.getElementById('derivativeOrder').value) || 1;

        if (!expr || !variable) {
            throw new Error('请输入完整的表达式和变量');
        }

        let result = expr;
        for (let i = 0; i < order; i++) {
            result = math.derivative(result, variable).toString();
        }

        const orderText = order === 1 ? '一阶' : (order === 2 ? '二阶' : `${order}阶`);
        showResult(`${orderText}导数 d^${order}/${variable}^${order} (${expr}) = ${result}`, false);
    } catch (e) {
        showResult('错误: ' + e.message, true);
    }
    inputField.focus();
}

// 级数求和
function calculateSeries() {
    try {
        const expr = document.getElementById('seriesExpr').value;
        const variable = document.getElementById('seriesVar').value;
        const start = parseInt(document.getElementById('seriesStart').value);
        const end = parseInt(document.getElementById('seriesEnd').value);

        if (!expr || !variable || isNaN(start) || isNaN(end)) {
            throw new Error('请输入完整的表达式和范围');
        }

        const f = math.compile(expr);
        let sum = 0;

        for (let i = start; i <= end; i++) {
            sum += f.evaluate({ [variable]: i });
        }

        showResult(`级数求和 ∑(${expr}) from ${variable}=${start} to ${end} = ${sum}`, false);
    } catch (e) {
        showResult('错误: ' + e.message, true);
    }
    inputField.focus();
}

// 矩阵运算
function calculateMatrix() {
    try {
        const op = document.getElementById('matrixOperation').value;
        const matrixA = document.getElementById('matrixInputA').value;

        if (!matrixA) {
            throw new Error('请输入矩阵A');
        }

        const A = math.evaluate(matrixA);
        let result;

        switch (op) {
            case 'det':
                result = math.det(A);
                showResult(`矩阵A的行列式 = ${result}`, false);
                break;

            case 'inv':
                result = math.inv(A);
                showResult(`矩阵A的逆矩阵:\n${formatMatrix(result)}`, false);
                break;

            case 'transpose':
                result = math.transpose(A);
                showResult(`矩阵A的转置矩阵:\n${formatMatrix(result)}`, false);
                break;

            case 'multiply':
            case 'add':
                const matrixB = document.getElementById('matrixInputB').value;
                if (!matrixB) throw new Error('请输入矩阵B');

                const B = math.evaluate(matrixB);

                if (op === 'multiply') {
                    result = math.multiply(A, B);
                    showResult(`矩阵A × 矩阵B:\n${formatMatrix(result)}`, false);
                } else {
                    result = math.add(A, B);
                    showResult(`矩阵A + 矩阵B:\n${formatMatrix(result)}`, false);
                }
                break;

            default:
                throw new Error('未知的矩阵运算');
        }
    } catch (e) {
        showResult('错误: ' + e.message, true);
    }
    inputField.focus();
}

function formatMatrix(matrix) {
    if (math.size(matrix).length === 1) {
        return '[' + matrix.join(', ') + ']';
    }

    return matrix.map(row => '[' + row.join(', ') + ']').join('\n');
}

// 显示结果
function showResult(text, isError = false) {
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = text;
    resultDiv.className = isError ? 'error' : 'success';
}

// 初始化
document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('modeSelect').addEventListener('change', toggleMode);
    toggleMode(); // 初始显示基本面板
    inputField.focus();
});