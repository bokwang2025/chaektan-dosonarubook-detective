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
        next: { revalidate: 86400 }, // 24시간 캐시
      }
    );
    const data = await res.json();
    const thumbnail = (data?.documents?.[0]?.thumbnail as string) || null;
    // 카카오 썸네일은 80×120 소형 → 더 큰 버전으로 교체
    const large = thumbnail ? thumbnail.replace(/C\d+x\d+$/, "R120x174") : null;
    return NextResponse.json({ url: large ?? thumbnail });
  } catch {
    return NextResponse.json({ url: null });
  }
}
