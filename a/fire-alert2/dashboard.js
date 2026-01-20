// 生成固定映射的火险指数（0-5之间）
function getFireRiskValue(dateStr) {
    return 0;
}

// 获取最近7天的日期
function getRecentDates() {
    const dates = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(today.getDate() - i);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        dates.push(`${month}-${day}`);
    }
    return dates;
}

// 计算距离2025年11月11日的天数
function getDaysToNov11() {
    const today = new Date();
    const nov11 = new Date(2025, 10, 11); // 注意：月份是0-based
    const diffTime = Math.abs(nov11 - today);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// 初始化图表
document.addEventListener('DOMContentLoaded', function () {
    // 生成API响应时间
    const apiResponseTime = Math.floor(Math.random() * (388 - 88 + 1)) + 88;
    document.getElementById('apiResponse').textContent = apiResponseTime + 'ms';

    const recentDates = getRecentDates();
    const fireRiskData = recentDates.map(date => getFireRiskValue(date));
    const daysToNov11 = getDaysToNov11();

    // 火险趋势图表
    const riskTrendCtx = document.getElementById('riskTrendChart').getContext('2d');
    const riskTrendChart = new Chart(riskTrendCtx, {
        type: 'line',
        data: {
            labels: recentDates,
            datasets: [{
                label: '火险指数',
                data: fireRiskData,
                borderColor: '#ff6b35',
                backgroundColor: 'rgba(255, 107, 53, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 5,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b0b0b0'
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b0b0b0'
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#e0e0e0'
                    }
                }
            }
        }
    });

    // 气象数据分布图表
    const weatherDistCtx = document.getElementById('weatherDistributionChart').getContext('2d');
    const weatherDistChart = new Chart(weatherDistCtx, {
        type: 'bar',
        data: {
            labels: ['温度', '湿度', '风速', '降水'],
            datasets: [{
                label: '当前值',
                data: [28, 45, 12, 5],
                backgroundColor: [
                    'rgba(255, 107, 53, 0.7)',
                    'rgba(52, 152, 219, 0.7)',
                    'rgba(155, 89, 182, 0.7)',
                    'rgba(46, 204, 113, 0.7)'
                ],
                borderColor: [
                    'rgba(255, 107, 53, 1)',
                    'rgba(52, 152, 219, 1)',
                    'rgba(155, 89, 182, 1)',
                    'rgba(46, 204, 113, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b0b0b0'
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b0b0b0'
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#e0e0e0'
                    }
                }
            }
        }
    });

    // 火情报告图表
    const fireReportCtx = document.getElementById('fireReportChart').getContext('2d');
    const fireReportChart = new Chart(fireReportCtx, {
        type: 'doughnut',
        data: {
            labels: ['已确认', '误报', '处理中'],
            datasets: [{
                data: [0, 0, 0],
                backgroundColor: [
                    'rgba(255, 107, 53, 0.7)',
                    'rgba(52, 152, 219, 0.7)',
                    'rgba(241, 196, 15, 0.7)'
                ],
                borderColor: [
                    'rgba(255, 107, 53, 1)',
                    'rgba(52, 152, 219, 1)',
                    'rgba(241, 196, 15, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#e0e0e0',
                        padding: 20
                    }
                }
            }
        }
    });

    // 预警统计图表
    const warningCtx = document.getElementById('warningChart').getContext('2d');
    const warningChart = new Chart(warningCtx, {
        type: 'bar',
        data: {
            labels: ['低风险', '中风险', '高风险', '极高风险'],
            datasets: [{
                label: '预警数量',
                data: [daysToNov11, 0, 0, 0],
                backgroundColor: [
                    'rgba(46, 204, 113, 0.7)',
                    'rgba(241, 196, 15, 0.7)',
                    'rgba(255, 107, 53, 0.7)',
                    'rgba(231, 76, 60, 0.7)'
                ],
                borderColor: [
                    'rgba(46, 204, 113, 1)',
                    'rgba(241, 196, 15, 1)',
                    'rgba(255, 107, 53, 1)',
                    'rgba(231, 76, 60, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b0b0b0'
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b0b0b0'
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#e0e0e0'
                    }
                }
            }
        }
    });

    // 性能监控图表
    const performanceCtx = document.getElementById('performanceChart').getContext('2d');
    const performanceChart = new Chart(performanceCtx, {
        type: 'line',
        data: {
            labels: ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'],
            datasets: [{
                label: 'API响应时间(ms)',
                data: [230, 245, 210, 195, 220, 260, 240],
                borderColor: '#4a6cf7',
                backgroundColor: 'rgba(74, 108, 247, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }, {
                label: '数据更新成功率(%)',
                data: [100, 100, 100, 100, 100, 100, 100],
                borderColor: '#4CAF50',
                backgroundColor: 'rgba(76, 175, 80, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                yAxisID: 'y1'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: '响应时间(ms)',
                        color: '#b0b0b0'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b0b0b0'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: '成功率(%)',
                        color: '#b0b0b0'
                    },
                    grid: {
                        drawOnChartArea: false,
                    },
                    ticks: {
                        color: '#b0b0b0'
                    },
                    min: 90,
                    max: 100
                },
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b0b0b0'
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#e0e0e0'
                    }
                }
            }
        }
    });

    // 时间范围选择事件
    document.getElementById('timeRange').addEventListener('change', function () {
        // 在实际应用中，这里会重新获取数据并更新图表
        alert('时间范围已更改为: ' + this.value + '天');
    });

    document.getElementById('statRange').addEventListener('change', function () {
        // 在实际应用中，这里会重新获取数据并更新图表
        alert('统计范围已更改为: ' + this.options[this.selectedIndex].text);
    });
});