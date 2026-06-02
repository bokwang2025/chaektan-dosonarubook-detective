import { NextRequest, NextResponse } from "next/server";

const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;

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

    // CDN URL 사이즈 업그레이드 (R120x174 → R300x0) 후 그대로 사용
    const upgradedUrl = thumbnail.replace(/\/R\d+x\d+\.q\d+\//, "/R300x0.q85/");
    return NextResponse.json({ url: upgradedUrl });
  } catch {
    return NextResponse.json({ url: null });
  }
}
