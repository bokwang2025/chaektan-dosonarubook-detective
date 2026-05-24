import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 20;

// 기존 데이터(hook, notice, tags)로 줄거리 구성 — API 크레딧 불필요
function buildSummaryFromData(params: URLSearchParams): string | null {
  const hook         = params.get("hook")?.trim()    || "";
  const notice       = params.get("notice")?.trim()  || "";
  const situation    = params.get("situationTags")?.trim() || "";
  const emotion      = params.get("emotionTags")?.trim()   || "";
  const topic        = params.get("topicTags")?.trim()     || "";
  const awardName    = params.get("awardName")?.trim()     || "";
  const awardYear    = params.get("awardYear")?.trim()     || "";
  const targetAge    = params.get("targetAge")?.trim()     || "";
  const author       = params.get("author")?.trim()        || "";

  const parts: string[] = [];

  // ① 수상 정보
  if (awardName && awardYear) {
    parts.push(`${awardYear}년 ${awardName} 수상작으로,`);
  } else if (awardName) {
    parts.push(`${awardName} 수상작으로,`);
  }

  // ② hook (한줄 소개) → 핵심 문장
  if (hook) {
    // "~할 때" 형태 → "~할 때 추천하는 책이에요" 로 변환
    if (hook.endsWith("할 때") || hook.endsWith("싶을 때") || hook.endsWith("때")) {
      parts.push(`${hook} 추천하는 책이에요.`);
    } else {
      parts.push(hook.endsWith(".") || hook.endsWith("요") || hook.endsWith("다") ? hook : `${hook}.`);
    }
  }

  // ③ notice (주목 포인트)
  if (notice) {
    parts.push(notice.endsWith(".") || notice.endsWith("요") || notice.endsWith("다") ? notice : `${notice}.`);
  }

  // ④ 태그 조합 → 주제 문장
  const allTags: string[] = [
    ...situation.split(",").map(t => t.trim()).filter(Boolean),
    ...emotion.split(",").map(t => t.trim()).filter(Boolean),
    ...topic.split(",").map(t => t.trim()).filter(Boolean),
  ];
  const uniqueTags = [...new Set(allTags)].slice(0, 5);
  if (uniqueTags.length >= 2) {
    parts.push(`${uniqueTags.join(", ")} 등을 섬세하게 담아낸 작품입니다.`);
  } else if (uniqueTags.length === 1) {
    parts.push(`${uniqueTags[0]}을(를) 따뜻하게 그려낸 그림책입니다.`);
  }

  // ⑤ 연령 + 저자 안내
  if (targetAge && author) {
    parts.push(`${targetAge} 어린이와 함께 읽기 좋으며, ${author}의 작품입니다.`);
  } else if (targetAge) {
    parts.push(`${targetAge} 어린이에게 추천합니다.`);
  }

  if (parts.length === 0) return null;
  return parts.join(" ");
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title") || "";
  if (!title) return NextResponse.json({ summary: null });

  // 1순위: 기존 데이터로 즉시 구성 (항상 작동)
  const localSummary = buildSummaryFromData(searchParams);
  if (localSummary) {
    return NextResponse.json({ summary: localSummary, source: "local" });
  }

  // 데이터 없는 경우 → Claude AI 시도 (크레딧 있을 때만 작동)
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const author    = searchParams.get("author")    || "";
    const tags      = searchParams.get("tags")      || "";
    const targetAge = searchParams.get("targetAge") || "";
    const awardName = searchParams.get("awardName") || "";

    const prompt = `다음 책의 줄거리를 어린이·학부모·교사가 읽기 쉽게 3~4문장으로 요약해줘.
반드시 한국어로만 답하고, 다른 설명 없이 줄거리만 작성해.

제목: ${title}
저자: ${author}
${awardName ? `수상: ${awardName}` : ""}
${targetAge ? `대상 연령: ${targetAge}` : ""}
${tags ? `주제 태그: ${tags}` : ""}`;

    const message = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });

    const summary = (message.content[0] as { text: string }).text.trim();
    return NextResponse.json({ summary, source: "claude" });
  } catch {
    return NextResponse.json({ summary: null });
  }
}
