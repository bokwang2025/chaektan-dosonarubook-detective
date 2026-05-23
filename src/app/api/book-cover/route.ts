import { NextRequest, NextResponse } from "next/server";

const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;

export async function GET(req: NextRequest) {
  const isbn = new URL(req.url).searchParams.get("isbn");
  if (!isbn) return new NextResponse(null, { status: 400 });

  try {
    // 1. Kakao API로 thumbnail URL 조회
    const apiRes = await fetch(
      `https://dapi.kakao.com/v3/search/book?target=isbn&query=${isbn}`,
      {
        headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
        next: { revalidate: 86400 },
      }
    );
    const data = await apiRes.json();
    const thumbnail = (data?.documents?.[0]?.thumbnail as string) || null;
    if (!thumbnail) return new NextResponse(null, { status: 404 });

    // 더 큰 이미지 URL
    const imgUrl = thumbnail.replace(/C\d+x\d+$/, "R120x174");

    // 2. 이미지를 서버에서 직접 fetch해서 프록시 (hotlinking 우회)
    const imgRes = await fetch(imgUrl);
    if (!imgRes.ok) return new NextResponse(null, { status: 404 });

    const contentType = imgRes.headers.get("content-type") || "image/jpeg";
    const buffer = await imgRes.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
