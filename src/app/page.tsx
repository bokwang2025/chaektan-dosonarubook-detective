"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Search, MapPin, Library, BookOpen, Star, Medal,
  Sparkles, X, ChevronDown, Loader2,
} from "lucide-react";
import booksData from "../data/books.json";
import confirmedCoversData from "../data/confirmed_covers.json";
import BookCover from "../components/BookCover";

// ─── 타입 ────────────────────────────────────
interface Book {
  id: string; source: string; sourceLabel: string;
  awardYear: string; awardName: string; awardCategory: string; awardSubCategory?: string;
  originalTitle: string; koreanTitle: string;
  author: string; publisher: string; publishedYear: string;
  isbn: string; koreanIsbn: string; targetAge: string;
  tags: string[]; situationTags: string[]; emotionTags: string[]; topicTags: string[];
  hook: string; notice: string; activity: string; country: string;
  additionalSources?: string[];
  aiReason?: string;
}
interface LibraryInfo {
  libName: string; address: string; tel: string; homepage: string;
  loanAvailable: boolean; distance?: number;
}

// ─── 책 형태 배지 ─────────────────────────────
const FORMAT_RULES = [
  { key: "wordless",   emoji: "🔤", label: "글없는그림책",
    patterns: ["글 없이", "글없는", "글자 없", "그림만으로", "말 없이", "글이 없"] },
  { key: "collage",    emoji: "✂️", label: "사진·콜라주",
    patterns: ["콜라주", "오려 만든", "거리에서 주운", "실물 재료"] },
  { key: "monochrome", emoji: "⬛", label: "흑백그림",
    patterns: ["흑백 그림", "흑백의", "흑백으로", "검정과 흰"] },
  { key: "vertical",   emoji: "📐", label: "세로판형",
    patterns: ["길쭉한 그림", "세로로 읽", "세로 방향"] },
  { key: "rotate",     emoji: "🔄", label: "돌려읽기",
    patterns: ["옆으로 돌려", "책을 돌리", "돌려서 읽"] },
  { key: "panorama",   emoji: "📜", label: "병풍·파노라마",
    patterns: ["병풍", "펼치면 이어지", "컷아웃을 통해", "아코디언"] },
  { key: "clay",       emoji: "🫙", label: "점토·입체",
    patterns: ["점토", "클레이", "조각으로 만든"] },
  { key: "woodcut",    emoji: "🎨", label: "판화",
    patterns: ["판화", "목판화", "스크래치보드"] },
];

function getBookFormats(book: Book) {
  const text = [book.notice, book.hook, book.activity].filter(Boolean).join(" ");
  return FORMAT_RULES.filter(rule => rule.patterns.some(p => text.includes(p)));
}

// ─── 상수 ────────────────────────────────────
const allBooks = booksData as Book[];

// ISBN 있는 책만 (서울어린이도서관 300권 제외)
const booksWithIsbn = allBooks.filter((b) => b.isbn && b.isbn.length > 0);

const SOURCE_CONFIG: Record<string, { label: string; chipClass: string; badgeClass: string }> = {
  "칼데콧":          { label: "🏅 칼데콧",        chipClass: "active-gold",    badgeClass: "badge-caldecott" },
  "안데르센":        { label: "🌟 안데르센",       chipClass: "active-teal",    badgeClass: "badge-andersen"  },
  "볼로냐":          { label: "🎨 볼로냐",         chipClass: "active-orange",  badgeClass: "badge-bologna"   },
  "카네기":          { label: "📖 카네기",         chipClass: "active-purple",  badgeClass: "badge-carnegie"  },
  "국립어린이도서관": { label: "📚 국립어린이도서관", chipClass: "active-green",   badgeClass: "badge-national"  },
  "서울시교육청":    { label: "🏫 서울시교육청",    chipClass: "active",         badgeClass: "badge-edu"       },
  "서울어린이도서관": { label: "🌸 서울어린이도서관", chipClass: "active-pink",    badgeClass: "badge-seoul"     },
  "국립중앙도서관":  { label: "🏛️ 국립중앙도서관",  chipClass: "active-indigo",  badgeClass: "badge-nlcf"      },
  "교과연계도서":    { label: "📝 교과연계도서",    chipClass: "active-brown",   badgeClass: "badge-cur"       },
};

// 수상 출처 (뱃지 금/은 구분 적용)
const AWARD_SOURCES = new Set(["칼데콧", "안데르센", "볼로냐", "카네기"]);

// 연령 순서 정의
// "어린이"(3,716권)는 출처에서 세분화 없이 제공 → "전체 어린이"로 표시, 필터에는 포함
const AGE_ORDER = ["6-7세", "초등1-2", "초등3-4", "초등5-6", "청소년", "어린이"];

// "어린이" → UI 표시용 레이블
function ageLabel(age: string): string {
  return age === "어린이" ? "전체 어린이" : age;
}

// 색상 테마
const COLOR_THEMES: Record<string, {
  accent: string; accent2: string; glow: string; label: string;
  grad1: string; grad2: string; grad3: string;
  blob1: string; blob2: string;
}> = {
  emerald: {
    accent: "#059669", accent2: "#047857", glow: "rgba(5,150,105,0.18)", label: "🌿 에메랄드",
    grad1: "#059669", grad2: "#047857", grad3: "#0d9488",
    blob1: "rgba(5,150,105,0.07)", blob2: "rgba(13,148,136,0.05)",
  },
  orange: {
    accent: "#EA580C", accent2: "#c2410c", glow: "rgba(234,88,12,0.18)", label: "🍊 오렌지",
    grad1: "#EA580C", grad2: "#dc2626", grad3: "#f43f5e",
    blob1: "rgba(234,88,12,0.08)", blob2: "rgba(220,38,38,0.05)",
  },
  sky: {
    accent: "#0284C7", accent2: "#0369a1", glow: "rgba(2,132,199,0.18)", label: "🩵 하늘색",
    grad1: "#0284C7", grad2: "#2563eb", grad3: "#7c3aed",
    blob1: "rgba(2,132,199,0.07)", blob2: "rgba(37,99,235,0.05)",
  },
};

// ─── 초기 표시용: 표지 확인된 책만, 출처 다양 + 중복수상 최우선 ──────────
const CONFIRMED_COVERS = confirmedCoversData as Record<string, {
  url: string; title: string; source: string; awardYear: string; dual: boolean; id: string;
}>;

function buildInitialBooks(): Book[] {
  const SOURCE_ORDER = ["칼데콧","안데르센","볼로냐","카네기","국립어린이도서관","서울시교육청","서울어린이도서관","국립중앙도서관","교과연계도서"];

  // 연도 우선순위 점수
  function yearScore(year: string): number {
    const y = parseInt(year || "0");
    if (y >= 2020 && y <= 2025) return 3;
    if (y === 2026)              return 2; // 신간 있으면 포함 (표지 확인됨)
    if (y >= 2015 && y < 2020)  return 1;
    return 0;
  }

  // 출처별로 묶기 — 카카오 표지 확인된 책만
  const confirmedIsbns = new Set(Object.keys(CONFIRMED_COVERS));
  const bySource: Record<string, Book[]> = {};
  for (const src of SOURCE_ORDER) {
    bySource[src] = allBooks
      .filter((b) => b.source === src && b.koreanIsbn && confirmedIsbns.has(b.koreanIsbn))
      .sort((a, b) => {
        // 중복수상 최우선
        const dualA = (a.additionalSources?.length ?? 0) > 0 ? 1 : 0;
        const dualB = (b.additionalSources?.length ?? 0) > 0 ? 1 : 0;
        if (dualB !== dualA) return dualB - dualA;
        // 최신 연도 우선
        const scoreDiff = yearScore(b.awardYear) - yearScore(a.awardYear);
        if (scoreDiff !== 0) return scoreDiff;
        return (b.awardYear || "0").localeCompare(a.awardYear || "0");
      });
  }

  // Round-robin: 각 출처에서 1권씩 번갈아 → 60권
  const result: Book[] = [];
  const activeSrcs = SOURCE_ORDER.filter((s) => (bySource[s]?.length ?? 0) > 0);
  let round = 0;
  while (result.length < 60) {
    let added = false;
    for (const src of activeSrcs) {
      if (bySource[src]?.[round]) {
        result.push(bySource[src][round]);
        added = true;
        if (result.length >= 60) break;
      }
    }
    if (!added) break;
    round++;
  }
  return result;
}

const INITIAL_BOOKS = buildInitialBooks();

// ─── 메인 컴포넌트 ────────────────────────────
export default function Home() {
  const [query,           setQuery]          = useState("");
  const [selectedAges,    setSelectedAges]   = useState<string[]>([]);
  const [selectedSources, setSelectedSources]= useState<string[]>([]);
  const [colorTheme,      setColorTheme]     = useState<string>("emerald");

  // 색상 테마 적용
  useEffect(() => {
    const t = COLOR_THEMES[colorTheme];
    if (!t) return;
    const root = document.documentElement;
    root.style.setProperty("--accent",  t.accent);
    root.style.setProperty("--accent2", t.accent2);
    root.style.setProperty("--glow",    t.glow);
    root.style.setProperty("--grad-1",  t.grad1);
    root.style.setProperty("--grad-2",  t.grad2);
    root.style.setProperty("--grad-3",  t.grad3);
    root.style.setProperty("--blob-1",  t.blob1);
    root.style.setProperty("--blob-2",  t.blob2);
  }, [colorTheme]);
  const [searchMode,      setSearchMode]     = useState<"keyword"|"ai">("keyword");
  const [showKoreanOnly,  setShowKoreanOnly] = useState(false);
  const [books,           setBooks]          = useState<Book[]>(INITIAL_BOOKS);
  const [locationDenied,  setLocationDenied] = useState(false);
  const [aiMode,         setAiMode]         = useState(false);
  const [aiEngine,       setAiEngine]       = useState<"claude"|"smart"|"">("");
  const [aiLoading,      setAiLoading]      = useState(false);
  const [aiError,        setAiError]        = useState("");
  const [selectedBook,   setSelectedBook]   = useState<Book | null>(null);
  const [detailBook,     setDetailBook]     = useState<Book | null>(null);
  const [summary,        setSummary]        = useState<string>("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [showActivityOnly, setShowActivityOnly] = useState(false);
  const [libraries,      setLibraries]      = useState<LibraryInfo[]>([]);
  const [libLoading,     setLibLoading]     = useState(false);
  const [userLocation,   setUserLocation]   = useState<{lat:number;lng:number}|null>(null);
  const [locationLabel,  setLocationLabel]  = useState("내 위치로 도서관 찾기");
  const [locationError,  setLocationError]  = useState("");
  const [showAll,        setShowAll]        = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 가용 연령 목록 ──────────────────────────
  const availableAges = AGE_ORDER.filter((a) =>
    booksWithIsbn.some((b) => b.targetAge === a)
  );

  // ── 일반 필터 ──────────────────────────────
  const filterBooks = useCallback(() => {
    if (aiMode) return;

    const hasFilter = query.trim() || selectedAges.length > 0 || selectedSources.length > 0 || showKoreanOnly || showActivityOnly;

    // 아무 필터·검색어도 없으면 초기 큐레이션 화면 (출처 다양 + 표지 있는 책)
    if (!hasFilter) {
      setBooks(INITIAL_BOOKS);
      return;
    }

    let filtered = booksWithIsbn;

    if (showKoreanOnly)
      filtered = filtered.filter((b) => b.koreanIsbn && b.koreanIsbn.length > 0);
    if (showActivityOnly)
      filtered = filtered.filter((b) => b.activity && b.activity.trim().length > 0);

    if (query.trim()) {
      const q = query.toLowerCase();
      filtered = filtered.filter(
        (b) =>
          b.koreanTitle.toLowerCase().includes(q) ||
          b.originalTitle.toLowerCase().includes(q) ||
          b.author.toLowerCase().includes(q) ||
          b.tags.some((t) => t.includes(q))
      );
    }
    if (selectedAges.length > 0)
      filtered = filtered.filter((b) => selectedAges.includes(b.targetAge));
    if (selectedSources.length > 0)
      filtered = filtered.filter((b) => selectedSources.includes(b.source));

    setBooks(showAll ? filtered : filtered.slice(0, 60));
  }, [query, selectedAges, selectedSources, showKoreanOnly, showActivityOnly, aiMode, showAll]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(filterBooks, 220);
  }, [filterBooks]);

  // ── AI 검색 ────────────────────────────────
  const handleAiSearch = async (overrideQuery?: string) => {
    const q = overrideQuery ?? query;
    if (!q.trim()) return;
    if (overrideQuery) setQuery(overrideQuery);
    setAiMode(true); setAiLoading(true); setAiError("");

    try {
      const payload = booksWithIsbn
        .filter((b) => b.tags.length > 0)
        .map((b) => ({
          id: b.id,
          title: b.koreanTitle || b.originalTitle,
          tags: b.tags, hook: b.hook,
          age: b.targetAge, source: b.source,
        }));

      const res = await fetch("/api/ai-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, books: payload }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAiEngine(data.engine || "smart");

      let aiBooks: Book[] = data.results
        .map((r: { id: string; reason: string }) => {
          const book = allBooks.find((b) => b.id === r.id);
          return book ? { ...book, aiReason: r.reason } : null;
        })
        .filter(Boolean);

      // AI 결과에도 현재 필터 적용
      if (showKoreanOnly)
        aiBooks = aiBooks.filter((b) => b.koreanIsbn && b.koreanIsbn.length > 0);
      if (selectedAges.length > 0)
        aiBooks = aiBooks.filter((b) => selectedAges.includes(b.targetAge));
      if (selectedSources.length > 0)
        aiBooks = aiBooks.filter((b) => selectedSources.includes(b.source));

      setBooks(aiBooks);
    } catch {
      setAiError("AI 검색에 실패했습니다. 일반 검색으로 대체합니다.");
      setAiMode(false); filterBooks();
    } finally {
      setAiLoading(false);
    }
  };

  const resetAi = () => { setAiMode(false); setAiEngine(""); setAiError(""); filterBooks(); };

  const switchTab = (mode: "keyword" | "ai") => {
    setSearchMode(mode);
    setQuery("");
    setAiMode(false);
    setAiEngine("");
    setAiError("");
  };

  // ── 국내출간 토글 ───────────────────────────
  const toggleKoreanOnly = () => {
    setAiMode(false);
    setShowKoreanOnly((prev) => !prev);
  };

  // ── 필터 토글 헬퍼 ─────────────────────────
  const toggleAge = (age: string) => {
    setAiMode(false);
    setSelectedAges((prev) =>
      prev.includes(age) ? prev.filter((a) => a !== age) : [...prev, age]
    );
  };
  const toggleSource = (src: string) => {
    setAiMode(false);
    setSelectedSources((prev) =>
      prev.includes(src) ? prev.filter((s) => s !== src) : [...prev, src]
    );
  };

  // ── 위치 가져오기 ───────────────────────────
  const handleGetLocation = () => {
    setLocationLabel("위치 확인 중…"); setLocationError("");
    if (!navigator.geolocation) {
      setLocationLabel("위치 미지원"); setLocationError("이 브라우저는 위치 서비스를 지원하지 않습니다.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationLabel("위치 확인됨 ✓");
        setLocationDenied(false);
        setLocationError("");
      },
      (err) => {
        if (err.code === 1) {
          // 권한 거부 → 위치 없이도 전국 도서관 검색 가능하므로 안내만
          setLocationDenied(true);
          setLocationLabel("위치 없이 검색");
          setLocationError("위치 권한 없이도 도서관 검색이 가능해요. (가까운 순서 정렬은 위치 허용 후 가능)");
        } else {
          setLocationLabel("위치 확인 실패");
          setLocationError(err.code === 3 ? "위치 확인 시간이 초과됐어요. 다시 시도해주세요." : "현재 위치를 확인할 수 없어요.");
        }
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  };

  // ── 도서관 조회 (위치 파라미터 별도 받음 — 모달 내 위치허용 후 재조회용) ──
  const fetchLibraries = useCallback(async (book: Book, loc: { lat: number; lng: number } | null) => {
    setLibLoading(true);
    try {
      // 한국 도서관은 한국 ISBN으로 검색해야 찾을 수 있음
      const searchIsbn = book.koreanIsbn || book.isbn;
      const params = new URLSearchParams({ isbn: searchIsbn });
      if (loc) {
        params.set("lat", String(loc.lat));
        params.set("lng", String(loc.lng));
      }
      const res  = await fetch(`/api/library?${params}`);
      const data = await res.json();
      setLibraries(data.libraries || []);
    } catch { setLibraries([]); }
    finally { setLibLoading(false); }
  }, []);

  const handleCheckLibrary = (book: Book) => {
    setSelectedBook(book); setLibraries([]);
    fetchLibraries(book, userLocation);
  };

  // ── 상세페이지 열기 (줄거리 AI 생성) ──────────
  const openDetail = async (book: Book) => {
    setDetailBook(book);
    setSummary("");
    setSummaryLoading(true);
    try {
      const params = new URLSearchParams({
        title:        book.koreanTitle,
        author:       book.author,
        isbn:         book.koreanIsbn   || book.isbn || "",
        origIsbn:     book.isbn         || "",
        hook:         book.hook         || "",
        notice:       book.notice       || "",
        tags:         (book.tags || []).slice(0, 8).join(", "),
        targetAge:    book.targetAge    || "",
        awardName:    book.awardName    || "",
        awardYear:    book.awardYear    || "",
      });
      const res = await fetch(`/api/book-summary?${params}`);
      const data = await res.json();
      setSummary(data.summary || "");
    } catch { setSummary(""); }
    finally { setSummaryLoading(false); }
  };

  // ── 모달 내 위치 허용 버튼 ───────────────────
  const handleGetLocationInModal = () => {
    if (!navigator.geolocation) return;
    setLibLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        setLocationLabel("위치 확인됨 ✓");
        setLocationDenied(false);
        setLocationError("");
        // 위치 허용 즉시 현재 선택된 책으로 재조회
        if (selectedBook) fetchLibraries(selectedBook, loc);
      },
      () => {
        setLibLoading(false);
        setLocationError("위치 권한이 거부됐어요. 브라우저 설정에서 위치 허용 후 다시 시도해주세요.");
      },
      { timeout: 10000 }
    );
  };

  // 전체 필터링된 수 (더보기용)
  const totalFiltered = (() => {
    let f = booksWithIsbn;
    if (showKoreanOnly) f = f.filter((b) => b.koreanIsbn && b.koreanIsbn.length > 0);
    if (query.trim()) {
      const q = query.toLowerCase();
      f = f.filter((b) =>
        b.koreanTitle.toLowerCase().includes(q) ||
        b.originalTitle.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        b.tags.some((t) => t.includes(q))
      );
    }
    if (selectedAges.length > 0) f = f.filter((b) => selectedAges.includes(b.targetAge));
    if (selectedSources.length > 0) f = f.filter((b) => selectedSources.includes(b.source));
    return f.length;
  })();

  // ── 렌더 ───────────────────────────────────
  return (
    <main>
      <div className="bg-gradient-effect" />

      {/* 헤더 */}
      <section className="hero">
        <h1 className="title-gradient">책탐정 도서나루</h1>
        <p className="subtitle">
          칼데콧 · 안데르센 · 볼로냐 · 카네기 · 국립어린이도서관 · 서울시교육청 · 서울어린이도서관 · 국립중앙도서관 · 교과연계도서{" "}
          <strong>{allBooks.length.toLocaleString()}권</strong>을 AI로 검색하고,
          내 근처 도서관 대출 여부를 바로 확인하세요.
        </p>

        <div className="controls-container">
          {/* 검색 모드 탭 */}
          <div className="search-tabs">
            <button
              className={`search-tab ${searchMode === "keyword" ? "search-tab-active" : ""}`}
              onClick={() => switchTab("keyword")}
            >
              <Search size={13} /> 제목·작가 검색
            </button>
            <button
              className={`search-tab ${searchMode === "ai" ? "search-tab-active search-tab-ai" : ""}`}
              onClick={() => switchTab("ai")}
            >
              <Sparkles size={13} /> AI 상황 추천
            </button>
          </div>

          {/* 검색창 */}
          <div className="search-row">
            <div className="search-input-wrapper">
              {searchMode === "keyword"
                ? <Search size={17} className="search-icon" />
                : <Sparkles size={17} className="search-icon search-icon-ai" />}
              <input
                type="text" className="search-input"
                placeholder={searchMode === "keyword"
                  ? "책 제목이나 작가 이름을 입력하세요…"
                  : "어떤 상황인지 말해보세요… (예: 친구와 싸웠을 때)"}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (aiMode) resetAi();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (searchMode === "ai") handleAiSearch();
                    // keyword 탭은 onChange debounce로 자동 필터
                  }
                }}
              />
              {query && (
                <button className="clear-btn" onClick={() => { setQuery(""); resetAi(); }}>
                  <X size={12} />
                </button>
              )}
            </div>
            {searchMode === "ai" && (
              <button
                className={`ai-btn ${aiLoading ? "loading" : ""}`}
                onClick={() => handleAiSearch()}
                disabled={aiLoading || !query.trim()}
              >
                {aiLoading
                  ? <><Loader2 size={15} className="spin" /> 분석 중…</>
                  : <><Sparkles size={15} /> 추천받기</>}
              </button>
            )}
          </div>

          {/* AI 탭: 예시 검색어 */}
          {searchMode === "ai" && !query && (
            <div className="ai-examples">
              <span className="ai-examples-label">이렇게 물어보세요</span>
              {[
                "전학 가서 외로운 아이에게",
                "용기를 내야 할 때",
                "동생이 생긴 아이에게",
                "자연과 환경을 느끼고 싶을 때",
                "친구와 화해하는 법",
              ].map((ex) => (
                <button key={ex} className="ai-example-chip"
                  onClick={() => handleAiSearch(ex)}>
                  {ex}
                </button>
              ))}
            </div>
          )}

          {/* 연령 필터 */}
          <div className="filter-row">
            <span className="filter-label">연령</span>
            <div className="filter-chips">
              {availableAges.map((age) => (
                <button
                  key={age}
                  className={`chip ${selectedAges.includes(age) ? "active" : ""} ${age === "어린이" ? "chip-age-broad" : ""}`}
                  onClick={() => toggleAge(age)}
                  title={age === "어린이" ? "출처에서 세분화 없이 제공된 도서 (서울시교육청·국립중앙도서관 등)" : undefined}
                >{ageLabel(age)}</button>
              ))}
            </div>
          </div>

          {/* 출처 필터 */}
          <div className="filter-row">
            <span className="filter-label">출처</span>
            <div style={{ display: "flex", flexDirection: "column", gap: ".35rem", flex: 1 }}>
              <div className="filter-chips">
                {Object.entries(SOURCE_CONFIG).map(([src, cfg]) => (
                  <button
                    key={src}
                    className={`chip ${selectedSources.includes(src) ? cfg.chipClass : ""}`}
                    onClick={() => toggleSource(src)}
                  >{cfg.label}</button>
                ))}
              </div>
              <p className="award-period-note">
                🏆 칼데콧 · 안데르센 · 볼로냐 · 카네기는 <strong>최근 20년(2006~2026년) 수상작</strong> 기준입니다.
              </p>
            </div>
          </div>

          {/* 국내출간 + 독서활동 토글 */}
          <div className="filter-row">
            <span className="filter-label">필터</span>
            <div className="filter-chips">
              <button
                className={`chip ${showKoreanOnly ? "active" : ""}`}
                onClick={toggleKoreanOnly}
              >
                🇰🇷 국내 출간
              </button>
              <button
                className={`chip ${showActivityOnly ? "active" : ""}`}
                onClick={() => setShowActivityOnly(v => !v)}
              >
                ✏️ 독서활동 있음
              </button>
            </div>
          </div>

          {/* 위치 버튼 */}
          <div className="filter-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: ".4rem" }}>
            <div style={{ display: "flex", gap: ".6rem", alignItems: "center", flexWrap: "wrap" }}>
              <button
                className={`location-btn ${userLocation ? "located" : locationDenied ? "denied" : ""}`}
                onClick={handleGetLocation}
              >
                <MapPin size={15} />
                {locationLabel}
              </button>
              {locationDenied && (
                <span style={{ fontSize: ".75rem", color: "var(--text-sub)" }}>
                  📍 위치 없어도 도서관 검색 가능 (가까운 순 정렬은 위치 허용 시)
                </span>
              )}
            </div>
            {locationError && !locationDenied && (
              <span className="location-error-msg">{locationError}</span>
            )}
          </div>

          {/* 색상 테마 선택 */}
          <div className="filter-row">
            <span className="filter-label">테마</span>
            <div className="theme-swatches">
              {Object.entries(COLOR_THEMES).map(([key, t]) => (
                <button
                  key={key}
                  className={`theme-swatch ${colorTheme === key ? "swatch-active" : ""}`}
                  style={{ "--swatch-color": t.accent } as React.CSSProperties}
                  onClick={() => setColorTheme(key)}
                  title={t.label}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* AI 모드 배너 */}
        {aiMode && !aiLoading && (
          <div className="ai-banner">
            <div className="ai-banner-left">
              <Sparkles size={15} />
              <div>
                <div className="ai-banner-title">
                  {aiEngine === "claude" ? "Claude AI 추천" : "스마트 검색 결과"}
                </div>
                <div className="ai-banner-sub">
                  &ldquo;{query}&rdquo; — {books.length}권의 책을 엄선했어요. 각 카드의 추천 이유를 확인해보세요.
                </div>
              </div>
            </div>
            <button onClick={resetAi}><X size={12} /> 일반 검색으로</button>
          </div>
        )}
        {aiError && <div className="error-banner">{aiError}</div>}
      </section>

      {/* 도서 그리드 */}
      <section className="book-grid">
        {books.map((book) => (
          <div className="book-card" key={book.id}>
            <div style={{ cursor: "pointer" }} onClick={() => openDetail(book)}>
              <BookCover
                isbn={book.koreanIsbn || book.isbn}
                title={book.koreanTitle}
                source={book.source}
                originalIsbn={book.isbn !== book.koreanIsbn ? book.isbn : undefined}
                cachedUrl={
                  CONFIRMED_COVERS[book.koreanIsbn]?.url ||
                  CONFIRMED_COVERS[book.isbn]?.url
                }
              />
            </div>

            {(() => {
              const isAward = AWARD_SOURCES.has(book.source);
              const isWinner = book.awardCategory === "Winner";
              const badgeClass = isAward
                ? (isWinner ? "badge-award-winner" : "badge-award-honor")
                : (SOURCE_CONFIG[book.source]?.badgeClass || "badge-default");
              return (
                <div className="badge-row">
                  <div className={`source-badge ${badgeClass}`}>
                    {isAward && isWinner
                      ? <Star size={11} />
                      : isAward
                      ? <Medal size={11} />
                      : <BookOpen size={11} />}
                    {book.sourceLabel}
                    {book.awardYear && (
                      <span className="award-year-inline">{book.awardYear}</span>
                    )}
                  </div>
                  {book.additionalSources?.map((src) => (
                    <div key={src}
                      className={`source-badge source-badge-sm ${SOURCE_CONFIG[src]?.badgeClass || "badge-default"}`}>
                      <BookOpen size={10} />
                      {SOURCE_CONFIG[src]?.label.replace(/^[^\s]+\s/, "") || src}
                    </div>
                  ))}
                </div>
              );
            })()}

            <h3 className="book-title" style={{ cursor: "pointer" }} onClick={() => openDetail(book)}>{book.koreanTitle}</h3>
            {book.originalTitle && book.originalTitle !== book.koreanTitle && (
              <div className="book-original">{book.originalTitle}</div>
            )}

            <div className="book-meta">
              <span>{book.author}</span>
            </div>

            {book.aiReason && (
              <div className="ai-reason">
                <Sparkles size={12} />
                <span>{book.aiReason}</span>
              </div>
            )}
            {!book.aiReason && book.hook && (
              <div className="hook-text">{book.hook}</div>
            )}
            {!book.aiReason && !book.hook && (() => {
              // hook 없을 때 fallback: 태그 조합 → 없으면 줄거리 유도
              const allTags = [
                ...(book.situationTags || []),
                ...(book.emotionTags   || []),
                ...(book.topicTags     || []),
                ...(book.tags          || []),
              ];
              const unique = [...new Set(allTags)].slice(0, 4);
              if (unique.length >= 2) {
                return (
                  <div className="hook-text hook-text-auto">
                    {unique.join(", ")} 등을 담은 책이에요.
                  </div>
                );
              }
              return (
                <div className="hook-text hook-text-hint" onClick={() => openDetail(book)}>
                  📖 줄거리 보기를 눌러 내용을 확인하세요
                </div>
              );
            })()}

            {(book.targetAge || book.tags.length > 0) && (
              <div className="tags-container">
                {book.targetAge && (
                  <span className={`tag-chip tag-chip-age ${book.targetAge === "어린이" ? "tag-chip-age-broad" : ""}`}>
                    {ageLabel(book.targetAge)}
                  </span>
                )}
                {book.activity && book.activity.trim() && (
                  <span className="tag-chip tag-chip-activity">✏️ 독서활동</span>
                )}
                {getBookFormats(book).map(fmt => (
                  <span key={fmt.key} className="tag-chip tag-chip-format" title={fmt.label}>
                    {fmt.emoji} {fmt.label}
                  </span>
                ))}
                {book.tags.slice(0, 5).map((t, i) => (
                  <button key={i} className="tag-chip" onClick={() => { setQuery(t); resetAi(); }}>
                    #{t}
                  </button>
                ))}
              </div>
            )}

            <div className="card-btns">
              <button className="detail-btn" onClick={() => openDetail(book)}>
                <BookOpen size={13} />
                줄거리 보기
              </button>
              <button className="library-btn" onClick={() => handleCheckLibrary(book)}>
                <Library size={13} />
                도서관 확인
              </button>
            </div>
          </div>
        ))}

        {books.length === 0 && (
          <div className="empty-state">
            {searchMode === "ai" ? (
              <>
                <Sparkles size={36} className="empty-ai-icon" />
                <p>"{query}"에 맞는 책을 찾지 못했어요.</p>
                <small>좀 더 구체적인 상황으로 다시 물어보세요.</small>
                <div className="empty-ai-suggestions">
                  <span>이렇게 바꿔보세요 →</span>
                  {["전학 가서 외로운 아이에게", "용기가 필요한 순간에", "동생이 생긴 아이에게"].map((ex) => (
                    <button key={ex} className="ai-example-chip"
                      onClick={() => handleAiSearch(ex)}>{ex}</button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <BookOpen size={38} />
                <p>검색 결과가 없습니다.</p>
                <small>제목·작가 이름을 확인하거나, <strong>AI 상황 추천</strong> 탭을 사용해 보세요.</small>
              </>
            )}
          </div>
        )}
      </section>

      {/* 더보기 */}
      {!aiMode && !showAll && totalFiltered > 60 && (
        <div style={{ textAlign: "center", paddingBottom: "3rem" }}>
          <button className="show-more-btn" onClick={() => setShowAll(true)}>
            <ChevronDown size={16} /> 전체 {totalFiltered.toLocaleString()}권 보기
          </button>
        </div>
      )}

      {/* 상세 모달 (줄거리) */}
      {detailBook && (
        <div className="modal-overlay" onClick={() => setDetailBook(null)}>
          <div className="modal detail-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setDetailBook(null)}>
              <X size={18} />
            </button>
            <div className="detail-header">
              <div className="detail-cover">
                <BookCover
                  isbn={detailBook.koreanIsbn || detailBook.isbn}
                  title={detailBook.koreanTitle}
                  source={detailBook.source}
                  originalIsbn={detailBook.isbn !== detailBook.koreanIsbn ? detailBook.isbn : undefined}
                  cachedUrl={
                    CONFIRMED_COVERS[detailBook.koreanIsbn]?.url ||
                    CONFIRMED_COVERS[detailBook.isbn]?.url
                  }
                />
              </div>
              <div className="detail-info">
                <h2 className="modal-title">{detailBook.koreanTitle}</h2>
                {detailBook.originalTitle && detailBook.originalTitle !== detailBook.koreanTitle && (
                  <div style={{ fontSize: ".82rem", color: "#64748b", marginBottom: ".4rem" }}>{detailBook.originalTitle}</div>
                )}
                <p className="modal-sub">{detailBook.author}</p>
                {detailBook.awardName && (
                  <div className="detail-award">{detailBook.sourceLabel} {detailBook.awardYear && `(${detailBook.awardYear})`}</div>
                )}
                {detailBook.targetAge && (
                  <div className="detail-age">
                    대상 연령: {ageLabel(detailBook.targetAge)}
                    {detailBook.targetAge === "어린이" && (
                      <span className="age-broad-note"> (출처 분류 기준)</span>
                    )}
                  </div>
                )}
                <div className="detail-tags">
                  {detailBook.tags.slice(0, 8).map((t, i) => (
                    <span key={i} className="tag-chip">#{t}</span>
                  ))}
                </div>
                <button className="library-btn" style={{ marginTop: ".8rem" }} onClick={() => { setDetailBook(null); handleCheckLibrary(detailBook); }}>
                  <Library size={13} />
                  대출 가능 도서관 확인
                </button>
              </div>
            </div>

            <div className="detail-summary-section">
              <div className="detail-section-title">📖 줄거리</div>
              {summaryLoading ? (
                <div className="lib-loading">
                  <Loader2 size={18} className="spin" />
                  <span>AI가 줄거리를 요약하고 있어요…</span>
                </div>
              ) : summary ? (
                <p className="detail-summary">{summary}</p>
              ) : (
                <p className="detail-summary" style={{ color: "#94a3b8" }}>줄거리 정보를 불러오지 못했어요.</p>
              )}
            </div>

            {detailBook.activity && detailBook.activity.trim() && (
              <div className="detail-activity-section">
                <div className="detail-section-title">✏️ 독서 후 활동</div>
                <p className="detail-activity">{detailBook.activity}</p>
              </div>
            )}

            {detailBook.hook && (
              <div className="detail-hook-section">
                <div className="detail-section-title">💬 한줄 소개</div>
                <p className="detail-hook">{detailBook.hook}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 도서관 모달 */}
      {selectedBook && (
        <div className="modal-overlay" onClick={() => setSelectedBook(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedBook(null)}>
              <X size={18} />
            </button>
            <h2 className="modal-title">{selectedBook.koreanTitle}</h2>
            <p className="modal-sub">{selectedBook.author} · ISBN {selectedBook.isbn}</p>

            {!userLocation && (
              <div className="location-hint">
                <MapPin size={13} />
                <span>📍 위치 허용하면 <strong>2km 이내 가까운 도서관</strong> 순으로 표시돼요</span>
                <button onClick={handleGetLocationInModal}>위치 허용 후 재검색</button>
              </div>
            )}
            {userLocation && (
              <div className="location-active">
                <MapPin size={13} />
                <span>내 위치 기준 2km 이내 · 가까운 순</span>
              </div>
            )}

            {libLoading && (
              <div className="lib-loading">
                <Loader2 size={22} className="spin" />
                <span>도서관 조회 중…</span>
              </div>
            )}
            {!libLoading && libraries.length === 0 && (
              <div className="lib-empty">
                소장 도서관을 찾지 못했습니다.<br />
                <small>도서관정보나루에 등록되지 않은 도서일 수 있어요.</small>
              </div>
            )}
            {!libLoading && libraries.length > 0 && (
              <div className="lib-data-note">
                📡 도서관정보나루 API 기준 · 실시간과 다를 수 있어요
              </div>
            )}
            {!libLoading && libraries.map((lib, i) => (
              <div key={i} className="lib-card">
                <div className="lib-header">
                  <span className="lib-name">{lib.libName}</span>
                  <span className={`loan-badge ${lib.loanAvailable ? "available" : "unavailable"}`}>
                    {lib.loanAvailable ? "대출 가능" : "대출 중"}
                  </span>
                </div>
                <div className="lib-addr">{lib.address}</div>
                {lib.distance !== undefined && (
                  <div className="lib-dist">📍 {lib.distance.toFixed(1)}km</div>
                )}
                {lib.tel && <div className="lib-tel">📞 {lib.tel}</div>}
                {lib.homepage && (
                  <a className="lib-link" href={lib.homepage} target="_blank" rel="noopener noreferrer">
                    홈페이지에서 직접 확인 →
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
