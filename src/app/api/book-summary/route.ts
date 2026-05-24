import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 25;

const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;

// 카카오 Book API — 출판사 소개글 (잘릴 수 있음)
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

// Claude — 카카오 내용을 바탕으로 완성된 줄거리 생성
async function summarizeWithClaude(params: {
  title: string; author: string; awardName: string; targetAge: string;
  tags: string; hook: string; kakaoContents: string | null;
}): Promise<string | null> {
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const contextLines: string[] = [];
    if (params.kakaoContents) {
      contextLines.push(`[출판사 소개글 참고]\n${params.kakaoContents}`);
    }
    if (params.hook) contextLines.push(`[한줄 소개] ${params.hook}`);
    if (params.tags) contextLines.push(`[주제 태그] ${params.tags}`);

    const prompt = `다음 정보를 바탕으로 책의 줄거리를 3문장으로 요약해줘.

규칙:
- 반드시 책의 이야기·내용 중심으로 써줘 (출판사 홍보 문구나 작가 소개는 제외)
- 문장은 반드시 완성된 형태로 끝내줘 (중간에 잘리면 안 됨)
- 어린이·학부모·교사가 읽기 쉽게, 따뜻하고 간결하게
- 한국어로만 답하고, 다른 설명 없이 줄거리만 작성

제목: ${params.title}
저자: ${params.author}
${params.awardName ? `수상: ${params.awardName}` : ""}
${params.targetAge ? `대상 연령: ${params.targetAge}` : ""}
${contextLines.join("\n")}`;

    const message = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 350,
      messages: [{ role: "user", content: prompt }],
    });

    const summary = (message.content[0] as { text: string }).text.trim();
    return summary || null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title     = searchParams.get("title")     || "";
  const author    = searchParams.get("author")    || "";
  const isbn      = searchParams.get("isbn")      || "";
  const origIsbn  = searchParams.get("origIsbn")  || "";
  const awardName = searchParams.get("awardName") || "";
  const targetAge = searchParams.get("targetAge") || "";
  const tags      = searchParams.get("tags")      || "";
  const hook      = searchParams.get("hook")      || "";

  if (!title) return NextResponse.json({ summary: null });

  // 1. 카카오 내용 가져오기
  let kakaoContents = await fetchKakaoContents(isbn);
  if (!kakaoContents && origIsbn) kakaoContents = await fetchKakaoContents(origIsbn);

  // 2. Claude로 완성된 줄거리 생성 (카카오 내용 있으면 그걸 바탕으로, 없으면 메타데이터로)
  const summary = await summarizeWithClaude({
    title, author, awardName, targetAge, tags, hook, kakaoContents,
  });

  if (summary) return NextResponse.json({ summary, source: kakaoContents ? "kakao+claude" : "claude" });

  // 3. Claude 크레딧 없을 때 — 카카오 내용 그대로 (불완전해도)
  if (kakaoContents) {
    // 문장 단위로 자르기
    const sentences = kakaoContents.match(/[^.!?…]*[.!?…]?/g) || [];
    const complete = sentences
      .filter(s => s.trim().length > 5)
      .join("")
      .trim();
    // 마지막 문장이 완성형으로 끝나는지 확인
    const clean = complete.replace(/[^.!?。]*$/, "").trim() || complete;
    return NextResponse.json({ summary: clean || kakaoContents, source: "kakao-raw" });
  }

  return NextResponse.json({ summary: null });
}
