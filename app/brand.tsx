import Image from "next/image";
import Link from "next/link";

/**
 * 화면 상단의 로고 자리.
 *
 * 전체 로고(글자 + 캐릭터)는 세로로 길어서 상단 바에 안 맞는다.
 * 상단에는 캐릭터만 쓰고 이름은 서체로 쓴다. 로그인 화면처럼 넓은 자리에서는
 * <BrandFull />로 원본을 그대로 보여준다.
 *
 * 밝은 모드와 어두운 모드에 서로 다른 파일을 쓴다.
 * 원본은 짙은 갈색 선이라 어두운 배경에서는 그대로 묻힌다.
 * 어두운 모드용은 선을 크림색으로 뒤집고 몸통을 투명하게 만든 것이다.
 * (CSS filter: invert는 색이 뒤집혀 갈색이 청록으로 간다)
 */

type Props = { className?: string };

function Pair({
  light,
  dark,
  alt,
  width,
  height,
  className = "",
}: Props & {
  light: string;
  dark: string;
  alt: string;
  width: number;
  height: number;
}) {
  return (
    <>
      <Image
        src={light}
        alt={alt}
        width={width}
        height={height}
        priority
        className={`${className} dark:hidden`}
      />
      <Image
        src={dark}
        alt=""
        aria-hidden
        width={width}
        height={height}
        priority
        className={`${className} hidden dark:block`}
      />
    </>
  );
}

/**
 * 상단 로고. back을 켜면 왼쪽에 작은 ‹ 가 붙는다.
 *
 * 실제로는 로고를 눌러 달력으로 가는 것과 같은 링크다. 다만 탭으로 들어온
 * 화면에서는 "어떻게 나가지"가 먼저 떠오르는데, 로고가 그 출구라는 걸
 * 알아채기 어렵다. 화살표 하나가 그걸 알려준다.
 *
 * 상자를 두르지 않는다. 테두리를 주면 로고와 나란히 놓인 두 번째 버튼처럼
 * 보여서, 로고 전체가 하나의 링크라는 사실이 오히려 흐려진다.
 *
 * 왼쪽 음수 여백으로 화살표가 차지한 만큼을 되돌린다. 안 그러면 화면마다
 * 로고 위치가 달라 보인다.
 */
export function Brand({
  href = "/",
  back = false,
}: {
  href?: string;
  back?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={back ? "달력으로" : undefined}
      // gap을 둘 다 쓰면 안 된다. tailwind-merge가 없어서 나중에 쓴 쪽이
      // 아니라 CSS 순서가 이긴다 — gap-1이 무시된다.
      className={`flex items-center ${back ? "-ml-2.5 gap-1" : "gap-2.5"}`}
    >
      {back && (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="size-4 shrink-0 text-ash"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 5 8 12l7 7" />
        </svg>
      )}
      {/*
       * 원본 mark.png는 824×824 정사각형인데 캐릭터가 518×374만 차지한다.
       * 나머지는 빈 여백이라 32px 상자에 넣으면 실제로는 20×14px로 그려져
       * 뭔지 알아볼 수가 없다. 여백을 잘라낸 -tight 판을 쓴다.
       *
       * 캐릭터가 가로로 길어서(4:3) 정사각형 size-*를 쓰면 다시 줄어든다.
       * 높이만 고정하고 너비는 비율대로 둔다.
       */}
      <Pair
        light="/mark-tight.png"
        dark="/mark-dark-tight.png"
        alt=""
        width={580}
        height={436}
        className="h-10 w-auto shrink-0"
      />
      <span className="font-display text-xl tracking-tight">JUNBI</span>
    </Link>
  );
}

export function BrandFull({ className = "" }: Props) {
  return (
    <Pair
      light="/logo.png"
      dark="/logo-dark.png"
      alt="JUNBI — the our calendar"
      width={634}
      height={785}
      className={`h-auto w-full ${className}`}
    />
  );
}
