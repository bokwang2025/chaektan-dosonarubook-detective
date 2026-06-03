import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "책탐정 도서나루",
  description: "칼데콧·안데르센·볼로냐·카네기 등 공신력 있는 수상·추천 도서를 AI로 검색하고, 내 근처 도서관 대출 여부를 바로 확인하세요.",
  // iOS Safari/Chrome 자동 인식(주소·날짜·전화)으로 저자/연도 텍스트가 지도 링크로 바뀌는 것 방지
  formatDetection: { telephone: false, date: false, address: false, email: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
