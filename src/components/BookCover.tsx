"use client";
import { useState } from "react";
import { BookOpen } from "lucide-react";

interface Props {
  isbn: string;
  title: string;
  source?: string;
  cachedUrl?: string;
  originalIsbn?: string;
}

const PLACEHOLDER_BG = "#f5f0e8";
const PLACEHOLDER_ICON_COLOR = "#c9b99a";

function Placeholder({ title }: { title: string }) {
  return (
    <div className="book-cover-placeholder" style={{ background: PLACEHOLDER_BG }}>
      <BookOpen size={28} style={{ color: PLACEHOLDER_ICON_COLOR }} />
      <span style={{ color: PLACEHOLDER_ICON_COLOR }}>
        {title.slice(0, 22)}{title.length > 22 ? "…" : ""}
      </span>
    </div>
  );
}

export default function BookCover({ isbn, title }: Props) {
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">("loading");

  if (!isbn) return <Placeholder title={title} />;

  const src = `/api/book-cover?isbn=${isbn}`;

  return (
    <div className="book-cover-wrap" style={{ position: "relative" }}>
      {/* 스켈레톤: 로딩 중에만 img 위에 absolute 오버레이 */}
      {status === "loading" && (
        <div className="book-cover-skeleton"
          style={{ position: "absolute", inset: 0, zIndex: 1 }} />
      )}
      {status === "failed" ? (
        <Placeholder title={title} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={title}
          loading="lazy"
          className="book-cover-img"
          style={{
            display: "block",
            opacity: status === "loaded" ? 1 : 0,
            transition: "opacity 0.2s ease",
          }}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("failed")}
          ref={(node) => {
            if (!node) return;
            if (node.complete) {
              if (node.naturalWidth > 0) setStatus("loaded");
              else setStatus("failed");
            }
          }}
        />
      )}
    </div>
  );
}
