/**
 * 작은도서관 소장 여부 검색 API
 * - knu.nl.go.kr (작은도서관 정보누리) 에서 ISBN으로 소장 여부 확인
 * - Nominatim 사전 지오코딩 데이터(small_lib_coords.json)로 거리 계산
 * - Kakao 좌표→행정동 API로 사용자 위치(구) 파악
 */

import { NextRequest, NextResponse } from "next/server";
import coordsData from "@/data/small_lib_coords.json";

const KNU_BASE = "https://knu.nl.go.kr";
const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;

// 사전 지오코딩된 좌표 데이터
const SMALL_LIB_COORDS = coordsData as Record<
  string,
  { libName: string; address: string; lat: number | null; lng: number | null; gu?: string }
>;

// 서울 구 코드 매핑 (knu CITY_CODE 기준)
const SEOUL_GU_CODE: Record<string, string> = {
  종로구: "001", 중구: "002", 용산구: "003", 성동구: "004",
  광진구: "005", 동대문구: "006", 중랑구: "007", 성북구: "008",
  강북구: "009", 도봉구: "010", 노원구: "011", 은평구: "012",
  서대문구: "013", 마포구: "014", 양천구: "015", 강서구: "016",
  구로구: "017", 금천구: "018", 영등포구: "019", 동작구: "020",
  관악구: "021", 서초구: "022", 강남구: "023", 송파구: "024",
  강동구: "025",
};

// 서울 인접 구 매핑 (경계를 접한 구들)
const SEOUL_GU_ADJACENT: Record<string, string[]> = {
  종로구: ["중구","성북구","은평구","서대문구","마포구"],
  중구: ["종로구","성동구","용산구"],
  용산구: ["중구","마포구","서대문구","성동구","동작구","영등포구"],
  성동구: ["중구","광진구","동대문구","성북구","용산구"],
  광진구: ["성동구","동대문구","중랑구","강동구","송파구"],
  동대문구: ["성북구","중랑구","광진구","성동구","종로구"],
  중랑구: ["노원구","도봉구","동대문구","광진구"],
  성북구: ["종로구","동대문구","노원구","강북구","도봉구"],
  강북구: ["성북구","도봉구","노원구"],
  도봉구: ["강북구","노원구","중랑구","성북구"],
  노원구: ["도봉구","강북구","성북구","중랑구"],
  은평구: ["종로구","서대문구","마포구"],
  서대문구: ["은평구","종로구","마포구","용산구"],
  마포구: ["은평구","서대문구","용산구","영등포구"],
  양천구: ["강서구","구로구","영등포구"],
  강서구: ["마포구","양천구","구로구"],
  구로구: ["강서구","양천구","영등포구","동작구","금천구"],
  금천구: ["구로구","동작구","관악구"],
  영등포구: ["마포구","용산구","동작구","구로구","양천구"],
  동작구: ["용산구","영등포구","구로구","금천구","관악구","서초구"],
  관악구: ["동작구","금천구","서초구"],
  서초구: ["관악구","동작구","강남구","송파구"],
  강남구: ["서초구","송파구","강동구"],
  송파구: ["강남구","강동구","광진구","서초구"],
  강동구: ["송파구","광진구"],
};

// 광역시/도 → knu area_code 매핑
const AREA_CODE: Record<string, string> = {
  서울특별시: "11", 부산광역시: "21", 대구광역시: "22", 인천광역시: "23",
  광주광역시: "24", 대전광역시: "25", 울산광역시: "26", 세종특별자치시: "50",
  경기도: "41", 강원특별자치도: "42", 충청북도: "43", 충청남도: "44",
  전라북도: "45", 전라남도: "46", 경상북도: "47", 경상남도: "48",
  제주특별자치도: "49",
};

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const isbn = searchParams.get("isbn");
  const lat = parseFloat(searchParams.get("lat") || "0");
  const lng = parseFloat(searchParams.get("lng") || "0");

  if (!isbn || !lat || !lng) {
    return NextResponse.json({ libraries: [] });
  }

  try {
    // ── 1. 역지오코딩 → 시도/구 이름 (Kakao → Nominatim fallback) ──
    let areaCode = "11"; // 기본 서울
    let guName = "";
    const cityCodes: string[] = []; // 검색할 구 코드 목록

    /** Kakao 역지오코딩 시도 */
    const tryKakao = async (): Promise<{ sido: string; gu: string } | null> => {
      if (!KAKAO_KEY) return null;
      try {
        const res = await fetch(
          `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`,
          { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } }
        );
        const data = await res.json();
        if (data.errorType) return null; // API 비활성화 등 오류
        const region = (data.documents ?? []).find(
          (d: { region_type: string }) => d.region_type === "H"
        ) as { region_1depth_name: string; region_2depth_name: string } | undefined;
        if (!region) return null;
        return { sido: region.region_1depth_name, gu: region.region_2depth_name };
      } catch { return null; }
    };

    /** Nominatim 역지오코딩 fallback */
    const tryNominatim = async (): Promise<{ sido: string; gu: string } | null> => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ko&zoom=10`,
          { headers: { "User-Agent": "BookDetective/1.0 (https://bookdetective-dosunaru.vercel.app)" } }
        );
        if (!res.ok) return null;
        const data = await res.json();
        const addr = data?.address ?? {};
        // Nominatim 응답에서 시/도 및 구/군 추출
        const sido = addr.city || addr.province || addr.state || "";
        const gu = addr.borough || addr.district || addr.suburb || "";
        if (!sido || !gu) return null;
        return { sido, gu };
      } catch { return null; }
    };

    const geoResult = await tryKakao() ?? await tryNominatim();

    if (geoResult) {
      const { sido, gu } = geoResult;
      guName = gu;
      areaCode = AREA_CODE[sido] ?? "11";
      if (sido.includes("서울") && SEOUL_GU_CODE[guName]) {
        cityCodes.push(SEOUL_GU_CODE[guName]);
        const adjacent = SEOUL_GU_ADJACENT[guName] ?? [];
        for (const adj of adjacent) {
          if (SEOUL_GU_CODE[adj]) cityCodes.push(SEOUL_GU_CODE[adj]);
        }
      }
    }

    // ── 2. knu 현재 구 + 인접 구 작은도서관 목록 병렬 조회 ──────────
    const fetchLibList = async (cityCode: string) => {
      try {
        const res = await fetch(`${KNU_BASE}/main/get/liblist`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            pageno: "1", display: "100",
            code: areaCode, city_code: cityCode,
            keyword: "", bookium_yn: "all",
          }).toString(),
        });
        const data = await res.json();
        return data?.LIB_LIST?.LIST_DATA ?? [];
      } catch { return []; }
    };

    // 구 코드가 있으면 해당 구들 병렬 조회, 없으면 전체 조회
    let allLibLists;
    if (cityCodes.length > 0) {
      allLibLists = await Promise.all(cityCodes.map(fetchLibList));
    } else {
      allLibLists = [await fetchLibList("all")];
    }

    // 중복 제거 후 합치기
    const seenMC = new Set<string>();
    const libs: Array<{
      MANAGE_CODE: string;
      LIB_NAME: string;
      LIB_ADDRESS: string;
      LIB_URL: string;
    }> = allLibLists.flat().filter((lib: { MANAGE_CODE: string }) => {
      if (seenMC.has(lib.MANAGE_CODE)) return false;
      seenMC.add(lib.MANAGE_CODE);
      return true;
    });

    if (!libs.length) return NextResponse.json({ libraries: [] });

    // ── 3. 사전 지오코딩 좌표로 거리 계산 (런타임 API 불필요) ────────
    const getDistance = (manageCode: string): number | undefined => {
      const entry = SMALL_LIB_COORDS[manageCode];
      if (entry?.lat != null && entry?.lng != null) {
        return haversine(lat, lng, entry.lat, entry.lng);
      }
      return undefined;
    };

    // ── 4. 각 도서관 소장 여부 병렬 확인 (최대 40개) ─────────────────
    const checkResults = await Promise.all(
      libs.slice(0, 40).map(async (lib) => {
        try {
          const searchRes = await fetch(`${KNU_BASE}/getSearchResult/detail`, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
              Referer: `${KNU_BASE}/search`,
            },
            body: new URLSearchParams({
              manage_code: lib.MANAGE_CODE,
              searchKind: "book",
              isInnerSearch: "F",
              innerSearchTxt: "",
              keywordSearch: "false",
              displayNo: "3",
              orderbyItem: "TITLE",
              orderby: "ASC",
              pageNo: "1",
              searchTitle: "",
              searchAuthor: "",
              searchPublisher: "",
              searchIsbn: isbn,
              searchPubYearStart: "",
              searchPubYearEnd: "",
              searchShelf: "",
              searchRegNo: "",
              searchKeyword: "",
            }).toString(),
          });

          const searchData = await searchRes.json();
          const count: number = searchData?.SEARCH_RESULT?.SEARCH_COUNT ?? 0;
          if (count === 0) return null;

          const firstBook = searchData?.SEARCH_RESULT?.SEARCH_LIST?.[0] ?? {};
          const loanAvailable = firstBook?.LOAN_CODE === "OK";

          const distance = getDistance(lib.MANAGE_CODE);

          return {
            libName: lib.LIB_NAME,
            address: lib.LIB_ADDRESS?.trim() ?? "",
            manageCode: lib.MANAGE_CODE,
            homepage: lib.LIB_URL ?? null,
            bookSearchUrl: `${KNU_BASE}/${lib.MANAGE_CODE}`,
            loanAvailable,
            distance,
            isSmall: true,
          };
        } catch {
          return null;
        }
      })
    );

    // 거리순 정렬 (좌표 없는 도서관은 뒤로)
    const found = checkResults
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => (a.distance ?? 999) - (b.distance ?? 999));

    return NextResponse.json({ libraries: found });
  } catch {
    return NextResponse.json({ libraries: [] });
  }
}
