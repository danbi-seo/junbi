import Image from "next/image";
import Link from "next/link";

/**
 * 화면 상단의 로고 자리.
 *
 * 전체 로고(글자 + 캐릭터)는 세로로 길어서 상단 바에 안 맞는다.
 * 상단에는 캐릭터만 쓰고 이름은 서체로 쓴다. 로그인 화면처럼 넓은 자리에서는
 * <BrandFull />로 원본을 그대로 보여준다.
 */
export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2">
      <Image
        src="/mark.png"
        alt=""
        width={856}
        height={856}
        priority
        className="size-8 shrink-0"
      />
      <span className="font-display text-xl tracking-tight">JUNBI</span>
    </Link>
  );
}

export function BrandFull({ className = "" }: { className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt="JUNBI — the our calendar"
      width={634}
      height={785}
      priority
      className={`h-auto w-full ${className}`}
    />
  );
}
