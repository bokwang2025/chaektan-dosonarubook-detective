import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_DESC =
  "칼데콧·안데르센·볼로냐·카네기 등 공신력 있는 수상·추천 그림책을 AI로 검색하고, 도서별 다중지능 독후활동과 내 근처 도서관 대출 여부를 바로 확인하세요.";

export const metadata: Metadata = {
  metadataBase: new URL("https://bookdetective-dosunaru.vercel.app"),
  title: "책탐정 도서나루",
  description: SITE_DESC,
  // iOS Safari/Chrome 자동 인식(주소·날짜·전화)으로 저자/연도 텍스트가 지도 링크로 바뀌는 것 방지
  formatDetection: { telephone: false, date: false, address: false, email: false },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "책탐정 도서나루",
    title: "책탐정 도서나루 — 수상·추천으로 고른 그림책, 가까운 도서관까지",
    description: SITE_DESC,
    // opengraph-image.png (app 폴더 파일 규칙)로 이미지 자동 연결됨
  },
  twitter: {
    card: "summary_large_image",
    title: "책탐정 도서나루",
    description: SITE_DESC,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}<Analytics /></body>
    </html>
  );
}
