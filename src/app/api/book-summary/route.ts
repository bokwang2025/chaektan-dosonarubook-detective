import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title") || "";
  const author = searchParams.get("author") || "";
  const tags = searchParams.get("tags") || "";
  const hook = searchParams.get("hook") || "";
  const targetAge = searchParams.get("targetAge") || "";
  const awardName = searchParams.get("awardName") || "";

  if (!title) return NextResponse.json({ summary: null });

  try {
    const prompt = `다음 책의 줄거리를 어린이·학부모·교사가 읽기 쉽게 3~4문장으로 요약해줘.
책 선택에 도움이 되도록 핵심 내용, 주제, 분위기를 담아줘.
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
    return NextResponse.json({ summary });
  } catch {
    return NextResponse.json({ summary: null });
  }
}
