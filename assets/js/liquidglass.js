/**
 * LiquidGlass.js - CSS Variable Driven Edition
 */
class LiquidGlass {
    constructor(element) {
        this.el = typeof element === 'string' ? document.querySelector(element) : element;
        if (!this.el) return;

        this._init();
    }

    _getProp(name, defaultValue) {
        // 按照优先级读取：1. CSS变量 > 2. Data属性 > 3. 默认值
        const cssVal = getComputedStyle(this.el).getPropertyValue(`--lg-${name}`).trim();
        if (cssVal) return cssVal.includes('px') ? parseFloat(cssVal) : parseFloat(cssVal);

        const dataVal = this.el.dataset[name];
        if (dataVal) return parseFloat(dataVal);

        return defaultValue;
    }

    _init() {
        // 读取配置
        this.config = {
            radius: this._getProp('radius', 40),
            opacity: this._getProp('opacity', 0.1),
            blur: this._getProp('blur', 30),
            refraction: this._getProp('refraction', 25),
            shimmer: this._getProp('shimmer', 0.4)
        };

        this.el.style.position = 'relative';
        const content = this.el.innerHTML;
        this.el.innerHTML = `
            <div class="lg-refraction-probe"></div>
            <div class="lg-body"><div class="lg-content">${content}</div></div>
        `;

        this._injectStyles();
        this._apply();
    }

    _injectStyles() {
        if (document.getElementById('lg-style')) return;
        const style = document.createElement('style');
        style.id = 'lg-style';
        style.innerHTML = `
            .lg-refraction-probe {
                position: absolute; top: var(--rf); left: var(--rf); right: var(--rf); bottom: var(--rf);
                background: inherit; border-radius: calc(var(--rd) * 1.5);
                filter: blur(var(--br)) saturate(2); opacity: 0.6; pointer-events: none; z-index: -1;
                mask-image: radial-gradient(circle, transparent 45%, black 80%);
                -webkit-mask-image: radial-gradient(circle, transparent 45%, black 80%);
            }
            .lg-body {
                position: relative; width: 100%; height: 100%; border-radius: var(--rd);
                background: rgba(255, 255, 255, var(--op));
                backdrop-filter: blur(var(--br)) saturate(1.8) brightness(1.1);
                -webkit-backdrop-filter: blur(var(--br)) saturate(1.8) brightness(1.1);
                box-shadow: inset 1.5px 1.5px 3px rgba(255, 255, 255, var(--sh)), inset -1.5px -1.5px 3px rgba(0,0,0,0.05);
                overflow: hidden;
            }
            .lg-content { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
        `;
        document.head.appendChild(style);
    }

    _apply() {
        const s = this.el.style;
        s.setProperty('--rd', this.config.radius + 'px');
        s.setProperty('--op', this.config.opacity);
        s.setProperty('--br', this.config.blur + 'px');
        s.setProperty('--rf', `-${this.config.refraction}px`);
        s.setProperty('--sh', this.config.shimmer);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.liquid-glass').forEach(el => new LiquidGlass(el));
});