import type { MetadataRoute } from "next";

/**
 * PWA 매니페스트 — docs/05-setup.md
 *
 * maskable 아이콘을 빠뜨리면 안드로이드 홈 화면에서 흰 여백 박스로 나온다.
 * 설치 안내와 서비스 워커는 2단계에서 붙인다.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "JUNBI",
    short_name: "JUNBI",
    description: "우리 둘의 캘린더",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#FBF7F0",
    theme_color: "#FBF7F0",
    orientation: "portrait",
    icons: [
      { src: "/icons/192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "일정 추가", url: "/new" },
      { name: "오늘", url: "/" },
    ],
  };
}
