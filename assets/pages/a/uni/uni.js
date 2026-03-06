// 移动菜单切换
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const navLinks = document.getElementById('navLinks');

mobileMenuBtn.addEventListener('click', () => {
    navLinks.classList.toggle('active');
    mobileMenuBtn.innerHTML = navLinks.classList.contains('active') ?
        '<i class="fas fa-times"></i>' : '<i class="fas fa-bars"></i>';
});

// 平滑滚动
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const targetId = this.getAttribute('href');
        if (targetId === '#') return;

        const targetElement = document.querySelector(targetId);
        if (targetElement) {
            window.scrollTo({
                top: targetElement.offsetTop - 70,
                behavior: 'smooth'
            });

            // 关闭移动菜单
            if (navLinks.classList.contains('active')) {
                navLinks.classList.remove('active');
                mobileMenuBtn.innerHTML = '<i class="fas fa-bars"></i>';
            }
        }
    });
});

// 返回顶部按钮
const backToTop = document.getElementById('backToTop');
window.addEventListener('scroll', () => {
    if (window.pageYOffset > 300) {
        backToTop.classList.add('active');
    } else {
        backToTop.classList.remove('active');
    }
});

backToTop.addEventListener('click', () => {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
});

// 统计数据动画
const statNumbers = document.querySelectorAll('.stat-number');
const options = {
    threshold: 0.5
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const target = +entry.target.getAttribute('data-count');
            const count = +entry.target.innerText;
            const increment = target / 50;

            if (count < target) {
                entry.target.innerText = Math.ceil(count + increment);
                setTimeout(() => {
                    observer.observe(entry.target);
                }, 20);
            } else {
                entry.target.innerText = target;
            }
        }
    });
}, options);

statNumbers.forEach(number => {
    observer.observe(number);
});

// 师资轮播
let currentSlide = 0;
const facultyContainer = document.getElementById('facultyContainer');
const dots = document.querySelectorAll('.slider-dot');
const facultyMembers = document.querySelectorAll('.faculty-member');
const facultyWidth = facultyMembers[0].offsetWidth + 32; // width + margin

function goToSlide(index) {
    currentSlide = index;
    facultyContainer.style.transform = `translateX(-${currentSlide * facultyWidth}px)`;

    // 更新指示点
    dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === currentSlide);
    });
}

// 点击指示点切换
dots.forEach((dot, index) => {
    dot.addEventListener('click', () => goToSlide(index));
});

// 自动轮播
setInterval(() => {
    currentSlide = (currentSlide + 1) % facultyMembers.length;
    goToSlide(currentSlide);
}, 5000);