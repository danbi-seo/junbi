import type { Metadata, Viewport } from "next";
import { Gowun_Batang, Noto_Sans_KR } from "next/font/google";
import "./globals.css";

// 표제(월 이름, D-day 숫자)용. 이 앱에서 숫자가 주인공인 자리에만 쓴다.
const display = Gowun_Batang({
  variable: "--font-display",
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
});

// 본문·UI용. 설계서는 Pretendard지만 Google Fonts에 없어 자체 호스팅이 필요하다.
// next/font가 자동으로 받아 심어주는 Noto Sans KR로 시작한다 → docs/decisions.md
const body = Noto_Sans_KR({
  variable: "--font-body",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "JUNBI",
  description: "커플이 일정과 상태를 나누되, 어디까지 공개할지는 각자 정한다.",
  // 탭 아이콘에는 글자를 뺀 캐릭터만 쓴다. 16px에서 글자는 안 읽힌다.
  icons: {
    icon: [
      { url: "/icons/32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/180.png",
  },
  appleWebApp: {
    capable: true,
    title: "JUNBI",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#FBF7F0",
  // 사용자가 확대할 수 있어야 한다. 접근성 문제다.
  initialScale: 1,
  width: "device-width",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${display.variable} ${body.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
