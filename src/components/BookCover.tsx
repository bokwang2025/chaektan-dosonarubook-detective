"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import { BookOpen } from "lucide-react";

interface Props {
  isbn: string;
  title: string;
  source: string;
  cachedUrl?: string;
}

function isKoreanIsbn(isbn: string) {
  return isbn.startsWith("9788") || isbn.startsWith("9791");
}

function openLibraryUrl(isbn: string) {
  return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
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

export default function BookCover({ isbn, title, source: _source, cachedUrl }: Props) {
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
        // 한국책: cachedUrl이 있으면 바로 사용, 없으면 Kakao API 조회
        const url = cachedUrl || await fetchKakaoUrl(isbn);
        if (!cancelled && url) { setSrc(url); return; }
        // 폴백: Google Books
        const google = await fetchGoogleCover(isbn);
        if (!cancelled && google) { setSrc(google); setStep(1); return; }
        if (!cancelled) setFailed(true);
      } else {
        // 해외책: cachedUrl(Open Library) → Google Books
        const url = cachedUrl || openLibraryUrl(isbn);
        if (!cancelled) { setSrc(url); }
      }
    }

    loadCover();
    return () => { cancelled = true; };
  }, [isbn, cachedUrl]);

  const handleError = async () => {
    if (isKoreanIsbn(isbn)) {
      if (step === 0) {
        // Kakao 실패 → Google Books
        const google = await fetchGoogleCover(isbn);
        if (google) { setSrc(google); setStep(1); }
        else setFailed(true);
      } else {
        setFailed(true);
      }
    } else {
      if (step === 0) {
        // Open Library 실패 → Google Books
        const g = await fetchGoogleCover(isbn);
        if (g) { setSrc(g); setStep(1); }
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
    <div className="book-cover-wrap" style={{ position: "relative" }}>
      {loading && <div className="book-cover-skeleton" />}
      {src && (
        <Image
          src={src}
          alt={title}
          fill
          sizes="(max-width: 640px) 50vw, 25vw"
          style={{
            objectFit: "cover",
            display: loading ? "none" : "block",
          }}
          onLoad={() => setLoading(false)}
          onError={handleError}
          unoptimized={step > 0} // Google Books URL은 최적화 건너뜀
        />
      )}
    </div>
  );
}
