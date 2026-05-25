/**
 * 서울 작은도서관 좌표 사전 생성 스크립트
 * knu.nl.go.kr의 서울 전체 구(25개) 작은도서관 목록을 가져와
 * Nominatim으로 좌표 변환 후 src/data/small_lib_coords.json에 저장
 *
 * Usage: node scripts/geocode-small-libs.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(__dirname, "../src/data/small_lib_coords.json");

const KNU_BASE = "https://knu.nl.go.kr";

// 서울 구 코드 (knu city_code 기준)
const SEOUL_GU_CODES = {
  종로구: "001", 중구: "002", 용산구: "003", 성동구: "004",
  광진구: "005", 동대문구: "006", 중랑구: "007", 성북구: "008",
  강북구: "009", 도봉구: "010", 노원구: "011", 은평구: "012",
  서대문구: "013", 마포구: "014", 양천구: "015", 강서구: "016",
  구로구: "017", 금천구: "018", 영등포구: "019", 동작구: "020",
  관악구: "021", 서초구: "022", 강남구: "023", 송파구: "024",
  강동구: "025",
};

/** knu 구별 도서관 목록 가져오기 */
async function fetchLibList(cityCode) {
  try {
    const res = await fetch(`${KNU_BASE}/main/get/liblist`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        pageno: "1", display: "100",
        code: "11", city_code: cityCode,
        keyword: "", bookium_yn: "all",
      }).toString(),
    });
    const data = await res.json();
    return data?.LIB_LIST?.LIST_DATA ?? [];
  } catch (e) {
    console.error(`  knu fetch 실패 (city_code=${cityCode}):`, e.message);
    return [];
  }
}

/** 주소에서 핵심 도로명 주소만 추출 (시도 + 구 + 도로명 + 건물번호) */
function cleanAddress(addr) {
  if (!addr) return "";
  // 괄호 내용 제거 "(자양동)" 등
  addr = addr.replace(/\(.*?\)/g, "").trim();
  // "서울 " → "서울특별시 "
  addr = addr.replace(/^서울 /, "서울특별시 ");
  // 공백으로 토큰 분리 후 앞 4개만 사용 (시도 구 도로명 건물번호)
  // 예: ["서울특별시","광진구","자양로50가길","45","2층"] → 앞 4개
  const tokens = addr.split(/\s+/).filter(Boolean);
  return tokens.slice(0, 4).join(" ");
}

/** Nominatim 지오코딩 (Rate limit: 1 req/sec) */
async function geocode(addr, libName) {
  const cleaned = cleanAddress(addr);
  if (!cleaned) return null;

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cleaned)}&format=json&countrycodes=kr&limit=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "BookDetective-Geocoder/1.0 (personal project)" },
    });
    const data = await res.json();
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
    // 실패시 구 + 구체적 도로 부분만 재시도
    const simplified = cleaned.replace(/^서울특별시\s+/, "");
    const url2 = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(simplified + " 서울")}&format=json&countrycodes=kr&limit=1`;
    const res2 = await fetch(url2, {
      headers: { "User-Agent": "BookDetective-Geocoder/1.0 (personal project)" },
    });
    const data2 = await res2.json();
    if (data2.length > 0) {
      return { lat: parseFloat(data2[0].lat), lng: parseFloat(data2[0].lon) };
    }
  } catch (e) {
    console.error(`  Nominatim 실패 (${libName}):`, e.message);
  }
  return null;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  // 기존 데이터 로드 (증분 업데이트용)
  let existing = {};
  if (fs.existsSync(OUT_FILE)) {
    existing = JSON.parse(fs.readFileSync(OUT_FILE, "utf-8"));
    console.log(`기존 좌표 데이터 ${Object.keys(existing).length}개 로드`);
  }

  const result = { ...existing };
  let total = 0, success = 0, skip = 0, fail = 0;

  for (const [guName, cityCode] of Object.entries(SEOUL_GU_CODES)) {
    console.log(`\n▶ ${guName} (city_code=${cityCode}) 조회 중...`);
    const libs = await fetchLibList(cityCode);
    console.log(`  도서관 ${libs.length}개 발견`);

    for (const lib of libs) {
      const mc = lib.MANAGE_CODE;
      total++;

      // 이미 좌표 있으면 스킵
      if (result[mc]?.lat) {
        skip++;
        continue;
      }

      const coords = await geocode(lib.LIB_ADDRESS, lib.LIB_NAME);
      await sleep(1100); // Nominatim 1req/sec 제한

      if (coords) {
        result[mc] = {
          libName: lib.LIB_NAME,
          address: lib.LIB_ADDRESS,
          lat: coords.lat,
          lng: coords.lng,
          gu: guName,
        };
        success++;
        console.log(`  ✓ ${lib.LIB_NAME} → lat=${coords.lat.toFixed(4)}, lng=${coords.lng.toFixed(4)}`);
      } else {
        result[mc] = {
          libName: lib.LIB_NAME,
          address: lib.LIB_ADDRESS,
          lat: null,
          lng: null,
          gu: guName,
        };
        fail++;
        console.log(`  ✗ ${lib.LIB_NAME} — 좌표 미발견`);
      }

      // 100개마다 중간 저장
      if ((success + fail) % 10 === 0) {
        fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2));
      }
    }
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2));
  console.log(`\n완료! 전체: ${total}, 성공: ${success}, 스킵(기존): ${skip}, 실패: ${fail}`);
  console.log(`저장 위치: ${OUT_FILE}`);
}

main().catch(console.error);
