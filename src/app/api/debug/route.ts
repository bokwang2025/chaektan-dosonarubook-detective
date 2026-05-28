import { NextResponse } from "next/server";

export async function GET() {
  const LIB_API_KEY = process.env.LIB_API_KEY || "be9456f40126dbefd5c69c0a647affe45f49a41766a6b10c5919c531810fe1ef";
  const isbn = "9788936446819"; // 수박 수영장 (서울 173개 도서관 소장 확인)

  const url = `https://data4library.kr/api/libSrchByBook?authKey=${LIB_API_KEY}&isbn=${isbn}&region=11&pageSize=5&format=json`;

  let rawStatus = 0;
  let rawText = "";
  let parsed: unknown = null;
  let fetchError = "";
  let timing = 0;

  const t0 = Date.now();
  try {
    const res = await fetch(url, { cache: "no-store" });
    rawStatus = res.status;
    rawText = await res.text();
    timing = Date.now() - t0;
    try { parsed = JSON.parse(rawText); } catch { /* not json */ }
  } catch (e: unknown) {
    fetchError = String(e);
    timing = Date.now() - t0;
  }

  type ParsedType = { response?: { numFound?: string; libs?: unknown[] } };
  const p = parsed as ParsedType;

  const claudeKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;

  return NextResponse.json({
    env: {
      LIB_API_KEY: process.env.LIB_API_KEY ? `set (${process.env.LIB_API_KEY.slice(0, 6)}...)` : "NOT SET",
      CLAUDE_API_KEY: process.env.CLAUDE_API_KEY
        ? `set (len=${process.env.CLAUDE_API_KEY.length})`
        : "NOT SET",
      ANTHROPIC_API_KEY_raw: process.env.ANTHROPIC_API_KEY || "(empty)",
      effectiveKey: claudeKey ? `set (${claudeKey.slice(0, 15)}... len=${claudeKey.length})` : "NOT SET",
      cwd: process.cwd(),
    },
    test: {
      url,
      httpStatus: rawStatus,
      timingMs: timing,
      fetchError: fetchError || null,
      rawPreview: rawText.slice(0, 600),
      numFound: p?.response?.numFound ?? null,
      libCount: (p?.response?.libs ?? []).length,
    },
  });
}
