/**
 * Claude API 없이 동작하는 스마트 검색 엔진
 * - 한국어 유의어/연관어 매핑
 * - 태그·훅·제목 가중치 점수 기반 랭킹
 * - 관련도 임계값: baseScore < 1 → 제외 (가중치로 관련없는 책 끼어들기 방지)
 */

import libraryRank from "../data/library_rank.json";

// ── 토큰화 ───────────────────────────────────────────────
const JOSA = ["에게서","으로","에게","에서","한테","까지","부터","처럼","보다","라는","라고","이의","의","을","를","이","가","은","는","과","와","도","만","에","로","께"];
const STOPWORDS = new Set(["책","그림책","도서","추천","좋은","맞는","맞춤","위한","위해","관련","이야기","아이","어린이","주제","내용","좋아하는","좋아하","싶은","같은","어울리는","찾아줘","알려줘","골라줘","해줘"]);

export function tokenize(query: string): string[] {
  const base = (query || "").toLowerCase().normalize("NFC");
  const out = new Set<string>();
  for (let w of base.split(/[\s,./·]+/).filter(Boolean)) {
    for (const j of JOSA) {
      if (w.length > j.length + 1 && w.endsWith(j)) { w = w.slice(0, -j.length); break; }
    }
    if (w.length < 2 || STOPWORDS.has(w)) continue;
    out.add(w);
  }
  return [...out];
}

// ── 유의어 / 연관어 사전 ─────────────────────────────────
const SYNONYM_MAP: Record<string, string[]> = {
  // 감정
  용기:   ["용기", "용감", "씩씩", "자신감", "희망", "도전", "두려움", "무서움", "극복", "겁"],
  슬픔:   ["슬픔", "슬프", "위로", "외로움", "속상함", "눈물", "그리움", "상실"],
  기쁨:   ["기쁨", "행복", "즐거움", "신남", "설렘", "웃음"],
  화남:   ["화남", "화", "분노", "짜증", "답답함", "억울함", "감정"],
  불안:   ["불안", "걱정", "두려움", "무서움", "긴장"],
  사랑:   ["사랑", "따뜻함", "포근함", "애정", "그리움", "보고싶음"],
  감사:   ["감사", "고마움", "소중함", "배려"],
  외로움: ["외로움", "혼자", "친구", "외롭", "고독"],
  자존감: ["자존감", "자신감", "나답게", "개성", "나다움", "자아", "자존심", "특별함"],
  // 관계·사회
  협동:   ["협동", "협력", "팀워크", "단합", "힘을 합"],
  다툼:   ["다툼", "싸움", "갈등", "다투", "화해", "토라", "미움"],
  우정:   ["우정", "친구", "단짝", "사이좋", "동무"],
  배려:   ["배려", "친절", "양보", "이해", "공감", "돕"],
  나눔:   ["나눔", "나누", "베풂", "기부", "선물", "공유", "함께", "이웃"],
  도전:   ["도전", "꿈", "목표", "노력", "포기하지"],
  이별:   ["이별", "죽음", "헤어짐", "떠남", "상실"],
  환경:   ["환경", "자연", "지구", "생태", "쓰레기", "재활용"],

  // 주제
  가족:      ["가족", "부모", "엄마", "아빠", "형제", "자매", "조부모", "할머니", "할아버지", "동생", "언니", "오빠", "형", "누나"],
  친구:      ["친구", "우정", "우애", "동무", "친구사귀기"],
  학교:      ["학교", "선생님", "공부", "교실", "전학"],
  자연:      ["자연", "환경", "동물", "식물", "꽃", "나무", "숲", "바다"],
  모험:      ["모험", "여행", "탐험", "상상", "판타지"],
  예술:      ["예술", "그림", "음악", "그리기", "만들기", "창의"],
  역사:      ["역사", "전통", "인권", "정의", "자유"],
  성장:      ["성장", "변화", "도전", "발전", "어른"],
  죽음:      ["죽음", "이별", "슬픔", "기억", "추억", "반려동물"],
  다름:      ["다름", "다양성", "차이", "이해", "배려", "존중"],
  동생:      ["동생", "남동생", "여동생", "동생생김", "아기동생", "새동생", "형제자매"],
  형제자매:  ["형제자매", "형제", "자매", "동생", "언니", "오빠", "형", "누나", "남매"],
  아기:      ["아기", "갓난아기", "신생아", "출생", "태어남", "임신", "아기동생", "새동생"],
  출생:      ["출생", "태어남", "아기", "신생아", "새생명", "탄생", "동생생김"],
  임신:      ["임신", "아기", "출생", "태어남", "엄마배속", "새동생"],

  // 상황
  여름:      ["여름", "더위", "바다", "수영", "방학", "여름방학"],
  겨울:      ["겨울", "눈", "추위", "크리스마스"],
  봄:        ["봄", "꽃", "따뜻함", "새학기"],
  가을:      ["가을", "단풍", "추석", "수확"],
  잠:        ["잠", "잠안옴", "밤", "꿈", "잠자리"],
  아픔:      ["아픔", "병", "병원", "건강"],
  이사:      ["이사", "전학", "낯선", "새로운"],
  반려동물:  ["반려동물", "강아지", "고양이", "펫"], // 2026-07-04 "동물" 제거 — 일반 동물책 소음 방지

  // 동물 12종 ─────────────────────────────────────────────
  토끼:  ["토끼", "래빗", "rabbit", "버니", "bunny", "당근", "knuffle bunny", "피터래빗"],
  강아지: ["강아지", "개", "puppy", "dog", "멍멍이", "강아지그림책"],
  고양이: ["고양이", "cat", "냥이", "키티", "kitty", "야옹"],
  곰:    ["곰", "bear", "곰돌이", "북극곰", "갈색곰", "아기곰", "paddington"],
  여우:  ["여우", "fox", "여우야여우야"],
  사자:  ["사자", "lion", "사자왕", "정글"],
  호랑이: ["호랑이", "tiger", "호랑이그림책"],
  코끼리: ["코끼리", "elephant", "코끼리그림책"],
  기린:  ["기린", "giraffe"],
  말:    ["말", "horse", "망아지", "포니"],
  돼지:  ["돼지", "pig", "아기돼지", "세마리아기돼지"],
  새:    ["새", "bird", "오리", "펭귄", "독수리", "참새", "비둘기", "까마귀"],

  // 관심 주제(구체 명사) — 아이들이 자주 찾는 키워드
  공룡:   ["공룡", "다이노", "dinosaur", "티라노", "공룡책"],
  공주:   ["공주", "왕자", "프린세스", "princess"],
  로봇:   ["로봇", "robot", "기계", "안드로이드"],
  자동차: ["자동차", "car", "버스", "트럭", "탈것"],
  기차:   ["기차", "열차", "train", "지하철", "기관차"],
  우주:   ["우주", "행성", "로켓", "space", "은하", "우주선"],
  마법:   ["마법", "마녀", "마법사", "요술", "주문", "magic", "판타지"],
  바다:   ["바다", "물고기", "고래", "상어", "해변", "바닷속", "sea", "ocean"],
  음악:   ["음악", "노래", "악기", "피아노", "춤", "리듬", "소리"],
  축구:   ["축구", "공놀이", "운동", "스포츠", "골"],
  요리:   ["요리", "음식", "먹기", "밥", "요리사", "맛"],
  생일:   ["생일", "파티", "축하", "케이크", "선물"],
  똥:     ["똥", "방귀", "응가", "변기", "화장실"],

  // 가치·감정 (키 없던 단어)
  화해:   ["화해", "사과", "용서", "미안", "다툼", "갈등", "사이좋"],
  질투:   ["질투", "샘", "부러움", "시기", "동생"],
  경쟁:   ["경쟁", "승부", "이기", "지기", "비교", "최고"],
  거짓말: ["거짓말", "진실", "정직", "솔직", "들통"],
  약속:   ["약속", "지키", "믿음", "신뢰", "다짐"],
  정직:   ["정직", "솔직", "진실", "거짓말", "양심"],
  규칙:   ["규칙", "질서", "약속", "예절", "차례", "기다림"],
  책임:   ["책임", "역할", "스스로", "자립", "맡은일"],
  실수:   ["실수", "잘못", "틀림", "괜찮아", "다시"],
  자신감: ["자신감", "자존감", "나답게", "할수있", "당당"],

  // ── 책 형태(판형) ──
  글없는그림책: ["글없는그림책", "무글자", "무글자책", "무글자그림책", "글없는"],
  병풍책:       ["병풍책", "병풍", "파노라마", "아코디언", "아코디언북"],
  콜라주그림책: ["콜라주그림책", "콜라주"],
  흑백그림책:   ["흑백그림책", "흑백", "모노톤", "모노크롬"],
  판화그림책:   ["판화그림책", "판화", "목판화"],
  점토그림책:   ["점토그림책", "점토", "클레이"],
  사진그림책:   ["사진그림책", "사진책"],
  세로판형:     ["세로판형", "세로책"],
};

// ── 직접 검색어 점수 (유의어 확장 없이) ─────────────────────
/** 원본 검색어만으로 relevance 계산 — 유의어는 보조 점수만 */
function directScore(book: BookEntry, base: string): number {
  let score = 0;
  const titleL = book.title.toLowerCase();
  const hookL  = (book.hook || "").toLowerCase();
  const tagsL  = book.tags.map(t => t.toLowerCase());

  if (titleL.includes(base)) score += 10;
  if (hookL.includes(base))  score += 3;
  for (const tag of tagsL) {
    // 태그가 검색어를 포함하거나, 검색어가 태그와 정확히 같을 때만
    if (tag.includes(base) || base === tag) score += 5;
  }
  return score;
}

/** 유의어 확장 보조 점수 */
function synonymScore(book: BookEntry, keywords: string[], base: string): number {
  let score = 0;
  const titleL = book.title.toLowerCase();
  const hookL  = (book.hook || "").toLowerCase();
  const tagsL  = book.tags.map(t => t.toLowerCase());

  for (const kw of keywords) {
    if (kw === base) continue;
    // 한 글자 한글 동의어: 태그 완전일치만 인정 (substring 오매칭 차단)
    if (kw.length < 2 && /[가-힣]/.test(kw)) {
      if (tagsL.some(t => t === kw)) score += 3;
      continue;
    }
    if (titleL.includes(kw)) score += 4;
    if (hookL.includes(kw))  score += 2;
    for (const tag of tagsL) {
      if (tag.includes(kw) || kw === tag) score += 3;
    }
  }
  return score;
}

function tokenScore(book: BookEntry, tokens: string[], base: string): number {
  let score = 0;
  const titleL = book.title.toLowerCase();
  const tagsL  = book.tags.map(t => t.toLowerCase());
  for (const tk of tokens) {
    if (tk === base) continue;
    if (tagsL.some(t => t === tk || t.includes(tk))) score += 5;
    else if (titleL.includes(tk)) score += 4;
  }
  return score;
}

// ── 책 점수 계산 ─────────────────────────────────────────
export interface AwardEntry {
  name: string;
  year?: string;
  category?: string;
}

export interface BookEntry {
  id: string;
  title: string;
  tags: string[];
  hook: string;
  summary?: string;
  age?: string;
  source?: string;
  isbn?: string;
  koreanIsbn?: string;
  // 가중치 필드
  awards?: AwardEntry[];
  awardCount?: number;
  sources?: string[];
  libraryCount?: number;
}

// ── 가중치 3종 (중앙화) ───────────────────────────────────
const LIB_RANK = libraryRank as Record<string, { count: number; pct: number }>;

/** 국제 수상 이름 집합 (W1) */
export const INTL_AWARD_NAMES = new Set([
  '칼데콧', '안데르센상', '볼로냐라가치상', '뉴베리상', '카네기상', '케이트 그린어웨이상',
]);
/** 국제 수상처(출처) 집합 — W2에서 제외 */
export const AWARD_SOURCES = new Set([
  '칼데콧', '안데르센', '볼로냐', '뉴베리', '카네기', '그린어웨이',
]);

type WeightLike = {
  awards?: { name: string }[];
  sources?: string[];
  koreanIsbn?: string;
  isbn?: string;
};

/** 국제 수상 개수 */
export function countIntlAwards(book: WeightLike): number {
  if (!book.awards) return 0;
  return book.awards.filter(a => INTL_AWARD_NAMES.has(a.name)).length;
}

/** W2용: 수상처를 제외한 사서·교육기관 추천 기관 수 */
export function recommendationCount(book: WeightLike): number {
  return (book.sources ?? []).filter(s => !AWARD_SOURCES.has(s)).length;
}

/** 도서관 보유 순위 조회 (없으면 null) — { count, pct(전국 보유 상위 %) } */
export function getLibRank(book: WeightLike): { count: number; pct: number } | null {
  return LIB_RANK[book.koreanIsbn ?? ""] ?? LIB_RANK[book.isbn ?? ""] ?? null;
}

/** W1: 국제 수상 단계화 (1관 1.3 / 2관 1.6 / 3관+ 2.0) */
export function awardWeight(book: WeightLike): number {
  const c = countIntlAwards(book);
  if (c >= 3) return 2.0;
  if (c === 2) return 1.6;
  if (c === 1) return 1.3;
  return 1.0;
}

/** W2: 사서·교육기관 추천 누적 (수상처 제외) */
export function recommendationWeight(book: WeightLike): number {
  const n = recommendationCount(book);
  if (n >= 4) return 1.6;
  if (n >= 3) return 1.4;
  if (n === 2) return 1.2;
  if (n === 1) return 1.1;
  return 1.0;
}

/** W3: 도서관 보유율 백분위 (상위 5% 1.3 / 15% 1.2 / 35% 1.1) */
export function libraryWeight(book: WeightLike): number {
  const r = getLibRank(book);
  if (!r) return 1.0;
  if (r.pct <= 5) return 1.3;
  if (r.pct <= 15) return 1.2;
  if (r.pct <= 35) return 1.1;
  return 1.0;
}

export function calcWeight(book: WeightLike): number {
  return awardWeight(book) * recommendationWeight(book) * libraryWeight(book);
}

export function getKeywords(query: string): string[] {
  const base = query.trim().toLowerCase();
  const expanded = new Set<string>([base]);
  const tokens = new Set(tokenize(query));
  for (const [key, synonyms] of Object.entries(SYNONYM_MAP)) {
    const hit =
      base === key ||
      tokens.has(key) ||
      synonyms.some(s => tokens.has(s) || (s.includes(" ") && base.includes(s)));
    if (hit) {
      synonyms.forEach(s => expanded.add(s));
      expanded.add(key);
    }
  }
  return [...expanded];
}

/**
 * 관련도 점수: 직접 매칭(가중치 높음) + 유의어 보조(가중치 낮음)
 * baseScore = 0 이면 가중치 무관 제외 대상
 */
function scoreBook(book: BookEntry, keywords: string[], base: string): { relevance: number; total: number } {
  const direct  = directScore(book, base);
  const token   = tokenScore(book, tokenize(base), base);
  const synonym = synonymScore(book, keywords, base);
  const relevance = direct + token + synonym * 0.4;

  if (relevance < 1) return { relevance: 0, total: 0 };

  const total = relevance * calcWeight(book);
  return { relevance, total };
}

// ── 추천 이유 생성 ────────────────────────────────────────
function buildReason(book: BookEntry, query: string): string {
  if (book.hook) return book.hook;

  const matchedTags = book.tags.filter(t =>
    query.split(/\s+/).some(q => t.includes(q) || q.includes(t))
  );

  if (matchedTags.length > 0) {
    return `"${query}" 주제와 관련된 ${matchedTags.slice(0, 3).map(t => `#${t}`).join(" ")} 태그를 가진 책이에요.`;
  }
  return `"${query}"를 탐색하는 어린이에게 어울리는 책이에요.`;
}

// ── 메인 함수 ─────────────────────────────────────────────
export interface SmartResult {
  id: string;
  reason: string;
}

export function smartSearch(query: string, books: BookEntry[]): SmartResult[] {
  const base     = query.trim().toLowerCase();
  const keywords = getKeywords(query);

  const scored = books
    .map(b => ({ book: b, ...scoreBook(b, keywords, base) }))
    .filter(x => x.relevance >= 1)  // 관련도 임계값
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  return scored.map(({ book }) => ({
    id:     book.id,
    reason: buildReason(book, query),
  }));
}

/**
 * 관련도 순 정렬 (Claude 전달용 사전 필터링)
 * 관련도 0인 책 제외 후 관련 책만 반환
 */
export function rankByRelevance(query: string, books: BookEntry[]): BookEntry[] {
  const base     = query.trim().toLowerCase();
  const keywords = getKeywords(query);

  const withScore = books
    .map(b => ({ book: b, ...scoreBook(b, keywords, base) }))
    .filter(x => x.relevance >= 1);

  return withScore
    .sort((a, b) => b.total - a.total)
    .map(x => x.book);
}

/**
 * AI 후보 선별용 — 줄거리(summary)까지 포함해 recall을 넓힘
 * 화면 무료검색(calcRelevance)과 별도로 AI 전달용으로만 사용
 */
export function rankForAi(query: string, books: BookEntry[]): BookEntry[] {
  const tokens = tokenize(query);
  const base   = query.trim().toLowerCase();
  const keywords = getKeywords(query);

  const scored = books.map((b) => {
    // 기존 스코어 (태그·제목·hook·유의어)
    let score = directScore(b, base) + synonymScore(b, keywords, base) * 0.4;

    // 토큰 × 줄거리 추가 매칭 (AI 후보용)
    const summaryL = (b.summary || "").toLowerCase();
    for (const tk of tokens) {
      if (tk === base) continue;
      if ((b.tags || []).some(t => t.toLowerCase().includes(tk))) score += 5;
      else if (b.title.toLowerCase().includes(tk)) score += 4;
      else if (summaryL.includes(tk)) score += 2;
    }
    return { book: b, score };
  });

  return scored
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(x => x.book);
}

/**
 * 검색어 기반 연관 키워드 반환
 */
export function getRelatedKeywords(query: string, topBookTags: string[] = []): string[] {
  const base = query.trim().toLowerCase();
  if (!base) return [];
  const tokens = new Set(tokenize(query));
  const suggestions = new Set<string>();
  for (const [key, synonyms] of Object.entries(SYNONYM_MAP)) {
    const hit =
      base === key ||
      tokens.has(key) ||
      synonyms.some(s => tokens.has(s) || (s.includes(" ") && base.includes(s)));
    if (hit) {
      synonyms.forEach(s => { if (!base.includes(s)) suggestions.add(s); });
    }
  }
  topBookTags.forEach(t => { if (!base.includes(t)) suggestions.add(t); });
  return [...suggestions].slice(0, 10);
}

/**
 * page.tsx filterBooks용: 관련도 점수만 반환 (가중치 별도 곱셈용)
 * relevance=0 → 결과에서 제외해야 함
 */
export function calcRelevance(query: string, book: BookEntry): number {
  const base     = query.trim().toLowerCase();
  const keywords = getKeywords(query);
  return scoreBook(book, keywords, base).relevance;
}
