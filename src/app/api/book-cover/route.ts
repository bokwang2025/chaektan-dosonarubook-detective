import { NextRequest, NextResponse } from "next/server";
import confirmedCovers from "../../../data/confirmed_covers.json";

const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;
const CONFIRMED = confirmedCovers as Record<string, { url: string }>;

// ISBN-13 → ISBN-10 (Amazon ASIN)
function isbn13to10(isbn13: string): string | null {
  if (isbn13.length !== 13 || !isbn13.startsWith("97")) return null;
  const body = isbn13.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * parseInt(body[i]);
  const check = (11 - (sum % 11)) % 11;
  return body + (check === 10 ? "X" : check.toString());
}

async function fetchImage(url: string): Promise<{ buf: ArrayBuffer; ct: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "image/jpeg";
    if (!ct.startsWith("image/")) return null;
    return { buf: await res.arrayBuffer(), ct };
  } catch { return null; }
}

async function kakaoUrl(isbn: string): Promise<string | null> {
  if (!KAKAO_KEY) return null;
  try {
    const res = await fetch(
      `https://dapi.kakao.com/v3/search/book?target=isbn&query=${isbn}`,
      { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }, next: { revalidate: 86400 } }
    );
    const data = await res.json();
    const thumb = data?.documents?.[0]?.thumbnail as string | undefined;
    if (!thumb) return null;
    return thumb.replace(/\/R\d+x\d+\.q\d+\//, "/R300x0.q85/");
  } catch { return null; }
}

async function googleUrl(isbn: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1&fields=items(volumeInfo/imageLinks)`,
      { next: { revalidate: 86400 } }
    );
    const data = await res.json();
    const thumb = data?.items?.[0]?.volumeInfo?.imageLinks?.thumbnail as string | undefined;
    if (!thumb) return null;
    return thumb.replace("http://", "https://").replace("zoom=1", "zoom=2");
  } catch { return null; }
}

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
};

export async function GET(req: NextRequest) {
  const isbn = new URL(req.url).searchParams.get("isbn");
  if (!isbn) return new NextResponse(null, { status: 400 });

  const isKorean = isbn.startsWith("9788") || isbn.startsWith("9791");
  let result: { buf: ArrayBuffer; ct: string } | null = null;

  if (isKorean) {
    // 1. 사전확인 캐시 (confirmed_covers.json)
    const cached = CONFIRMED[isbn]?.url;
    if (cached) {
      const upgraded = cached.replace(/\/R\d+x\d+\.q\d+\//, "/R300x0.q85/");
      result = await fetchImage(upgraded);
    }
    // 2. Kakao API
    if (!result) {
      const url = await kakaoUrl(isbn);
      if (url) result = await fetchImage(url);
    }
    // 3. Google Books
    if (!result) {
      const url = await googleUrl(isbn);
      if (url) result = await fetchImage(url);
    }
  } else {
    // 해외책
    const cached = CONFIRMED[isbn]?.url;
    if (cached) result = await fetchImage(cached);

    if (!result) {
      const isbn10 = isbn13to10(isbn);
      if (isbn10) {
        result = await fetchImage(
          `https://images-na.ssl-images-amazon.com/images/P/${isbn10}.01.LZZZZZZZ.jpg`
        );
      }
    }
    if (!result) {
      result = await fetchImage(
        `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`
      );
    }
    if (!result) {
      const url = await googleUrl(isbn);
      if (url) result = await fetchImage(url);
    }
  }

  if (!result) return new NextResponse(null, { status: 404 });

  return new NextResponse(result.buf, {
    headers: { "Content-Type": result.ct, ...CACHE_HEADERS },
  });
}
