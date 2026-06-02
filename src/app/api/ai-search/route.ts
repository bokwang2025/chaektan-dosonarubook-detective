import { NextRequest, NextResponse } from "next/server";
import { smartSearch, rankByRelevance, calcWeight, BookEntry } from "@/lib/smartSearch";
import libraryCounts from "@/data/library_counts.json";

// library_counts.json: { [isbn]: count }
const LC = libraryCounts as Record<string, number>;

/** books 페이로드에 libraryCount 주입 */
function injectLibraryCount(books: BookEntry[]): BookEntry[] {
  return books.map((b) => ({
    ...b,
    libraryCount: LC[b.isbn ?? ""] ?? 0,
  }));
}

export async function POST(req: NextRequest) {
  try {
    const { query, books: rawBooks } = await req.json();
    if (!query) {
      return NextResponse.json({ error: "검색어가 필요합니다." }, { status: 400 });
    }

    // libraryCount 주입
    const books = injectLibraryCount(rawBooks as BookEntry[]);

    // ── 1. Claude API 시도 ─────────────────────────────
    const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (apiKey && apiKey !== "여기에_Claude_API_키_입력") {
      try {
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const client = new Anthropic({ apiKey });

        // 가중치 반영 관련도 순 사전 정렬 → 상위 300권만 Claude에 전달
        const ranked = rankByRelevance(query, books);
        const booksSlice = ranked.slice(0, 300);

        // Claude 전달 시 가중치 정보도 포함 (추천 이유 품질 향상)
        const booksForClaude = booksSlice.map((b) => ({
          id: b.id,
          title: b.title,
          tags: b.tags,
          hook: b.hook,
          age: b.age,
          source: b.source,
          awardCount: b.awardCount,
          sources: b.sources,
          weight: Math.round(calcWeight(b) * 100) / 100,
        }));

        const prompt = `당신은 어린이 도서 추천 전문가입니다.
아래는 도서 목록(JSON)입니다. 각 도서에는 tags(주제/감정/상황 태그), hook(추천 상황 설명), weight(가중치 점수)가 있습니다.
weight가 높을수록 다수 기관 추천·수상 이력이 풍부한 책입니다.

도서 목록:
${JSON.stringify(booksForClaude, null, 0)}

사용자 검색어: "${query}"

위 검색어와 가장 관련성 높은 책 최대 10권을 골라주세요.
태그, 훅, 제목을 종합적으로 고려하고, 동일 관련도라면 weight가 높은 책을 우선하세요.
응답은 반드시 아래 JSON 형식만 반환하세요 (설명 없이):
{"results": [{"id": "책id", "reason": "이 책을 추천하는 이유 1-2문장 (한국어)"}]}`;

        const message = await client.messages.create({
          model: "claude-haiku-4-5",
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        });

        const text = message.content[0].type === "text" ? message.content[0].text : "";
        const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed = JSON.parse(cleaned);
        return NextResponse.json({ ...parsed, engine: "claude" });

      } catch (claudeErr) {
        console.warn("Claude API 실패, 스마트 검색으로 전환:", claudeErr);
      }
    }

    // ── 2. 스마트 검색 (로컬 폴백, 가중치 적용) ────────
    const results = smartSearch(query, books);
    return NextResponse.json({ results, engine: "smart" });

  } catch (err) {
    console.error("AI search error:", err);
    return NextResponse.json({ error: "검색 중 오류가 발생했습니다." }, { status: 500 });
  }
}
