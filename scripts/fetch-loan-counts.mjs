/**
 * 도서별 누적 대출 건수 배치 수집 (정보나루 usageAnalysisList)
 * - 각 책의 koreanIsbn으로 loanCnt(전국 참여관 누적 대출) 수집
 * - 결과: src/data/loan_counts.json  { "ISBN": loanCnt }
 * - 중단 후 재실행 시 이미 수집된 ISBN은 건너뜀(이어받기)
 * 실행: node scripts/fetch-loan-counts.mjs   (예상 20~30분)
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const KEY = "be9456f40126dbefd5c69c0a647affe45f49a41766a6b10c5919c531810fe1ef";
const BASE = "https://data4library.kr/api";
const DELAY_MS = 250;
const OUT = join(ROOT, "src/data/loan_counts.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchLoanCnt(isbn) {
  try {
    const url = `${BASE}/usageAnalysisList?authKey=${KEY}&isbn13=${isbn}&format=json`;
    const res = await fetch(url);
    const data = await res.json();
    const n = parseInt(data?.response?.book?.loanCnt ?? "0");
    return isNaN(n) ? 0 : n;
  } catch { return null; } // 오류는 null → 다음 실행 때 재시도
}

async function main() {
  const books = JSON.parse(readFileSync(join(ROOT, "src/data/books.json"), "utf8"));
  const pool = books.filter(b => !b._excluded && (b.isbn || b.koreanIsbn) && b.isPictureBook && b.ageGroup !== "비대상");
  const isbns = [...new Set(pool.map(b => b.koreanIsbn).filter(Boolean))];
  const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
  const todo = isbns.filter(i => out[i] === undefined);
  console.log(`대상 ${isbns.length} / 이미 수집 ${isbns.length - todo.length} / 남은 ${todo.length}`);
  let done = 0, fail = 0;
  for (const isbn of todo) {
    const n = await fetchLoanCnt(isbn);
    if (n === null) { fail++; } else { out[isbn] = n; }
    done++;
    if (done % 100 === 0) {
      writeFileSync(OUT, JSON.stringify(out));
      console.log(`${done}/${todo.length} (실패 ${fail}) 중간 저장`);
    }
    await sleep(DELAY_MS);
  }
  writeFileSync(OUT, JSON.stringify(out));
  const vals = Object.values(out);
  console.log(`완료: ${vals.length}건 저장 / 실패 ${fail} / 대출>0: ${vals.filter(v => v > 0).length}`);
}
main();
