import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 25;

// 도서관 홈페이지 → 도서 직접 검색 URL 구성
function buildBookSearchUrl(homepage: string, isbn: string): string {
  const base = homepage.replace(/\/$/, "");
  return `${base}/search/tot/result?searchType=SIMPLE&searchKey=ISBN&searchValue=${isbn}`;
}

const LIB_API_KEY = process.env.LIB_API_KEY || "be9456f40126dbefd5c69c0a647affe45f49a41766a6b10c5919c531810fe1ef";
const BASE = "https://data4library.kr/api";

// 위경도 → 지역코드 (빠른 근사)
function regionFromCoords(lat: number, lng: number): string {
  if (lat > 37.40 && lat < 37.71 && lng > 126.79 && lng < 127.19) return "11"; // 서울
  if (lat > 37.27 && lat < 37.63 && lng > 126.44 && lng < 126.80) return "23"; // 인천
  if (lat > 36.90 && lat < 38.31 && lng > 126.30 && lng < 127.90) return "31"; // 경기
  if (lat > 36.19 && lat < 36.52 && lng > 127.29 && lng < 127.51) return "25"; // 대전
  if (lat > 36.40 && lat < 36.62 && lng > 127.17 && lng < 127.32) return "29"; // 세종
  if (lat > 35.73 && lat < 36.03 && lng > 128.50 && lng < 128.78) return "22"; // 대구
  if (lat > 35.04 && lat < 35.30 && lng > 128.86 && lng < 129.32) return "21"; // 부산
  if (lat > 35.44 && lat < 35.64 && lng > 129.04 && lng < 129.42) return "26"; // 울산
  if (lat > 35.05 && lat < 35.27 && lng > 126.78 && lng < 126.97) return "24"; // 광주
  if (lat > 37.00 && lat < 38.60 && lng > 127.70 && lng < 129.40) return "32"; // 강원
  if (lat > 36.20 && lat < 37.20 && lng > 127.40 && lng < 128.50) return "33"; // 충북
  if (lat > 36.00 && lat < 37.00 && lng > 126.10 && lng < 127.40) return "34"; // 충남
  if (lat > 35.30 && lat < 36.20 && lng > 126.50 && lng < 127.80) return "35"; // 전북
  if (lat > 34.20 && lat < 35.30 && lng > 126.00 && lng < 127.60) return "36"; // 전남
  if (lat > 35.50 && lat < 37.30 && lng > 128.40 && lng < 129.50) return "37"; // 경북
  if (lat > 34.70 && lat < 35.70 && lng > 127.60 && lng < 129.10) return "38"; // 경남
  if (lat > 33.10 && lat < 33.60 && lng > 126.10 && lng < 126.95) return "39"; // 제주
  return "11";
}

interface LibRaw {
  libCode: string; libName: string; address: string;
  tel: string; homepage: string;
  latitude: string; longitude: string;
  distance?: number;
}

// fetch with timeout (AbortController)
async function fetchWithTimeout(url: string, timeoutMs = 5000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { cache: "no-store", signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// 한 지역의 도서관 목록 가져오기
async function fetchLibsByRegion(isbn: string, region: string, pageSize = 10): Promise<LibRaw[]> {
  try {
    const url = `${BASE}/libSrchByBook?authKey=${LIB_API_KEY}&isbn=${isbn}&region=${region}&pageSize=${pageSize}&format=json`;
    const res  = await fetchWithTimeout(url, 6000);
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

// bookExist — 타임아웃 3초, 실패 시 null
async function checkBookExist(libCode: string, isbn: string): Promise<{ hasBook: string; loanAvailable: string } | null> {
  try {
    const url = `${BASE}/bookExist?authKey=${LIB_API_KEY}&libCode=${libCode}&isbn13=${isbn}&format=json`;
    const res  = await fetchWithTimeout(url, 3000);
    const data = await res.json();
    const result = data?.response?.result ?? {};
    return { hasBook: result.hasBook ?? "", loanAvailable: result.loanAvailable ?? "N" };
  } catch { return null; }
}

// Haversine 거리 (km)
function dist(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const isbn = searchParams.get("isbn");
  const lat  = searchParams.get("lat");
  const lng  = searchParams.get("lng");

  if (!isbn) return NextResponse.json({ error: "ISBN이 필요합니다." }, { status: 400 });

  const userLat = lat ? parseFloat(lat) : null;
  const userLng = lng ? parseFloat(lng) : null;

  try {
    let libraries: LibRaw[] = [];

    if (userLat && userLng) {
      // ── 위치 기반: 해당 지역만 조회 (1회 API 호출)
      const userRegion = regionFromCoords(userLat, userLng);
      libraries = await fetchLibsByRegion(isbn, userRegion, 30);

      // 결과가 3개 미만이면 인접 대도시(서울·경기) 추가 (최대 2회 추가)
      if (libraries.length < 3) {
        const fallbackRegions = ["11", "31"].filter(r => r !== userRegion);
        const extras = await Promise.all(
          fallbackRegions.map(r => fetchLibsByRegion(isbn, r, 10))
        );
        libraries = [...libraries, ...extras.flat()];
      }
    } else {
      // ── 위치 없음: 서울(11) + 경기(31) 2개 지역만 병렬 조회 (2회 API 호출)
      const [seoul, gyeonggi] = await Promise.all([
        fetchLibsByRegion(isbn, "11", 10),
        fetchLibsByRegion(isbn, "31", 10),
      ]);
      libraries = [...seoul, ...gyeonggi];

      // 아무 결과도 없으면 전국 주요 광역시 추가 (6회 추가)
      if (!libraries.length) {
        const majorRegions = ["21","22","23","24","25","26"];
        const extras = await Promise.all(majorRegions.map(r => fetchLibsByRegion(isbn, r, 5)));
        libraries = extras.flat();
      }
    }

    // libCode 기준 중복 제거
    const seen = new Set<string>();
    libraries = libraries.filter(l => {
      if (seen.has(l.libCode)) return false;
      seen.add(l.libCode);
      return true;
    });

    if (!libraries.length) {
      return NextResponse.json({ libraries: [], message: "소장 도서관 없음" });
    }

    // 거리 계산 후 정렬 (위치 있을 때)
    if (userLat && userLng) {
      libraries = libraries
        .map(lib => ({
          ...lib,
          distance: dist(userLat, userLng, parseFloat(lib.latitude || "0"), parseFloat(lib.longitude || "0")),
        }))
        .sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999));
    }

    const top5 = libraries.slice(0, 5);

    // ── bookExist 병렬 확인 (3초 타임아웃, 실패하면 소장 중으로 간주)
    const checked = await Promise.all(
      top5.map(async (lib) => {
        const exist = await checkBookExist(lib.libCode, isbn);
        // 명시적 "N"인 경우만 제외, 타임아웃/실패는 소장 중으로 간주
        if (exist?.hasBook === "N") return null;
        return {
          libCode:       lib.libCode,
          libName:       lib.libName,
          address:       lib.address,
          tel:           lib.tel,
          homepage:      lib.homepage,
          bookSearchUrl: lib.homepage ? buildBookSearchUrl(lib.homepage, isbn) : null,
          distance:      lib.distance,
          loanAvailable: exist?.loanAvailable === "Y",
        };
      })
    );

    const results = checked.filter(Boolean);

    // bookExist 전부 실패 시 → libSrchByBook 결과 fallback
    if (!results.length) {
      return NextResponse.json({
        libraries: top5.map(lib => ({
          libCode:       lib.libCode,
          libName:       lib.libName,
          address:       lib.address,
          tel:           lib.tel,
          homepage:      lib.homepage,
          bookSearchUrl: lib.homepage ? buildBookSearchUrl(lib.homepage, isbn) : null,
          distance:      lib.distance,
          loanAvailable: false,
        })),
      });
    }

    return NextResponse.json({ libraries: results });

  } catch (err) {
    console.error("Library API error:", err);
    return NextResponse.json({ error: "도서관 조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
