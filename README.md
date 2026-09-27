# DKTON — 音频工程师作品集单页站

按《dkton-描述词库》A/B 区规格实现的参考站。**零依赖**：不引 GSAP / Lenis / Howler，
全部等效能力（平滑滚动、帧率无关趋近、实时音频合成、频谱分析）用原生 API 手写，
离线可直接跑。

## 启动

```bash
# 方式一：任意静态服务器
cd site && node serve.js        # http://localhost:8080

# 方式二：直接双击 index.html 也可以（用的是经典 script，非 ES Module，file:// 兼容）
```

## 结构

```
site/
├── index.html              单页 DOM（8 个区块 + gate + lightbox + pill）
├── serve.js                20 行静态服务器（开发用）
└── assets/
    ├── css/
    │   ├── tokens.css      品牌色九级色阶(color-mix) + clamp 流体字号 + 缓动变量
    │   ├── base.css        全局（禁 backdrop-filter、grain、footage 占位、按钮四角卡扣）
    │   └── sections.css    按页面顺序的区块样式
    └── js/
        ├── core.js         util / ticker(收敛即停机) / IntentGate / audio(masterGain
        │                   后挂 Analyser) / smooth(Wheel→scrollTo，保 sticky) / media 调度器
        ├── cursor.js       SVG data-URI 光标（6 态 × 9 参数插值）+ Hover 胶囊
        ├── modules-1.js    IntroGate(三段式推子曲线) / Hero 频谱 / 逐字聚光灯 / WaveReveal
        ├── modules-2.js    调音台推子三轨 / Pegel 电平柱(SVG clipPath) / 幕布揭示 / 电平表
        ├── modules-3.js    FAQ 手风琴 / 磁吸拼贴 / 页脚弦乐器(Canvas 驻波) / 巨标自适应
        └── main.js         装配顺序 + 导航高亮 + 锚点平滑滚动
```

## 关键实现对照（描述词库 → 本实现）

| 描述词库条目 | 位置 |
|---|---|
| B1 推子三段式曲线 lead200/attack260/settle520/stagger70 | `modules-1.js → DK.gate` |
| B2 频谱挂 masterGain、attack.45/release.11、clip-path 圆角补偿 | `modules-1.js → DK.pulse` |
| B3 字符流坐标 + 五声音阶 + StereoPanner | `modules-1.js → DK.wave` |
| B4 三源错相位 loop + 头尾 35% 交叉淡化 + 22 卡位 detent | `modules-2.js → DK.faders` |
| B5 340vh sticky + S/F/M/E/Q 参数 + SVG clipPath 切视频 | `modules-2.js → DK.pegel` |
| B6 dkSettle/dkDuck/dkRise 三缓动 + 2px 光晕幕布边 | `modules-2.js → DK.projects`（CSS transition 实现） |
| B7 驻波 22 段 + 手速驱动音量 + 离屏烘笔画 + 幽灵演示 | `modules-3.js → DK.instrument` |
| B8 光标 6 态 9 参 + Map 缓存 + 点击爆裂 | `cursor.js` |
| C24 Intent Gate（pointermove/key/wheel/touch 或 load+idle 4s） | `core.js` |

## 与原站的刻意差异

1. **无外部资源**：视频窗/项目封面用 CSS 动画渐变 `.footage` 占位，音床/音效全部
   Web Audio 实时合成。接真实素材时把 `[data-footage]` 换成 `<video>`，
   `core.js → DK.media` 的调度器（并发 2 / 4s 超时 / rootMargin 150%/10%）已经就位。
2. **GSAP 三条 CustomEase** 换成了等值 CSS `cubic-bezier`（--ease-settle/duck/ride）。
3. **幕布揭示**用 CSS transition + IntersectionObserver，未引 GSAP Timeline；
   逐字 stagger 用 `transition-delay` 内联实现。
4. 光标为 SVG data-URI（忠于原站方案）；个别内核不支持时自动回退系统光标，不影响功能。

## 降级矩阵

- `prefers-reduced-motion`：gate 直接跳过、频谱给静态电平、正文全亮、光标/胶囊/弦乐器不初始化
- `(pointer: coarse)` 或 ≤991px：平滑滚动/弦乐器/光标/跟随预览关闭，其余保留
- 键盘：推子可聚焦（role=slider + 方向键），lightbox Esc 关闭，焦点归还触发元素
