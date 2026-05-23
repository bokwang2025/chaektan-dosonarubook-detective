"use client";
import { useState, useEffect } from "react";
import { BookOpen } from "lucide-react";

interface Props {
  isbn: string;
  title: string;
  source: string;
  cachedUrl?: string;   // confirmed_covers.json 에서 사전 확인된 URL (있으면 API 호출 생략)
}

// 한국 ISBN 여부 (978-89 또는 979-11 로 시작)
function isKoreanIsbn(isbn: string) {
  return isbn.startsWith("9788") || isbn.startsWith("9791");
}

// 카카오 책 검색 (서버 프록시 경유 — API 키 보호)
async function fetchKakaoCover(isbn: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/book-cover?isbn=${isbn}`);
    const data = await res.json();
    return (data?.url as string) ?? null;
  } catch { return null; }
}

// Google Books API (무료·무키)
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

// Open Library
function openLibraryUrl(isbn: string) {
  return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
}

// 플레이스홀더: 아이보리
const PLACEHOLDER_BG = "#f5f0e8";
const PLACEHOLDER_ICON_COLOR = "#c9b99a";

export default function BookCover({ isbn, title, source: _source, cachedUrl }: Props) {
  // cachedUrl 이 있으면 즉시 사용 (API 호출 없음)
  const [src,     setSrc]     = useState<string | null>(cachedUrl || null);
  const [failed,  setFailed]  = useState(false);
  const [loading, setLoading] = useState(true);
  const [step,    setStep]    = useState(0);
  // step: 0=최초  1=1차 폴백  2=2차 폴백

  useEffect(() => {
    // cachedUrl 이 있으면 API 호출 없이 바로 표시
    if (cachedUrl) {
      setSrc(cachedUrl);
      setFailed(false);
      setLoading(true); // img onLoad 에서 false 로 전환
      return;
    }

    if (!isbn) { setFailed(true); setLoading(false); return; }

    let cancelled = false;

    async function loadCover() {
      setLoading(true); setFailed(false); setSrc(null); setStep(0);

      if (isKoreanIsbn(isbn)) {
        // ── 한국책: 카카오(최고품질) → Google Books → Open Library
        const kakao = await fetchKakaoCover(isbn);
        if (!cancelled && kakao) { setSrc(kakao); return; }

        const google = await fetchGoogleCover(isbn);
        if (!cancelled && google) { setSrc(google); setStep(1); return; }

        // Open Library 마지막 시도 (onError 에서 실패 처리)
        if (!cancelled) { setSrc(openLibraryUrl(isbn)); setStep(2); }
      } else {
        // ── 해외책: Open Library → Google Books
        if (!cancelled) { setSrc(openLibraryUrl(isbn)); setStep(0); }
      }
    }

    loadCover();
    return () => { cancelled = true; };
  }, [isbn, cachedUrl]);

  const handleError = async () => {
    if (cachedUrl) {
      // 캐시 URL 실패 → live API 로 폴백
      setSrc(null);
      setFailed(false);
      if (isKoreanIsbn(isbn)) {
        const kakao = await fetchKakaoCover(isbn);
        if (kakao) { setSrc(kakao); return; }
        const google = await fetchGoogleCover(isbn);
        if (google) { setSrc(google); return; }
      } else {
        const google = await fetchGoogleCover(isbn);
        if (google) { setSrc(google); return; }
      }
      setFailed(true);
      return;
    }

    if (isKoreanIsbn(isbn)) {
      setFailed(true);
    } else {
      if (step === 0) {
        // OL 실패 → Google Books 시도
        const g = await fetchGoogleCover(isbn);
        if (g) { setSrc(g); setStep(1); }
        else   { setFailed(true); }
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
