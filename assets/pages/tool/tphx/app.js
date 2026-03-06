// 设置当前年份
document.getElementById('current-year').textContent = new Date().getFullYear();

// 初始化变量
let currentImage = null;
const img = document.getElementById('display-img');
const iterationsInput = document.getElementById('iterations');
let processedBlob = null;

// 拖放功能
const dropArea = document.getElementById('drop-area');

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
    dropArea.addEventListener(eventName, highlight, false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, unhighlight, false);
});

function highlight() {
    dropArea.classList.add('active');
}

function unhighlight() {
    dropArea.classList.remove('active');
}

dropArea.addEventListener('drop', handleDrop, false);

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
        handleFiles(files);
    }
}

// 文件处理
function handleFiles(files) {
    if (files.length > 0 && files[0].type.startsWith('image/')) {
        const file = files[0];
        const url = URL.createObjectURL(file);
        setImageSource(url);
        currentImage = file;
    }
}

function setImageSource(src) {
    URL.revokeObjectURL(img.src);
    img.src = src;
    img.style.display = 'block';
    processedBlob = null;

    // 预加载图片获取尺寸
    const tempImg = new Image();
    tempImg.onload = function () {
        console.log(`图片已加载，尺寸: ${this.width}x${this.height}`);
    };
    tempImg.src = src;
}

// 文件输入
const ipt = document.getElementById('ipt');
ipt.addEventListener('change', () => {
    if (ipt.files.length > 0) {
        handleFiles(ipt.files);
    }
});

// 混淆函数
function gilbert2d(width, height) {
    const coordinates = [];
    if (width >= height) {
        generate2d(0, 0, width, 0, 0, height, coordinates);
    } else {
        generate2d(0, 0, 0, height, width, 0, coordinates);
    }
    return coordinates;
}

function generate2d(x, y, ax, ay, bx, by, coordinates) {
    const w = Math.abs(ax + ay);
    const h = Math.abs(bx + by);
    const dax = Math.sign(ax), day = Math.sign(ay);
    const dbx = Math.sign(bx), dby = Math.sign(by);

    if (h === 1) {
        for (let i = 0; i < w; i++) {
            coordinates.push([x, y]);
            x += dax;
            y += day;
        }
        return;
    }

    if (w === 1) {
        for (let i = 0; i < h; i++) {
            coordinates.push([x, y]);
            x += dbx;
            y += dby;
        }
        return;
    }

    let ax2 = Math.floor(ax / 2), ay2 = Math.floor(ay / 2);
    let bx2 = Math.floor(bx / 2), by2 = Math.floor(by / 2);
    const w2 = Math.abs(ax2 + ay2);
    const h2 = Math.abs(bx2 + by2);

    if (2 * w > 3 * h) {
        if ((w2 % 2) && (w > 2)) {
            ax2 += dax;
            ay2 += day;
        }
        generate2d(x, y, ax2, ay2, bx, by, coordinates);
        generate2d(x + ax2, y + ay2, ax - ax2, ay - ay2, bx, by, coordinates);
    } else {
        if ((h2 % 2) && (h > 2)) {
            bx2 += dbx;
            by2 += dby;
        }
        generate2d(x, y, bx2, by2, ax2, ay2, coordinates);
        generate2d(x + bx2, y + by2, ax, ay, bx - bx2, by - by2, coordinates);
        generate2d(x + (ax - dax) + (bx2 - dbx), y + (ay - day) + (by2 - dby),
            -bx2, -by2, -(ax - ax2), -(ay - ay2), coordinates);
    }
}

// 处理图片
function processImage(img, encryptMode = true) {
    return new Promise((resolve) => {
        const iterations = parseInt(iterationsInput.value) || 1;
        const cvs = document.createElement('canvas');
        const tempImg = new Image();

        tempImg.onload = function () {
            const width = cvs.width = this.naturalWidth;
            const height = cvs.height = this.naturalHeight;
            const ctx = cvs.getContext('2d');
            ctx.drawImage(this, 0, 0);

            let imgdata = ctx.getImageData(0, 0, width, height);
            const curve = gilbert2d(width, height);
            const offset = Math.round((Math.sqrt(5) - 1) / 2 * width * height);

            for (let iter = 0; iter < iterations; iter++) {
                const imgdata2 = new ImageData(width, height);

                for (let i = 0; i < width * height; i++) {
                    const old_pos = curve[i];
                    const new_pos = curve[(i + offset) % (width * height)];
                    const old_p = 4 * (old_pos[0] + old_pos[1] * width);
                    const new_p = 4 * (new_pos[0] + new_pos[1] * width);

                    if (encryptMode) {
                        imgdata2.data.set(imgdata.data.slice(old_p, old_p + 4), new_p);
                    } else {
                        imgdata2.data.set(imgdata.data.slice(new_p, new_p + 4), old_p);
                    }
                }

                imgdata = imgdata2;
            }

            ctx.putImageData(imgdata, 0, 0);
            cvs.toBlob(blob => {
                resolve(blob);
            }, 'image/jpeg', 0.95);
        };

        tempImg.src = img.src;
    });
}

// 按钮事件
document.getElementById('enc').addEventListener('click', async () => {
    if (img.src && img.src !== '') {
        img.style.display = 'none';
        const blob = await processImage(img, true);
        processedBlob = blob;
        setImageSource(URL.createObjectURL(blob));
    }
});

document.getElementById('dec').addEventListener('click', async () => {
    if (img.src && img.src !== '') {
        img.style.display = 'none';
        const blob = await processImage(img, false);
        processedBlob = blob;
        setImageSource(URL.createObjectURL(blob));
    }
});

document.getElementById('download').addEventListener('click', () => {
    if (processedBlob) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(processedBlob);
        a.download = `processed_${new Date().getTime()}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    } else if (img.src && img.src !== '') {
        const a = document.createElement('a');
        a.href = img.src;
        a.download = `image_${new Date().getTime()}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
});