import { NextRequest, NextResponse } from "next/server";

const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;

// Kakao CDN URL에서 실제 이미지 URL 추출
// https://search1.kakaocdn.net/thumb/...?fname=https%3A%2F%2Ft1.kakaocdn.net%2F...
// → https://t1.kakaocdn.net/...
function extractDirectUrl(kakaoUrl: string): string {
  try {
    const fname = new URL(kakaoUrl).searchParams.get("fname");
    return fname ? decodeURIComponent(fname) : kakaoUrl;
  } catch {
    return kakaoUrl;
  }
}

export async function GET(req: NextRequest) {
  const isbn = new URL(req.url).searchParams.get("isbn");
  if (!isbn) return NextResponse.json({ url: null });

  try {
    const res = await fetch(
      `https://dapi.kakao.com/v3/search/book?target=isbn&query=${isbn}`,
      {
        headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
        next: { revalidate: 86400 },
      }
    );
    const data = await res.json();
    const thumbnail = (data?.documents?.[0]?.thumbnail as string) || null;
    if (!thumbnail) return NextResponse.json({ url: null });

    // CDN 리사이저 URL → 직접 스토리지 URL (t1.kakaocdn.net)
    const directUrl = extractDirectUrl(thumbnail);
    return NextResponse.json({ url: directUrl });
  } catch {
    return NextResponse.json({ url: null });
  }
}
