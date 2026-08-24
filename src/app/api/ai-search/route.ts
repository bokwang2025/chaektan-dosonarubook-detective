import { NextRequest, NextResponse } from "next/server";
import { smartSearch, rankByRelevance, calcWeight, BookEntry } from "@/lib/smartSearch";

/**
 * 응답에서 첫 번째 균형 잡힌 {...} JSON 객체만 추출.
 * 마크다운 펜스·앞뒤 잡담(모델이 JSON 앞뒤에 붙이는 설명)을 제거해 파싱 안정성을 높인다.
 * 문자열 리터럴 내부의 중괄호·이스케이프를 구분한다.
 */
function extractFirstJsonObject(s: string): string | null {
  const start = s.indexOf("{");
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) return s.slice(start, i + 1); }
  }
  return null;
}

// 콜드스타트 대비 함수 실행 시간 여유 (1회 재시도 포함) — 타 라우트와 동일 수준
export const maxDuration = 25;

/**
 * 워밍업(GET): 서버리스 함수 부팅 + Anthropic SDK 모듈 프리로드만 수행.
 * Claude API는 호출하지 않으므로 비용 0. 홈 로드 시 클라이언트가 1회 호출해 함수를 미리 깨운다.
 */
export async function GET() {
  try { await import("@anthropic-ai/sdk"); } catch { /* noop */ }
  return NextResponse.json({ ok: true, warmed: true });
}

export async function POST(req: NextRequest) {
  try {
    const { query, books: rawBooks } = await req.json();
    if (!query) {
      return NextResponse.json({ error: "검색어가 필요합니다." }, { status: 400 });
    }

    // 가중치(W3)는 koreanIsbn/isbn 기반 보유 순위로 내부 계산됨
    const books = rawBooks as BookEntry[];

    // ── 1. Claude API 시도 ─────────────────────────────
    const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (apiKey && apiKey !== "여기에_Claude_API_키_입력") {
      let rawText = "";
      try {
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const client = new Anthropic({ apiKey, maxRetries: 0 }); // 재시도는 아래에서 직접 1회 제어

        // 가중치 반영 관련도 순 사전 정렬 → 상위 300권만 Claude에 전달
        const ranked = rankByRelevance(query, books);
        const booksSlice = ranked.slice(0, 300);

        // Claude 전달 시 가중치 + 줄거리 포함 (추천 판단 품질 향상)
        const booksForClaude = booksSlice.map((b) => ({
          id: b.id,
          title: b.title,
          tags: b.tags,
          hook: b.hook,
          summary: (b.summary || "").slice(0, 100),
          age: b.age,
          source: b.source,
          awardCount: b.awardCount,
          sources: b.sources,
          weight: Math.round(calcWeight(b) * 100) / 100,
        }));

        const prompt = `당신은 어린이 도서 추천 전문가입니다.
아래는 도서 목록(JSON)입니다. 각 도서에는 tags(주제/감정/상황 태그), hook(추천 상황 설명), summary(줄거리 요약), weight(가중치 점수)가 있습니다.
weight가 높을수록 다수 기관 추천·수상 이력이 풍부한 책입니다.

도서 목록:
${JSON.stringify(booksForClaude, null, 0)}

사용자 검색어: "${query}"

위 검색어의 **의미·상황·감정**에 맞는 책을 골라주세요.
제목·태그뿐 아니라 줄거리(summary) 기준으로 판단하고, 동일 관련도라면 weight가 높은 책을 우선하세요.
관련 있는 책을 최대 15권 골라주세요.
응답은 반드시 아래 JSON 형식만 반환하세요 (설명 없이):
{"results": [{"id": "책id", "reason": "이 책을 추천하는 이유 1-2문장 (한국어)"}]}`;

        // 콜드스타트/일시 오류 대비: 실패 시 즉시 폴백하지 않고 1회 자동 재시도.
        // 각 시도에 짧은 타임아웃(10s)을 둬 재시도 여유를 확보(2회 × 10s < maxDuration 25s).
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const message = await client.messages.create(
              {
                model: "claude-haiku-4-5",
                max_tokens: 1500,
                messages: [{ role: "user", content: prompt }],
              },
              { timeout: 10000 }
            );
            rawText = message.content[0].type === "text" ? message.content[0].text : "";
            // 첫 {...} JSON 객체만 추출 → 파싱 (마크다운 펜스·앞뒤 잡담에 견고)
            const jsonStr = extractFirstJsonObject(rawText);
            if (!jsonStr) throw new Error("응답에서 JSON 객체를 찾지 못함");
            const parsed = JSON.parse(jsonStr);
            return NextResponse.json({ ...parsed, engine: "claude" });
          } catch (attemptErr) {
            const reason = attemptErr instanceof Error ? attemptErr.message : String(attemptErr);
            if (attempt === 0) {
              console.warn(`[ai-search] 1차 시도 실패 → 1회 재시도: ${reason}`);
              continue; // 폴백 전 1회 재시도
            }
            // 재시도도 실패 → 아래 smart 폴백으로. 진단 로그(검색어 전문·개인정보 미기록)
            const head = rawText.slice(0, 120).replace(/\s+/g, " ").trim();
            console.warn(`[ai-search] 재시도도 실패 → smart 폴백: ${reason}`);
            if (head) console.warn(`[ai-search] 응답 앞부분(120자): ${head}`);
          }
        }

      } catch (setupErr) {
        // 초기화(SDK 임포트·클라이언트·프롬프트 구성) 실패 → smart 폴백
        const reason = setupErr instanceof Error ? setupErr.message : String(setupErr);
        console.warn(`[ai-search] Claude 초기화 실패 → smart 폴백: ${reason}`);
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
