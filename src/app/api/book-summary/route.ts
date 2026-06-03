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
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY });

    const hasRealContent = !!(params.kakaoContents || params.amazonDesc || params.notice);
    const isEstimate = params.isForeign && !hasRealContent;

    const contextLines: string[] = [];
    if (params.kakaoContents) {
      contextLines.push(`[출판사 소개글 — 마케팅·수상·저자 칭찬이 섞여 있으니 줄거리(사건·전개)만 추출]\n${params.kakaoContents}`);
    }
    if (params.amazonDesc) {
      contextLines.push(`[Amazon 원서 소개글 — 가장 중요, 이 내용을 기반으로 줄거리를 써줘]\n${params.amazonDesc}`);
    }
    // notice는 kakaoContents와 거의 동일(마케팅 원문)이라 중복 입력 방지
    if (params.notice && !params.kakaoContents) contextLines.push(`[참고 소개글 — 마케팅 포함 가능, 줄거리만 추출]\n${params.notice}`);
    if (params.hook) contextLines.push(`[줄거리 힌트] ${params.hook}`);
    if (params.tags) contextLines.push(`[주제 태그] ${params.tags}`);

    const estimateNote = isEstimate
      ? "\n주의: 소개글이 없어 제목·정보만으로 추정하는 내용입니다."
      : "";

    const prompt = `아래 참고 자료를 바탕으로 이 책의 "이야기 줄거리"만 3문장으로 써줘.${estimateNote}

[반드시 지킬 것]
- 오직 이야기(등장인물·사건·전개) 내용만 써라. 줄거리가 아닌 문장은 모두 버려라.
- 책 제목, 저자 이름, 출판사, 수상 이력(○○상 수상작 등), 작가 소개·칭찬, 홍보·추천 문구는 절대 쓰지 마라.
- "이 책은", "○○ 작가의", "○○상 수상작인" 같은 표현으로 시작하거나 언급하지 마라. 바로 이야기로 시작하라.
- 참고 소개글에 마케팅·수상·저자 칭찬이 섞여 있으면 그 부분은 무시하고 실제 줄거리만 뽑아내라.
- 영어 자료는 한국어로 옮겨 써라.
- 모든 문장은 완성된 형태로 끝맺어라. 어린이·학부모·교사가 읽기 쉽게 따뜻하고 간결하게.
- 한국어 줄거리 문장만 출력하고 그 외의 말은 붙이지 마라.
${params.targetAge ? `(대상 연령: ${params.targetAge})` : ""}

[참고 자료]
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

/**
 * 생성된 줄거리 사후 필터 — 모델이 규칙을 어겨도 메타/홍보 문장을 제거하는 안전장치
 * 제목·저자·수상·홍보·"이 책은" 등이 들어간 문장을 통째로 버리고 줄거리 문장만 남김
 */
function sanitizeSummary(text: string, title: string, author: string): string {
  const META = /(수상작|수상 작가|수상에 빛|후보작|베스트셀러|스테디셀러|화제작|화제의|강력 ?추천|출간되었|출간!|펴낸|펴낸이|옮긴이|글쓴이|지은이|그린이|데뷔작|대표작|신작|이 책은|이 그림책|독자라면|작가의|작가가|평론|에디터)/;
  const authorTokens = (author || "").split(/[\s;,·/]+/).filter((t) => t.length >= 2);
  const sents = (text.match(/[^.!?。…\n]+[.!?。…]?/g) || []).map((x) => x.trim()).filter(Boolean);
  const kept = sents.filter((sen) => {
    if (META.test(sen)) return false;
    if (title && title.length >= 2 && sen.includes(title)) return false;
    if (authorTokens.some((t) => sen.includes(t))) return false;
    return true;
  });
  const out = kept.join(" ").trim();
  if (out.length >= 20) return out;
  // 과도 제거 방지: 선두 메타 1문장만 제거하고 원문 유지
  return text.replace(/^\s*[^.!?。…]*?(수상작|작가의|이 책은|베스트셀러|출간)[^.!?。…]*[.!?。…]\s*/, "").trim() || text;
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
      summary: sanitizeSummary(result.text, title, author),
      isEstimate: result.isEstimate,
      source: kakaoContents ? "kakao+claude" : amazonDesc ? "amazon+claude" : "claude",
    });
  }

  // 4. Claude 실패 시 — 원문에서 홍보·수상·저자 문장을 걷어내고 줄거리 문장만
  const rawContent = kakaoContents || amazonDesc;
  if (rawContent) {
    const META = /(수상|수상작|작가|베스트셀러|스테디셀러|추천|화제|출간|펴낸|옮긴이|글쓴이|지은이|그린이|작품이다$|그림책입니다$|동화입니다$)/;
    const sents = (rawContent.match(/[^.!?…]+[.!?…]?/g) || [])
      .map((x) => x.trim())
      .filter((x) => x.length > 5 && !META.test(x) && !x.startsWith("이 책은"));
    const clean = sents.join(" ").replace(/[^.!?。…]*$/, "").trim();
    if (clean.length > 20) {
      return NextResponse.json({ summary: clean, source: "raw-cleaned" });
    }
  }

  return NextResponse.json({ summary: null });
}
