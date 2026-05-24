import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 20;

const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;

// 1순위: 카카오 Book API — 출판사 줄거리 (무료, 한국어)
async function fetchKakaoContents(isbn: string): Promise<string | null> {
  if (!isbn || !KAKAO_KEY) return null;
  try {
    const res = await fetch(
      `https://dapi.kakao.com/v3/search/book?target=isbn&query=${isbn}`,
      { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }, next: { revalidate: 86400 } }
    );
    const data = await res.json();
    const contents = data?.documents?.[0]?.contents as string | undefined;
    return contents && contents.trim().length > 20 ? contents.trim() : null;
  } catch { return null; }
}

// 2순위: Claude AI — ISBN 없거나 카카오에 없을 때
async function fetchClaudeSummary(params: URLSearchParams): Promise<string | null> {
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const title     = params.get("title")     || "";
    const author    = params.get("author")    || "";
    const tags      = params.get("tags")      || "";
    const hook      = params.get("hook")      || "";
    const targetAge = params.get("targetAge") || "";
    const awardName = params.get("awardName") || "";

    const prompt = `다음 책의 줄거리를 어린이·학부모·교사가 읽기 쉽게 3~4문장으로 요약해줘.
출판사 소개글처럼 핵심 내용, 주제, 분위기를 담아줘.
반드시 한국어로만 답하고, 다른 설명 없이 줄거리만 작성해.

제목: ${title}
저자: ${author}
${awardName ? `수상: ${awardName}` : ""}
${targetAge ? `대상 연령: ${targetAge}` : ""}
${tags ? `주제 태그: ${tags}` : ""}
${hook ? `한줄 소개: ${hook}` : ""}`;

    const message = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });

    const summary = (message.content[0] as { text: string }).text.trim();
    return summary || null;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title    = searchParams.get("title") || "";
  const isbn     = searchParams.get("isbn")  || "";
  const origIsbn = searchParams.get("origIsbn") || "";

  if (!title) return NextResponse.json({ summary: null });

  // 1순위: 카카오 (한국 ISBN → 원서 ISBN 순으로 시도)
  let summary = await fetchKakaoContents(isbn);
  if (!summary && origIsbn) summary = await fetchKakaoContents(origIsbn);

  if (summary) return NextResponse.json({ summary, source: "kakao" });

  // 2순위: Claude AI (카카오에 없는 경우)
  summary = await fetchClaudeSummary(searchParams);
  if (summary) return NextResponse.json({ summary, source: "claude" });

  return NextResponse.json({ summary: null });
}
