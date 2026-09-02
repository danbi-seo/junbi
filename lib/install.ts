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
  | "android-samsung"
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

  if (/Android/.test(ua)) {
    // 갤럭시 기본 브라우저는 beforeinstallprompt를 안 쏜다.
    // 설치 팝업이 안 뜨는데 단계 설명까지 없으면 막다른 길이 된다.
    // 메뉴 위치도 크롬(오른쪽 위)과 반대라(오른쪽 아래) 따로 적어야 한다.
    return /SamsungBrowser/.test(ua) ? "android-samsung" : "android";
  }
  return "desktop";
}

export const INSTALL_COPY: Record<
  Exclude<InstallState, "installed">,
  { title: string; body: string; steps?: string[] }
> = {
  "ios-safari": {
    title: "홈 화면에 추가하면 더 편해요",
    body: "앱처럼 바로 열리고, 알림도 받을 수 있어요.",
    // 위치를 '아래'로 못박지 않는다. 아이폰은 하단이지만 아이패드는 상단이고,
    // 우리 판별은 둘을 구분하지 않는다.
    steps: [
      "공유 버튼(⬆︎)을 눌러요 — 아이폰은 화면 아래, 아이패드는 위",
      "조금 내려서 '홈 화면에 추가'",
      "오른쪽 위 '추가'를 눌러요",
    ],
  },
  "ios-other": {
    title: "사파리에서 열어 주세요",
    // 제약이 우리 탓이 아닐 때는 그렇다고 말한다. 앱이 이상한 게 아니라는 게 전달된다.
    body: "아이폰은 사파리에서만 홈 화면에 추가할 수 있어요. 애플 정책이라 어쩔 수 없어요.",
    // '사파리에서 여세요'만 적으면 방법을 모른다. 주소 복사가 가장 확실하다.
    steps: [
      "주소창의 주소를 길게 눌러 복사해요",
      "사파리를 열고 붙여넣어요",
      "그다음 공유 버튼(⬆︎) → '홈 화면에 추가'",
    ],
  },
  android: {
    title: "홈 화면에 추가할까요?",
    body: "앱처럼 바로 열리고, 알림도 받을 수 있어요.",
    // 설치 팝업이 안 뜨는 경우가 있다. 그때 쓸 수 있게 단계도 적는다.
    steps: [
      "위 '하기'를 누르면 설치 창이 떠요",
      "안 뜨면 오른쪽 위 ⋮ 를 눌러요",
      "'홈 화면에 추가' 또는 '앱 설치'",
    ],
  },
  "android-samsung": {
    title: "홈 화면에 추가할까요?",
    body: "앱처럼 바로 열리고, 알림도 받을 수 있어요.",
    steps: [
      "오른쪽 아래 ☰ (더보기)를 눌러요",
      "'현재 페이지 추가'를 눌러요",
      "'홈 화면'을 고르고 '추가'",
    ],
  },
  desktop: {
    title: "PC에서도 그대로 써요",
    body: "주소창 오른쪽의 설치 아이콘을 누르면 창으로 띄울 수 있어요.",
  },
};
