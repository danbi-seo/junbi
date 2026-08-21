/**
 * 홈 화면 설치 상태 판별 — docs/21-onboarding.md
 *
 * 여기가 이 프로젝트 최대의 이탈 지점이다.
 * 아이폰은 사파리에서만 홈 화면에 추가할 수 있고, 추가하지 않으면
 * 3단계의 웹 푸시가 아예 동작하지 않는다.
 */

export type InstallState =
  | "installed"
  | "ios-safari"
  | "ios-other"
  | "android"
  | "desktop";

export function installState(): InstallState {
  if (typeof window === "undefined") return "desktop";

  const ua = navigator.userAgent;

  // 아이패드는 기본이 데스크톱 모드라 UA에 iPad가 없다.
  // MacIntel + 터치 지원으로 잡는다.
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    // 아이폰 홈 화면 웹앱은 표준 대신 이 값을 쓴다
    (navigator as unknown as { standalone?: boolean }).standalone === true;

  if (isStandalone) return "installed";

  if (isIOS) {
    // 네이버 웨일은 국내에서 iOS 크롬만큼 흔하다. 빠뜨리면 안 된다.
    const isSafari = !/CriOS|FxiOS|EdgiOS|OPiOS|Whale|DaumApps|KAKAOTALK/.test(ua);
    return isSafari ? "ios-safari" : "ios-other";
  }

  if (/Android/.test(ua)) return "android";
  return "desktop";
}

export const INSTALL_COPY: Record<
  Exclude<InstallState, "installed">,
  { title: string; body: string; steps?: string[] }
> = {
  "ios-safari": {
    title: "홈 화면에 추가하면 더 편해요",
    body: "앱처럼 바로 열리고, 알림도 받을 수 있어요.",
    steps: [
      "아래 공유 버튼(⬆︎)을 눌러요",
      "조금 내려서 '홈 화면에 추가'",
      "오른쪽 위 '추가'를 눌러요",
    ],
  },
  "ios-other": {
    title: "사파리에서 열어 주세요",
    // 제약이 우리 탓이 아닐 때는 그렇다고 말한다. 앱이 이상한 게 아니라는 게 전달된다.
    body: "아이폰은 사파리에서만 홈 화면에 추가할 수 있어요. 애플 정책이라 어쩔 수 없어요.",
  },
  android: {
    title: "홈 화면에 추가할까요?",
    body: "앱처럼 바로 열리고, 알림도 받을 수 있어요.",
  },
  desktop: {
    title: "PC에서도 그대로 써요",
    body: "주소창 오른쪽의 설치 아이콘을 누르면 창으로 띄울 수 있어요.",
  },
};
