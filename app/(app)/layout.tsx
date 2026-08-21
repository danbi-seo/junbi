import { AppShell } from "@/app/nav";

/**
 * 로그인한 뒤의 화면들이 공유하는 골격.
 *
 * 로그인 화면은 (auth) 그룹이라 이 레이아웃을 타지 않는다.
 * 하단 탭이 로그인 화면에 뜨면 이상하다.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
