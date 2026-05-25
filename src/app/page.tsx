"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Search, MapPin, Library, BookOpen, Star, Medal,
  Sparkles, X, ChevronDown, Loader2, Info,
} from "lucide-react";
import { getRelatedKeywords } from "../lib/smartSearch";
import libraryCounts from "../data/library_counts.json";
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
  libCode?: string;
  libName: string; address: string; tel: string; homepage: string;
  bookSearchUrl?: string | null;
  loanAvailable: boolean; distance?: number;
}

interface SmallLibInfo {
  libName: string; address: string; manageCode: string;
  homepage?: string | null; bookSearchUrl?: string | null;
  loanAvailable: boolean; distance?: number; isSmall: true;
}

// ─── 책 형태 배지 ─────────────────────────────
const FORMAT_RULES = [
  { key: "wordless",   emoji: "🔤", label: "글없는그림책",
    patterns: ["글 없이", "글없는", "글자 없", "그림만으로", "말 없이", "글이 없", "무언의 그림책", "글 없는 그림"] },
  { key: "photo",      emoji: "📷", label: "사진그림책",
    patterns: ["사진으로 만든", "실제 사진", "포토그래피", "사진 그림책", "사진을 활용"] },
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

const SOURCE_CONFIG: Record<string, { label: string; chipClass: string; badgeClass: string; desc: string }> = {
  "칼데콧":          { label: "🏅 칼데콧",        chipClass: "active-gold",    badgeClass: "badge-caldecott", desc: "미국 최고 그림책 일러스트레이터상. 매년 ALA가 미국 아동 그림책 작가에게 수여. 세계적으로 인정받는 그림책이 많습니다." },
  "안데르센":        { label: "🌟 안데르센",       chipClass: "active-teal",    badgeClass: "badge-andersen",  desc: "세계 아동문학의 노벨상. 글작가·그림작가 부문으로 나뉘어 2년마다 수상. 전 세계 우수 아동도서 작가를 선정합니다." },
  "볼로냐":          { label: "🎨 볼로냐",         chipClass: "active-orange",  badgeClass: "badge-bologna",   desc: "이탈리아 볼로냐 국제아동도서전 최우수상. Fiction·Non-fiction·Comics·New Horizons 등 부문별 수상. 예술성 높은 그림책이 많습니다." },
  "카네기":          { label: "📖 카네기",         chipClass: "active-purple",  badgeClass: "badge-carnegie",  desc: "영국 최고 권위의 아동문학상. 어린이·청소년 소설 중심이며 Illustration 부문도 있습니다." },
  "국립어린이도서관": { label: "📚 국립어린이도서관", chipClass: "active-green",   badgeClass: "badge-national",  desc: "국립어린이청소년도서관 사서 추천도서. 어린이·청소년 대상 균형 잡힌 독서 목록입니다." },
  "서울시교육청":    { label: "🏫 서울시교육청",    chipClass: "active",         badgeClass: "badge-edu",       desc: "서울시교육청 교사 추천 도서. 유아~청소년 전 연령 포괄하며 문학·사회·과학 분야가 고루 포함됩니다." },
  "서울어린이도서관": { label: "🌸 서울어린이도서관", chipClass: "active-pink",    badgeClass: "badge-seoul",     desc: "서울어린이도서관협의회 테마 추천 도서. 이웃·가족 등 생활 주제 중심으로 선정한 그림책·동화가 많습니다." },
  "국립중앙도서관":  { label: "🏛️ 국립중앙도서관",  chipClass: "active-indigo",  badgeClass: "badge-nlcf",      desc: "국립중앙도서관 사서 추천 우수 문학 도서. 초등 고학년·청소년 대상 문학 작품 중심입니다." },
  "교과연계도서":    { label: "📝 교과연계도서",    chipClass: "active-brown",   badgeClass: "badge-cur",       desc: "서울시교육청 초등 1~6학년 교과서 연계 도서. 국어·수학·사회·과학 등 교과목별로 분류되어 있습니다." },
};

// 수상 출처 (뱃지 금/은 구분 적용)
const AWARD_SOURCES = new Set(["칼데콧", "안데르센", "볼로냐", "카네기"]);

// 연령 순서 정의
// "어린이"(3,716권)는 출처에서 세분화 없이 제공 → "전체 어린이"로 표시, 필터에는 포함
const AGE_ORDER = ["6-7세", "초등1-2", "초등3-4", "초등5-6", "청소년", "어린이"];

// "어린이" → UI 표시용 레이블
function ageLabel(age: string): string {
  return age === "어린이" ? "어린이" : age;
}
const AGE_TOOLTIP: Record<string, string> = {
  "6-7세":   "유아·유치원~초등 저학년 대상 그림책",
  "초등1-2": "초등학교 1~2학년 대상",
  "초등3-4": "초등학교 3~4학년 대상",
  "초등5-6": "초등학교 5~6학년 대상",
  "청소년":  "중학교~고등학교 청소년 대상",
  "어린이":  "초등 전 학년 (1~6학년) 대상 · 일부 5~7세 포함",
};

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
  const [summaryIsEstimate, setSummaryIsEstimate] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [showActivityOnly, setShowActivityOnly] = useState(false);
  const [showAbout,        setShowAbout]        = useState(false);
  const [activeTags,       setActiveTags]       = useState<string[]>([]);
  const [libraries,      setLibraries]      = useState<LibraryInfo[]>([]);
  const [libLoading,     setLibLoading]     = useState(false);
  const [smallLibraries,    setSmallLibraries]    = useState<SmallLibInfo[]>([]);
  const [smallLibLoading,   setSmallLibLoading]   = useState(false);
  const [userLocation,   setUserLocation]   = useState<{lat:number;lng:number}|null>(null);
  const [locationLabel,  setLocationLabel]  = useState("내 위치로 도서관 찾기");
  const [locationError,  setLocationError]  = useState("");
  const [showAll,        setShowAll]        = useState(false);
  const [sortModes,      setSortModes]      = useState<Array<"recent"|"multi"|"library">>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const relatedTags = useMemo(() => {
    if (!query.trim() || aiMode || searchMode === "ai") return [];
    const tagCount: Record<string, number> = {};
    books.forEach((b) => b.tags.forEach((t) => { tagCount[t] = (tagCount[t] || 0) + 1; }));
    const topTags = Object.entries(tagCount)
      .filter(([t]) => !activeTags.includes(t) && t.toLowerCase() !== query.trim().toLowerCase())
      .sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t]) => t);
    return getRelatedKeywords(query, topTags).filter((t) => !activeTags.includes(t)).slice(0, 8);
  }, [query, books, activeTags, aiMode, searchMode]);

  // ── 가용 연령 목록 ──────────────────────────
  const availableAges = AGE_ORDER.filter((a) =>
    booksWithIsbn.some((b) => b.targetAge === a)
  );

  // ── 일반 필터 ──────────────────────────────
  const filterBooks = useCallback(() => {
    if (aiMode) return;

    const hasFilter = query.trim() || selectedAges.length > 0 || selectedSources.length > 0 || showKoreanOnly || showActivityOnly || activeTags.length > 0 || sortModes.length > 0;

    // 아무 필터·검색어도 없으면 초기 큐레이션 화면 (출처 다양 + 표지 있는 책)
    if (!hasFilter) {
      setBooks(INITIAL_BOOKS);
      return;
    }

    let filtered = booksWithIsbn;

    if (showKoreanOnly)
      filtered = filtered.filter((b) => b.koreanIsbn && b.koreanIsbn.length > 0);
    // 독서활동 있음: 활동 자료 보유 책을 상단 우선 정렬
    // (기관추천도서엔 활동 데이터 없음 → 제외가 아닌 하단 배치)
    if (showActivityOnly) {
      const withAct    = filtered.filter((b) => b.activity?.trim());
      const withoutAct = filtered.filter((b) => !b.activity?.trim());
      filtered = [...withAct, ...withoutAct];
    }

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

    if (activeTags.length > 0)
      filtered = filtered.filter((b) =>
        activeTags.every((t) =>
          b.tags.includes(t) || (b.hook || "").includes(t) || b.koreanTitle.includes(t)
        )
      );

    // ── 다중 정렬 적용 (선택 순서 = 우선순위) ──
    if (sortModes.length > 0) {
      const counts = libraryCounts as Record<string, number>;
      filtered = [...filtered].sort((a, b) => {
        for (const mode of sortModes) {
          let diff = 0;
          if (mode === "recent") {
            // publishedYear가 비어있으면 0으로 처리 (awardYear로 대체하지 않음)
            const ya = a.publishedYear ? parseInt(a.publishedYear) : 0;
            const yb = b.publishedYear ? parseInt(b.publishedYear) : 0;
            diff = yb - ya;
          } else if (mode === "multi") {
            // additionalSources 수만 기준 (awardCategory Winner 보너스 제거)
            const sa = (a.additionalSources?.length ?? 0);
            const sb = (b.additionalSources?.length ?? 0);
            diff = sb - sa;
          } else if (mode === "library") {
            const ca = counts[a.koreanIsbn] ?? (a.koreanIsbn ? 0 : -1);
            const cb = counts[b.koreanIsbn] ?? (b.koreanIsbn ? 0 : -1);
            diff = cb - ca;
          }
          if (diff !== 0) return diff;
        }
        return 0;
      });
    }

    setBooks(showAll ? filtered : filtered.slice(0, 60));
  }, [query, selectedAges, selectedSources, showKoreanOnly, showActivityOnly, aiMode, showAll, activeTags, sortModes]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(filterBooks, 220);
  }, [filterBooks]);

  // ── AI 검색 ────────────────────────────────
  const handleAiSearch = async (
    overrideQuery?: string,
    overrideFilters?: { koreanOnly?: boolean; ages?: string[]; sources?: string[] }
  ) => {
    const q = overrideQuery ?? query;
    if (!q.trim()) return;
    if (overrideQuery) setQuery(overrideQuery);
    setAiMode(true); setAiLoading(true); setAiError("");

    // 필터 override 지원 (필터 해제 후 즉시 재검색 시 state 반영 전 값 보정)
    const effectiveKoreanOnly = overrideFilters?.koreanOnly  ?? showKoreanOnly;
    const effectiveAges       = overrideFilters?.ages        ?? selectedAges;
    const effectiveSources    = overrideFilters?.sources     ?? selectedSources;

    try {
      // AI에게 보내는 풀: 현재 활성 필터를 먼저 적용 → 필터 범위 안에서만 추천
      const payload = booksWithIsbn
        .filter((b) => b.tags.length > 0)
        .filter((b) => !effectiveKoreanOnly || (b.koreanIsbn && b.koreanIsbn.length > 0))
        .filter((b) => effectiveAges.length === 0    || effectiveAges.includes(b.targetAge))
        .filter((b) => effectiveSources.length === 0 || effectiveSources.includes(b.source))
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

      setBooks(aiBooks);
    } catch {
      setAiError("AI 검색에 실패했습니다. 일반 검색으로 대체합니다.");
      setAiMode(false); filterBooks();
    } finally {
      setAiLoading(false);
    }
  };

  const addActiveTag = (tag: string) => {
    setActiveTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    setAiMode(false);
  };
  const removeActiveTag = (tag: string) => {
    setActiveTags((prev) => prev.filter((t) => t !== tag));
  };

  const resetAi = () => { setAiMode(false); setAiEngine(""); setAiError(""); filterBooks(); };

  const switchTab = (mode: "keyword" | "ai") => {
    setSearchMode(mode);
    setQuery("");
    setActiveTags([]);
    setSortModes([]);
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

  // ── 도서관 조회 — 브라우저에서 data4library.kr 직접 호출 (CORS: *) ──
  // Vercel 서버 경유 시 "IP 등록 필요" 오류 발생 → 클라이언트 직접 호출로 우회
  const fetchLibraries = useCallback(async (book: Book, loc: { lat: number; lng: number } | null) => {
    setLibLoading(true);
    try {
      const LIB_KEY = "be9456f40126dbefd5c69c0a647affe45f49a41766a6b10c5919c531810fe1ef";
      const BASE_LIB = "https://data4library.kr/api";
      const isbn = book.koreanIsbn || book.isbn;
      if (!isbn) { setLibraries([]); return; }

      // Haversine 거리 (km)
      const calcDist = (la1: number, lo1: number, la2: number, lo2: number) => {
        const R = 6371, dLa = (la2 - la1) * Math.PI / 180, dLo = (lo2 - lo1) * Math.PI / 180;
        const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      };

      // 위경도 → 지역코드
      const regionFromCoords = (la: number, lo: number): string => {
        if (la > 37.40 && la < 37.71 && lo > 126.79 && lo < 127.19) return "11";
        if (la > 37.27 && la < 37.63 && lo > 126.44 && lo < 126.80) return "23";
        if (la > 36.90 && la < 38.31 && lo > 126.30 && lo < 127.90) return "31";
        if (la > 36.19 && la < 36.52 && lo > 127.29 && lo < 127.51) return "25";
        if (la > 36.40 && la < 36.62 && lo > 127.17 && lo < 127.32) return "29";
        if (la > 35.73 && la < 36.03 && lo > 128.50 && lo < 128.78) return "22";
        if (la > 35.04 && la < 35.30 && lo > 128.86 && lo < 129.32) return "21";
        if (la > 35.44 && la < 35.64 && lo > 129.04 && lo < 129.42) return "26";
        if (la > 35.05 && la < 35.27 && lo > 126.78 && lo < 126.97) return "24";
        if (la > 37.00 && la < 38.60 && lo > 127.70 && lo < 129.40) return "32";
        if (la > 36.20 && la < 37.20 && lo > 127.40 && lo < 128.50) return "33";
        if (la > 36.00 && la < 37.00 && lo > 126.10 && lo < 127.40) return "34";
        if (la > 35.30 && la < 36.20 && lo > 126.50 && lo < 127.80) return "35";
        if (la > 34.20 && la < 35.30 && lo > 126.00 && lo < 127.60) return "36";
        if (la > 35.50 && la < 37.30 && lo > 128.40 && lo < 129.50) return "37";
        if (la > 34.70 && la < 35.70 && lo > 127.60 && lo < 129.10) return "38";
        if (la > 33.10 && la < 33.60 && lo > 126.10 && lo < 126.95) return "39";
        return "11";
      };

      // libSrchByBook 1회 호출
      type RawLib = { lib: { libCode: string; libName: string; address: string; tel: string; homepage: string; latitude: string; longitude: string } };
      const fetchLibs = async (region: string, pageSize = 10): Promise<RawLib[]> => {
        try {
          const url = `${BASE_LIB}/libSrchByBook?authKey=${LIB_KEY}&isbn=${isbn}&region=${region}&pageSize=${pageSize}&format=json`;
          const res = await fetch(url);
          const data = await res.json();
          return (data?.response?.libs ?? []) as RawLib[];
        } catch { return []; }
      };

      // 지역 결정 및 검색
      let rawLibs: RawLib[] = [];
      if (loc) {
        const region = regionFromCoords(loc.lat, loc.lng);
        rawLibs = await fetchLibs(region, 30);
        if (rawLibs.length < 3) {
          const extras = await Promise.all(
            ["11", "31"].filter(r => r !== region).map(r => fetchLibs(r, 10))
          );
          rawLibs = [...rawLibs, ...extras.flat()];
        }
      } else {
        const [a, b] = await Promise.all([fetchLibs("11", 10), fetchLibs("31", 10)]);
        rawLibs = [...a, ...b];
        if (!rawLibs.length) {
          const extras = await Promise.all(["21","22","23","24","25","26"].map(r => fetchLibs(r, 5)));
          rawLibs = extras.flat();
        }
      }

      // 중복 제거 → 거리 계산 → 상위 5개
      const seen = new Set<string>();
      const uniq = rawLibs.filter(({ lib }) => { if (seen.has(lib.libCode)) return false; seen.add(lib.libCode); return true; });
      const withDist = uniq.map(({ lib }) => ({
        ...lib,
        distance: loc ? calcDist(loc.lat, loc.lng, parseFloat(lib.latitude || "0"), parseFloat(lib.longitude || "0")) : undefined,
      }));
      if (loc) withDist.sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999));
      const top5 = withDist.slice(0, 5);

      if (!top5.length) { setLibraries([]); return; }

      // bookExist 병렬 확인
      const buildUrl = (hp: string) => `${hp.replace(/\/$/, "")}/search/tot/result?searchType=SIMPLE&searchKey=ISBN&searchValue=${isbn}`;
      const results = await Promise.all(
        top5.map(async lib => {
          try {
            const url = `${BASE_LIB}/bookExist?authKey=${LIB_KEY}&libCode=${lib.libCode}&isbn13=${isbn}&format=json`;
            const res  = await fetch(url);
            const data = await res.json();
            const r    = data?.response?.result ?? {};
            if (r.hasBook === "N") return null;
            return {
              libName: lib.libName, address: lib.address, tel: lib.tel,
              homepage: lib.homepage,
              bookSearchUrl: lib.homepage ? buildUrl(lib.homepage) : null,
              distance: lib.distance,
              loanAvailable: r.loanAvailable === "Y",
            };
          } catch { return null; }
        })
      );

      const finalLibs = results.filter((x): x is NonNullable<typeof x> => x !== null);
      setLibraries(
        finalLibs.length
          ? finalLibs
          : top5.map(lib => ({
              libName: lib.libName, address: lib.address, tel: lib.tel,
              homepage: lib.homepage,
              bookSearchUrl: lib.homepage ? buildUrl(lib.homepage) : null,
              distance: lib.distance,
              loanAvailable: false,
            }))
      );
    } catch { setLibraries([]); }
    finally { setLibLoading(false); }
  }, []);

  // ── 작은도서관 조회 (knu.nl.go.kr 서버 경유) ──────────────────────
  const fetchSmallLibraries = useCallback(async (book: Book, loc: { lat: number; lng: number } | null) => {
    if (!loc) { setSmallLibraries([]); return; }
    const isbn = book.koreanIsbn || book.isbn;
    if (!isbn) { setSmallLibraries([]); return; }
    setSmallLibLoading(true);
    try {
      const res = await fetch(`/api/smalllibs?isbn=${isbn}&lat=${loc.lat}&lng=${loc.lng}`);
      const data = await res.json();
      setSmallLibraries(data.libraries ?? []);
    } catch { setSmallLibraries([]); }
    finally { setSmallLibLoading(false); }
  }, []);

  const handleCheckLibrary = (book: Book) => {
    setSelectedBook(book); setLibraries([]); setSmallLibraries([]);
    fetchLibraries(book, userLocation);
    fetchSmallLibraries(book, userLocation);
  };

  // ── 상세페이지 열기 (줄거리 AI 생성) ──────────
  const openDetail = async (book: Book) => {
    setDetailBook(book);
    setSummary("");
    setSummaryIsEstimate(false);
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
      setSummaryIsEstimate(data.isEstimate === true);
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
        if (selectedBook) {
          fetchLibraries(selectedBook, loc);
          fetchSmallLibraries(selectedBook, loc);
        }
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
        <p className="app-tagline">공공데이터를 활용한 어린이·청소년 도서 탐색 서비스</p>
        <p className="subtitle">
          칼데콧·안데르센 등 국제 아동문학상과 국내 공신력 있는 기관이<br />
          직접 감별한 도서 <strong>{allBooks.length.toLocaleString()}권</strong> 중에서,<br />
          인기순이 아닌 <strong>진짜 좋은 책</strong>을 주제·감정·상황으로 찾고<br />
          내 근처 도서관의 <strong>대출 가능 여부</strong>를 바로 확인하세요.
        </p>

        {/* 앱 소개 토글 */}
        <button className="about-toggle" onClick={() => setShowAbout(v => !v)}>
          <Info size={13} /> 이 앱에 대해 {showAbout ? "▲" : "▼"}
        </button>
        {showAbout && (
          <div className="about-panel">
            <div className="about-section">
              <strong>📖 이 서비스를 만든 이야기</strong>
              <p>동화구연봉사자로 활동하며 아이들에게 좋은 책을 읽어주고 싶다는 마음, 하지만 <strong>&ldquo;어떤 책이 진짜 좋은 책인가&rdquo;</strong>라는 고민이 늘 있었습니다. 베스트셀러나 인기도서가 아니라, <strong>전문가들이 감별한 책</strong>을 찾고 싶었습니다. 그래서 칼데콧·안데르센 등 세계 권위 있는 아동문학상 수상작과, 국립어린이도서관·서울시교육청 등 <strong>공신력 있는 기관이 엄선한 추천도서</strong>로 목록을 구성했습니다. &ldquo;내 주제에 맞는 책을 빠르게 찾고, 줄거리를 파악해서, 가까운 도서관에서 바로 빌릴 수 있으면&rdquo;이라는 바람도 함께 담았습니다. 매년 국제 시상식이 열리는 <strong>상반기에 업데이트</strong>할 예정입니다.</p>
            </div>
            <div className="about-sources">
              <strong>📚 출처별 특징</strong>
              <ul>
                {Object.entries(SOURCE_CONFIG).map(([src, cfg]) => (
                  <li key={src}><span className="about-src-label">{cfg.label}</span> {cfg.desc}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

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
                <button className="clear-btn" onClick={() => { setQuery(""); setActiveTags([]); resetAi(); }}>
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

          {/* 키워드 탭: 활성 태그 + 연관 태그 */}
          {searchMode === "keyword" && (
            <>
              {activeTags.length > 0 && (
                <div className="active-tags-row">
                  <span className="active-tags-label">AND 검색:</span>
                  {activeTags.map((t) => (
                    <span key={t} className="active-tag-pill">
                      #{t}
                      <button onClick={() => removeActiveTag(t)}><X size={9} /></button>
                    </span>
                  ))}
                  {activeTags.length > 1 && (
                    <button className="active-tag-clear" onClick={() => setActiveTags([])}>전체 해제</button>
                  )}
                </div>
              )}
              {relatedTags.length > 0 && (
                <div className="related-tags-row">
                  <span className="related-tags-label">관련 주제어</span>
                  {relatedTags.map((t) => (
                    <button key={t} className="related-tag-btn" onClick={() => addActiveTag(t)}>
                      +{t}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

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

          {/* 수상·추천 컬렉션 — 핵심 섹션 (상단 배치) */}
          <div className="collection-section">
            <div className="collection-header">
              <span className="collection-title">🏆 수상·추천 컬렉션</span>
              <span className="collection-sub">전체 또는 특정 컬렉션에서 검색</span>
            </div>
            <div className="filter-chips">
              {Object.entries(SOURCE_CONFIG).map(([src, cfg]) => (
                <button
                  key={src}
                  className={`chip ${selectedSources.includes(src) ? cfg.chipClass : ""}`}
                  onClick={() => toggleSource(src)}
                  data-tooltip={AWARD_SOURCES.has(src) ? "최근 20년(2006~2026년) 수상작 기준" : undefined}
                  title={AWARD_SOURCES.has(src) ? undefined : cfg.desc}
                >{cfg.label}</button>
              ))}
            </div>
          </div>

          {/* 연령 필터 */}
          <div className="filter-row">
            <span className="filter-label">연령</span>
            <div className="filter-chips">
              {availableAges.map((age) => (
                <button
                  key={age}
                  className={`chip ${selectedAges.includes(age) ? "active" : ""} ${age === "어린이" ? "chip-age-broad" : ""}`}
                  onClick={() => toggleAge(age)}
                  title={AGE_TOOLTIP[age]}
                >
                  {ageLabel(age)}
                  {age === "어린이" && <span className="chip-age-sub">초등전학년</span>}
                </button>
              ))}
            </div>
          </div>

          {/* 국내출간 + 독서활동 토글 */}
          <div className="filter-row">
            <span className="filter-label">세부 조건</span>
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
                title="독서활동 자료가 있는 책을 상단에 표시합니다 (국제상 수상작 중심)"
              >
                ✏️ 독서활동 우선
              </button>
            </div>
          </div>

          {/* 정렬 (복수 선택 가능 — 선택 순서가 우선순위) */}
          <div className="filter-row sort-row">
            <span className="filter-label">정렬</span>
            <div className="filter-chips" style={{ alignItems: "center", gap: ".35rem" }}>
              {sortModes.length > 0 && (
                <button className="sort-clear-btn" onClick={() => { setSortModes([]); setAiMode(false); }}>
                  초기화
                </button>
              )}
              {(
                [
                  { key: "recent",  label: "📅 최신 출간",      title: "출판연도 기준 최신순으로 정렬" },
                  { key: "multi",   label: "🏆 다수 수상·추천",  title: "여러 기관에서 중복 수상·추천된 책 우선\n수상 부문 Winner 여부도 함께 반영" },
                  { key: "library", label: "📚 도서관 보유수",   title: "전국 도서관 보유 수가 많은 책 우선\n(서울+경기 보유 도서관 합산 기준)" },
                ] as const
              ).map(({ key, label, title }) => {
                const idx = sortModes.indexOf(key);
                const isActive = idx >= 0;
                return (
                  <button
                    key={key}
                    className={`chip sort-chip ${isActive ? "active" : ""}`}
                    onClick={() => {
                      setSortModes((prev) =>
                        prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
                      );
                      setAiMode(false);
                    }}
                    title={title}
                  >
                    {isActive && <span className="sort-priority">{idx + 1}</span>}
                    {label}
                  </button>
                );
              })}
              {sortModes.length > 1 && (
                <span className="sort-hint">← 왼쪽부터 주정렬</span>
              )}
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
                  <button key={i} className="tag-chip" onClick={() => addActiveTag(t)}>
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
                <small>
                  {showKoreanOnly || selectedAges.length > 0 || selectedSources.length > 0
                    ? "필터 범위 안에서 적합한 책을 찾지 못했어요. 필터를 해제하거나 검색어를 바꿔보세요."
                    : "좀 더 구체적인 상황으로 다시 물어보세요."}
                </small>
                {(showKoreanOnly || selectedAges.length > 0 || selectedSources.length > 0) && (
                  <button className="ai-clear-filter-btn"
                    onClick={() => {
                      setShowKoreanOnly(false);
                      setSelectedAges([]);
                      setSelectedSources([]);
                      // state 업데이트 전에 override로 즉시 재검색
                      handleAiSearch(query, { koreanOnly: false, ages: [], sources: [] });
                    }}>
                    필터 모두 해제하고 다시 검색
                  </button>
                )}
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
                <>
                  {summaryIsEstimate && (
                    <p style={{ fontSize: ".72rem", color: "#f59e0b", marginBottom: ".5rem",
                      background: "#fffbeb", border: "1px solid #fde68a", borderRadius: ".4rem",
                      padding: ".3rem .6rem", display: "inline-block" }}>
                      ⚠️ 국내 미출간 원서로 AI가 추정한 줄거리입니다. 실제 내용과 다를 수 있어요.
                    </p>
                  )}
                  <p className="detail-summary">{summary}</p>
                </>
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
                {(lib.bookSearchUrl || lib.homepage) && (
                  <a className="lib-link"
                    href={lib.bookSearchUrl || lib.homepage}
                    target="_blank" rel="noopener noreferrer">
                    도서관에서 이 책 바로 검색 →
                  </a>
                )}
              </div>
            ))}

            {/* ── 작은도서관 섹션 ── */}
            {userLocation && (
              <>
                <div className="small-lib-section-header">
                  📚 근처 작은도서관
                  <span className="small-lib-note">작은도서관 정보누리 기준</span>
                </div>
                {smallLibLoading && (
                  <div className="lib-loading">
                    <Loader2 size={18} className="spin" />
                    <span>작은도서관 조회 중…</span>
                  </div>
                )}
                {!smallLibLoading && smallLibraries.length === 0 && (
                  <div className="lib-empty small-lib-empty">
                    근처 작은도서관에서 소장 정보를 찾지 못했어요.
                  </div>
                )}
                {!smallLibLoading && smallLibraries.map((lib, i) => (
                  <div key={i} className="lib-card small-lib-card">
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
                    {lib.bookSearchUrl && (
                      <a className="lib-link"
                        href={lib.bookSearchUrl}
                        target="_blank" rel="noopener noreferrer">
                        작은도서관 바로가기 →
                      </a>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
