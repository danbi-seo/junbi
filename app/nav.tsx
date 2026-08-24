import Link from "next/link";
import { Brand } from "./brand";
import { SignOutButton } from "./sign-out";

/**
 * 반응형 골격 — docs/10-responsive.md
 *
 *   base      하단 탭
 *   md 이상   좌측 아이콘 레일
 *   lg 이상   좌측 사이드바 (라벨까지)
 *
 * 기능을 숨기지 않는다. 레이아웃만 바뀌고 할 수 있는 일은 같다.
 * 모바일에서 못 하는 기능이 생기면 그건 반응형이 아니라 다른 제품이다.
 *
 * 하단 탭과 좌측 레일의 순서는 같아야 한다. 기기를 옮길 때 위치가 바뀌면 헤맨다.
 */

/**
 * 최대 5개다. 넘으면 '더보기'로 접지 말고 항목을 줄인다 → docs/10-responsive.md
 *
 * 여기 없는 화면은 다른 자리에서 들어간다.
 *   월 뷰    메인 달력의 ⟨주⟩⟨월⟩ 토글
 *   일정 추가 메인 달력 오른쪽 ＋
 *   루틴     내 상태 편집 시트 안
 *   이음새   날짜를 두 번 탭
 *
 * 4단계 뒤에 장소·지출이 들어오면 기념일·루틴을 이 자리에서 빼야 한다.
 */
const ITEMS = [
  { href: "/", icon: "📅", label: "달력" },
  { href: "/places", icon: "📍", label: "장소" },
  { href: "/lists", icon: "☑", label: "목록" },
  { href: "/dday", icon: "💜", label: "기념일" },
  { href: "/settings", icon: "⚙", label: "설정" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const items = ITEMS;

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      {/* md 이상 — 좌측 레일 · 사이드바 */}
      <nav className="hidden shrink-0 border-r border-line md:flex md:w-[72px] md:flex-col lg:w-[220px]">
        <div className="px-3 py-5 lg:px-5">
          <Brand />
        </div>
        <ul className="flex flex-1 flex-col gap-1 px-2 lg:px-3">
          {items.map((i) => (
            <li key={i.label}>
              <Link
                href={i.href}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-slot-a-bg"
              >
                <span className="w-5 text-center">{i.icon}</span>
                <span className="hidden lg:inline">{i.label}</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="px-3 py-4 text-sm lg:px-5">
          <SignOutButton />
        </div>
      </nav>

      {/* 본문 */}
      <div className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">{children}</div>

      {/* base — 하단 탭. safe-area를 넘어 홈 인디케이터에 가리지 않게 한다. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-card md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="flex">
          {items.map((i) => (
            <li key={i.label} className="flex-1">
              <Link
                href={i.href}
                // 터치 타겟은 44px 이상 → docs/09-ui-spec.md
                className="flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] text-ash"
              >
                <span className="text-lg leading-none">{i.icon}</span>
                {i.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
