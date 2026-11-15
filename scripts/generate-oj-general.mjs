import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

// Run this command after editing the fixtures. Pass --check to verify the published JSON.
const problems = [];
const words = input => input.trim().split(/\s+/);
const nums = input => words(input).map(Number);
const lines = input => input.split('\n');
const space = values => values.join(' ');
const rows = values => values.join('\n');
const repeated = (length, fn) => Array.from({ length }, (_, i) => fn(i));
const sum = values => values.reduce((total, value) => total + value, 0);
const order = (a, b) => a - b;
const arrayInput = values => `${values.length}\n${space(values)}`;
const leetcode = (number, slug) => ({ title: `力扣 ${number} · 同类拓展`, url: `https://leetcode.cn/problems/${slug}/` });
const luogu = number => ({ title: `洛谷 ${number} · 同类拓展`, url: `https://www.luogu.com.cn/problem/${number}` });

function add(id, track, difficulty, title, tags, description, input, output, sample, expected, tests, solve, source) {
    assert.equal(String(solve(sample)), expected, `样例 ${id}`);
    assert.equal(new Set([sample, ...tests]).size, tests.length + 1, `重复用例 ${id}`);
    const cases = tests.map(test => {
        const expectedOutput = String(solve(test));
        assert(!/\b(?:NaN|undefined|Infinity)\b/.test(expectedOutput), `无效答案 ${id}`);
        return { input: test, expected_output: expectedOutput };
    });
    assert(cases.length >= 3, `边界用例不足 ${id}`);
    problems.push({
        id, track, difficulty, title, tags, time_limit: '1500ms', memory_limit: '128MB', description,
        input_format: input, output_format: output, sample_input: sample, sample_output: expected,
        hidden_tests: cases, ...(source && { source }),
    });
}

function basics() {
    const track = 'basics';
    add(2001, track, '入门', '装箱补零', ['整除', '取模'],
        '工厂把零件装入容量相同的箱子。零件不拆分。求所需箱数，以及最后一个箱子剩下多少空位。恰好装满时空位为 0，没有零件时两个答案均为 0。',
        '一行两个整数 n、k，分别为零件数和箱容量。0 ≤ n ≤ 10^12，1 ≤ k ≤ 10^9。',
        '一行两个整数，依次为箱数和空位数。', '27 8', '4 5',
        ['0 7', '32 8', '1 1000000000', '999999999999 1000000000'],
        input => { const [n, k] = nums(input); const boxes = Math.ceil(n / k); return space([boxes, boxes * k - n]); });
    add(2002, track, '入门', '末班接驳车', ['整除', '分支'],
        '接驳车从第 s 分钟起每隔 d 分钟发一班，发车时刻不超过第 e 分钟。旅客在第 t 分钟抵达，可以赶上恰好在这一分钟出发的车。求他最早可以乘坐的班次时刻。',
        '一行四个整数 s、d、e、t。0 ≤ s ≤ e ≤ 10^9，1 ≤ d ≤ 10^9，0 ≤ t ≤ 10^9。',
        '输出发车分钟，已无班次时输出 -1。', '10 6 34 17', '22',
        ['10 6 34 34', '10 6 33 33', '8 12 40 0', '0 1 0 1'],
        input => { const [s, d, e, t] = nums(input); const next = s + d * Math.max(0, Math.ceil((t - s) / d)); return next <= e ? next : -1; });
    add(2003, track, '入门', '三角形分类器', ['分支', '勾股定理'],
        '用三根给定长度的木条组成三角形。无法组成面积大于零的三角形时判为无效，否则按最大内角分为锐角、直角、钝角。无需计算浮点角度。',
        '一行三个整数 a、b、c，长度均在 1 到 10^9 之间。',
        '输出 INVALID、ACUTE、RIGHT 或 OBTUSE。', '13 5 12', 'RIGHT',
        ['3 7 4', '1000000000 1000000000 1000000000', '2 3 4', '6 5 7'],
        input => {
            const [a,b,c] = words(input).map(BigInt).sort((x,y) => x < y ? -1 : x > y ? 1 : 0);
            if (a+b <= c) return 'INVALID';
            const delta = a*a+b*b-c*c;
            return delta === 0n ? 'RIGHT' : delta > 0n ? 'ACUTE' : 'OBTUSE';
        });
    add(2004, track, '入门', '连续正收益', ['循环', '连续段'],
        '按日期给出摊位的净收益。求最长一段连续净收益严格大于零的天数，以及最早达到该长度的起始日。',
        '第一行整数 n（1 ≤ n ≤ 100000）。第二行有 n 个整数，绝对值不超过 10^9。',
        '输出最长长度和起始日（从 1 计数）。无正收益时输出 0 0。', '8\n-2 1 7 0 3 3 0 4', '2 2',
        ['1\n0', '1\n5', '6\n0 1 1 -1 2 3', '5\n-3 0 5 8 1'],
        input => {
            const [, ...values] = nums(input);
            let best = 0, start = 0, run = 0;
            values.forEach((value, i) => {
                run = value > 0 ? run + 1 : 0;
                if (run > best) { best = run; start = i - run + 2; }
            });
            return space([best, start]);
        });
    add(2005, track, '简单', '批量电量告警', ['前缀累加', '阈值'],
        '电池初始电量为 b。每分钟末发生一次变化，负数代表耗电。找到第一次电量严格低于阈值 k 的分钟。初始电量也要检测。',
        '第一行 n、b、k，1 ≤ n ≤ 100000。第二行 n 个电量变化值。b、k 和每次变化值的绝对值均不超过 10^9。',
        '输出首次告警时刻，初始时刻为 0。始终不告警则输出 -1。', '4 8 5\n-2 -1 -1 8', '3',
        ['1 4 5\n100', '3 0 0\n0 1 -1', '3 1 0\n-1 -1 10', '4 1 0\n1000000000 1000000000 1000000000 1000000000'],
        input => {
            const [, initial, threshold, ...changes] = nums(input);
            let charge = initial;
            if (charge < threshold) return 0;
            return changes.findIndex(change => (charge += change) < threshold) + 1 || -1;
        });
    add(2006, track, '简单', '末尾零的数量', ['阶乘', '质因数'],
        '给定 n，只输出 n! 的十进制表示末尾有多少个零。定义 0! = 1。',
        '一行整数 n（0 ≤ n ≤ 10^12）。', '输出一个整数。', '30', '7',
        ['0', '4', '125', '1000000000000'],
        input => {
            let n = Number(input), result = 0;
            while (n >= 5) { n = Math.floor(n / 5); result += n; }
            return result;
        });
    add(2007, track, '入门', '阶梯运费', ['分支', '算术'],
        '寄件按整数千克计费。前 3 千克每千克 8 元，超过 3 至 10 千克的部分每千克 5 元，其余部分每千克 3 元。目的地在偏远区时，总价另加 12 元。',
        '一行两个整数 w 和 r。1 ≤ w ≤ 10^9，r 为 1 表示偏远，为 0 表示普通。',
        '输出运费金额。', '12 1', '77', ['1 0', '3 1', '10 0', '1000000000 1'],
        input => { const [w,r] = nums(input); return 8*Math.min(w,3)+5*Math.min(Math.max(w-3,0),7)+3*Math.max(w-10,0)+12*r; });
    add(2008, track, '简单', '循环岗哨重逢', ['最小公倍数', '循环'],
        '两盏巡逻灯都于第 0 秒闪烁，随后分别每 a 秒和每 b 秒闪一次。统计到第 t 秒为止，两灯同时闪烁了多少次，不计第 0 秒，计入第 t 秒。',
        '一行三个整数 a、b、t。1 ≤ a,b ≤ 10^6，0 ≤ t ≤ 10^15。',
        '输出同时闪烁次数。', '6 8 50', '2', ['1 1 0', '5 10 10', '999983 999979 1000000000000000', '10 20 19'],
        input => {
            const [a,b,t] = nums(input);
            let x = a, y = b;
            while (y) [x,y] = [y,x%y];
            return Math.floor(t / (a/x*b));
        });
}

function arrays() {
    const track = 'arrays';
    add(2009, track, '简单', '雨量区间合计', ['前缀和', '区间查询'],
        '气象站存了 n 天的整数降雨量。对每个查询，计算从第 l 天到第 r 天（含端点）的降雨总和。',
        '第一行 n、q（均在 1 到 50000 之间）。第二行 n 个整数，每个在 0 到 10^9 之间。其后 q 行，每行 l、r，1 ≤ l ≤ r ≤ n。',
        '每个查询的答案占一行。', '5 3\n2 0 8 1 4\n1 5\n2 3\n4 4', '15\n8\n1',
        ['1 2\n0\n1 1\n1 1', '4 2\n1000000000 1000000000 1000000000 1000000000\n1 4\n2 4',
            '6 3\n1 2 4 8 16 32\n6 6\n1 1\n2 5',
            `8000 3000\n${space(repeated(8000, i => i%97))}\n${rows(repeated(3000, i => `${i+1} ${8000-i}`))}`],
        input => {
            const [n,q,...values] = nums(input), prefix = [0];
            for (let i=0; i<n; i++) prefix.push(prefix[i]+values[i]);
            return rows(repeated(q, i => prefix[values[n+2*i+1]]-prefix[values[n+2*i]-1]));
        });
    add(2010, track, '中等', '净值为零的工作段', ['前缀和', '哈希计数'],
        '一天的收益可以为负数。统计有多少段连续、非空的日期，其总收益为 0。只要起止日不同，就分别计数。',
        '第一行 n（1 ≤ n ≤ 100000）。第二行 n 个整数，绝对值不超过 10^9。', '输出工作段数。',
        '6\n3 -3 2 -2 0 8', '6',
        ['1\n7', '4\n0 0 0 0', '6\n1000000000 1000000000 1000000000 -1000000000 -1000000000 -1000000000',
            arrayInput(repeated(70000, () => 0))],
        input => {
            const counts = new Map([[0,1]]);
            let prefix = 0, answer = 0;
            for (const value of nums(input).slice(1)) {
                prefix += value;
                const seen = counts.get(prefix) ?? 0;
                answer += seen;
                counts.set(prefix, seen+1);
            }
            return answer;
        }, leetcode(560, 'subarray-sum-equals-k'));
    add(2011, track, '简单', '两路传感器合流', ['双指针', '去重'],
        '两路传感器分别给出已经按时间非降序排列的事件序列。合并为一个按时间严格递增的序列，同一时刻只保留一次。',
        '第一行 n、m（各 1 至 100000）。第二行 n 个整数，第三行 m 个整数，绝对值不超过 10^9。两个序列均非降序。',
        '在一行用空格输出所有不同的时刻。', '4 3\n-3 2 2 7\n2 3 9', '-3 2 3 7 9',
        ['1 1\n6\n6', '2 2\n-2 -1\n2 3', '4 1\n1 1 1 1\n0', '3 4\n-1 5 12\n-100 -1 5 12'],
        input => space([...new Set(nums(input).slice(2))].sort(order)));
    add(2012, track, '中等', '打乱字母的窗口', ['滑动窗口', '字符频次'],
        '统计正文中有多少个连续片段，与给定关键词含有完全相同的字母和字母出现次数。不同起点的片段即使重叠也分别计数。',
        '两行非空小写英文字母串，第一行为正文 s，第二行为关键词 p。两串长度均不超过 100000。',
        '输出匹配片段的数量。', 'bbabaa\nabb', '2', ['ab\naba', 'aaaa\naa', 'abcxyz\nz', 'a'.repeat(30000)+'\n'+'a'.repeat(5000)],
        input => {
            const [s,p] = lines(input), counts = new Int32Array(26);
            let missing = p.length, answer = 0;
            for (const char of p) counts[char.charCodeAt(0)-97]++;
            for (let i=0; i<s.length; i++) {
                if (counts[s.charCodeAt(i)-97]-- > 0) missing--;
                if (i>=p.length && ++counts[s.charCodeAt(i-p.length)-97] > 0) missing++;
                if (!missing) answer++;
            }
            return answer;
        }, leetcode(438, 'find-all-anagrams-in-a-string'));
    add(2013, track, '简单', '矩阵的鞍点', ['二维数组', '最值'],
        '矩阵中同时等于所在行最小值和所在列最大值的位置叫鞍点。相同的数字可以出现在多个鞍点中。',
        '第一行 n、m（1 ≤ n,m ≤ 200）。接下来 n 行每行 m 个整数，绝对值不超过 10^9。',
        '输出鞍点数量。', '2 3\n5 4 6\n2 3 9', '1',
        ['1 1\n-5', '2 2\n1 2\n2 1', '2 3\n0 0 0\n0 0 0', '3 1\n-9\n-1\n-1'],
        input => {
            const [n,m,...values] = nums(input);
            const rowMin = repeated(n, i => Math.min(...values.slice(i*m, (i+1)*m)));
            const colMax = repeated(m, j => Math.max(...repeated(n, i => values[i*m+j])));
            return values.filter((x,i) => x === rowMin[Math.floor(i/m)] && x === colMax[i%m]).length;
        });
    add(2014, track, '简单', '会合位置旋转', ['字符串', '循环数组'],
        '显示屏有 n 个位置，依次记录一个字符。每次右旋可以将最后一个字符移至最前，其余字符向右挪一格。求把初始状态旋转成目标状态所需的最少次数。',
        '两行等长的非空小写英文串，每串长度不超过 50000。',
        '输出最少的右旋次数，无法达到时输出 -1。', 'bcabca\nabcabc', '1',
        ['aaa\naaa', 'asdf\nasdg', 'abcd\nbcda', 'ababa\nbaaba', 'a'.repeat(12000)+'z\nz'+'a'.repeat(12000)],
        input => {
            const [s,target] = lines(input);
            if (s === target) return 0;
            const rotation = (target+target).indexOf(s, 1);
            return rotation < 0 ? -1 : rotation;
        });
    add(2015, track, '中等', '每个位置被覆盖几次', ['差分', '区间操作'],
        '有一条含 n 个格子的走廊。每块长毯可以覆盖闭区间 [l,r] 中的全部格子。铺设完成后，统计恰好被 k 块长毯覆盖的格子数量。',
        '第一行 n、m、k，1 ≤ n ≤ 100000，0 ≤ k ≤ m ≤ 100000。随后 m 行每行 l、r，1 ≤ l ≤ r ≤ n。',
        '输出格子数量。', '8 3 2\n1 4\n3 6\n5 8', '4',
        ['1 0 0', '4 2 0\n1 1\n4 4', '4 3 3\n1 4\n1 4\n1 4',
            `8000 8000 8000\n${rows(repeated(8000, () => '1 8000'))}`],
        input => {
            const [n,m,k,...ranges] = nums(input), delta = new Int32Array(n+1);
            for (let i=0;i<m;i++) { delta[ranges[2*i]-1]++; delta[ranges[2*i+1]]--; }
            let cover = 0, answer = 0;
            for (let i=0;i<n;i++) if ((cover += delta[i]) === k) answer++;
            return answer;
        });
    add(2016, track, '中等', '环形货架的下一件', ['单调栈', '环形数组'],
        '货架按顺时针编号 1 到 n。对每件货物，沿顺时针找下一件重量严格更大的货物。回答到它所需的步数，绕一周都找不到则回答 0。',
        '第一行 n（1 ≤ n ≤ 100000）。第二行 n 个整数重量，重量在 1 到 10^9 之间。',
        '一行 n 个用空格分隔的答案。', '5\n3 3 1 4 2', '3 2 1 0 1',
        ['1\n9', '4\n8 8 8 8', '4\n9 1 2 3', '5\n5 4 3 2 1', arrayInput(repeated(16000, i => 16000-i))],
        input => {
            const [n,...weights] = nums(input), distances = new Int32Array(n), pending = [];
            for (let i=0;i<2*n;i++) {
                while (pending.length && weights[i%n] > weights[pending.at(-1)]) {
                    const previous = pending.pop();
                    distances[previous] = i-previous;
                }
                if (i<n) pending.push(i);
            }
            return space(distances);
        });
}

function structures() {
    const track = 'structures';
    const gcd = (a,b) => b === 0 ? a : gcd(b,a%b);
    add(2017, track, '简单', '分数账单相加', ['函数', '分数', '最大公约数'],
        '把两项以分数表示的账单相加。用一个包含分子和分母的记录表示结果，并约分。分母固定为正数，零用 0/1 表示。',
        '一行 a、b、c、d，分别表示 a/b 与 c/d。|a|、|c| ≤ 10^6，1 ≤ b,d ≤ 10^6。',
        '输出约分后的分子和分母，用一个空格分隔。', '1 6 -5 8', '-11 24',
        ['1 2 -3 6', '-3 2 -3 2', '1000000 999997 1000000 999983', '0 19 4 6'],
        input => {
            const [a,b,c,d] = nums(input), numerator = a*d+c*b, denominator = b*d;
            const divisor = gcd(Math.abs(numerator), denominator);
            return space([numerator/divisor,denominator/divisor]);
        });
    add(2018, track, '简单', '实验成绩加权排名', ['结构体', '多关键字'],
        '每位学生有实验、报告、答辩三项分数，权重分别为 4、3、3。找出加权总分最高的学生。并列时选实验分更高者，再并列时选编号更小者。',
        '第一行 n（1 ≤ n ≤ 10000）。接下来 n 行各有四个整数：唯一编号（1 至 10^9），以及三项 0 至 100 的整数分数。',
        '输出获胜编号和未除以 10 的加权总分。', '3\n14 70 90 80\n17 85 80 75\n2 85 75 80', '2 805',
        ['1\n999999999 0 0 0', '2\n9 90 80 70\n1 75 90 80', '3\n8 100 100 100\n1 99 100 100\n5 100 100 100'],
        input => {
            const candidates = lines(input).slice(1).map(line => {
                const [id,lab,report,defense] = nums(line);
                return { id,lab, score: 4*lab+3*report+3*defense };
            });
            const winner = candidates.sort((a,b) => b.score-a.score || b.lab-a.lab || a.id-b.id)[0];
            return space([winner.id,winner.score]);
        });
    add(2019, track, '简单', '合并图书条目', ['结构体', '字典'],
        '两批图书入库记录混在一起，每条记录含简短书号和册数。同书号的记录需要合并。按书号首次出现的顺序输出库存。',
        '第一行记录数 n（1 至 10000）。其后 n 行，每行一个长 1 至 12 的小写英文书号及正整数册数（至多 10^9）。',
        '每种书一行，输出书号和合计册数。', '4\ncat 3\nart 4\ncat 8\nmap 2', 'cat 11\nart 4\nmap 2',
        ['1\na 4', '3\nz 1\ny 2\nx 3', '4\nb 1000000000\nb 1000000000\na 1\nb 1000000000'],
        input => {
            const stock = new Map();
            for (const line of lines(input).slice(1)) {
                const [id,count] = words(line);
                stock.set(id, (stock.get(id) ?? 0)+Number(count));
            }
            return rows([...stock].map(space));
        });
    add(2020, track, '中等', '公告时段合并', ['区间', '结构体', '贪心'],
        '将多个公告有效时段合并。每个时段覆盖半开区间 [l,r)，允许把重叠或端点相接的时段合并。输出覆盖范围与原时段合在一起完全相同且数量最少的新时段。',
        '第一行 n（1 至 50000）。随后 n 行每行两个整数 l、r，−10^9 ≤ l < r ≤ 10^9。',
        '第一行是合并后的时段数量，其后按起点升序每行输出一个时段的 l、r。', '5\n7 9\n0 2\n2 4\n1 3\n8 10', '2\n0 4\n7 10',
        ['1\n-5 0', '3\n0 9\n0 1\n2 5', '4\n-2 0\n0 1\n1 7\n8 9', '3\n-9 -8\n-4 -3\n-2 -1'],
        input => {
            const intervals = lines(input).slice(1).map(nums).sort((a,b) => a[0]-b[0]);
            const result = [];
            for (const [left,right] of intervals) {
                const last = result.at(-1);
                if (last && left <= last[1]) last[1] = Math.max(last[1],right);
                else result.push([left,right]);
            }
            return rows([result.length,...result.map(space)]);
        });
    add(2021, track, '中等', '旋转后的左右判定', ['叉积', '点', '64 位整数'],
        '给定有向线段 A→B，判断点 C 位于直线的左侧、右侧还是直线上。横坐标向右、纵坐标向上。',
        '第一行 q（1 至 10000）。随后 q 行六个整数 ax、ay、bx、by、cx、cy，绝对值不超过 10^9，A 与 B 不重合。',
        '每行输出 LEFT、RIGHT 或 LINE。', '3\n0 0 4 0 3 1\n0 0 4 0 -1 -2\n0 0 4 0 8 0', 'LEFT\nRIGHT\nLINE',
        ['1\n0 0 1 1 0 0', '1\n0 0 1 -1 -3 3', '2\n-1000000000 -1000000000 1000000000 1000000000 999999999 1000000000\n0 1 0 -1 1 0',
            '1\n0 0 999999999 1000000000 999999998 999999999'],
        input => rows(lines(input).slice(1).map(line => {
            const [ax,ay,bx,by,cx,cy] = words(line).map(BigInt);
            const product = (bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
            return product > 0n ? 'LEFT' : product < 0n ? 'RIGHT' : 'LINE';
        })));
    add(2022, track, '简单', '时刻规范化', ['结构体', '负数取模'],
        '某个时刻由一小时数和一分钟数给出，两者可能超出通常范围。先换算为以当天午夜为零点的总分钟，再分解为天数偏移和一个 24 小时制时刻。例如倒退一分钟应落在前一天 23:59。',
        '一行两个整数 h、m，绝对值均不超过 10^9。', '输出天数偏移、小时（0 至 23）、分钟（0 至 59），各用空格分隔。',
        '1 -61', '-1 23 59', ['0 0', '49 121', '-24 0', '1000000000 -1000000000'],
        input => {
            const [h,m] = nums(input), total = 60*h+m, day = Math.floor(total/1440), minutes = total-day*1440;
            return space([day,Math.floor(minutes/60),minutes%60]);
        });
    add(2023, track, '简单', '两个矩形相交的面积', ['结构体', '矩形'],
        '画板上有两个与坐标轴平行的矩形，每个矩形由一对对角点描述。求它们共有部分的面积，只碰到边或顶点时算 0。',
        '两行，每行给一个矩形的 x1、y1、x2、y2，坐标是绝对值不超过 10^9 的整数。对角点顺序任意，允许退化为线段或点。',
        '输出相交面积。', '5 5 0 1\n2 0 7 3', '6',
        ['0 0 1 1\n1 1 5 5', '0 1 10 6\n1 2 5 5', '2 0 2 9\n0 1 7 4', '-1000000000 -1000000000 1000000000 1000000000\n1000000000 -1000000000 -1000000000 1000000000'],
        input => {
            const [a,b] = lines(input).map(line => words(line).map(BigInt));
            const min = (x,y) => x < y ? x : y;
            const max = (x,y) => x > y ? x : y;
            const overlap = i => max(0n,min(max(a[i],a[i+2]),max(b[i],b[i+2]))-max(min(a[i],a[i+2]),min(b[i],b[i+2])));
            return overlap(0)*overlap(1);
        });
    add(2024, track, '简单', '带符号的时区转换', ['结构体', '日期', '整数运算'],
        '两个城市相对 UTC 的偏移以分钟表示。把出发地当地钟面时间换成目的地钟面时间，并报告目的地相对出发地日期变化了几天。',
        '一行四个整数 h、m、a、b。0 ≤ h < 24，0 ≤ m < 60。a、b 是两个城市的 UTC 偏移，均在 −720 到 840 分钟之间。',
        '一行输出日期偏移、小时、分钟。', '23 40 480 600', '1 1 40',
        ['0 5 0 -60', '12 45 330 345', '23 59 -720 840', '17 20 480 480'],
        input => {
            const [h,m,a,b] = nums(input), clock = h*60+m+b-a;
            const day = Math.floor(clock/1440), within = clock-day*1440;
            return space([day,Math.floor(within/60),within%60]);
        });
}

function simulation() {
    const track = 'simulation';
    const decimal = input => words(input).map(BigInt);
    add(2025, track, '简单', '百位整数比较', ['大整数', '前导零'],
        '比较两个带可选正负号的十进制整数。位数可能超过机器整数范围。前导零不影响数值，正零和负零相等。',
        '两行，每行一个含 1 至 500 个十进制数字的整数，首字符允许是 + 或 -。',
        '按第一数相对于第二数的大小输出 <、= 或 >。', '-00067\n-000060', '<',
        ['-0\n+000', '0009\n+08', '5\n-50', '1'+'0'.repeat(499)+'\n'+'9'.repeat(499)],
        input => { const [a,b] = decimal(input); return a < b ? '<' : a > b ? '>' : '='; });
    add(2026, track, '简单', '跨日票据校验', ['模拟', '闰年', '日期'],
        '审核系统应把给出的合法公历日期推进一天，输出新日期。公历闰年的二月有 29 天，其余年份有 28 天。',
        '一行三个整数 y、m、d，是一个有效日期。1583 ≤ y ≤ 9998。',
        '输出 YYYY-MM-DD，月和日补足两位。', '2024 2 29', '2024-03-01',
        ['1900 2 28', '2000 2 28', '9998 12 31', '2025 4 30'],
        input => { const [y,m,d] = nums(input); return new Date(Date.UTC(y,m-1,d+1)).toISOString().slice(0,10); });
    add(2027, track, '中等', '任意长流水号的模', ['大整数', '逐位取模'],
        '流水号由十进制数字组成，可能有前导零。计算它除以正整数 m 的余数。',
        '第一行 1 至 20000 个十进制数字。第二行一个整数 m（1 至 10^9）。',
        '输出余数。', '000100000000000000000002\n7', '4',
        ['000000\n17', '1234567890\n1', '9'.repeat(20000)+'\n1000000000', '75\n16'],
        input => { const [number,modulus] = decimal(input); return number%modulus; });
    add(2028, track, '中等', '中央闸门排队', ['模拟', '队列'],
        '闸门一次检查一辆车，车辆按到达时刻排队，同一时刻按输入顺序。车辆可立即进入空闲闸门。每辆车用时为正，当前车辆结束时下一辆可以立即开始。求最后一辆结束时刻及所有车的总等待时间。',
        '第一行 n（1 至 50000）。随后 n 行每行整数 t、d（0 ≤ t ≤ 10^9，1 ≤ d ≤ 10^9）。输入中的 t 非降序。',
        '输出结束时刻和总等待时间。等待时间只计开始检查前的时间。', '4\n0 4\n1 2\n1 3\n10 1', '11 8',
        ['1\n1000000000 1000000000','3\n0 4\n4 2\n6 1','3\n1 1000000000\n1 1000000000\n1 1000000000'],
        input => {
            let finish = 0n, wait = 0n;
            for (const line of lines(input).slice(1)) {
                const [arrival,duration] = decimal(line);
                const start = arrival > finish ? arrival : finish;
                wait += start-arrival;
                finish = start+duration;
            }
            return space([finish,wait]);
        });
    add(2029, track, '简单', '货架双向巡检', ['模拟', '越界'],
        '机器人从货架第 1 格出发，每条指令让它尝试左移 L 或右移 R 一格。越界的指令被忽略。统计最终位置和一共忽略了多少条指令。',
        '第一行格子数 n（1 至 10^9）。第二行由 L、R 组成，长度在 1 至 100000 之间。',
        '输出最终位置和忽略指令数。', '3\nLRRRLLL', '1 3', ['1\nLRLR', '20\nRRR', '2\nLRLR', '1000000000\nRRRR'],
        input => {
            const [length,commands] = lines(input);
            let position = 1, ignored = 0;
            for (const c of commands) {
                const next = position+(c === 'R' ? 1 : -1);
                if (next < 1 || next > Number(length)) ignored++;
                else position = next;
            }
            return space([position,ignored]);
        });
    add(2030, track, '中等', '书签撤销栈', ['模拟', '栈', '撤销'],
        '初始没有书签。P a 在栈顶加入编号 a，U 撤销最近一次仍存在的添加操作（空栈时什么都不做），Q 查询栈顶编号。',
        '第一行操作数 q（1 至 50000）。随后 q 行每行一条操作，书签编号为 1 至 10^9。保证至少有一次 Q。',
        '每次查询输出一行编号，空栈时输出 EMPTY。', '7\nQ\nP 5\nP 8\nQ\nU\nU\nQ', 'EMPTY\n8\nEMPTY',
        ['1\nQ','4\nU\nU\nP 10\nQ','6\nP 7\nP 7\nU\nQ\nU\nQ'],
        input => {
            const stack = [], result = [];
            for (const line of lines(input).slice(1)) {
                const [command,id] = words(line);
                if (command === 'P') stack.push(id);
                if (command === 'U') stack.pop();
                if (command === 'Q') result.push(stack.at(-1) ?? 'EMPTY');
            }
            return rows(result);
        });
    add(2031, track, '中等', '任意长整数的进制牌', ['高精度', '进制转换'],
        '把一个非负十进制整数转写到指定进制，数值可能远超 64 位整数上限。新进制的数字 10 至 35 用 A 至 Z 表示。',
        '第一行 1 至 1000 个十进制数字，可以有前导零。第二行目标进制 b，2 ≤ b ≤ 36。',
        '输出转换结果，使用大写字母，不保留前导零。', '01023\n16', '3FF',
        ['0\n2', '35\n36', '36\n36', '1'+'0'.repeat(999)+'\n2'],
        input => { const [n,b] = decimal(input); return n.toString(Number(b)).toUpperCase(); });
    add(2032, track, '中等', '进位接力完成后', ['高精度', '逐位运算'],
        '将两个非负十进制整数按小学算法逐位相加。除计算结果外，还要统计从一个数位传递到更高数位的进位次数，最高位产生的新进位也计一次。',
        '两行，每行 1 至 1000 个十进制数字，可以有前导零。',
        '第一行输出和（不保留前导零），第二行输出进位次数。', '0958\n8046', '9004\n3',
        ['0\n000','999\n1','123\n34','9'.repeat(1000)+'\n1'],
        input => {
            const [a,b] = lines(input);
            const width = Math.max(a.length,b.length);
            const paddedA = a.padStart(width,'0'), paddedB = b.padStart(width,'0');
            let count = 0, carry = 0;
            for (let i=width-1; i>=0; i--) {
                carry = Number(Number(paddedA[i])+Number(paddedB[i])+carry >= 10);
                count += carry;
            }
            return rows([BigInt(a)+BigInt(b),count]);
        });
}

function sorting() {
    const track = 'sorting';
    add(2033, track, '简单', '同分保持签到顺序', ['稳定排序', '记录'],
        '按得分从高到低公布签到选手。同分选手的相对顺序保持为输入顺序。',
        '第一行 n（1 至 50000）。随后 n 行每行两个整数 id、score，id 是唯一正整数（不超过 10^9），得分绝对值不超过 10^9。',
        '在一行用空格输出排序后的编号。', '4\n90 10\n20 40\n10 40\n30 32', '20 10 30 90',
        ['1\n8 0','3\n9 -1\n1 -2\n7 1','4\n8 3\n6 3\n4 3\n2 3'],
        input => space(lines(input).slice(1).map(nums).sort((a,b) => b[1]-a[1]).map(row => row[0])));
    add(2034, track, '中等', '出库队列的逆序对', ['归并排序', '树状数组', '逆序对'],
        '货物按出库顺序给出优先级。对所有 i < j 的下标组合，统计前一个优先级严格大于后一个优先级的组合数。相同优先级不构成逆序。',
        '第一行 n（1 至 100000）。第二行 n 个整数，绝对值不超过 10^9。',
        '输出逆序对总数。', '5\n3 1 2 2 -1', '7',
        ['1\n0','4\n3 3 3 3','4\n-2 -1 0 1', arrayInput(repeated(100000, i => Number(i<50000))),
            arrayInput(repeated(3000, i => ((i*7717)%991)-495))],
        input => {
            const [, ...values] = nums(input);
            const ranks = new Map([...new Set(values)].sort(order).map((x,i) => [x,i+1]));
            const tree = new Int32Array(ranks.size+1);
            let inversions = 0;
            for (let i=values.length-1; i>=0; i--) {
                const rank = ranks.get(values[i]);
                for (let j=rank-1;j>0;j-=j&-j) inversions += tree[j];
                for (let j=rank;j<tree.length;j+=j&-j) tree[j]++;
            }
            return inversions;
        }, luogu('P3374'));
    add(2035, track, '简单', '直播榜的相邻差值', ['排序', '相邻元素'],
        '从所有观众数记录里挑两条不同记录，使两个观众数之差的绝对值最小。并列时选择较小观众数最小的那一组。',
        '第一行 n（2 至 100000）。第二行 n 个整数，每个在 0 至 10^9 之间。',
        '按升序输出选中的两个观众数，允许相等。', '6\n14 9 11 3 17 1', '1 3',
        ['2\n5 2','4\n9 9 8 8','5\n0 4 1 3 5','2\n1000000000 0'],
        input => {
            const values = nums(input).slice(1).sort(order);
            let index = 0;
            for (let i=1;i<values.length-1;i++) {
                if (values[i+1]-values[i] < values[index+1]-values[index]) index = i;
            }
            return space(values.slice(index,index+2));
        });
    add(2036, track, '中等', '路边牌子的密集区', ['排序', '滑动窗口'],
        '在一条无限长的笔直路上有多个路牌。选择一段长度为 d 的闭区间，尽量包含更多路牌（两端都计入）。同一位置可能有多个路牌。',
        '第一行 n、d，1 ≤ n ≤ 100000，0 ≤ d ≤ 2×10^9。第二行 n 个路牌坐标，均为绝对值不超过 10^9 的整数。',
        '输出一个区间最多可以包含多少路牌。', '6 3\n8 2 5 5 1 11', '3',
        ['1 0\n0','5 0\n3 1 3 1 1','2 2000000000\n-1000000000 1000000000', '5 4\n6 0 5 10 9'],
        input => {
            const [,distance,...values] = nums(input);
            values.sort(order);
            let left = 0, best = 0;
            for (let right=0;right<values.length;right++) {
                while (values[right]-values[left] > distance) left++;
                best = Math.max(best,right-left+1);
            }
            return best;
        });
    add(2037, track, '中等', '最少需要几个教室', ['扫描线', '排序', '半开区间'],
        '每节课需要独占一个教室，其上课时间覆盖 [s,e)。刚结束的教室同一时刻可交给下一节课。求能同时安排所有课程的最少教室数。',
        '第一行 n（1 至 100000）。随后 n 行每行两个整数 s、e，0 ≤ s < e ≤ 10^9。',
        '输出最少教室数。', '4\n0 5\n3 7\n5 9\n4 6', '3',
        ['1\n0 1','3\n0 2\n2 4\n4 6','3\n1 4\n1 4\n1 4','4\n1 2\n7 10\n2 8\n1 10'],
        input => {
            const events = lines(input).slice(1).flatMap(line => {
                const [start,end] = nums(line);
                return [[start,1],[end,-1]];
            });
            events.sort((a,b) => a[0]-b[0] || a[1]-b[1]);
            let active = 0, best = 0;
            for (const [,delta] of events) best = Math.max(best,active+=delta);
            return best;
        });
    add(2038, track, '中等', '字典中有多少张票', ['排序', '二分查找'],
        '给定一批票据的整数编号，允许重复。对每个查询 [l,r]，统计编号落在闭区间内的票据张数。',
        '第一行 n、q（均为 1 至 100000）。第二行 n 个编号。随后 q 行每行一对整数 l ≤ r。所有编号及查询端点的绝对值均不超过 10^9。',
        '每个查询输出一行张数。', '5 3\n7 5 1 5 9\n5 7\n2 4\n1 9', '3\n0\n5',
        ['1 2\n-1\n-1 -1\n0 1000000000','3 2\n2 2 2\n-7 1\n2 2','3 2\n0 -1000000000 1000000000\n-1000000000 -1\n1 1000000000',
            `12000 3000\n${space(repeated(12000,i => (i*12345)%9877))}\n${rows(repeated(3000,i => `${i} ${i+1500}`))}`],
        input => {
            const [n,q,...values] = nums(input);
            const tickets = values.slice(0,n).sort(order);
            return rows(repeated(q,i => lowerBound(tickets,values[n+2*i+1]+1)-lowerBound(tickets,values[n+2*i])));
        });
    add(2039, track, '简单', '压缩楼层号', ['离散化', '排序'],
        '将所有出现过的楼层按楼层号从小到大重新编号为 1、2、3、……。相同楼层的新编号必须相同。保持输入顺序输出新编号。',
        '第一行 n（1 至 100000）。第二行 n 个整数楼层号，绝对值不超过 10^9。',
        '在一行用空格输出 n 个新编号。', '5\n80 -1 80 6 -1', '3 1 3 2 1',
        ['1\n999','4\n0 0 0 0','4\n100 -100 -50 200','5\n1000000000 0 -1000000000 1 0'],
        input => {
            const values = nums(input).slice(1);
            const sorted = [...new Set(values)].sort(order);
            const ranks = new Map(sorted.map((value,i) => [value,i+1]));
            return space(values.map(value => ranks.get(value)));
        });
    add(2040, track, '中等', '容量固定的快递班次', ['排序', '双指针', '贪心'],
        '一辆车每班最多运两个箱子，两个箱子合计重量不得超过容量。每个箱子都可以单独运走，求运完所有箱子的最少班次。',
        '第一行 n、w（1 ≤ n ≤ 100000，1 ≤ w ≤ 10^9）。第二行 n 个整数重量，每个在 1 到 w 之间。',
        '输出最少班次。', '5 10\n3 8 2 7 6', '3',
        ['1 4\n4','4 5\n5 5 5 5','4 6\n3 3 3 3','5 8\n5 2 5 2 7'],
        input => {
            const [n,limit,...weights] = nums(input);
            weights.sort(order);
            let first = 0, last = n-1, trips = 0;
            while (first <= last) {
                if (first < last && weights[first]+weights[last] <= limit) first++;
                last--;
                trips++;
            }
            return trips;
        });
}

function lowerBound(values, target) {
    let low = 0, high = values.length;
    while (low < high) {
        const middle = Math.floor((low+high)/2);
        if (values[middle] < target) low = middle+1;
        else high = middle;
    }
    return low;
}

function search() {
    const track = 'search';
    add(2041, track, '中等', '含禁选组合的实验计划', ['状态枚举', '位运算'],
        '实验课有 n 个项目，每个项目带来一定收益。一些项目不能一起选。要求恰好选 k 个项目，使总收益最大。',
        '第一行 n、k、m（1 ≤ n ≤ 15，0 ≤ k ≤ n，0 ≤ m ≤ n(n−1)/2）。第二行 n 个整数收益（绝对值不超过 10^6）。随后 m 行每行两个不同的编号，表示不能同时选择，编号为 1 至 n。',
        '输出最大总收益，无合法计划时输出 IMPOSSIBLE。', '4 2 2\n8 7 -2 3\n1 2\n1 4', '10',
        ['1 0 0\n-5','2 2 1\n-1 -2\n1 2','3 2 0\n-5 -2 -3',
            `15 7 0\n${space(repeated(15,i => i-9))}`],
        input => {
            const [n,k,m,...values] = nums(input), conflicts = [];
            for (let i=0;i<m;i++) conflicts.push((1<<(values[n+2*i]-1))|(1<<(values[n+2*i+1]-1)));
            let best = -Infinity;
            for (let mask=0;mask<1<<n;mask++) {
                let count = 0, profit = 0;
                for (let i=0;i<n;i++) if (mask&(1<<i)) { count++; profit += values[i]; }
                if (count === k && conflicts.every(pair => (mask&pair) !== pair)) best = Math.max(best,profit);
            }
            return best === -Infinity ? 'IMPOSSIBLE' : best;
        });
    add(2042, track, '中等', '均衡分队', ['回溯', '子集枚举'],
        '将所有选手分成两组，允许其中一组为空。两组能力值分别求和。求两个和的最小绝对差。',
        '第一行 n（1 至 18）。第二行 n 个正整数能力值，每个不超过 10^9。',
        '输出最小绝对差。', '5\n3 7 8 10 17', '3',
        ['1\n6','3\n10 10 20','5\n1000000000 1000000000 1000000000 1000000000 5', arrayInput(repeated(18,i => (i*13)%113+1))],
        input => {
            const [, ...values] = nums(input);
            const total = sum(values);
            let best = total;
            function visit(i,subset) {
                if (i === values.length) { best = Math.min(best,Math.abs(total-2*subset)); return; }
                visit(i+1,subset);
                visit(i+1,subset+values[i]);
            }
            visit(0,0);
            return best;
        });
    add(2043, track, '中等', '带跳板的轨道', ['广度优先搜索', '状态图'],
        '轨道位置从 0 到 U 编号。每一步可以向左一格、向右一格，或跳到当前位置的两倍；落点必须在轨道内。求从 s 到 t 的最少步数。',
        '一行 U、s、t，1 ≤ U ≤ 100000，0 ≤ s,t ≤ U。', '输出最少步数。', '20 3 10', '3',
        ['1 0 0','10 7 3','12 0 12','99999 1 99999'],
        input => {
            const [limit,start,target] = nums(input);
            const distance = new Int32Array(limit+1).fill(-1), queue = [start];
            distance[start] = 0;
            for (let i=0;i<queue.length;i++) {
                const u = queue[i];
                if (u === target) return distance[u];
                for (const v of [u-1,u+1,2*u]) {
                    if (v>=0 && v<=limit && distance[v]===-1) { distance[v] = distance[u]+1; queue.push(v); }
                }
            }
        });
    add(2044, track, '困难', '只带一把钥匙的迷宫', ['广度优先搜索', '状态压缩'],
        '找到起点 S 到出口 E 的最少步数。可每次向上下左右移动一格，# 不可通过。第一次踏上 K 时永久取得钥匙，此后才能进入门 D。',
        '第一行 n、m（1 ≤ n,m ≤ 200）。随后 n 行，每行 m 个字符，取自 # . S E K D。S 和 E 各一个，K 至多一个，D 可以有多个。',
        '输出最少步数，不能到达时输出 -1。', '3 5\nS.D.E\n.#.##\nK....', '8',
        ['1 2\nSE','1 3\nSDE','3 3\nS#E\n.#.\nKDD','3 3\nS..\n##D\nKE.'],
        input => {
            const grid = lines(input).slice(1);
            const n = grid.length, m = grid[0].length;
            const r = grid.findIndex(line => line.includes('S')), c = grid[r].indexOf('S');
            const queue = [[r,c,0,0]], seen = new Set([(r*m+c)*2]);
            for (let i=0;i<queue.length;i++) {
                const [x,y,key,steps] = queue[i];
                if (grid[x][y] === 'E') return steps;
                for (const [dx,dy] of [[-1,0],[0,-1],[1,0],[0,1]]) {
                    const a = x+dx, b = y+dy, cell = grid[a]?.[b];
                    if (!cell || cell === '#' || (cell === 'D' && !key)) continue;
                    const nextKey = key || Number(cell === 'K'), state = (a*m+b)*2+nextKey;
                    if (!seen.has(state)) { seen.add(state); queue.push([a,b,nextKey,steps+1]); }
                }
            }
            return -1;
        });
    add(2045, track, '中等', '互不相邻的展位', ['组合枚举', '回溯'],
        '一排展位从 1 至 n 编号，选恰好 k 个来展示。相邻的两个展位不能同时选。计算选择方案数。',
        '一行 n、k，1 ≤ n ≤ 30，0 ≤ k ≤ n。', '输出方案数。', '6 3', '4',
        ['1 0','1 1','5 4','30 8'],
        input => {
            const [n,k] = nums(input);
            const counts = repeated(n+2,() => new Int32Array(k+1));
            counts.forEach(row => { row[0] = 1; });
            for (let length=1;length<=n;length++) {
                for (let take=1;take<=k;take++) counts[length+1][take] = counts[length][take]+counts[length-1][take-1];
            }
            return counts[n+1][k];
        });
    add(2046, track, '中等', '让货物按时出发', ['答案二分', '贪心'],
        '按输入顺序装运货物，不得拆分或调换顺序。每天可运一段连续货物，总重量不得超过容量 C。求在至多 d 天内运完所需的最小 C。',
        '第一行 n、d，1 ≤ d ≤ n ≤ 50000。第二行 n 个整数重量（1 至 10^9）。', '输出最小 C。', '6 3\n4 2 7 1 3 5', '8',
        ['1 1\n1','4 1\n1000000000 1000000000 1000000000 1000000000','5 5\n5 9 1 2 8',
            `12000 4\n${space(repeated(12000,() => 1000000000))}`],
        input => {
            const [,days,...weights] = nums(input);
            let low = Math.max(...weights), high = sum(weights);
            while (low<high) {
                const capacity = Math.floor((low+high)/2);
                let used = 1, load = 0;
                for (const weight of weights) {
                    if (load+weight > capacity) { used++; load = 0; }
                    load += weight;
                }
                if (used <= days) high = capacity;
                else low = capacity+1;
            }
            return low;
        });
    add(2047, track, '中等', '枚举三人接力队', ['枚举', '计数'],
        '给出每位选手的速度分。选择三个不同选手，速度分之和为 t。队内没有顺序，求不同队伍数量。',
        '第一行 n、t，3 ≤ n ≤ 2500，|t| ≤ 3×10^9。第二行 n 个整数速度分，绝对值不超过 10^9。',
        '输出队伍数量。', '6 8\n1 2 2 3 4 5', '4',
        ['3 0\n-1 0 1','5 15\n5 5 5 5 5','3 100\n0 0 0', `2500 0\n${space(repeated(2500,() => 0))}`],
        input => {
            const [,target,...values] = nums(input);
            const frequencies = new Map();
            let count = 0;
            for (let middle=1;middle<values.length-1;middle++) {
                const left = values[middle-1];
                frequencies.set(left, (frequencies.get(left) ?? 0)+1);
                for (let right=middle+1;right<values.length;right++) {
                    count += frequencies.get(target-values[middle]-values[right]) ?? 0;
                }
            }
            return count;
        });
    add(2048, track, '中等', '方阵词牌', ['回溯', '深度优先搜索'],
        '给定字符方阵和关键词。路径可以从任意格开始，每步上下左右走一格，同一格不能重复走。判断是否有一条路径能按顺序拼出关键词。',
        '第一行 n（1 至 7），接下来 n 行各 n 个小写字母，最后一行是关键词（1 至 12 个小写字母）。',
        '存在时输出 YES，否则输出 NO。', '3\nabx\nxcd\nxxe\nabcde', 'YES',
        ['1\na\naa','1\nb\nb','2\nab\ncd\nad','3\naba\naaa\nabz\naaaaaab'],
        input => {
            const [, ...data] = lines(input), keyword = data.pop(), visited = new Set(), n = data.length;
            function trace(r,c,i) {
                if (data[r]?.[c] !== keyword[i] || visited.has(r*n+c)) return false;
                if (i+1 === keyword.length) return true;
                visited.add(r*n+c);
                const found = [[-1,0],[0,-1],[1,0],[0,1]].some(([dr,dc]) => trace(r+dr,c+dc,i+1));
                visited.delete(r*n+c);
                return found;
            }
            return data.some((row,r) => [...row].some((_,c) => trace(r,c,0))) ? 'YES' : 'NO';
        });
}

function dataStructures() {
    const track = 'data-structures';
    add(2049, track, '简单', '工单两端进出', ['双端队列', '模拟'],
        '工单存放在一个空队列中。LF x、RT x 分别在左端、右端插入编号 x。PL、PR 分别取出并报告左端、右端编号。空队列的取出操作不会改变状态。',
        '第一行 q（1 至 100000）。随后 q 行每行一条操作，工单编号是 1 至 10^9 的整数。保证有取出操作。',
        '每次取出输出一行编号，空时输出 EMPTY。', '6\nLF 4\nRT 9\nLF 7\nPR\nPL\nPR', '9\n7\n4',
        ['1\nPR','4\nPL\nRT 3\nPR\nPR','5\nRT 3\nRT 3\nPR\nPL\nPR'],
        input => {
            const jobs = new Map(), result = [];
            let left = 0, right = 0;
            for (const line of lines(input).slice(1)) {
                const [command,id] = words(line);
                if (command === 'LF') jobs.set(--left,id);
                else if (command === 'RT') jobs.set(right++,id);
                else if (left === right) result.push('EMPTY');
                else {
                    const index = command === 'PL' ? left++ : --right;
                    result.push(jobs.get(index));
                    jobs.delete(index);
                }
            }
            return rows(result);
        });
    add(2050, track, '中等', '连通站点的规模', ['并查集', '连通分量'],
        '起初每个站点各自独立。L x y 将两个站点之间接通，可重复接线。S x 查询能从站点 x 到达的站点数量，包含 x 自己。',
        '第一行 n、q（1 ≤ n,q ≤ 100000）。随后 q 行每行 L x y 或 S x，站号为 1 至 n。保证有查询。',
        '每次查询输出一行规模。', '5 6\nS 1\nL 1 2\nL 3 4\nL 2 4\nS 3\nS 5', '1\n4\n1',
        ['1 3\nL 1 1\nS 1\nS 1','3 4\nL 1 2\nL 1 2\nS 2\nS 3','4 4\nL 3 4\nL 4 2\nL 1 2\nS 1',
            `12000 12000\n${rows(repeated(11999,i => `L ${i+2} ${i+1}`))}\nS 1`],
        input => {
            const [[n],...operations] = lines(input).map(words);
            const forest = components(Number(n)), result = [];
            for (const [command,x,y] of operations) {
                if (command === 'L') forest.join(Number(x),Number(y));
                else result.push(forest.size[forest.root(Number(x))]);
            }
            return rows(result);
        }, luogu('P3367'));
    add(2051, track, '中等', '滑动窗口最低报价', ['单调队列', '滑动窗口'],
        '每天有一个整数报价。对每段连续 k 天，输出这段内的最低报价。',
        '第一行 n、k，1 ≤ k ≤ n ≤ 100000。第二行 n 个整数报价，绝对值不超过 10^9。',
        '从第一段开始，用空格分隔输出 n−k+1 个最低报价。', '7 3\n9 4 4 5 1 7 2', '4 4 1 1 1',
        ['1 1\n9','6 1\n0 -1 2 5 7 0','4 4\n8 -5 0 -5',
            `25000 10000\n${space(repeated(25000,i => i-13000))}`],
        input => {
            const [,k,...values] = nums(input), queue = [], result = [];
            let head = 0;
            for (let i=0;i<values.length;i++) {
                if (queue[head] <= i-k) head++;
                while (queue.length > head && values[queue.at(-1)] >= values[i]) queue.pop();
                queue.push(i);
                if (i+1 >= k) result.push(values[queue[head]]);
            }
            return space(result);
        });
    add(2052, track, '中等', '实时订单金额区间', ['树状数组', '单点更新', '区间和'],
        '每笔订单有一个当前金额。SET i x 将第 i 笔金额改为 x，SUM l r 查询闭区间内订单金额之和。修改可增可减。',
        '第一行 n、q（1 ≤ n,q ≤ 100000）。第二行 n 个初始金额。随后 q 行是 SET i x 或 SUM l r，位置均从 1 开始且 l ≤ r。金额整数在 0 至 10^9 之间。至少有一次 SUM。',
        '每次 SUM 输出一行查询结果。', '4 4\n1 5 3 4\nSUM 2 4\nSET 3 10\nSET 4 0\nSUM 1 4', '12\n16',
        ['1 3\n0\nSUM 1 1\nSET 1 8\nSUM 1 1','3 1\n1000000000 1000000000 1000000000\nSUM 1 3',
            '4 4\n8 1 2 7\nSET 1 8\nSUM 1 1\nSET 4 0\nSUM 4 4',
            `10000 2000\n${space(repeated(10000,() => 0))}\n${rows(repeated(2000,i => i%2 ? 'SUM 1 10000' : `SET ${i+1} 1000000000`))}`],
        input => {
            const [header,initial,...actions] = lines(input), [n] = nums(header);
            const current = nums(initial), tree = new Float64Array(n+1), result = [];
            function add(index,delta) {
                for (let i=index;i<=n;i+=i&-i) tree[i] += delta;
            }
            function prefix(index) {
                let result = 0;
                for (let i=index;i>0;i-=i&-i) result += tree[i];
                return result;
            }
            current.forEach((amount,i) => add(i+1,amount));
            for (const line of actions) {
                const [cmd,x,y] = words(line), a = Number(x), b = Number(y);
                if (cmd === 'SET') { add(a,b-current[a-1]); current[a-1] = b; }
                else result.push(prefix(b)-prefix(a-1));
            }
            return rows(result);
        }, luogu('P3374'));
    add(2053, track, '困难', '维修任务的优先队列', ['堆', '优先队列', '稳定性'],
        '调度器收到 ADD id priority 时加入任务。RUN 取走优先级最高的任务。同优先级时先执行较早加入的任务。任务被取走后不会再次加入。',
        '第一行 q（1 至 100000）。随后 q 行是 ADD id priority 或 RUN。id 为唯一的 1 至 10^9 的整数，优先级为绝对值不超过 10^9 的整数。至少有一次 RUN。',
        '每次 RUN 输出任务编号，没有任务则输出 EMPTY。', '6\nADD 5 7\nADD 2 7\nADD 8 9\nRUN\nRUN\nRUN', '8\n5\n2',
        ['1\nRUN','4\nADD 99 -8\nRUN\nADD 2 100\nRUN','6\nADD 8 0\nADD 3 1\nRUN\nADD 6 0\nRUN\nRUN',
            `10000\n${rows(repeated(5000,i => `ADD ${i+1} ${i%17}`))}\n${rows(repeated(5000,() => 'RUN'))}`],
        input => {
            const queue = heap((a,b) => b.priority-a.priority || a.index-b.index);
            const result = [];
            lines(input).slice(1).forEach((line,index) => {
                const [op,id,value] = words(line);
                if (op === 'ADD') queue.add({id,priority:Number(value),index});
                else result.push(queue.remove()?.id ?? 'EMPTY');
            });
            return rows(result);
        });
    add(2054, track, '中等', '命令前缀索引', ['字典树', '二分查找'],
        '给出一批已经注册的命令名和若干前缀。对每个前缀，统计有多少条命令以它开头。相同命令名可以注册多次，每次单独计入。',
        '第一行 n、q（1 ≤ n,q ≤ 50000）。随后 n 行每行一个命令名，再 q 行每行一个前缀。所有串由 1 至 20 个小写英文字母组成。',
        '每个前缀输出一行统计结果。', '5 4\nmap\nmake\nmath\nmap\nmove\nma\nmap\nm\nmozz', '4\n2\n5\n0',
        ['1 2\nx\ny\nx','2 3\na\nab\na\nab\nabc','3 4\nz\nza\nzz\nz\nzz\nzzy\nzza'],
        input => {
            const [header,...data] = lines(input), [n] = nums(header);
            const dictionary = data.slice(0,n).sort();
            function firstAtLeast(target) {
                let low = 0, high = dictionary.length;
                while (low < high) {
                    const mid = Math.floor((low+high)/2);
                    if (dictionary[mid] < target) low = mid+1;
                    else high = mid;
                }
                return low;
            }
            return rows(data.slice(n).map(prefix => firstAtLeast(prefix+'{')-firstAtLeast(prefix)));
        });
    add(2055, track, '中等', '可回退的最小报价', ['栈', '维护最小值'],
        '每次输入 PUSH x 时登记一个报价，POP 撤销当前最新的一笔有效报价（如果没有，则忽略），MIN 查询所有仍有效报价中的最小值。',
        '第一行 q（1 至 100000）。随后 q 行给出 PUSH x、POP 或 MIN。x 是绝对值不超过 10^9 的整数。至少有一次 MIN。',
        '每次 MIN 输出一行最小值，空时输出 EMPTY。', '7\nPUSH 8\nPUSH 2\nPUSH 5\nMIN\nPOP\nPOP\nMIN', '2\n8',
        ['1\nMIN','5\nPUSH -4\nPUSH -4\nPOP\nMIN\nPOP','5\nPOP\nMIN\nPUSH 0\nPUSH 1\nMIN'],
        input => {
            const stack = [], result = [];
            for (const line of lines(input).slice(1)) {
                const [cmd,value] = words(line);
                if (cmd === 'PUSH') stack.push(Math.min(Number(value),stack.at(-1) ?? Infinity));
                if (cmd === 'POP') stack.pop();
                if (cmd === 'MIN') result.push(stack.at(-1) ?? 'EMPTY');
            }
            return rows(result);
        });
    add(2056, track, '中等', '括号日志的最大嵌套', ['栈', '括号匹配'],
        '日志由三种括号和字母组成。括号必须成对闭合且正确嵌套，字母无需处理。判断日志是否合法。合法时给出最大括号嵌套深度。',
        '一行字符串，长度 1 至 100000。字符为小写英文字母和 ()[]{}。',
        '不合法时输出 INVALID，合法时输出最大深度。', 'a{b(c)[d(e)]}f', '3',
        ['x','([)]','(abc','abc))','('.repeat(20000)+'x'+')'.repeat(20000)],
        input => {
            const stack = [], matching = {')':'(',']':'[','}':'{'};
            let depth = 0;
            for (const char of input) {
                if ('([{'.includes(char)) { stack.push(char); depth = Math.max(depth,stack.length); }
                else if (matching[char] && stack.pop() !== matching[char]) return 'INVALID';
            }
            return stack.length ? 'INVALID' : depth;
        });
}

function components(n) {
    const parent = repeated(n+1,i => i), size = new Int32Array(n+1).fill(1);
    function root(node) {
        while (node !== parent[node]) {
            parent[node] = parent[parent[node]];
            node = parent[node];
        }
        return node;
    }
    function join(a,b) {
        a = root(a);
        b = root(b);
        if (a === b) return false;
        if (size[a] < size[b]) [a,b] = [b,a];
        size[a] += size[b];
        parent[b] = a;
        return true;
    }
    return {root,join,size};
}

function heap(compare) {
    const items = [];
    function add(item) {
        let index = items.length;
        items.push(item);
        while (index > 0) {
            const parent = Math.floor((index-1)/2);
            if (compare(items[parent],item) <= 0) break;
            items[index] = items[parent];
            index = parent;
        }
        items[index] = item;
    }
    function remove() {
        if (!items.length) return undefined;
        const first = items[0], last = items.pop();
        if (!items.length) return first;
        let index = 0;
        while (2*index+1 < items.length) {
            const left = 2*index+1, right = left+1;
            const child = right < items.length && compare(items[right],items[left]) < 0 ? right : left;
            if (compare(last,items[child]) <= 0) break;
            items[index] = items[child];
            index = child;
        }
        items[index] = last;
        return first;
    }
    return {add,remove,get length() { return items.length; }};
}

function graphProblems() {
    const track = 'graphs';
    const graph = (n,edges,directed = false) => {
        const neighbors = repeated(n+1,() => []);
        for (const [u,v,w] of edges) {
            neighbors[u].push([v,w]);
            if (!directed) neighbors[v].push([u,w]);
        }
        return neighbors;
    };
    const readGraph = input => {
        const [header,...edges] = lines(input);
        return [nums(header),edges.map(nums)];
    };
    add(2057, track, '简单', '一共有几个通信网', ['图', '连通分量'],
        '每条线路双向连接两座基站。求有几个彼此独立的通信网，孤立的基站单独构成一个网。',
        '首行 n、m（1 ≤ n ≤ 50000，0 ≤ m ≤ 100000）。随后 m 行为两个站号，站号从 1 至 n。允许重复线路和自环。',
        '输出通信网数量。', '6 4\n1 2\n2 3\n3 1\n4 5', '3', ['1 0','5 0','3 5\n1 1\n1 2\n1 2\n2 3\n3 3'],
        input => {
            const [[n],edges] = readGraph(input), forest = components(n);
            return n - edges.filter(([u,v]) => forest.join(u,v)).length;
        });
    add(2058, track, '中等', '有向线路的转乘次数', ['图', '广度优先搜索'],
        '线路只能按箭头方向走，每段用时相同。求从起点到终点经过的最少线路数，并统计共有多少个基站可以从起点到达（计入起点）。',
        '首行 n、m、s、t（1 ≤ n ≤ 50000，0 ≤ m ≤ 100000，1 ≤ s,t ≤ n）。随后 m 行分别给出线路起点和终点。',
        '输出最少线路数和可达基站数。无法到达终点时线路数输出 -1。',
        '5 5 2 4\n1 2\n2 3\n2 5\n3 4\n5 3', '2 4', ['1 0 1 1','2 1 1 2\n2 1','4 4 1 4\n1 2\n2 1\n2 3\n3 4'],
        input => {
            const [[n,,s,t],edges] = readGraph(input), neighbors = graph(n,edges,true);
            const distance = new Int32Array(n+1).fill(-1), queue = [s];
            distance[s] = 0;
            for (let i=0;i<queue.length;i++) {
                for (const [v] of neighbors[queue[i]]) if (distance[v] === -1) {
                    distance[v] = distance[queue[i]]+1;
                    queue.push(v);
                }
            }
            return space([distance[t],queue.length]);
        });
    add(2059, track, '中等', '准时抵达过夜站', ['最短路', 'Dijkstra', '堆'],
        '货车沿有向道路行驶，道路权值为非负用时。从出发站 s 到目的地 t，求最少用时。',
        '首行 n、m、s、t（1 ≤ n ≤ 50000，0 ≤ m ≤ 100000，1 ≤ s,t ≤ n）。随后 m 行为 u、v、w，表示 u 到 v 的道路，用时 0 ≤ w ≤ 10^9。',
        '输出最少用时，不可达时输出 -1。', '4 5 1 4\n1 2 12\n1 3 1\n3 2 0\n2 4 2\n3 4 8', '3',
        ['1 0 1 1','3 2 2 1\n1 2 9\n1 3 8','4 3 1 4\n1 2 1000000000\n2 3 1000000000\n3 4 1000000000',
            `12000 11999 1 12000\n${rows(repeated(11999,i => `${i+1} ${i+2} 3`))}`],
        input => {
            const [[n,,s,t],edges] = readGraph(input), neighbors = graph(n,edges,true);
            const distance = new Float64Array(n+1).fill(Infinity), queue = heap((a,b) => a[0]-b[0]);
            distance[s] = 0;
            queue.add([0,s]);
            while (queue.length) {
                const [cost,u] = queue.remove();
                if (cost !== distance[u]) continue;
                if (u === t) return cost;
                for (const [v,w] of neighbors[u]) if (cost+w < distance[v]) {
                    distance[v] = cost+w;
                    queue.add([distance[v],v]);
                }
            }
            return -1;
        }, luogu('P4779'));
    add(2060, track, '中等', '修通各村的道路', ['最小生成树', 'Kruskal', '并查集'],
        '乡镇准备在候选双向公路中开通部分，使所有村庄相互可达。求最小总费用。',
        '首行 n、m（1 ≤ n ≤ 50000，0 ≤ m ≤ 100000）。随后 m 行给出 u、v、w。村庄编号 1 至 n，费用 w 在 0 至 10^9 之间，允许重边和自环。',
        '输出最小费用，无法联通时输出 -1。', '4 5\n1 2 5\n1 3 1\n2 3 2\n2 4 3\n3 4 6', '6',
        ['1 0','4 2\n1 2 5\n3 4 5','3 4\n1 1 0\n1 2 1000000000\n2 3 1000000000\n2 3 999999999'],
        input => {
            const [[n],edges] = readGraph(input), forest = components(n);
            let count = 0, cost = 0;
            for (const [u,v,w] of edges.sort((a,b) => a[2]-b[2])) if (forest.join(u,v)) { count++; cost += w; }
            return count === n-1 ? cost : -1;
        }, luogu('P3366'));
    add(2061, track, '中等', '依赖顺序编号优先', ['拓扑排序', '堆', '有向图'],
        '工作有前置依赖。每一步从前置工作都已完成的工作中选编号最小的一项。求完整执行序列，若无法完成全部则报告环。',
        '首行 n、m（1 ≤ n ≤ 50000，0 ≤ m ≤ 100000）。随后 m 行 u、v 表示必须先完成 u 后完成 v，编号为 1 至 n。',
        '输出空格分隔的执行序列，无法完成则只输出 CYCLE。', '5 3\n4 2\n1 3\n3 2', '1 3 4 2 5',
        ['1 1\n1 1','3 0','4 3\n1 2\n2 3\n3 2','3 3\n1 2\n1 2\n2 3'],
        input => {
            const [[n],edges] = readGraph(input), neighbors = graph(n,edges,true);
            const degree = new Int32Array(n+1), queue = heap(order), result = [];
            for (const [,v] of edges) degree[v]++;
            for (let u=1;u<=n;u++) if (!degree[u]) queue.add(u);
            while (queue.length) {
                const u = queue.remove();
                result.push(u);
                for (const [v] of neighbors[u]) if (--degree[v] === 0) queue.add(v);
            }
            return result.length === n ? space(result) : 'CYCLE';
        });
    add(2062, track, '中等', '给相邻展馆分两色', ['二分图', '图染色'],
        '每条连接边的两个展馆必须刷成不同颜色。仅允许使用两种颜色，判断能否完成。',
        '首行 n、m（1 ≤ n ≤ 50000，0 ≤ m ≤ 100000）。随后 m 行为两个馆号，馆号从 1 至 n，允许自环和重复边。',
        '可以时输出 YES，否则输出 NO。', '5 4\n1 2\n2 3\n3 4\n4 1', 'YES',
        ['1 1\n1 1','5 3\n2 3\n3 4\n4 2','4 0','3 3\n1 2\n1 2\n2 3'],
        input => {
            const [[n],edges] = readGraph(input), neighbors = graph(n,edges);
            const color = new Int8Array(n+1);
            for (let start=1;start<=n;start++) {
                if (color[start]) continue;
                const queue = [start];
                color[start] = 1;
                for (let i=0;i<queue.length;i++) for (const [v] of neighbors[queue[i]]) {
                    if (color[v] === color[queue[i]]) return 'NO';
                    if (!color[v]) { color[v] = 3-color[queue[i]]; queue.push(v); }
                }
            }
            return 'YES';
        });
    add(2063, track, '中等', '最大的盐湖面积', ['洪水填充', '连通分量'],
        '地图上字符 ~ 代表湖水，. 代表陆地。仅上下左右接壤的湖水才连成同一片湖。找出最大湖泊占据的格子数。',
        '首行 n、m（1 ≤ n,m ≤ 200）。随后 n 行各 m 个地图字符。',
        '输出最大格子数，没有湖水时输出 0。', '3 4\n~~..\n.~.~\n..~~', '3',
        ['1 1\n.','2 2\n~.\n.~','2 3\n~~~\n~~~',`200 200\n${rows(repeated(200,() => '~'.repeat(200)))}`],
        input => {
            const grid = lines(input).slice(1).map(line => [...line]);
            let best = 0;
            for (let r=0;r<grid.length;r++) for (let c=0;c<grid[r].length;c++) {
                if (grid[r][c] !== '~') continue;
                const queue = [[r,c]];
                grid[r][c] = '.';
                for (let i=0;i<queue.length;i++) {
                    const [x,y] = queue[i];
                    for (const [a,b] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]) if (grid[a]?.[b] === '~') {
                        grid[a][b] = '.';
                        queue.push([a,b]);
                    }
                }
                best = Math.max(best,queue.length);
            }
            return best;
        }, leetcode(200,'number-of-islands'));
    add(2064, track, '中等', '树上相隔最远的站点', ['树', '直径', '广度优先搜索'],
        'n 个站点恰好由 n−1 条双向线路连成一棵树。找出任意两个站点之间需要经过的最大边数。',
        '首行 n（1 至 100000）。随后 n−1 行给出相邻站点编号，编号为 1 至 n。',
        '输出最大边数。', '6\n1 2\n2 3\n2 4\n4 5\n1 6', '4',
        ['1','2\n1 2','5\n1 2\n1 3\n1 4\n1 5',`15000\n${rows(repeated(14999,i => `${i+1} ${i+2}`))}`],
        input => {
            const [[n],edges] = readGraph(input), neighbors = graph(n,edges);
            function farthest(start) {
                const queue = [[start,0,0]];
                for (let i=0;i<queue.length;i++) {
                    const [u,parent,dist] = queue[i];
                    for (const [v] of neighbors[u]) if (v !== parent) queue.push([v,u,dist+1]);
                }
                return queue.at(-1);
            }
            return farthest(farthest(1)[0])[2];
        });
}

function dynamicProgramming() {
    const track = 'dynamic-programming';
    add(2065, track, '简单', '避开坏台阶的登顶路线', ['动态规划', '计数'],
        '从第 0 阶出发，每次上升 1 或 2 阶。不能落在损坏的台阶上。计算到达第 n 阶的路线数量，结果对 1000000007 取余。',
        '首行 n、m（1 ≤ n ≤ 100000，0 ≤ m ≤ n）。其后给出 m 个互异的损坏台阶编号，范围 1 至 n。m 为 0 时没有编号。',
        '输出余数。', '6 1\n3', '4', ['1 0','1 1\n1','5 2\n2 3','100000 0'],
        input => {
            const [n,,...bad] = nums(input), broken = new Set(bad);
            let previous = 0, current = 1;
            for (let i=1;i<=n;i++) [previous,current] = [current,broken.has(i) ? 0 : (previous+current)%1000000007];
            return current;
        });
    add(2066, track, '中等', '最低成本凑指定积分', ['完全背包', '最优值'],
        '每种礼券贡献若干积分并消耗若干成本，同类礼券可以重复选。用礼券精确凑到目标积分，求最小成本。',
        '首行 n、s（1 ≤ n ≤ 80，0 ≤ s ≤ 20000）。随后 n 行为积分 p 和成本 c，1 ≤ p ≤ 20000，0 ≤ c ≤ 10^9。',
        '输出最低成本，无法恰好凑出时输出 -1。', '3 10\n2 10\n3 4\n4 7', '15',
        ['1 0\n5 10','2 7\n2 1\n4 2','2 12\n3 0\n1 5','1 20000\n1 1000000000'],
        input => {
            const [n,target,...types] = nums(input), best = new Float64Array(target+1).fill(Infinity);
            best[0] = 0;
            for (let i=0;i<n;i++) {
                const points = types[2*i], cost = types[2*i+1];
                for (let value=points;value<=target;value++) best[value] = Math.min(best[value],best[value-points]+cost);
            }
            return Number.isFinite(best[target]) ? best[target] : -1;
        }, leetcode(322,'coin-change'));
    add(2067, track, '中等', '仓库采购清单', ['0-1 背包', '滚动数组'],
        '仓库最多有预算 C。每种物资可选购一次或完全不买。每件物资有费用和收益，计算预算内的最大总收益。',
        '首行 n、C（1 ≤ n ≤ 150，0 ≤ C ≤ 10000）。随后 n 行为费用 w 和收益 v，1 ≤ w ≤ 10000，0 ≤ v ≤ 10^9。',
        '输出最大总收益。', '4 7\n3 6\n4 7\n5 8\n2 5', '13',
        ['1 0\n1 9','1 8\n2 100','3 6\n2 1000000000\n2 1000000000\n2 1000000000','3 5\n6 100\n2 0\n3 2'],
        input => {
            const [n,capacity,...items] = nums(input), best = new Float64Array(capacity+1);
            for (let i=0;i<n;i++) {
                const cost = items[2*i], reward = items[2*i+1];
                for (let budget=capacity;budget>=cost;budget--) best[budget] = Math.max(best[budget],best[budget-cost]+reward);
            }
            return best[capacity];
        });
    add(2068, track, '中等', '两封电报中的公共顺序', ['最长公共子序列', '滚动数组'],
        '可以从两封电报中各删除一些字符，剩余字符的相对顺序保持不变。求两封电报能保留的最长相同内容的长度。',
        '两行各一个小写英文串，长度 1 至 1000。', '输出最长长度。', 'abdcab\nbadba', '3',
        ['a\nb','a\na','aaaa\naa','abc\ncba', 'ab'.repeat(500)+'\n'+'ba'.repeat(500)],
        input => {
            const [a,b] = lines(input), best = new Int32Array(b.length+1);
            for (const character of a) {
                let oldDiagonal = 0;
                for (let j=1;j<=b.length;j++) {
                    const old = best[j];
                    best[j] = character === b[j-1] ? oldDiagonal+1 : Math.max(best[j],best[j-1]);
                    oldDiagonal = old;
                }
            }
            return best[b.length];
        });
    add(2069, track, '中等', '不下降的观测序列', ['最长子序列', '二分查找'],
        '从一列读数中删除任意个，使剩下的读数保持原来的相对顺序且非降序。计算可保留的最大读数数量，相等的相邻读数允许保留。',
        '首行 n（1 至 100000）。第二行 n 个读数，整数绝对值不超过 10^9。',
        '输出可保留的最大数量。', '7\n4 2 2 1 3 3 9', '5',
        ['1\n-1','4\n1 1 1 1','5\n5 4 3 2 1',arrayInput(repeated(30000,i => Math.floor(i/2)))],
        input => {
            const tails = [];
            for (const value of nums(input).slice(1)) tails[lowerBound(tails,value+1)] = value;
            return tails.length;
        }, leetcode(300,'longest-increasing-subsequence'));
    add(2070, track, '中等', '相邻路灯交替亮起', ['线性动态规划', '相邻约束'],
        '每盏灯有带符号的展示收益。选择部分灯点亮，相邻的两盏不能同时点亮。可以一盏都不亮，求最大总收益。',
        '首行 n（1 至 100000）。第二行 n 个整数收益，绝对值不超过 10^9。',
        '输出最大总收益。', '6\n4 1 7 8 -5 9', '21',
        ['1\n-8','1\n8','5\n-1 -2 -3 -4 -5',arrayInput(repeated(25000,() => 1000000000))],
        input => {
            let older = 0, latest = 0;
            for (const value of nums(input).slice(1)) [older,latest] = [latest,Math.max(latest,older+value)];
            return latest;
        });
    add(2071, track, '困难', '分批合并连续录音', ['区间动态规划', '合并代价'],
        '每段录音有给定长度。每次合并两段当前相邻的录音，新段长度为之和，这也是此次付出的代价。求合并成一段的最小总代价。',
        '首行 n（1 至 220）。第二行 n 个整数长度，每个在 1 到 10^9 之间。',
        '输出最小总代价。', '4\n4 3 6 2', '30',
        ['1\n7','2\n1000000000 1000000000','4\n10 1 1 10',arrayInput(repeated(200,i => (i*53)%700+1))],
        input => {
            const [n,...lengths] = nums(input), prefix = [0], best = repeated(n,() => new Float64Array(n));
            lengths.forEach((length,i) => prefix.push(prefix[i]+length));
            for (let width=2;width<=n;width++) for (let left=0;left+width<=n;left++) {
                const right = left+width-1, cost = prefix[right+1]-prefix[left];
                let answer = Infinity;
                for (let split=left;split<right;split++) answer = Math.min(answer,cost+best[left][split]+best[split+1][right]);
                best[left][right] = answer;
            }
            return best[0][n-1];
        });
    add(2072, track, '中等', '蚂蚁绕开积水', ['网格动态规划', '计数'],
        '蚂蚁从网格左上角到右下角，每步只能向右或向下。不能踏入积水格 #，干燥格用 . 表示。计算不同走法数量。',
        '首行 n、m（1 ≤ n,m ≤ 500）。随后 n 行各 m 个字符，起点和终点可能积水。',
        '输出走法数量对 1000000007 取余的结果。', '3 4\n....\n.#..\n....', '4',
        ['1 1\n.','1 1\n#','2 2\n.#\n#.','2 3\n...\n..#',`200 200\n${rows(repeated(200,() => '.'.repeat(200)))}`],
        input => {
            const grid = lines(input).slice(1), best = new Int32Array(grid[0].length);
            best[0] = 1;
            for (const row of grid) {
                for (let i=0;i<row.length;i++) best[i] = row[i] === '#' ? 0 : (best[i]+(best[i-1] ?? 0))%1000000007;
            }
            return best.at(-1);
        });
}

basics();
arrays();
structures();
simulation();
sorting();
search();
dataStructures();
graphProblems();
dynamicProgramming();

const check = process.argv.includes('--check');
const directory = new URL('../assets/pages/a/oj/problems/',import.meta.url);
assert.equal(new Set(problems.map(problem => problem.id)).size,problems.length);
function publish(filename,value) {
    const path = new URL(filename,directory);
    const content = JSON.stringify(value,null,2)+'\n';
    if (check) assert.equal(readFileSync(path,'utf8').replace(/\r\n/g,'\n'),content,filename);
    else writeFileSync(path,content);
}

for (const problem of problems) publish(`${problem.id}.json`,problem);
publish('general-index.json',problems.map(({id,title,track,tags,difficulty,time_limit,memory_limit}) => ({
    id,title,track,tags,difficulty,time_limit,memory_limit,
})));
const count = problems.reduce((total,problem) => total+problem.hidden_tests.length,0);
console.log(`${check ? 'Verified' : 'Generated'} ${problems.length} problems and ${count} judge cases.`);
