import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // 카카오 CDN (책 표지)
      { protocol: "https", hostname: "**.kakaocdn.net" },
      // Open Library (해외 도서 표지)
      { protocol: "https", hostname: "covers.openlibrary.org" },
      // Google Books
      { protocol: "https", hostname: "books.google.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
};

export default nextConfig;
