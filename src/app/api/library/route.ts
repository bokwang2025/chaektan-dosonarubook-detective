import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 25;

const LIB_API_KEY =
  process.env.LIB_API_KEY ||
  "be9456f40126dbefd5c69c0a647affe45f49a41766a6b10c5919c531810fe1ef";
const BASE = "https://data4library.kr/api";

function buildBookSearchUrl(homepage: string, isbn: string): string {
  const base = homepage.replace(/\/$/, "");
  return `${base}/search/tot/result?searchType=SIMPLE&searchKey=ISBN&searchValue=${isbn}`;
}

function regionFromCoords(lat: number, lng: number): string {
  if (lat > 37.40 && lat < 37.71 && lng > 126.79 && lng < 127.19) return "11";
  if (lat > 37.27 && lat < 37.63 && lng > 126.44 && lng < 126.80) return "23";
  if (lat > 36.90 && lat < 38.31 && lng > 126.30 && lng < 127.90) return "31";
  if (lat > 36.19 && lat < 36.52 && lng > 127.29 && lng < 127.51) return "25";
  if (lat > 36.40 && lat < 36.62 && lng > 127.17 && lng < 127.32) return "29";
  if (lat > 35.73 && lat < 36.03 && lng > 128.50 && lng < 128.78) return "22";
  if (lat > 35.04 && lat < 35.30 && lng > 128.86 && lng < 129.32) return "21";
  if (lat > 35.44 && lat < 35.64 && lng > 129.04 && lng < 129.42) return "26";
  if (lat > 35.05 && lat < 35.27 && lng > 126.78 && lng < 126.97) return "24";
  if (lat > 37.00 && lat < 38.60 && lng > 127.70 && lng < 129.40) return "32";
  if (lat > 36.20 && lat < 37.20 && lng > 127.40 && lng < 128.50) return "33";
  if (lat > 36.00 && lat < 37.00 && lng > 126.10 && lng < 127.40) return "34";
  if (lat > 35.30 && lat < 36.20 && lng > 126.50 && lng < 127.80) return "35";
  if (lat > 34.20 && lat < 35.30 && lng > 126.00 && lng < 127.60) return "36";
  if (lat > 35.50 && lat < 37.30 && lng > 128.40 && lng < 129.50) return "37";
  if (lat > 34.70 && lat < 35.70 && lng > 127.60 && lng < 129.10) return "38";
  if (lat > 33.10 && lat < 33.60 && lng > 126.10 && lng < 126.95) return "39";
  return "11";
}

interface LibRaw {
  libCode: string; libName: string; address: string;
  tel: string; homepage: string;
  latitude: string; longitude: string;
  distance?: number;
}

// fetch 1회 — 개별 타임아웃 포함
async function timedFetch(url: string, ms = 5000): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { cache: "no-store", signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

// libSrchByBook 1회 호출
async function fetchLibs(isbn: string, region: string, pageSize = 10): Promise<LibRaw[]> {
  try {
    const url = `${BASE}/libSrchByBook?authKey=${LIB_API_KEY}&isbn=${isbn}&region=${region}&pageSize=${pageSize}&format=json`;
    const res  = await timedFetch(url, 5000);
    const data = await res.json();
    return (data?.response?.libs ?? []).map((l: { lib: LibRaw }) => ({
      libCode:   l.lib.libCode,
      libName:   l.lib.libName,
      address:   l.lib.address,
      tel:       l.lib.tel,
      homepage:  l.lib.homepage,
      latitude:  l.lib.latitude,
      longitude: l.lib.longitude,
    }));
  } catch { return []; }
}

// bookExist 1회 — 2초 타임아웃, 실패 시 null 반환
async function checkExist(libCode: string, isbn: string) {
  try {
    const url = `${BASE}/bookExist?authKey=${LIB_API_KEY}&libCode=${libCode}&isbn13=${isbn}&format=json`;
    const res  = await timedFetch(url, 2000);
    const data = await res.json();
    const r    = data?.response?.result ?? {};
    return { hasBook: r.hasBook ?? "", loanAvailable: r.loanAvailable ?? "N" };
  } catch { return null; }
}

function dist(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function resolveLibraries(isbn: string, userLat: number | null, userLng: number | null): Promise<LibRaw[]> {
  let libs: LibRaw[] = [];

  if (userLat && userLng) {
    // 위치 있음: 해당 지역 1번 호출
    const region = regionFromCoords(userLat, userLng);
    libs = await fetchLibs(isbn, region, 20);

    // 부족하면 서울 + 경기 보완
    if (libs.length < 3) {
      const extras = await Promise.all(
        ["11", "31"].filter(r => r !== region).map(r => fetchLibs(isbn, r, 10))
      );
      libs = [...libs, ...extras.flat()];
    }
  } else {
    // 위치 없음: 서울 + 경기만 (가장 도서관 多)
    const [a, b] = await Promise.all([
      fetchLibs(isbn, "11", 10),
      fetchLibs(isbn, "31", 10),
    ]);
    libs = [...a, ...b];

    // 여전히 없으면 주요 광역시
    if (!libs.length) {
      const extras = await Promise.all(
        ["21", "22", "23", "24", "25", "26"].map(r => fetchLibs(isbn, r, 5))
      );
      libs = extras.flat();
    }
  }

  // 중복 제거
  const seen = new Set<string>();
  return libs.filter(l => { if (seen.has(l.libCode)) return false; seen.add(l.libCode); return true; });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const isbn = searchParams.get("isbn");
  const lat  = searchParams.get("lat");
  const lng  = searchParams.get("lng");

  if (!isbn) return NextResponse.json({ error: "ISBN이 필요합니다." }, { status: 400 });

  const userLat = lat ? parseFloat(lat) : null;
  const userLng = lng ? parseFloat(lng) : null;

  // ── 전체 8초 hard deadline ────────────────────────────────
  const HARD_LIMIT = 8000;
  let timedOut = false;
  const hardTimer = setTimeout(() => { timedOut = true; }, HARD_LIMIT);

  try {
    let libraries = await resolveLibraries(isbn, userLat, userLng);

    if (!libraries.length) {
      clearTimeout(hardTimer);
      return NextResponse.json({ libraries: [], message: "소장 도서관 없음" });
    }

    // 거리 정렬
    if (userLat && userLng) {
      libraries = libraries
        .map(l => ({ ...l, distance: dist(userLat, userLng, parseFloat(l.latitude || "0"), parseFloat(l.longitude || "0")) }))
        .sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999));
    }

    const top5 = libraries.slice(0, 5);

    // 출력 타입
    interface LibResult {
      libCode: string; libName: string; address: string; tel: string;
      homepage: string; bookSearchUrl: string | null;
      distance: number | undefined; loanAvailable: boolean;
    }

    // lib → LibResult 변환 (loanAvailable 기본값 false)
    const toResult = (lib: LibRaw, loanAvailable = false): LibResult => ({
      libCode:       lib.libCode,
      libName:       lib.libName,
      address:       lib.address,
      tel:           lib.tel,
      homepage:      lib.homepage,
      bookSearchUrl: lib.homepage ? buildBookSearchUrl(lib.homepage, isbn) : null,
      distance:      lib.distance,
      loanAvailable,
    });

    // ── bookExist: 아직 시간 여유 있으면 실행, 없으면 스킵 ──
    let finalLibs: LibResult[] = [];

    if (!timedOut) {
      const checked = await Promise.all(
        top5.map(async (lib): Promise<LibResult | null> => {
          if (timedOut) return null;
          const exist = await checkExist(lib.libCode, isbn);
          if (exist?.hasBook === "N") return null; // 명시적 미소장만 제외
          return toResult(lib, exist?.loanAvailable === "Y");
        })
      );
      finalLibs = checked.filter((x): x is LibResult => x !== null);
    }

    // bookExist 실패/타임아웃 → libSrchByBook 결과 그대로 반환
    if (!finalLibs.length) {
      finalLibs = top5.map(lib => toResult(lib, false));
    }

    clearTimeout(hardTimer);
    return NextResponse.json({ libraries: finalLibs });

  } catch (err) {
    clearTimeout(hardTimer);
    console.error("Library API error:", err);
    return NextResponse.json({ error: "도서관 조회 오류" }, { status: 500 });
  }
}
