import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    LIB_API_KEY: process.env.LIB_API_KEY ? `set (${process.env.LIB_API_KEY.slice(0,6)}...)` : "NOT SET",
    KAKAO_REST_API_KEY: process.env.KAKAO_REST_API_KEY ? `set (${process.env.KAKAO_REST_API_KEY.slice(0,6)}...)` : "NOT SET",
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? "set" : "NOT SET",
  });
}
