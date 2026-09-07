"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * 화면을 옮기면 맨 위로.
 *
 * 본문이 창이 아니라 안쪽 상자에서 스크롤되므로 브라우저의 자동 복원이
 * 걸리지 않는다. 이게 없으면 설정을 한참 내려 보다가 달력으로 갔을 때
 * 중간부터 보인다.
 */
export function ScrollReset({ target }: { target: string }) {
  const pathname = usePathname();

  useEffect(() => {
    document.getElementById(target)?.scrollTo({ top: 0 });
  }, [pathname, target]);

  return null;
}
