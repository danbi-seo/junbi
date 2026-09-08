import Link from "next/link";

/**
 * 앞·뒤로 넘기는 화살표.
 *
 * ‹ › 같은 글자를 그냥 쓰면 안 된다. 획이 가늘고 글꼴마다 크기가 달라서
 * 키워도 잘 안 보이고, 테두리가 없으니 누를 수 있는 것인지도 알 수 없다.
 * 실제로 "작고 눌리는 건지 모르겠다"는 말이 나왔다.
 *
 * 그려서 굵기를 못 박고, 토글과 같은 테두리를 줘서 누르는 것처럼 보이게 한다.
 * 상자는 44px → docs/09-ui-spec.md
 */
export function ArrowLink({
  href,
  dir,
  label,
}: {
  href: string;
  dir: "prev" | "next";
  label: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="grid size-11 shrink-0 place-items-center rounded-lg border border-line bg-card text-ink active:bg-slot-a-bg"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={dir === "next" ? { transform: "scaleX(-1)" } : undefined}
      >
        <path d="M15 5 8 12l7 7" />
      </svg>
    </Link>
  );
}
