import { NextRequest, NextResponse } from "next/server";
import { smartSearch, rankByRelevance } from "@/lib/smartSearch";

export async function POST(req: NextRequest) {
  try {
    const { query, books } = await req.json();
    if (!query) {
      return NextResponse.json({ error: "검색어가 필요합니다." }, { status: 400 });
    }

    // ── 1. Claude API 시도 ─────────────────────────────
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey && apiKey !== "여기에_Claude_API_키_입력") {
      try {
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const client = new Anthropic({ apiKey });

        // 관련도 순 사전 정렬 → 상위 300권만 Claude에 전달
        const ranked = rankByRelevance(query, books);
        const booksSlice = ranked.slice(0, 300);
        const prompt = `당신은 어린이 도서 추천 전문가입니다.
아래는 도서 목록(JSON)입니다. 각 도서에는 tags(주제/감정/상황 태그)와 hook(추천 상황 설명)이 있습니다.

도서 목록:
${JSON.stringify(booksSlice, null, 0)}

사용자 검색어: "${query}"

위 검색어와 가장 관련성 높은 책 최대 10권을 골라주세요.
태그, 훅, 제목을 종합적으로 고려하세요.
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
        // 아래 스마트 검색으로 계속
      }
    }

    // ── 2. 스마트 검색 (로컬 폴백) ────────────────────
    const results = smartSearch(query, books);
    return NextResponse.json({ results, engine: "smart" });

  } catch (err) {
    console.error("AI search error:", err);
    return NextResponse.json({ error: "검색 중 오류가 발생했습니다." }, { status: 500 });
  }
}
