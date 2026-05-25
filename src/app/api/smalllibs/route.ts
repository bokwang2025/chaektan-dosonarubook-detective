/**
 * 작은도서관 소장 여부 검색 API
 * - knu.nl.go.kr (작은도서관 정보누리) 에서 ISBN으로 소장 여부 확인
 * - Kakao 좌표→행정동, 주소→좌표 API로 거리 계산
 */

import { NextRequest, NextResponse } from "next/server";

const KNU_BASE = "https://knu.nl.go.kr";
const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;

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
    // ── 1. Kakao 역지오코딩 → 시도/구 이름 ──────────────────────────
    let areaCode = "11"; // 기본 서울
    let cityCode = "all";

    if (KAKAO_KEY) {
      try {
        const kakaoRes = await fetch(
          `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`,
          { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } }
        );
        const kakaoData = await kakaoRes.json();
        const region = (kakaoData.documents ?? []).find(
          (d: { region_type: string }) => d.region_type === "H"
        ) as { region_1depth_name: string; region_2depth_name: string } | undefined;

        if (region) {
          const sido = region.region_1depth_name;
          const gu = region.region_2depth_name;
          areaCode = AREA_CODE[sido] ?? "11";
          if (sido.includes("서울")) {
            cityCode = SEOUL_GU_CODE[gu] ?? "all";
          }
        }
      } catch { /* 역지오코딩 실패시 기본값 사용 */ }
    }

    // ── 2. knu 해당 구/지역 작은도서관 목록 ─────────────────────────
    const libListRes = await fetch(`${KNU_BASE}/main/get/liblist`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        pageno: "1",
        display: "50",
        code: areaCode,
        city_code: cityCode,
        keyword: "",
        bookium_yn: "all",
      }).toString(),
    });

    if (!libListRes.ok) return NextResponse.json({ libraries: [] });

    const libListData = await libListRes.json();
    const libs: Array<{
      MANAGE_CODE: string;
      LIB_NAME: string;
      LIB_ADDRESS: string;
      LIB_URL: string;
    }> = libListData?.LIB_LIST?.LIST_DATA ?? [];

    if (!libs.length) return NextResponse.json({ libraries: [] });

    // ── 3. 각 도서관 소장 여부 + 주소→좌표 병렬 확인 (최대 30개) ──
    const checkResults = await Promise.all(
      libs.slice(0, 30).map(async (lib) => {
        try {
          // 3-a. ISBN 소장 여부 확인
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

          // 3-b. Kakao 주소→좌표 (거리 계산용)
          let distance: number | undefined;
          const rawAddr = lib.LIB_ADDRESS?.trim() ?? "";
          if (KAKAO_KEY && rawAddr) {
            try {
              const geoRes = await fetch(
                `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(rawAddr)}`,
                { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } }
              );
              const geoData = await geoRes.json();
              const doc = geoData.documents?.[0];
              if (doc) {
                distance = haversine(lat, lng, parseFloat(doc.y), parseFloat(doc.x));
              }
            } catch { /* 거리 미표시 */ }
          }

          return {
            libName: lib.LIB_NAME,
            address: rawAddr,
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

    const found = checkResults
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => (a.distance ?? 999) - (b.distance ?? 999));

    return NextResponse.json({ libraries: found });
  } catch {
    return NextResponse.json({ libraries: [] });
  }
}
