"use client";
import { useState, useEffect } from "react";
import { BookOpen } from "lucide-react";

interface Props {
  isbn: string;
  title: string;
  source: string;
  cachedUrl?: string; // 해외 도서용 Open Library URL (한국책은 API 프록시 사용)
}

function isKoreanIsbn(isbn: string) {
  return isbn.startsWith("9788") || isbn.startsWith("9791");
}

function openLibraryUrl(isbn: string) {
  return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
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
  // 한국책: /api/book-cover?isbn=... (서버 프록시 — hotlinking 우회)
  // 해외책: cachedUrl(Open Library) 또는 openLibraryUrl(isbn)
  function getInitialSrc() {
    if (!isbn) return null;
    if (isKoreanIsbn(isbn)) return `/api/book-cover?isbn=${isbn}`;
    return cachedUrl || openLibraryUrl(isbn);
  }

  const [src,     setSrc]     = useState<string | null>(getInitialSrc);
  const [failed,  setFailed]  = useState(false);
  const [loading, setLoading] = useState(true);
  const [step,    setStep]    = useState(0);

  useEffect(() => {
    setSrc(getInitialSrc());
    setFailed(false);
    setLoading(true);
    setStep(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isbn, cachedUrl]);

  const handleError = async () => {
    if (isKoreanIsbn(isbn)) {
      // 카카오 프록시 실패 → Google Books
      const google = await fetchGoogleCover(isbn);
      if (google) { setSrc(google); setStep(1); }
      else setFailed(true);
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
