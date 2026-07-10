"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Search, MapPin, Library, BookOpen, Award, Medal, BadgeCheck, Pencil,
  Sparkles, X, ChevronDown, Loader2, Info,
} from "lucide-react";
import { getRelatedKeywords, tokenize, calcRelevance, rankByRelevance, rankForAi, countIntlAwards, recommendationCount, awardWeight, recommendationWeight, libraryWeight, calcWeight, getLibRank, INTL_AWARD_NAMES } from "../lib/smartSearch";
import libraryCounts from "../data/library_counts.json";
import booksData from "../data/books.json";
import confirmedCoversData from "../data/confirmed_covers.json";
import BookCover from "../components/BookCover";
import ReadingActivity from "../components/ReadingActivity";

// ─── 타입 ────────────────────────────────────
interface Book {
  id: string; source: string; sourceLabel: string;
  awardYear: string; awardName: string; awardCategory: string; awardSubCategory?: string;
  originalTitle: string; koreanTitle: string;
  author: string; authorSearch?: string; publisher: string; publishedYear: string;
  isbn: string; koreanIsbn: string; targetAge: string;
  tags: string[]; situationTags: string[]; emotionTags: string[]; topicTags: string[];
  hook: string; notice: string; activity: string; country: string;
  additionalSources?: string[];
  aiReason?: string;
  // 메타 배치 생성 필드 (그림책 중심)
  ageGroup?: string; bookType?: string; isPictureBook?: boolean;
  summary?: string; summaryEstimate?: boolean; _excluded?: boolean;
  companions?: { title: string; original?: string }[];
  // 가중치 필드 (다중 수상·추천 모델)
  awardCount?: number;
  sources?: string[];
  sourceLabels?: string[];
  awards?: { name: string; year: string; category: string }[];
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
  { key: "collage",    emoji: "✂️", label: "콜라주그림책",
    patterns: ["콜라주", "오려 만든", "거리에서 주운", "실물 재료"] },
  { key: "monochrome", emoji: "⬛", label: "흑백그림책",
    patterns: ["흑백 그림", "흑백의", "흑백으로", "검정과 흰"] },
  { key: "vertical",   emoji: "📐", label: "세로판형",
    patterns: ["길쭉한 그림", "세로로 읽", "세로 방향"] },
  { key: "rotate",     emoji: "🔄", label: "돌려읽기",
    patterns: ["옆으로 돌려", "책을 돌리", "돌려서 읽"] },
  { key: "panorama",   emoji: "📜", label: "병풍책",
    patterns: ["병풍", "펼치면 이어지", "컷아웃을 통해", "아코디언"] },
  { key: "clay",       emoji: "🫙", label: "점토그림책",
    patterns: ["점토", "클레이", "조각으로 만든"] },
  { key: "woodcut",    emoji: "🎨", label: "판화그림책",
    patterns: ["판화", "목판화", "스크래치보드"] },
];

function getBookFormats(book: Book) {
  const tagSet = new Set(book.tags || []);
  return FORMAT_RULES.filter(rule => tagSet.has(rule.label));
}

// ─── 상수 ────────────────────────────────────
const allBooks = booksData as Book[];

// ISBN 있는 책만 (서울어린이도서관 300권 제외)
const booksWithIsbn = allBooks.filter((b) => (b.isbn || b.koreanIsbn) && b.isPictureBook === true && b.ageGroup !== "비대상" && !b._excluded);

// ── 검색어 라우팅용: '구체어 신호' 강도 ────────────────────────
// 검색어 토큰이 태그·제목에 직접 매칭되는 책 수. 5권 이상이면 조기 종료.
// 이 수가 충분하면(구체어) 키워드 검색으로 충분 → AI 자동호출을 생략한다.
const AI_ROUTE_THRESHOLD = 5;
function strongKeywordHits(q: string): number {
  const toks = tokenize(q);
  if (toks.length === 0) return 0;
  let n = 0;
  for (const b of booksWithIsbn) {
    const title = (b.koreanTitle || b.originalTitle || "").toLowerCase();
    const tags = (b.tags || []).map((t) => t.toLowerCase());
    if (toks.some((tk) => title.includes(tk) || tags.some((t) => t === tk || t.includes(tk)))) {
      n++;
      if (n >= AI_ROUTE_THRESHOLD) return n;
    }
  }
  return n;
}

const SOURCE_CONFIG: Record<string, { label: string; chipClass: string; badgeClass: string; desc: string }> = {
  "칼데콧":          { label: "칼데콧",        chipClass: "active-gold",    badgeClass: "badge-caldecott", desc: "미국 최고 그림책 일러스트레이터상. 매년 ALA가 미국 아동 그림책 작가에게 수여. 세계적으로 인정받는 그림책이 많습니다." },
  "안데르센":        { label: "안데르센",       chipClass: "active-teal",    badgeClass: "badge-andersen",  desc: "세계 아동문학의 노벨상. 글작가·그림작가 부문으로 나뉘어 2년마다 수상. 전 세계 우수 아동도서 작가를 선정합니다." },
  "볼로냐":          { label: "볼로냐",         chipClass: "active-orange",  badgeClass: "badge-bologna",   desc: "이탈리아 볼로냐 국제아동도서전 최우수상. Fiction·Non-fiction·Comics·New Horizons 등 부문별 수상. 예술성 높은 그림책이 많습니다." },
  "카네기":          { label: "카네기",         chipClass: "active-purple",  badgeClass: "badge-carnegie",  desc: "영국 최고 권위의 아동문학상(요토 카네기). 일러스트레이션 부문(옛 케이트 그린어웨이상) 수상작을 포함합니다." },
  "국립어린이도서관": { label: "국립어린이도서관", chipClass: "active-green",   badgeClass: "badge-national",  desc: "국립어린이청소년도서관 사서 추천도서. 어린이·청소년 대상 균형 잡힌 독서 목록입니다." },
  "서울시교육청":    { label: "서울시교육청",    chipClass: "active",         badgeClass: "badge-edu",       desc: "서울시교육청 교사 추천 도서. 유아~청소년 전 연령 포괄하며 문학·사회·과학 분야가 고루 포함됩니다." },
  "서울어린이도서관": { label: "서울어린이도서관", chipClass: "active-pink",    badgeClass: "badge-seoul",     desc: "서울어린이도서관협의회 테마 추천 도서. 이웃·가족 등 생활 주제 중심으로 선정한 그림책·동화가 많습니다." },
  "국립중앙도서관":  { label: "국립중앙도서관",  chipClass: "active-indigo",  badgeClass: "badge-nlcf",      desc: "국립중앙도서관 사서 추천 우수 문학 도서. 초등 고학년·청소년 대상 문학 작품 중심입니다." },
  "교과연계도서":    { label: "교과연계도서",    chipClass: "active-brown",   badgeClass: "badge-cur",       desc: "서울시교육청 초등 1~6학년 교과서 연계 도서. 국어·수학·사회·과학 등 교과목별로 분류되어 있습니다." },
  "학교도서관저널":  { label: "학교도서관저널",  chipClass: "active-slate",   badgeClass: "badge-jnl",       desc: "학교도서관저널 사서 추천도서. 어린이·청소년 도서 전문 잡지에서 선정한 추천목록입니다." },
  "뉴베리":         { label: "뉴베리",          chipClass: "active-amber",   badgeClass: "badge-newbery",   desc: "미국 최고 권위의 아동문학상. 매년 ALA가 가장 탁월한 미국 아동도서에 수여합니다." },
  "그린어웨이":     { label: "그린어웨이",      chipClass: "active-lime",    badgeClass: "badge-greenaway", desc: "영국 최고의 아동 그림책 일러스트상. 케이트 그린어웨이상으로도 알려진 영국판 칼데콧입니다." },
  "세종도서":       { label: "세종도서",         chipClass: "active-teal",    badgeClass: "badge-sejong",    desc: "문화체육관광부 선정 세종도서. 매년 우수 교양·문학나눔 도서를 선정합니다." },
  "행복한아침독서": { label: "행복한아침독서", chipClass: "active-rose", badgeClass: "badge-achim", desc: "㈔행복한아침독서 아침독서 추천도서. 교사·동네책방 운영자 등 선정위원이 학교·가정의 아침독서를 위해 고른 추천목록입니다. 유아~초등을 두루 포함합니다." },
  "어린이도서연구회": { label: "어린이도서연구회", chipClass: "active", badgeClass: "badge-default", desc: "어린이도서연구회가 선정한 추천 그림책. 1995년부터 좋은 어린이책을 가려 뽑아 온 시민단체의 그림책 목록으로, 옛 명작까지 폭넓게 포함합니다." },
};

// 수상 출처 (뱃지 금/은 구분 적용)
const AWARD_SOURCES = new Set(["칼데콧", "안데르센", "볼로냐", "카네기", "뉴베리", "그린어웨이"]);

// 연령 순서 정의
// "어린이"(3,716권)는 출처에서 세분화 없이 제공 → "전체 어린이"로 표시, 필터에는 포함
const AGE_ORDER = ["미취학", "초등저학년", "초등고학년"];

// "어린이" → UI 표시용 레이블
function ageLabel(age: string): string {
  if (age === "미취학") return "미취학 (4-7세)";
  if (age === "초등저학년") return "초등 저학년 (1-3)";
  if (age === "초등고학년") return "초등 고학년 (4-6)";
  return age;
}
const AGE_TOOLTIP: Record<string, string> = {
  "미취학":     "만 4~7세 · 출판사 권장연령과 국내외 도서관·수상 기관의 대상 분류를 종합해 나눈 기준이에요. 그림 중심, 어른이 읽어주기 좋은 책",
  "초등저학년": "초등 1~3학년 · 혼자 읽기를 시작하는 시기 — 또래·학교·일상 이야기 중심으로 분류했어요",
  "초등고학년": "초등 4~6학년 · 사회·역사·정체성 등 생각할 거리가 있는 주제 — 글밥이 있어도 그림책의 힘이 큰 책들이에요",
};

// 카드용 연령 축약 배지
const AGE_SHORT: Record<string, string> = {
  "미취학": "미취학", "초등저학년": "초등저", "초등고학년": "초등고",
};

// 국제 수상명 축약 + 대표 배지 선정 (배지·+N·추천근거 줄 기준 통일)
const AWARD_SHORT: Record<string, string> = {
  "칼데콧": "칼데콧", "안데르센상": "안데르센", "볼로냐라가치상": "볼로냐",
  "카네기상": "카네기", "케이트 그린어웨이상": "그린어웨이", "뉴베리상": "뉴베리",
};
function normAwardCat(cat: string): string {
  if (!cat) return "";
  if (/winner/i.test(cat)) return "Winner";
  if (/honor/i.test(cat)) return "Honor";
  if (/shortlist/i.test(cat)) return "Shortlist";
  if (/mention|nominee/i.test(cat)) return "Mention";
  return cat.replace(/\s+/g, "");
}
/** 등급: 0=Winner·작가상(골드) / 1=Honor / 2=Shortlist 등(실버) */
function awardRank(cat: string): number {
  if (/honor/i.test(cat)) return 1;
  if (/shortlist|mention|nominee/i.test(cat)) return 2;
  return 0;
}
function pickDisplayBadge(book: Book): { label: string; cls: string; gold: boolean; intl: boolean } {
  const intl = (book.awards ?? []).filter((a) => INTL_AWARD_NAMES.has(a.name));
  if (intl.length > 0) {
    const best = [...intl].sort((a, b) =>
      awardRank(a.category) - awardRank(b.category) ||
      (parseInt(b.year) || 0) - (parseInt(a.year) || 0)
    )[0];
    const gold = awardRank(best.category) === 0;
    const label = [AWARD_SHORT[best.name] ?? best.name, normAwardCat(best.category), best.year]
      .filter(Boolean).join(" ");
    return { label, cls: gold ? "badge-seal-gold" : "badge-seal-silver", gold, intl: true };
  }
  const domSrc = (book.sources ?? [book.source]).find((s) => !AWARD_SOURCES.has(s)) ?? book.source;
  return { label: SOURCE_CONFIG[domSrc]?.label ?? domSrc, cls: "badge-neutral", gold: false, intl: false };
}

// 카드 왼쪽 색 띠 — 국제수상 > 사서추천 > 교과연계 순
const LIBRARIAN_SRC = new Set(["국립중앙도서관","국립어린이도서관","서울어린이도서관","세종도서"]);
const CURRIC_SRC    = new Set(["교과연계도서","학교도서관저널","행복한아침독서","서울시교육청","어린이도서연구회"]);
function bookBandColor(book: Book): string {
  if ((book.awards ?? []).some(a => INTL_AWARD_NAMES.has(a.name))) return "#B8860B";
  const srcs = book.sources ?? [book.source];
  if (srcs.some(s => LIBRARIAN_SRC.has(s ?? ""))) return "#0E6E6B";
  if (srcs.some(s => CURRIC_SRC.has(s ?? "")))    return "#B04A5A";
  return "var(--card-border, #e2e8f0)";
}
function bookBandCat(book: Book): string {
  if ((book.awards ?? []).some(a => INTL_AWARD_NAMES.has(a.name))) return "seal-award";
  const srcs = book.sources ?? [book.source];
  if (srcs.some(s => LIBRARIAN_SRC.has(s ?? ""))) return "seal-lib";
  if (srcs.some(s => CURRIC_SRC.has(s ?? "")))    return "seal-edu";
  return "";
}

// 둘러보기 카드 (검색 영역 재디자인)
const COLLECTION_GROUPS = [
  { key: "국제수상", hanja: "賞", title: "국제수상", desc: "세계가 인정한 그림책",
    iconCls: "browse-icon-gold", tip: "볼로냐 · 안데르센 · 카네기 · 칼데콧",
    sources: ["볼로냐", "안데르센", "카네기", "칼데콧"] },
  { key: "사서추천", hanja: "推", title: "사서추천", desc: "도서관·공공기관이 권하는 책",
    iconCls: "browse-icon-teal", tip: "국립중앙 · 국립어린이 · 서울어린이 · 세종도서",
    sources: ["국립중앙도서관", "국립어린이도서관", "서울어린이도서관", "세종도서"] },
  { key: "독서교육", hanja: "讀", title: "독서교육", desc: "교사·독서기관이 권하는 책",
    iconCls: "browse-icon-blue", tip: "교과연계도서 · 서울시교육청 · 어린이도서연구회 · 학교도서관저널 · 행복한아침독서",
    sources: ["교과연계도서", "서울시교육청", "어린이도서연구회", "학교도서관저널", "행복한아침독서"] },
];

const AGE_CARD: Record<string, { title: string; sub: string }> = {
  "미취학":     { title: "미취학",     sub: "4~7세" },
  "초등저학년": { title: "초등 저학년", sub: "1~3학년" },
  "초등고학년": { title: "초등 고학년", sub: "4~6학년" },
};

const FORMAT_BROWSE = [
  { label: "글없는그림책", tip: "글 없이 그림만으로 이야기가 펼쳐지는 책" },
  { label: "병풍책",       tip: "아코디언·병풍처럼 길게 펼쳐지는 판형의 책" },
  { label: "콜라주그림책", tip: "오려 붙이기·혼합 재료(콜라주) 기법으로 그린 책" },
  { label: "판화그림책",   tip: "목판·석판 등 판화 기법으로 찍어 만든 책" },
];

// ─── 배지 레이블 압축 ───────────────────────────────────────
// ─── W1용: 국제 수상 개수 (smartSearch 중앙 함수 재사용) ─────

// ─── 초기 표시용: 표지 확인된 책만, 출처 다양 + 중복수상 최우선 ──────────
const CONFIRMED_COVERS = confirmedCoversData as unknown as Record<string, {
  url: string; title: string; source: string; awardYear?: string; dual?: boolean; id?: string;
}>;

/** 가중치(W1×W2×W3) 기준 내림차순 정렬된 초기 도서 목록 */
function buildInitialBooks(): Book[] {
  // 그림책 중심 풀(booksWithIsbn)만 가중치순 노출
  return [...booksWithIsbn].sort((a, b) => calcWeight(b) - calcWeight(a));
}

const INITIAL_BOOKS = buildInitialBooks();

// ─── 메인 컴포넌트 ────────────────────────────
export default function Home() {
  const [query,           setQuery]          = useState("");
  const [selectedAges,    setSelectedAges]   = useState<string[]>([]);
  const [selectedSources, setSelectedSources]= useState<string[]>([]);
  const [searchMode,      setSearchMode]     = useState<"keyword"|"ai">("keyword");
  const [showKoreanOnly,  setShowKoreanOnly] = useState(false);
  const [books,           setBooks]          = useState<Book[]>(() => INITIAL_BOOKS.slice(0, 60)); // 프리렌더 HTML 경량화: 초기 60권(하이드레이션 후 filterBooks가 동일하게 유지)
  const [resultCount,     setResultCount]    = useState<number>(INITIAL_BOOKS.length);
  const [aiMode,         setAiMode]         = useState(false);
  const [aiEngine,       setAiEngine]       = useState<"claude"|"smart"|"">("");
  const [aiLoading,      setAiLoading]      = useState(false);
  const [aiError,        setAiError]        = useState("");
  const [selectedBook,   setSelectedBook]   = useState<Book | null>(null);
  const [detailBook,     setDetailBook]     = useState<Book | null>(null);
  const [detailAutoActivity, setDetailAutoActivity] = useState(false);
  const [summary,        setSummary]        = useState<string>("");
  const [summaryIsEstimate, setSummaryIsEstimate] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [showActivityOnly, setShowActivityOnly] = useState(false); // 내부 로직용 유지
  const [showAbout,        setShowAbout]        = useState(false);
  const [coverZoom,        setCoverZoom]        = useState<string | null>(null);
  const [orTags,           setOrTags]           = useState<string[]>([]);
  const [andTags,          setAndTags]          = useState<string[]>([]);
  const [expandedGroups,   setExpandedGroups]   = useState<string[]>([]);
  const [libraries,      setLibraries]      = useState<LibraryInfo[]>([]);
  const [libLoading,     setLibLoading]     = useState(false);
  const [smallLibraries,    setSmallLibraries]    = useState<SmallLibInfo[]>([]);
  const [smallLibLoading,   setSmallLibLoading]   = useState(false);
  const [userLocation,   setUserLocation]   = useState<{lat:number;lng:number}|null>(null);
  const [locationError,  setLocationError]  = useState("");
  const [showAll,        setShowAll]        = useState(false);
  const [weightOpenIds,  setWeightOpenIds]  = useState<Set<string>>(new Set());
  const toggleWeight = (id: string) =>
    setWeightOpenIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const [sortModes,      setSortModes]      = useState<Array<"recent"|"library">>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isPreciseQuery = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return false;
    const qNorm = q.replace(/[^0-9a-z가-힣]/g, "");
    return booksWithIsbn.some((b) =>
      b.koreanTitle.toLowerCase().includes(q) ||
      b.originalTitle.toLowerCase().includes(q) ||
      b.author.toLowerCase().includes(q) ||
      (qNorm.length >= 2 && (b.authorSearch || "").includes(qNorm))
    );
  }, [query, booksWithIsbn]);

  const relatedTags = useMemo(() => {
    if (!query.trim() || aiMode || isPreciseQuery) return [];
    const tagCount: Record<string, number> = {};
    books.forEach((b) => b.tags.forEach((t) => { tagCount[t] = (tagCount[t] || 0) + 1; }));
    const topTags = Object.entries(tagCount)
      .filter(([t]) => !orTags.includes(t) && t.toLowerCase() !== query.trim().toLowerCase())
      .sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t]) => t);
    return getRelatedKeywords(query, topTags).filter((t) => !orTags.includes(t)).slice(0, 8);
  }, [query, books, orTags, aiMode, isPreciseQuery]);

  const narrowTags = useMemo((): [string, number][] => {
    const hasContext =
      query.trim().length > 0 ||
      orTags.length > 0 ||
      selectedSources.length > 0 ||
      selectedAges.length > 0;
    const minResults = isPreciseQuery ? 1 : 20;
    if (aiMode || !hasContext || books.length <= minResults) return [];
    const exclude = new Set<string>(
      [query.trim(), ...orTags, ...andTags].map((s) => s.toLowerCase()).filter(Boolean)
    );
    const cnt = new Map<string, number>();
    for (const b of books) {
      for (const t of new Set(b.tags)) {
        if (exclude.has(t.toLowerCase())) continue;
        cnt.set(t, (cnt.get(t) || 0) + 1);
      }
    }
    return [...cnt.entries()]
      .filter(([, n]) => n >= 2 && n < books.length)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [books, query, orTags, andTags, selectedSources, selectedAges, aiMode, isPreciseQuery]);

  // ── 가용 연령 목록 ──────────────────────────
  const availableAges = AGE_ORDER.filter((a) =>
    booksWithIsbn.some((b) => b.ageGroup === a)
  );

  // ── 일반 필터 ──────────────────────────────
  const filterBooks = useCallback(() => {
    if (aiMode) return;

    const hasFilter = query.trim() || selectedAges.length > 0 || selectedSources.length > 0 || showKoreanOnly || showActivityOnly || orTags.length > 0 || andTags.length > 0 || sortModes.length > 0;

    // 아무 필터·검색어도 없으면 가중치 정렬 전체 목록 (더보기로 확장)
    if (!hasFilter) {
      setResultCount(INITIAL_BOOKS.length);
      setBooks(showAll ? INITIAL_BOOKS : INITIAL_BOOKS.slice(0, 60));
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

    // G: 관련도 임계값 필터 — 제목/작가 신호와 주제어 신호를 분리
    if (query.trim()) {
      const q = query.toLowerCase();
      const qNorm = q.replace(/[^0-9a-z가-힣]/g, "");
      const entryOf = (b: Book) => ({
        id: b.id, title: b.koreanTitle || b.originalTitle,
        tags: b.tags, hook: b.hook || "", awards: b.awards, sources: b.sources,
      });
      const titleAuthorHit = (b: Book) =>
        b.koreanTitle.toLowerCase().includes(q) ||
        b.originalTitle.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        (qNorm.length >= 2 && (b.authorSearch || "").includes(qNorm));
      const exactTagHit = (b: Book) => b.tags.some((t) => t.toLowerCase() === q);
      const taHits = filtered.filter(titleAuthorHit);
      if (taHits.length > 0) {
        // 제목/작가 검색 → 정밀: 제목·작가·정확한 태그만 (주제 확장 안 함)
        filtered = filtered.filter((b) => titleAuthorHit(b) || exactTagHit(b));
      } else {
        // 주제어 검색 → 정확한 태그 ∪ 유의어/관련도 확장
        filtered = filtered.filter(
          (b) => exactTagHit(b) || calcRelevance(query, entryOf(b)) >= 1
        );
      }
    }
    if (selectedAges.length > 0)
      filtered = filtered.filter((b) => selectedAges.includes(b.ageGroup || ""));
    if (selectedSources.length > 0)
      filtered = filtered.filter((b) => {
        const srcs = b.sources ?? (b.source ? [b.source] : []);
        return srcs.some((s) => selectedSources.includes(s)) ||
          (selectedSources.includes("카네기") && srcs.includes("그린어웨이"));
      });

    // orTags: 관련 주제어 칩 OR 확장
    if (orTags.length > 0) {
      const base = new Set(filtered.map((b) => b.id));
      const extra = booksWithIsbn.filter((b) =>
        !base.has(b.id) &&
        orTags.some((t) => {
          const tl = t.toLowerCase();
          return b.tags.some((x) => x.toLowerCase() === tl) ||
            calcRelevance(t, {
              id: b.id, title: b.koreanTitle || b.originalTitle,
              tags: b.tags, hook: b.hook || "", awards: b.awards, sources: b.sources,
            }) >= 1;
        })
      );
      filtered = [...filtered, ...extra];
    }

    // andTags: 좁히기(AND 패싯)
    if (andTags.length > 0) {
      filtered = filtered.filter((b) =>
        andTags.every((t) => {
          const tl = t.toLowerCase();
          return b.tags.some((x) => x.toLowerCase() === tl) ||
                 (b.hook || "").toLowerCase().includes(tl) ||
                 b.koreanTitle.toLowerCase().includes(tl);
        })
      );
    }

    // H: 검색어 있을 때 항상 관련도×가중치 정렬 → sortModes는 2차 기준
    const counts = libraryCounts as Record<string, number>;

    const weightedScore = (book: Book): number => {
      const bookEntry = { id: book.id, title: book.koreanTitle || book.originalTitle, tags: book.tags, hook: book.hook || "", awards: book.awards, sources: book.sources, koreanIsbn: book.koreanIsbn, isbn: book.isbn };
      const rel = query.trim() ? calcRelevance(query, bookEntry) : 1;
      if (rel === 0) return 0;
      return rel * calcWeight(book);
    };

    if (sortModes.length > 0) {
      filtered = [...filtered].sort((a, b) => {
        // 0순위: 국내 출간(대출 가능) 우선 — 미출간은 모든 정렬에서 항상 아래로
        const ka = a.koreanIsbn ? 1 : 0, kb = b.koreanIsbn ? 1 : 0;
        if (ka !== kb) return kb - ka;
        // 검색어 있으면 관련도×가중치
        if (query.trim()) {
          const diff = weightedScore(b) - weightedScore(a);
          if (Math.abs(diff) > 0.5) return diff;
        }
        for (const mode of sortModes) {
          let diff = 0;
          if (mode === "recent") {
            const ya = a.publishedYear ? parseInt(a.publishedYear) : 0;
            const yb = b.publishedYear ? parseInt(b.publishedYear) : 0;
            diff = yb - ya;
          } else if (mode === "library") {
            const ca = counts[a.koreanIsbn] ?? (a.koreanIsbn ? 0 : -1);
            const cb = counts[b.koreanIsbn] ?? (b.koreanIsbn ? 0 : -1);
            diff = cb - ca;
          }
          if (diff !== 0) return diff;
        }
        return 0;
      });
    } else {
      // 추천순 기본: 국내 출간(번역본) 우선 → 그다음 관련도×가중치
      filtered = [...filtered].sort((a, b) => {
        const ka = a.koreanIsbn ? 1 : 0, kb = b.koreanIsbn ? 1 : 0;
        if (ka !== kb) return kb - ka;
        return weightedScore(b) - weightedScore(a);
      });
    }

    setResultCount(filtered.length);
    setBooks(showAll ? filtered : filtered.slice(0, 60));
  }, [query, selectedAges, selectedSources, showKoreanOnly, showActivityOnly, aiMode, showAll, orTags, andTags, sortModes]); // showAll 포함 — 기본 화면 더보기 지원

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
      // I: 즉시 로컬 smartSearch 결과 먼저 표시 (0초 응답)
      const localPool = booksWithIsbn
        .filter((b) => !effectiveKoreanOnly || (b.koreanIsbn && b.koreanIsbn.length > 0))
        .filter((b) => effectiveAges.length === 0    || effectiveAges.includes(b.ageGroup || ""))
        .filter((b) => effectiveSources.length === 0 || (b.sources ?? (b.source ? [b.source] : [])).some((s) => effectiveSources.includes(s)));
      const localEntries = localPool.map((b) => ({
        id: b.id, title: b.koreanTitle || b.originalTitle,
        tags: b.tags, hook: b.hook || "", summary: b.summary || "",
        awards: b.awards, sources: b.sources,
        source: b.source, awardCount: b.awardCount,
        koreanIsbn: b.koreanIsbn, isbn: b.isbn,
      }));
      // 관련도 있는 책 상위 60권 즉시 표시 (화면용 — 태그·제목 정밀)
      const preRanked = rankByRelevance(q, localEntries).slice(0, 60);
      const preBooks  = preRanked.map(r => allBooks.find(b => b.id === r.id)).filter(Boolean) as Book[];
      if (preBooks.length > 0) setBooks(preBooks);

      // AI 후보 풀: 줄거리까지 본 넓은 리콜로 최소 80권 확보
      const aiRanked = rankForAi(q, localEntries);
      // 부족하면 가중치 상위 책으로 패딩 (AI가 굶지 않도록)
      const aiIds = new Set(aiRanked.map(b => b.id));
      const padding = localEntries
        .filter(b => !aiIds.has(b.id))
        .sort((a, b) => calcWeight(b) - calcWeight(a));
      const aiPool = [...aiRanked, ...padding].slice(0, 120);

      const payload = aiPool.map((b) => {
        const full = allBooks.find(ab => ab.id === b.id);
        return {
          id: b.id,
          title: b.title,
          tags: b.tags, hook: b.hook,
          summary: (b.summary || "").slice(0, 100),
          age: full?.targetAge || "",
          source: b.source,
          awardCount: b.awardCount ?? 1,
          sources:    b.sources ?? [b.source ?? ""],
          isbn:       b.isbn || "",
          koreanIsbn: b.koreanIsbn || "",
        };
      });

      const res = await fetch("/api/ai-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, books: payload }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAiEngine(data.engine || "smart");

      const aiBooks: Book[] = (data.results as { id: string; reason: string }[])
        .map((r): Book | null => {
          const book = allBooks.find((b) => b.id === r.id);
          return book ? { ...book, aiReason: r.reason } : null;
        })
        .filter((b): b is Book => b !== null);

      // AI 결과가 키워드 후보를 덮어써 화면이 비는 문제 방지:
      // AI가 고른 책(추천 사유 有)을 앞에 두고, 키워드로 찾은 관련 도서를 뒤에 이어 붙임.
      // → "공룡" 같은 구체어 검색에서 AI가 적게/못 골라도 관련 책이 사라지지 않음.
      const aiIdSet = new Set(aiBooks.map((b) => b.id));
      const merged = [...aiBooks, ...preBooks.filter((b) => !aiIdSet.has(b.id))];
      setBooks(merged.length > 0 ? merged : preBooks);
    } catch {
      setAiError("AI 검색에 실패했습니다. 일반 검색으로 대체합니다.");
      setAiMode(false); filterBooks();
    } finally {
      setAiLoading(false);
    }
  };

  const addOrTag = (tag: string) => {
    setOrTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    setAiMode(false);
  };
  const removeOrTag = (tag: string) => {
    setOrTags((prev) => prev.filter((t) => t !== tag));
  };
  const addAndTag = (tag: string) => {
    setAndTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    setAiMode(false);
  };
  const removeAndTag = (tag: string) => {
    setAndTags((prev) => prev.filter((t) => t !== tag));
  };

  const resetAi = () => { setAiMode(false); setAiEngine(""); setAiError(""); filterBooks(); };

  const switchTab = (mode: "keyword" | "ai") => {
    setSearchMode(mode);
    setQuery("");
    setOrTags([]);
    setAndTags([]);
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
  const toggleGroup = (sources: string[]) => {
    setAiMode(false);
    setSelectedSources((prev) => {
      const anyOn = sources.some((s) => prev.includes(s));
      return anyOn
        ? prev.filter((s) => !sources.includes(s))
        : [...prev, ...sources.filter((s) => !prev.includes(s))];
    });
  };
  const clearAllFilters = () => {
    setQuery(""); setSelectedSources([]); setSelectedAges([]);
    setOrTags([]); setAndTags([]); setSortModes([]); setAiMode(false); setExpandedGroups([]);
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

      // 지역 결정 및 검색 — pageSize=200으로 가나다 순 편향 해소
      let rawLibs: RawLib[] = [];
      if (loc) {
        const region = regionFromCoords(loc.lat, loc.lng);
        rawLibs = await fetchLibs(region, 200);
        if (rawLibs.length < 3) {
          const extras = await Promise.all(
            ["11", "31"].filter(r => r !== region).map(r => fetchLibs(r, 50))
          );
          rawLibs = [...rawLibs, ...extras.flat()];
        }
      } else {
        const [a, b] = await Promise.all([fetchLibs("11", 30), fetchLibs("31", 20)]);
        rawLibs = [...a, ...b];
        if (!rawLibs.length) {
          const extras = await Promise.all(["21","22","23","24","25","26"].map(r => fetchLibs(r, 10)));
          rawLibs = extras.flat();
        }
      }

      // 중복 제거 → 거리 계산 → 거리순 정렬 → 상위 5개
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
  const openDetail = async (book: Book, autoActivity = false) => {
    setDetailBook(book);
    setDetailAutoActivity(autoActivity);
    // 저장된 줄거리(고정본) 우선 — 라이브 생성 폐기로 환각·변동 제거
    if ((book.summary || "").trim()) {
      setSummary(book.summary as string);
      setSummaryIsEstimate(book.summaryEstimate === true);
      setSummaryLoading(false);
      return;
    }
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


  const hasAnyFilter =
    Boolean(query.trim()) || selectedAges.length > 0 ||
    selectedSources.length > 0 || orTags.length > 0 || andTags.length > 0;

  // ── 렌더 ───────────────────────────────────
  return (
    <main>
      <div className="bg-gradient-effect" />

      {/* 헤더 */}
      <section className="hero">
        <h1 className="wordmark">책탐정 도서나루</h1>
        <p className="app-tagline">수상·추천으로 고른 그림책, 가까운 도서관까지</p>
        <p className="stat-pill">검증된 그림책 <strong>{booksWithIsbn.length.toLocaleString()}권</strong> · 국제 4대 상 + 국내 추천 9기관</p>

        {/* 앱 소개 토글 */}
        <button className="about-toggle" onClick={() => setShowAbout(v => !v)}>
          <Info size={13} /> 이 앱에 대해 {showAbout ? "▲" : "▼"}
        </button>
        {showAbout && (
          <div className="about-panel">
            <div className="about-section">
              <strong>이 서비스를 만든 이야기</strong>
              <p>동화구연봉사자로 활동하며 아이들에게 좋은 책을 읽어주고 싶다는 마음, 하지만 <strong>&ldquo;어떤 책이 진짜 좋은 책인가&rdquo;</strong>라는 고민이 늘 있었습니다. 베스트셀러나 인기도서가 아니라, <strong>전문가들이 감별한 책</strong>을 찾고 싶었습니다. 그래서 칼데콧·안데르센 등 세계 권위 있는 아동문학상 수상작과, 국립어린이도서관·서울시교육청 등 <strong>공신력 있는 기관이 엄선한 추천도서</strong>로 목록을 구성했습니다. &ldquo;내 주제에 맞는 책을 빠르게 찾고, 줄거리를 파악해서, 가까운 도서관에서 바로 빌릴 수 있으면&rdquo;이라는 바람도 함께 담았습니다. 매년 국제 시상식이 열리는 <strong>상반기에 업데이트</strong>할 예정입니다.</p>
            </div>
            <div className="about-sources">
              <strong>수상·추천 컬렉션별 특징</strong>
              <ul>
                {(["칼데콧","안데르센","볼로냐","카네기","국립중앙도서관","국립어린이도서관","서울어린이도서관","서울시교육청","세종도서","교과연계도서","어린이도서연구회","학교도서관저널","행복한아침독서"] as const).map((src) => {
                  const cfg = SOURCE_CONFIG[src];
                  if (!cfg) return null;
                  return <li key={src}><span className="about-src-label">{cfg.label}</span> {cfg.desc}</li>;
                })}
              </ul>
            </div>
          </div>
        )}

        <div className="controls-container">
          {/* 통합 검색창 — 큰 단일 입력 + AI 버튼 내장 */}
          <div className="search-hero">
            {aiMode
              ? <Sparkles size={18} className="search-icon search-icon-ai" />
              : <Search size={18} className="search-icon" />}
            <input
              type="text" className="search-input search-input-hero"
              placeholder="어떤 책을 찾으세요? 상황·감정·제목·작가 무엇이든 적어 보세요"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (aiMode) resetAi();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && query.trim()) {
                  // 키워드 우선 라우팅:
                  //  · 구체어(토큰 1~2개가 태그·제목에 강하게 매칭 = 주제/제목/작가 찾기) → 키워드
                  //  · 서술형(토큰 3개+ 또는 상황·감정 표현) 이면서 구체어가 아닐 때만 → AI
                  //  (AI가 좁혀도 ①의 병합 로직으로 키워드 결과는 유지되므로 빈 화면 위험 없음)
                  const q = query.trim();
                  const toks = tokenize(q);
                  const concrete = toks.length <= 2 && strongKeywordHits(q) >= AI_ROUTE_THRESHOLD;
                  const descriptive = toks.length >= 3 || /(에게|싶|마음|기분|그리워|외로|무서)/.test(q);
                  if (descriptive && !concrete) {
                    handleAiSearch();
                  }
                }
              }}
            />
            {query && (
              <button className="clear-btn" onClick={() => { setQuery(""); setOrTags([]); setAndTags([]); resetAi(); }}>
                <X size={12} />
              </button>
            )}
            <button
              className="ai-inset-btn"
              onClick={() => handleAiSearch()}
              disabled={aiLoading || !query.trim()}
              title="AI가 상황·감정으로 책을 추천합니다"
            >
              {aiLoading
                ? <><Loader2 size={13} className="spin" /> 분석 중</>
                : <><Sparkles size={13} /> AI 추천</>}
            </button>
          </div>

          {/* 검색 예시 — 유형 라벨로 검색 범위 안내 */}
          {!query && (
            <div className="search-examples">
              <span className="search-examples-label">상황·감정뿐 아니라 책 제목이나 작가 이름으로도 찾을 수 있어요</span>
              <div className="search-example-chips">
                <button className="example-chip" onClick={() => handleAiSearch("용기를 주는 책")}>
                  용기를 주는 책 <span className="example-type">상황</span>
                </button>
                <button className="example-chip" onClick={() => handleAiSearch("동생이 생긴 아이에게")}>
                  동생이 생긴 아이에게 <span className="example-type">감정</span>
                </button>
                <button className="example-chip" onClick={() => setQuery("강아지똥")}>
                  강아지똥 <span className="example-type">제목</span>
                </button>
                <button className="example-chip" onClick={() => setQuery("백희나")}>
                  백희나 <span className="example-type">작가</span>
                </button>
              </div>
            </div>
          )}

          {/* 활성 태그 + 연관 태그 */}
          {!aiMode && (
            <>
              {orTags.length > 0 && (
                <div className="active-tags-row">
                  <span className="active-tags-label">넓힌 주제:</span>
                  {orTags.map((t) => (
                    <span key={t} className="active-tag-pill or-pill">
                      {t}<button onClick={() => removeOrTag(t)}><X size={9} /></button>
                    </span>
                  ))}
                  {orTags.length > 1 && (
                    <button className="active-tag-clear" onClick={() => setOrTags([])}>전체 해제</button>
                  )}
                </div>
              )}
              {andTags.length > 0 && (
                <div className="active-tags-row">
                  <span className="active-tags-label">좁힌 주제:</span>
                  {andTags.map((t) => (
                    <span key={t} className="active-tag-pill and-pill">
                      {t}<button onClick={() => removeAndTag(t)}><X size={9} /></button>
                    </span>
                  ))}
                  {andTags.length > 1 && (
                    <button className="active-tag-clear" onClick={() => setAndTags([])}>전체 해제</button>
                  )}
                </div>
              )}
              {relatedTags.length > 0 && (
                <div className="related-tags-row">
                  <span className="related-tags-label">관련 주제어 (눌러서 넓히기)</span>
                  {relatedTags.map((t) => (
                    <button key={t} className="related-tag-btn" onClick={() => addOrTag(t)}>
                      +{t}
                    </button>
                  ))}
                </div>
              )}
              {narrowTags.length > 0 && (
                <div className="related-tags-row narrow-row">
                  <span className="related-tags-label">결과 좁히기 (눌러서 좁히기)</span>
                  {narrowTags.map(([t, n]) => (
                    <button key={t} className="related-tag-btn narrow-btn" onClick={() => addAndTag(t)}>
                      {t} {n}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* 전체 해제 — 필터 활성 시만 노출 */}
          {(hasAnyFilter || sortModes.length > 0) && (
            <div className="reset-all-row">
              <button className="reset-all-prominent-btn" onClick={clearAllFilters} title="검색어·컬렉션·연령·주제어·정렬을 모두 해제합니다">
                ✕ 검색·필터 전체 초기화
              </button>
            </div>
          )}

          {/* 컬렉션으로 둘러보기 */}
          <div className="browse-section">
            <div className="browse-header">
              <span className="browse-title">컬렉션으로 둘러보기</span>
              <span className="browse-hint">마우스를 올리면 포함된 출처가 떠요</span>
            </div>
            <div className="browse-cards browse-cards-collection">
              {COLLECTION_GROUPS.map((g) => {
                const hasSelected = g.sources.some((src) => selectedSources.includes(src));
                const isExpanded  = expandedGroups.includes(g.key);
                const isOn = isExpanded || hasSelected;
                return (
                  <button
                    key={g.key}
                    className={`browse-card ${isOn ? "on" : ""}`}
                    onClick={() => setExpandedGroups(prev =>
                      prev.includes(g.key) ? prev.filter(k => k !== g.key) : [...prev, g.key]
                    )}
                    data-tooltip={g.tip}
                  >
                    <span className={`browse-icon ${g.iconCls}`}>{g.hanja}</span>
                    <span className="browse-card-title">{g.title}</span>
                    <span className="browse-card-desc">{g.tip}</span>
                  </button>
                );
              })}
            </div>
            {COLLECTION_GROUPS.filter((g) =>
              expandedGroups.includes(g.key) || g.sources.some((src) => selectedSources.includes(src))
            ).map((g) => (
              <div key={g.key} className="browse-detail-chips">
                <span className="browse-detail-label">{g.title} 세부</span>
                <button
                  className={`chip ${g.sources.every(s => selectedSources.includes(s)) ? "active" : ""}`}
                  onClick={() => toggleGroup(g.sources)}
                >전체</button>
                {g.sources.map((src) => {
                  const cfg = SOURCE_CONFIG[src];
                  if (!cfg) return null;
                  return (
                    <button
                      key={src}
                      className={`chip ${selectedSources.includes(src) ? "active" : ""}`}
                      onClick={() => toggleSource(src)}
                      data-tooltip={cfg.desc}
                    >{cfg.label}</button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* 연령 · 형태로 둘러보기 (통합 칩) */}
          <div className="browse-section">
            <div className="browse-header">
              <span className="browse-title">연령 · 형태로 둘러보기</span>
            </div>
            <div className="format-browse-row">
              {availableAges.map((age) => {
                const card = AGE_CARD[age] ?? { title: age, sub: "" };
                return (
                  <button
                    key={age}
                    className={`format-browse-chip age-chip ${selectedAges.includes(age) ? "active" : ""}`}
                    onClick={() => toggleAge(age)}
                    data-tooltip={AGE_TOOLTIP[age]}
                  >
                    {card.title}{card.sub ? <small className="age-chip-sub">{card.sub}</small> : null}
                  </button>
                );
              })}
              {FORMAT_BROWSE.map((f) => (
                <button key={f.label} className="format-browse-chip" title={f.tip}
                  onClick={() => { resetAi(); setOrTags([]); setAndTags([]); setQuery(f.label); }}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* K: AI 배너 1줄 슬림 */}
        {aiMode && !aiLoading && (
          <div className="ai-banner-slim">
            <Sparkles size={13} />
            <span className="ai-banner-slim-text">
              {aiEngine === "claude" ? "Claude AI 추천" : "스마트 검색 결과"}
              {" · "}<strong>{books.length}권</strong>
            </span>
            <button className="ai-banner-slim-close" onClick={resetAi}><X size={11} /> 일반 검색</button>
          </div>
        )}
        {/* I: AI 로딩 중 진행 표시 */}
        {aiMode && aiLoading && (
          <div className="ai-banner-slim ai-banner-loading">
            <Loader2 size={13} className="spin" />
            <span className="ai-banner-slim-text">AI가 더 좋은 결과를 찾고 있어요…</span>
          </div>
        )}
        {aiError && <div className="error-banner">{aiError}</div>}
      </section>

      {/* 도서 그리드 헤더: 제목 + 정렬 필 */}
      {!aiMode && (
        <div className="grid-header">
          <div className="grid-header-left">
            <span className="grid-title">
              {hasAnyFilter ? `검색 결과 ${resultCount.toLocaleString()}권` : "오늘의 추천 그림책"}
            </span>
            {!hasAnyFilter && (
              <span className="grid-sub">국제 수상 · 사서 추천 · 공공도서관 보유율을 종합한 추천 순</span>
            )}
          </div>
          <div className="grid-header-right">
            <div className="sort-pills">
              <button
                className={`sort-pill ${sortModes.length === 0 ? "on" : ""}`}
                onClick={() => { setSortModes([]); setAiMode(false); }}
                data-tooltip="국제 수상 횟수 × 추천 기관 수 × 전국 공공도서관 보유율을 종합한 기본 정렬이에요"
              >추천순</button>
              {(
                [
                  { key: "library", label: "인기 대출",      title: "전국 공공도서관이 많이 소장한 책부터 — 도서관정보나루 보유 데이터 기준이에요" },
                  // [2026-07-05 임시 숨김] 최신 출간: publishedYear가 초판이 아닌 복간/재쇄 연도로 들어간 데이터가 있어 정렬이 부정확 → 데이터 정비 후 복원. 아래 한 줄 주석 해제하면 즉시 복원됨.
                  // { key: "recent",  label: "최신 출간",      title: "출판 연도가 최신인 책부터 보여드려요" },

                ] as const
              ).map(({ key, label, title }) => {
                const idx = sortModes.indexOf(key);
                const isActive = idx >= 0;
                return (
                  <button
                    key={key}
                    className={`sort-pill ${isActive ? "on" : ""}`}
                    onClick={() => {
                      setSortModes((prev) =>
                        prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
                      );
                      setAiMode(false);
                    }}
                    data-tooltip={title}
                  >
                    {isActive && sortModes.length > 1 && <span className="sort-priority">{idx + 1}</span>}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 도서 그리드 */}
      <section className="book-grid">
        {books.map((book) => {
          const badge = pickDisplayBadge(book);
          const band  = bookBandColor(book);
          return (
            <div className="book-card" key={book.id} onClick={() => openDetail(book)}>
              <span className="card-band" style={{ background: band }} aria-hidden />
              <div className="card-cover-wrap">
                <BookCover
                  isbn={book.koreanIsbn || book.isbn}
                  title={book.koreanTitle}
                  source={book.source}
                  originalIsbn={book.isbn !== book.koreanIsbn ? book.isbn : undefined}
                  cachedUrl={CONFIRMED_COVERS[book.koreanIsbn]?.url || CONFIRMED_COVERS[book.isbn]?.url}
                />
              </div>

              <div className={`cover-seal ${badge.cls} ${bookBandCat(book)}`}>
                {badge.intl ? (badge.gold ? <Award size={11}/> : <Medal size={11}/>) : <BookOpen size={11}/>}
                {badge.label}
              </div>

              <h3 className="book-title">{book.koreanTitle}</h3>

              <div className="book-meta">
                <span className="book-author" title={book.author}>{book.author}</span>
                {book.ageGroup && AGE_SHORT[book.ageGroup] && (
                  <span className="book-age-inline" title={AGE_TOOLTIP[book.ageGroup]}> · {AGE_SHORT[book.ageGroup]}</span>
                )}
                {!book.koreanIsbn && (
                  <span className="badge-untranslated" title="국내에 번역 출간되지 않아 국내 도서관 대출이 어려울 수 있어요">국내 미출간</span>
                )}
              </div>

              {book.hook ? (
                <div className="hook-text clamp2">{book.hook}</div>
              ) : (() => {
                const allTags = [...(book.situationTags||[]),...(book.emotionTags||[]),...(book.topicTags||[]),...(book.tags||[])];
                const uniq = [...new Set(allTags)].slice(0, 3);
                return uniq.length >= 2
                  ? <div className="hook-text hook-text-auto clamp2">{uniq.join(", ")} 등을 담은 책이에요.</div>
                  : <div className="hook-text hook-text-hint">카드를 눌러 줄거리를 확인하세요</div>;
              })()}

              <div className="card-btns">
                <button className="library-btn cta-btn" title="내 주변 도서관의 대출 가능 여부를 확인해요"
                  onClick={(e) => { e.stopPropagation(); handleCheckLibrary(book); }}>
                  <Library size={13}/> 도서관에서 찾기
                </button>
                <button className="library-btn lib-ghost activity-btn" title="이 책으로 할 수 있는 다중지능 독후활동을 봐요"
                  onClick={(e) => { e.stopPropagation(); openDetail(book, true); }}>
                  <Pencil size={13}/> 독후활동
                </button>
              </div>
            </div>
          );
        })}

        {books.length === 0 && (
          <div className="empty-state">
            {aiMode ? (
              <>
                <Sparkles size={36} className="empty-ai-icon" />
                <p>&ldquo;{query}&rdquo;에 맞는 책을 찾지 못했어요.</p>
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
      {!aiMode && !showAll && resultCount > 60 && (
        <div style={{ textAlign: "center", paddingBottom: "3rem" }}>
          <button className="show-more-btn" onClick={() => setShowAll(true)}>
            <ChevronDown size={16} /> 전체 {resultCount.toLocaleString()}권 보기
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
            <div className="detail-body">
              <div className="detail-side">
              <div className="detail-cover" onClick={() => setCoverZoom(detailBook.koreanIsbn || detailBook.isbn)} style={{ cursor: "zoom-in" }} title="표지를 크게 보기">
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
                <span className="zoom-hint">🔍 크게 보기</span>
              </div>
              <button className="library-btn detail-side-btn" onClick={() => { setDetailAutoActivity(true); setTimeout(() => document.querySelector(".mi-activity-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80); }}>
                <Pencil size={13} /> 독후활동 보기
              </button>
              <button className="library-btn library-btn-ghost detail-side-btn" onClick={() => { setDetailBook(null); handleCheckLibrary(detailBook); }}>
                <Library size={13} /> 대출 가능 도서관 확인
              </button>
              </div>
              <div className="detail-main">
              <div className="detail-info">
                <h2 className="modal-title">{detailBook.koreanTitle}</h2>
                {detailBook.originalTitle && detailBook.originalTitle !== detailBook.koreanTitle && (
                  <div style={{ fontSize: ".82rem", color: "#64748b", marginBottom: ".4rem" }}>{detailBook.originalTitle}</div>
                )}
                <p className="modal-sub">{detailBook.author}</p>
                {/* 수상·추천 배지 + awards 전체 펼침 */}
                {(detailBook.awards && detailBook.awards.length > 0) ? (
                  <div className="detail-awards-block">
                    <div className="detail-awards-list">
                      {detailBook.awards.map((aw, i) => (
                        <div key={i} className="detail-award-item">
                          <span className="detail-award-name">{aw.name}</span>
                          <span className="detail-award-cat">{aw.category}</span>
                          {aw.year && <span className="detail-award-year">({aw.year})</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : detailBook.awardName ? (
                  <div className="detail-award">{detailBook.sourceLabel} {detailBook.awardYear && `(${detailBook.awardYear})`}</div>
                ) : null}
                {/* 가중치 토글 — 모든 책 대상, 가중치 없으면 자동 숨김 */}
                {(() => {
                  const w1 = awardWeight(detailBook), w2 = recommendationWeight(detailBook), w3 = libraryWeight(detailBook);
                  if (w1 === 1.0 && w2 === 1.0 && w3 === 1.0) return null;
                  const aw = countIntlAwards(detailBook);
                  const recoN = recommendationCount(detailBook);
                  const lr = getLibRank(detailBook);
                  const total = Math.round(w1 * w2 * w3 * 100) / 100;
                  const isOpen = weightOpenIds.has("modal-" + detailBook.id);
                  return (
                    <div className="weight-toggle-wrap" style={{ marginTop: ".4rem" }}>
                      <button className="weight-toggle-btn" onClick={() => toggleWeight("modal-" + detailBook.id)}>
                        추천 가중치 {isOpen ? "▲" : "▼"}
                      </button>
                      {isOpen && (
                        <div className="weight-detail">
                          <div className={w1 > 1.0 ? "weight-row active" : "weight-row dim"}>국제 수상: ×{w1.toFixed(1)} ({aw}개)</div>
                          <div className={w2 > 1.0 ? "weight-row active" : "weight-row dim"}>추천 기관: ×{w2.toFixed(1)} ({recoN}개 기관)</div>
                          <div className={w3 > 1.0 ? "weight-row active" : "weight-row dim"}>공공도서관 보유: ×{w3.toFixed(1)} {lr ? `전국 ${lr.count}개관 보유 (상위 ${lr.pct}%)` : "(데이터 없음)"}</div>
                          <div className="weight-total">합산 ×{total}</div>
                        </div>
                      )}
                    </div>
                  );
                })()}
                {detailBook.ageGroup && (
                  <div className="detail-age">
                    대상 연령: {ageLabel(detailBook.ageGroup)}
                  </div>
                )}
                <div className="detail-tags">
                  {getBookFormats(detailBook).map(fmt => (
                    <span key={fmt.key} className="tag-chip tag-chip-format" title={fmt.label}>
                      {fmt.emoji} {fmt.label}
                    </span>
                  ))}
                  {(() => {
                    const fmtLabels = new Set(getBookFormats(detailBook).map(f => f.label));
                    return detailBook.tags.filter(t => !fmtLabels.has(t)).slice(0, 8).map((t, i) => (
                      <span key={i} className="tag-chip">#{t}</span>
                    ));
                  })()}
                </div>
              </div>

            <div className="detail-summary-section">
              <div className="detail-section-title">줄거리</div>
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

            {/* 다중지능 독후활동 */}
            <div className="mi-activity-anchor" />
            <ReadingActivity
              key={detailBook.id}
              title={detailBook.koreanTitle}
              author={detailBook.author}
              summary={summary}
              tags={detailBook.tags}
              hook={detailBook.hook}
              targetAge={detailBook.targetAge}
              autoOpen={detailAutoActivity}
            />

            {detailBook.activity && detailBook.activity.trim() && (
              <div className="detail-activity-section">
                <div className="detail-section-title">독서 후 활동</div>
                <p className="detail-activity">{detailBook.activity}</p>
              </div>
            )}

            {detailBook.companions && detailBook.companions.length > 0 && (
              <div className="detail-activity-section">
                <div className="detail-section-title">함께 보면 좋은 짝꿍 책</div>
                {detailBook.companions.map((c, i) => (
                  <p key={i} className="detail-activity" style={{ margin: ".15rem 0" }}>
                    · {c.title}{c.original ? ` (${c.original})` : ""}
                  </p>
                ))}
              </div>
            )}

            {/* hook은 카드 목록에서만 노출 — 수정 2: 모달에서 제거 */}
              </div>
            </div>
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
            {locationError && <span className="location-error-msg">{locationError}</span>}
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
                  근처 작은도서관
                  <span className="small-lib-note">작은도서관 정보누리 기준</span>
                </div>
                <div className="small-lib-disclaimer">
                  ⚠️ 작은도서관은 소장 도서 일부만 knu에 등록되어 있어, 실제로 소장하고 있어도 검색 결과에 나타나지 않을 수 있어요. 미표시 시 도서관에 직접 문의해보세요.
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
      {/* 맨 위로 */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="맨 위로"
        title="맨 위로"
        style={{ position: "fixed", right: "1rem", bottom: "1rem", zIndex: 50,
          width: 44, height: 44, borderRadius: "50%", border: "none",
          background: "var(--accent, #2f9e8f)", color: "#fff", fontSize: 20, lineHeight: "44px",
          boxShadow: "0 2px 10px rgba(0,0,0,.22)", cursor: "pointer" }}
      >↑</button>

      {coverZoom && (
        <div className="cover-zoom-overlay" onClick={() => setCoverZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={(() => { const c = CONFIRMED_COVERS[coverZoom]?.url; return c && c.includes("cover500") ? c : `/api/book-cover?isbn=${coverZoom}`; })()} alt="표지 확대" className="cover-zoom-img" />
          {detailBook && <div className="cover-zoom-caption">{detailBook.koreanTitle} · {detailBook.author}</div>}
          <button className="cover-zoom-close" onClick={() => setCoverZoom(null)} aria-label="닫기">✕</button>
        </div>
      )}
    </main>
  );
}
