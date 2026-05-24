"use client";
import { useState, useEffect } from "react";
import { BookOpen } from "lucide-react";

interface Props {
  isbn: string;
  title: string;
  source: string;
  cachedUrl?: string;
  originalIsbn?: string; // 원서 ISBN (Google Books 폴백용)
}

function isKoreanIsbn(isbn: string) {
  return isbn.startsWith("9788") || isbn.startsWith("9791");
}

// Kakao CDN URL → 직접 스토리지 URL 추출
// https://search1.kakaocdn.net/...?fname=https%3A%2F%2Ft1.kakaocdn.net%2F...
function extractKakaoDirectUrl(url: string): string {
  try {
    const fname = new URL(url).searchParams.get("fname");
    return fname ? decodeURIComponent(fname) : url;
  } catch {
    return url;
  }
}

function openLibraryUrl(isbn: string) {
  return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
}

// ISBN-13 → ISBN-10 변환
function isbn13to10(isbn13: string): string | null {
  if (isbn13.length !== 13 || !isbn13.startsWith("97")) return null;
  const body = isbn13.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * parseInt(body[i]);
  const check = (11 - (sum % 11)) % 11;
  return body + (check === 10 ? "X" : check.toString());
}

// Amazon 이미지 CDN (ISBN-10 = ASIN for books)
function amazonCoverUrl(isbn13: string): string | null {
  const isbn10 = isbn13to10(isbn13);
  if (!isbn10) return null;
  return `https://images-na.ssl-images-amazon.com/images/P/${isbn10}.01.LZZZZZZZ.jpg`;
}

async function fetchKakaoUrl(isbn: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/book-cover?isbn=${isbn}`);
    const data = await res.json();
    return (data?.url as string) ?? null;
  } catch { return null; }
}

async function fetchGoogleCover(isbn: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1&fields=items(volumeInfo/imageLinks)`,
      { cache: "force-cache" }
    );
    const data = await res.json();
    const thumb = data?.items?.[0]?.volumeInfo?.imageLinks?.thumbnail as string | undefined;
    if (!thumb) return null;
    return thumb.replace("http://", "https://").replace("zoom=1", "zoom=2");
  } catch { return null; }
}

const PLACEHOLDER_BG = "#f5f0e8";
const PLACEHOLDER_ICON_COLOR = "#c9b99a";

export default function BookCover({ isbn, title, source: _source, cachedUrl, originalIsbn }: Props) {
  const [src,     setSrc]     = useState<string | null>(null);
  const [failed,  setFailed]  = useState(false);
  const [loading, setLoading] = useState(true);
  const [step,    setStep]    = useState(0);

  useEffect(() => {
    if (!isbn) { setFailed(true); setLoading(false); return; }

    let cancelled = false;
    setLoading(true); setFailed(false); setSrc(null); setStep(0);

    async function loadCover() {
      if (isKoreanIsbn(isbn)) {
        // ① 사전확인된 Kakao URL → t1.kakaocdn.net 직접 URL 추출
        if (cachedUrl) {
          const direct = extractKakaoDirectUrl(cachedUrl);
          if (!cancelled) { setSrc(direct); return; }
        }
        // ② Kakao API 조회
        const url = await fetchKakaoUrl(isbn);
        if (!cancelled && url) { setSrc(url); return; }
        // ③ Google Books (원서 ISBN으로)
        const fallbackIsbn = originalIsbn || isbn;
        const google = await fetchGoogleCover(fallbackIsbn);
        if (!cancelled && google) { setSrc(google); setStep(1); return; }
        if (!cancelled) setFailed(true);
      } else {
        // 해외책: cachedUrl → Amazon CDN → Open Library → Google Books
        if (cachedUrl) { if (!cancelled) { setSrc(cachedUrl); } return; }
        const amazon = amazonCoverUrl(isbn);
        if (amazon && !cancelled) { setSrc(amazon); return; }
        const ol = openLibraryUrl(isbn);
        if (!cancelled) { setSrc(ol); }
      }
    }

    loadCover();
    return () => { cancelled = true; };
  }, [isbn, cachedUrl, originalIsbn]);

  const handleError = async () => {
    if (isKoreanIsbn(isbn)) {
      if (step === 0) {
        // t1.kakaocdn.net 실패 → Kakao API 재시도
        const url = await fetchKakaoUrl(isbn);
        if (url && url !== src) { setSrc(url); setStep(1); return; }
        // → Google Books
        const fallbackIsbn = originalIsbn || isbn;
        const google = await fetchGoogleCover(fallbackIsbn);
        if (google) { setSrc(google); setStep(2); return; }
        setFailed(true);
      } else {
        setFailed(true);
      }
    } else {
      // Amazon CDN 실패 → Open Library → Google Books
      if (step === 0) {
        const ol = openLibraryUrl(isbn);
        if (ol !== src) { setSrc(ol); setStep(1); return; }
        setFailed(true);
      } else if (step === 1) {
        const g = await fetchGoogleCover(isbn);
        if (g) { setSrc(g); setStep(2); }
        else setFailed(true);
      } else {
        setFailed(true);
      }
    }
  };

  if (failed || (!src && !loading)) {
    return (
      <div className="book-cover-placeholder" style={{ background: PLACEHOLDER_BG }}>
        <BookOpen size={28} style={{ color: PLACEHOLDER_ICON_COLOR }} />
        <span style={{ color: PLACEHOLDER_ICON_COLOR }}>
          {title.slice(0, 22)}{title.length > 22 ? "…" : ""}
        </span>
      </div>
    );
  }

  return (
    <div className="book-cover-wrap">
      {loading && <div className="book-cover-skeleton" />}
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={title}
          className="book-cover-img"
          style={{ display: loading ? "none" : "block" }}
          onLoad={() => setLoading(false)}
          onError={handleError}
        />
      )}
    </div>
  );
}
