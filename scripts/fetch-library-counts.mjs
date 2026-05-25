/**
 * 도서관 보유 수 배치 수집 스크립트
 * - 각 책의 koreanIsbn으로 data4library.kr API 조회
 * - 서울(11) + 경기(31) numFound 합산 → 전국 보유 규모 추정
 * - 결과: src/data/library_counts.json
 *
 * 실행: node scripts/fetch-library-counts.mjs
 * 예상 소요시간: ~20분 (4400권 × 250ms)
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const LIB_API_KEY = "be9456f40126dbefd5c69c0a647affe45f49a41766a6b10c5919c531810fe1ef";
const BASE = "https://data4library.kr/api";
const REGIONS = ["11", "31"]; // 서울 + 경기 (가장 많은 도서관)
const DELAY_MS = 250;
const OUTPUT = join(ROOT, "src/data/library_counts.json");

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchNumFound(isbn, region) {
  try {
    const url = `${BASE}/libSrchByBook?authKey=${LIB_API_KEY}&isbn=${isbn}&region=${region}&pageSize=1&format=json`;
    const res = await fetch(url);
    const data = await res.json();
    const found = parseInt(data?.response?.numFound ?? "0");
    return isNaN(found) ? 0 : found;
  } catch {
    return 0;
  }
}

async function main() {
  // 기존 결과 불러오기 (중단 후 재시작 지원)
  let counts = {};
  if (existsSync(OUTPUT)) {
    counts = JSON.parse(readFileSync(OUTPUT, "utf-8"));
    console.log(`기존 결과 ${Object.keys(counts).length}건 로드`);
  }

  const books = JSON.parse(readFileSync(join(ROOT, "src/data/books.json"), "utf-8"));
  const targets = books.filter((b) => b.koreanIsbn && b.koreanIsbn.length > 0);

  console.log(`\n총 ${targets.length}권 처리 시작 (기존 완료 제외)\n`);

  let done = 0;
  for (const book of targets) {
    const isbn = book.koreanIsbn;
    if (counts[isbn] !== undefined) {
      done++;
      continue; // 이미 수집됨
    }

    let total = 0;
    for (const region of REGIONS) {
      total += await fetchNumFound(isbn, region);
      await sleep(DELAY_MS);
    }
    counts[isbn] = total;
    done++;

    if (done % 50 === 0) {
      writeFileSync(OUTPUT, JSON.stringify(counts, null, 2));
      console.log(`[${done}/${targets.length}] 중간 저장 완료 (${isbn} = ${total})`);
    }
  }

  writeFileSync(OUTPUT, JSON.stringify(counts, null, 2));
  console.log(`\n완료! ${Object.keys(counts).length}권 저장 → ${OUTPUT}`);
}

main().catch(console.error);
