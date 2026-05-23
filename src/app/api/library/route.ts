import { NextRequest, NextResponse } from "next/server";

const LIB_API_KEY = process.env.LIB_API_KEY;
const BASE = "https://data4library.kr/api";

// 전국 지역코드
const ALL_REGIONS = ["11","21","22","23","24","25","26","29","31","32","33","34","35","36","37","38","39"];

// 위경도 → 지역코드 (빠른 근사)
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
  return "11"; // 기본값: 서울
}

interface LibRaw {
  libCode: string; libName: string; address: string;
  tel: string; homepage: string;
  latitude: string; longitude: string;
  distance?: number;
}

// 한 지역의 도서관 목록 가져오기
async function fetchLibsByRegion(isbn: string, region: string, pageSize = 10): Promise<LibRaw[]> {
  try {
    const url = `${BASE}/libSrchByBook?authKey=${LIB_API_KEY}&isbn=${isbn}&region=${region}&pageSize=${pageSize}&format=json`;
    const res  = await fetch(url, { cache: "no-store" });
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

// Haversine 거리 (km)
function dist(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
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
    // ── 1. 위치 있으면 해당 지역 먼저, 없으면 전국 병렬 검색
    let libraries: LibRaw[] = [];

    if (userLat && userLng) {
      // 위치 기반: 사용자 지역 최대 200개 가져와서 거리 정렬
      const userRegion = regionFromCoords(userLat, userLng);
      const primaryLibs = await fetchLibsByRegion(isbn, userRegion, 200);

      // 2km 이내 도서관 우선
      const within2km = primaryLibs.filter(l => {
        const d = dist(userLat, userLng, parseFloat(l.latitude||"0"), parseFloat(l.longitude||"0"));
        return d <= 2;
      });

      if (within2km.length >= 3) {
        libraries = primaryLibs; // 거리 정렬은 뒤에서 처리
      } else {
        // 2km 내 부족 → 5km로 확장 + 인근 지역 추가
        const extraRegions = ALL_REGIONS.filter(r => r !== userRegion).slice(0, 3);
        const extras = await Promise.all(extraRegions.map(r => fetchLibsByRegion(isbn, r, 50)));
        libraries = [...primaryLibs, ...extras.flat()];
      }
    } else {
      // 위치 없음: 전국 병렬 검색 (pageSize=10씩)
      const allResults = await Promise.all(ALL_REGIONS.map(r => fetchLibsByRegion(isbn, r, 10)));
      libraries = allResults.flat();
    }

    // ── 2. libCode 기준 중복 제거
    const seen = new Set<string>();
    libraries = libraries.filter(l => {
      if (seen.has(l.libCode)) return false;
      seen.add(l.libCode);
      return true;
    });

    if (!libraries.length) {
      return NextResponse.json({ libraries: [], message: "소장 도서관 없음" });
    }

    // ── 3. 거리 계산 후 정렬
    if (userLat && userLng) {
      libraries = libraries
        .map(lib => ({
          ...lib,
          distance: dist(userLat, userLng, parseFloat(lib.latitude||"0"), parseFloat(lib.longitude||"0")),
        }))
        .sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999));
    }

    // 위치 있으면 2km 이내 우선, 부족하면 5km, 그래도 부족하면 가장 가까운 순 5개
    let top5: typeof libraries;
    if (userLat && userLng) {
      const within2 = libraries.filter(l => (l.distance ?? 99) <= 2);
      const within5 = libraries.filter(l => (l.distance ?? 99) <= 5);
      top5 = (within2.length >= 3 ? within2 : within5.length >= 3 ? within5 : libraries).slice(0, 5);
    } else {
      top5 = libraries.slice(0, 5);
    }

    // ── 4. 대출 가능 여부 확인 (hasBook:N 인 도서관은 제외)
    const checked = await Promise.all(
      top5.map(async (lib) => {
        try {
          const url = `${BASE}/bookExist?authKey=${LIB_API_KEY}&libCode=${lib.libCode}&isbn13=${isbn}&format=json`;
          const res  = await fetch(url);
          const data = await res.json();
          const result = data?.response?.result ?? {};
          const hasBook   = result.hasBook   ?? "N";
          const loanAvail = result.loanAvailable ?? "N";
          if (hasBook !== "Y") return null; // 실제 미소장이면 제외
          return {
            libName:       lib.libName,
            address:       lib.address,
            tel:           lib.tel,
            homepage:      lib.homepage,
            distance:      lib.distance,
            loanAvailable: loanAvail === "Y",
          };
        } catch {
          return null;
        }
      })
    );

    const results = checked.filter(Boolean);

    if (!results.length) {
      return NextResponse.json({ libraries: [], message: "소장 도서관 없음" });
    }

    return NextResponse.json({ libraries: results });

  } catch (err) {
    console.error("Library API error:", err);
    return NextResponse.json({ error: "도서관 조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
