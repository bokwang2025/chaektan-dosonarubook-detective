import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 25;

const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;

// ISBN-13 → ISBN-10 변환 (Amazon ASIN)
function isbn13to10(isbn13: string): string | null {
  if (!isbn13 || isbn13.length !== 13) return null;
  const body = isbn13.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * parseInt(body[i]);
  const check = (11 - (sum % 11)) % 11;
  return body + (check === 10 ? "X" : check.toString());
}

// ISBN이 해외 원서인지 판별
function isForeignIsbn(isbn: string): boolean {
  if (!isbn) return false;
  return !isbn.startsWith("9788") && !isbn.startsWith("9791");
}

// 카카오 Book API — 출판사 소개글
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

// Amazon 상품 페이지에서 책 설명 가져오기 (서버사이드 전용, API 키 불필요)
async function fetchAmazonDescription(isbn13: string): Promise<string | null> {
  const isbn10 = isbn13to10(isbn13);
  if (!isbn10) return null;
  try {
    const res = await fetch(`https://www.amazon.com/dp/${isbn10}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml",
      },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const html = await res.text();
    if (html.includes("captcha") || html.includes("robot check")) return null;

    // 책 설명 파싱 — Amazon 여러 셀렉터 시도
    const patterns = [
      /<div[^>]*id="bookDescription_feature_div"[^>]*>([\s\S]*?)<\/noscript>/,
      /<div[^>]*id="bookDescription_feature_div"[^>]*>([\s\S]*?)<\/div>/,
      /<div[^>]*data-feature-name="bookDescription"[^>]*>([\s\S]*?)<\/div>/,
      /<span[^>]*class="a-expander-content[^"]*readable-content[^"]*"[^>]*>([\s\S]*?)<\/span>/,
    ];
    for (const pattern of patterns) {
      const m = html.match(pattern);
      if (m) {
        const text = m[1]
          .replace(/<[^>]+>/g, " ")
          .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
          .replace(/\s+/g, " ").trim();
        if (text.length > 50) return text.substring(0, 500);
      }
    }
    return null;
  } catch { return null; }
}

// Claude — 줄거리 생성
async function summarizeWithClaude(params: {
  title: string; author: string; awardName: string; targetAge: string;
  tags: string; hook: string; notice: string;
  kakaoContents: string | null; amazonDesc: string | null;
  isForeign: boolean;
}): Promise<{ text: string; isEstimate: boolean } | null> {
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const hasRealContent = !!(params.kakaoContents || params.amazonDesc || params.notice);
    const isEstimate = params.isForeign && !hasRealContent;

    const contextLines: string[] = [];
    if (params.kakaoContents) {
      contextLines.push(`[출판사 소개글 참고]\n${params.kakaoContents}`);
    }
    if (params.amazonDesc) {
      contextLines.push(`[Amazon 원서 소개글 — 가장 중요, 이 내용을 기반으로 줄거리를 써줘]\n${params.amazonDesc}`);
    }
    if (params.notice) contextLines.push(`[도서관 소개글 참고]\n${params.notice}`);
    if (params.hook) contextLines.push(`[줄거리 힌트] ${params.hook}`);
    if (params.tags) contextLines.push(`[주제 태그] ${params.tags}`);

    const estimateNote = isEstimate
      ? "\n주의: 소개글이 없어 제목·정보만으로 추정하는 내용입니다."
      : "";

    const prompt = `다음 정보를 바탕으로 책의 줄거리를 3문장으로 요약해줘.${estimateNote}

규칙:
- 소개글이 영어여도 반드시 한국어로 번역해서 줄거리를 써줘
- 책의 이야기·내용 중심으로 써줘 (홍보문구·수상정보 나열 제외)
- 문장은 완성된 형태로 끝내줘
- 어린이·학부모·교사가 읽기 쉽게, 따뜻하고 간결하게
- 한국어로만 답하고, 다른 설명 없이 줄거리만 작성
- 절대로 책 제목이나 "제목:" 같은 말로 시작하지 말고, 바로 이야기 내용으로 시작해줘

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

    const text = (message.content[0] as { text: string }).text.trim();
    return text ? { text, isEstimate } : null;
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
  const notice    = searchParams.get("notice")    || "";

  if (!title) return NextResponse.json({ summary: null });

  // 1. 카카오 내용 (한국 출간 도서)
  let kakaoContents = await fetchKakaoContents(isbn);
  if (!kakaoContents && origIsbn) kakaoContents = await fetchKakaoContents(origIsbn);

  // 2. 해외 원서이고 Kakao 없으면 → Amazon 설명 가져오기
  const isForeign = isForeignIsbn(isbn) && isForeignIsbn(origIsbn);
  let amazonDesc: string | null = null;
  if (isForeign && !kakaoContents) {
    const foreignIsbn = isForeignIsbn(isbn) ? isbn : origIsbn;
    if (foreignIsbn) amazonDesc = await fetchAmazonDescription(foreignIsbn);
  }

  // 3. Claude로 줄거리 생성
  const result = await summarizeWithClaude({
    title, author, awardName, targetAge, tags, hook, notice,
    kakaoContents, amazonDesc, isForeign,
  });

  if (result) {
    return NextResponse.json({
      summary: result.text,
      isEstimate: result.isEstimate,
      source: kakaoContents ? "kakao+claude" : amazonDesc ? "amazon+claude" : "claude",
    });
  }

  // 4. Claude 실패 시 — 카카오/Amazon 내용 그대로
  const rawContent = kakaoContents || amazonDesc;
  if (rawContent) {
    const sentences = rawContent.match(/[^.!?…]*[.!?…]?/g) || [];
    const complete = sentences.filter(s => s.trim().length > 5).join("").trim();
    const clean = complete.replace(/[^.!?。]*$/, "").trim() || complete;
    return NextResponse.json({ summary: clean || rawContent, source: "raw" });
  }

  return NextResponse.json({ summary: null });
}
