/**
 * Claude API 없이 동작하는 스마트 검색 엔진
 * - 한국어 유의어/연관어 매핑
 * - 태그·훅·제목 가중치 점수 기반 랭킹
 * - 훅 텍스트로 추천 이유 자동 생성
 */

// ── 유의어 / 연관어 사전 ─────────────────────────────────
const SYNONYM_MAP: Record<string, string[]> = {
  // 감정
  용기:   ["용기", "자신감", "희망", "도전", "두려움", "무서움", "극복"],
  슬픔:   ["슬픔", "슬프", "위로", "외로움", "속상함", "눈물", "그리움"],
  기쁨:   ["기쁨", "행복", "즐거움", "신남", "설렘", "웃음"],
  화남:   ["화남", "분노", "짜증", "답답함", "억울함"],
  불안:   ["불안", "걱정", "두려움", "무서움", "긴장"],
  사랑:   ["사랑", "따뜻함", "포근함", "애정", "그리움", "보고싶음"],
  감사:   ["감사", "고마움", "소중함", "배려"],
  외로움: ["외로움", "혼자", "친구", "외롭", "고독"],
  자존감: ["자존감", "자신감", "나다움", "자아", "자존심", "특별함"],

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
  나눔:      ["나눔", "배려", "공유", "함께", "이웃"],
  반려동물:  ["반려동물", "강아지", "고양이", "동물", "펫"],
};

// ── 책 점수 계산 ─────────────────────────────────────────
interface BookEntry {
  id: string;
  title: string;
  tags: string[];
  hook: string;
  age?: string;
  source?: string;
}

function getKeywords(query: string): string[] {
  const base = query.trim().toLowerCase();
  const expanded = new Set<string>([base]);

  // 유의어 확장
  for (const [key, synonyms] of Object.entries(SYNONYM_MAP)) {
    if (base.includes(key) || synonyms.some((s) => base.includes(s))) {
      synonyms.forEach((s) => expanded.add(s));
      expanded.add(key);
    }
  }
  return [...expanded];
}

function scoreBook(book: BookEntry, keywords: string[]): number {
  let score = 0;
  const titleLower = book.title.toLowerCase();
  const hookLower  = (book.hook || "").toLowerCase();
  const tagsLower  = book.tags.map((t) => t.toLowerCase());

  for (const kw of keywords) {
    // 제목 일치 (높은 가중치)
    if (titleLower.includes(kw)) score += 10;
    // 태그 일치
    for (const tag of tagsLower) {
      if (tag.includes(kw) || kw.includes(tag)) score += 5;
    }
    // 훅 일치
    if (hookLower.includes(kw)) score += 3;
  }
  return score;
}

// ── 추천 이유 생성 ────────────────────────────────────────
function buildReason(book: BookEntry, query: string): string {
  if (book.hook) return book.hook;

  const matchedTags = book.tags.filter((t) =>
    query.split(/\s+/).some((q) => t.includes(q) || q.includes(t))
  );

  if (matchedTags.length > 0) {
    return `"${query}" 주제와 관련된 ${matchedTags.slice(0, 3).map((t) => `#${t}`).join(" ")} 태그를 가진 책이에요.`;
  }
  return `"${query}"를 탐색하는 어린이에게 어울리는 책이에요.`;
}

// ── 메인 함수 ─────────────────────────────────────────────
export interface SmartResult {
  id: string;
  reason: string;
}

export function smartSearch(query: string, books: BookEntry[]): SmartResult[] {
  const keywords = getKeywords(query);

  const scored = books
    .map((b) => ({ book: b, score: scoreBook(b, keywords) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return scored.map(({ book }) => ({
    id:     book.id,
    reason: buildReason(book, query),
  }));
}

/**
 * 관련도 순으로 전체 도서를 정렬하여 반환 (Claude 전달용 사전 필터링)
 * 점수 > 0인 책은 앞에, 나머지는 뒤에 붙임
 */
export function rankByRelevance(query: string, books: BookEntry[]): BookEntry[] {
  const keywords = getKeywords(query);

  const withScore = books.map((b) => ({ book: b, score: scoreBook(b, keywords) }));
  const relevant  = withScore.filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  const rest      = withScore.filter((x) => x.score === 0);

  return [...relevant, ...rest].map((x) => x.book);
}
