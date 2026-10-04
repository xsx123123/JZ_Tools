// 品牌徽标：手绘内联 SVG——双螺旋 + 数据刻度点，替代通用 lucide 图标
export function BrandMark({ size = 18 }: { size?: number }): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden
    >
      {/* 两条交叉螺旋链 */}
      <path d="M7.5 2.5c0 4.5 9 5.5 9 9.5s-9 5-9 9.5" />
      <path d="M16.5 2.5c0 4.5-9 5.5-9 9.5s9 5 9 9.5" />
      {/* 碱基对横档（中间三档） */}
      <path d="M9.4 7.2h5.2" strokeWidth="1.3" />
      <path d="M8.4 12h7.2" strokeWidth="1.3" />
      <path d="M9.4 16.8h5.2" strokeWidth="1.3" />
      {/* 端点数据节点 */}
      <circle cx="7.5" cy="2.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="21.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}