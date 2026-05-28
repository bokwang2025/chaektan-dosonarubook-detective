import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

const INTELLIGENCE_TYPES = [
  { key: "linguistic",      name: "언어적 지능",    emoji: "📝", desc: "말과 글로 표현하기" },
  { key: "logical",         name: "논리수학적 지능", emoji: "🔢", desc: "논리적으로 분석하기" },
  { key: "spatial",         name: "공간적 지능",    emoji: "🎨", desc: "그림과 공간으로 표현하기" },
  { key: "musical",         name: "음악적 지능",    emoji: "🎵", desc: "리듬과 소리로 표현하기" },
  { key: "bodily",          name: "신체운동적 지능", emoji: "🎭", desc: "몸으로 느끼고 표현하기" },
  { key: "interpersonal",   name: "대인관계 지능",  emoji: "🤝", desc: "함께 이야기 나누기" },
  { key: "intrapersonal",   name: "자기성찰 지능",  emoji: "💭", desc: "나 자신을 돌아보기" },
  { key: "naturalist",      name: "자연탐구 지능",  emoji: "🌿", desc: "자연과 연결 지어 탐구하기" },
];

// ── Claude API로 책 특화 독후활동 생성 ───────────────────
async function generateWithClaude(params: {
  title: string; author: string; summary: string;
  tags: string; hook: string; targetAge: string;
}): Promise<Record<string, string> | null> {
  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "여기에_Claude_API_키_입력") return null;

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });

    const prompt = `당신은 초등학생 독서교육 전문가입니다.
하워드 가드너의 다중지능이론에 기반하여 아래 책에 딱 맞는 독후활동을 만들어주세요.

【책 정보】
- 제목: ${params.title}
- 저자: ${params.author}
- 대상 연령: ${params.targetAge || "초등학생"}
- 주제 태그: ${params.tags}
- 줄거리/소개: ${params.summary || params.hook || "제목과 태그를 기반으로 추론해주세요"}

【핵심 원칙】
- 각 활동은 반드시 이 책의 고유한 내용(등장인물, 배경, 사건, 주제)과 직접 연결되어야 합니다
- 다른 책에 그대로 쓸 수 없는, 이 책만을 위한 활동으로 만들어주세요
- 아이들이 즐겁고 창의적으로 참여할 수 있는 구체적인 활동으로
- 각 활동은 2~3문장, 교사나 부모가 바로 활용 가능한 수준

【지능 유형별 활동 작성】
아래 8가지 지능 유형 각각에 대해 이 책에만 해당하는 독후활동 1가지씩 만들어주세요:
- linguistic(언어적): 이 책의 특정 장면·인물·대화를 활용한 글쓰기/말하기 활동
- logical(논리수학적): 이 책의 사건 흐름·인과관계·구조를 분석하는 활동
- spatial(공간적): 이 책의 배경·장면·인물을 시각적으로 표현하는 활동
- musical(음악적): 이 책의 분위기·감정·장면에 어울리는 음악적 활동
- bodily(신체운동적): 이 책의 장면이나 인물을 몸으로 표현하는 활동
- interpersonal(대인관계): 이 책을 바탕으로 친구들과 함께하는 토의·협동 활동
- intrapersonal(자기성찰): 이 책을 읽고 자신의 경험·감정과 연결하는 성찰 활동
- naturalist(자연탐구): 이 책에 등장하는 자연·환경·생물 요소를 탐구하는 활동 (책에 자연 요소가 없다면 책의 주제와 연결된 탐구 활동)

반드시 아래 JSON 형식으로만 응답하세요 (다른 설명 없이):
{"linguistic":"활동내용","logical":"활동내용","spatial":"활동내용","musical":"활동내용","bodily":"활동내용","interpersonal":"활동내용","intrapersonal":"활동내용","naturalist":"활동내용"}`;

    const message = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    // JSON 시작 위치 찾기 (안전하게)
    const jsonStart = cleaned.indexOf("{");
    const jsonEnd   = cleaned.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) return null;

    return JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
  } catch (err) {
    console.error("Claude 독후활동 생성 실패:", err);
    return null;
  }
}

// ── 책 내용 기반 스마트 기본 활동 생성 ───────────────────
function buildSmartDefaults(params: {
  title: string; tags: string[]; hook: string; summary: string; targetAge: string;
}): Record<string, string> {
  const { title, tags, hook, summary, targetAge } = params;
  const context = [hook, summary].filter(Boolean).join(" ");
  const tagStr  = tags.slice(0, 5).join(", ");
  const age     = targetAge?.includes("청소년") ? "청소년" : targetAge?.includes("초등5") || targetAge?.includes("초등3") ? "고학년" : "저학년";

  // 태그 기반 활동 힌트 도출
  const hasNature     = tags.some(t => ["자연", "동물", "식물", "숲", "바다", "환경"].some(k => t.includes(k)));
  const hasFamily     = tags.some(t => ["가족", "엄마", "아빠", "형제", "동생"].some(k => t.includes(k)));
  const hasEmotion    = tags.some(t => ["슬픔", "용기", "외로움", "기쁨", "사랑", "우정"].some(k => t.includes(k)));
  const hasAdventure  = tags.some(t => ["모험", "여행", "탐험"].some(k => t.includes(k)));

  return {
    linguistic: age === "청소년"
      ? `《${title}》에서 가장 인상 깊었던 장면의 인물에게 편지를 써보세요. ${tagStr ? `#${tagStr.split(",")[0]} 주제와 연결하여` : ""} 인물의 입장이 되어 자신의 감정과 생각을 솔직하게 표현해봐요.`
      : `《${title}》를 읽고 가장 기억에 남는 장면을 골라 짧은 글로 써보세요. ${hasEmotion ? "주인공의 감정 변화에 집중하며" : "내가 주인공이라면 어떻게 했을지 상상하며"} "만약 내가 주인공이라면?" 으로 시작해봐요.`,

    logical: hasAdventure
      ? `《${title}》의 이야기 속 사건들을 순서대로 정리하고, 각 사건의 원인과 결과를 연결해보세요. 주인공이 선택의 기로에서 어떤 결정을 내렸는지도 분석해봐요.`
      : `《${title}》의 등장인물들 관계를 도표로 그려보세요. ${hasFamily ? "가족 관계도를 중심으로" : "이야기가 진행되면서 관계가 어떻게 변했는지"} 표시해봐요.`,

    spatial: hasNature
      ? `《${title}》에 등장하는 자연 배경을 상상하며 그림으로 표현해보세요. 책에서 묘사된 색깔, 빛, 계절의 분위기를 내 그림에 담아봐요.`
      : `《${title}》에서 가장 인상 깊었던 장면을 그림으로 그려보세요. 등장인물의 표정과 주변 배경, ${hasEmotion ? "그 순간의 감정" : "이야기의 분위기"}까지 상세하게 표현해봐요.`,

    musical: hasEmotion
      ? `《${title}》의 이야기에서 감정이 가장 크게 변하는 순간을 찾아보세요. 그 순간의 ${tags[0] || "감정"}에 어울리는 음악이나 소리를 선택하거나 직접 만들어봐요.`
      : `《${title}》를 읽으며 떠오르는 분위기에 어울리는 음악을 찾아보세요. 이야기의 시작, 중간, 끝에 각각 다른 음악을 골라 왜 그 음악이 어울리는지 설명해봐요.`,

    bodily: hasAdventure
      ? `《${title}》의 모험 장면 중 가장 긴장감 넘치는 순간을 친구들과 역할극으로 표현해보세요. 대사 없이 몸짓과 표정만으로 장면을 전달해봐도 좋아요.`
      : `《${title}》에서 기억에 남는 장면을 친구들과 함께 역할극으로 표현해보세요. ${hasEmotion ? "등장인물의 감정이 가장 잘 드러나는 장면" : "이야기에서 가장 중요한 장면"}을 골라봐요.`,

    interpersonal: hasFamily
      ? `《${title}》를 읽고 가족과 함께 "우리 가족이라면 어떻게 했을까?" 를 주제로 이야기를 나눠보세요. 책 속 상황과 비슷한 우리 가족의 경험을 함께 떠올려봐요.`
      : `《${title}》를 읽고 친구들과 "이 책에서 가장 중요한 순간은 언제인가?" 를 주제로 토의해보세요. 서로 다른 의견을 나누며 각자 어떤 장면에 가장 마음이 움직였는지 이야기해봐요.`,

    intrapersonal: `《${title}》를 다 읽은 후, ${hasEmotion ? `책 속의 ${tags.find(t => ["슬픔","용기","외로움","기쁨","사랑"].some(k=>t.includes(k))) || "감정"}을 내가 비슷하게 느꼈던 경험과 연결하여` : "책을 읽기 전과 후에 내 마음이 어떻게 달라졌는지"} 일기로 써보세요.`,

    naturalist: hasNature
      ? `《${title}》에 등장하는 자연 요소(${tags.filter(t=>["자연","동물","식물","날씨","계절","숲","바다"].some(k=>t.includes(k))).slice(0,3).join("·") || "동물, 식물, 날씨"} 등)를 모두 찾아 목록을 만들어보세요. 그 중 하나를 골라 실제로 조사하고 책 속 묘사와 비교해봐요.`
      : `《${title}》의 이야기가 다른 계절이나 자연환경에서 펼쳐진다면 어떻게 달라질지 상상해보세요. 배경이 바뀌면 등장인물의 행동도 달라질지 생각해봐요.`,
  };
}

// ── 메인 핸들러 ───────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title     = searchParams.get("title")     || "";
  const author    = searchParams.get("author")    || "";
  const summary   = searchParams.get("summary")   || "";
  const tags      = searchParams.get("tags")      || "";
  const hook      = searchParams.get("hook")      || "";
  const targetAge = searchParams.get("targetAge") || "";

  if (!title) return NextResponse.json({ error: "책 제목이 필요합니다." }, { status: 400 });

  const tagArray = tags ? tags.split(",").map(t => t.trim()).filter(Boolean) : [];

  // Claude로 책 특화 활동 생성 시도
  const aiActivities = await generateWithClaude({ title, author, summary, tags, hook, targetAge });

  // 실패 시 → 책 내용 기반 스마트 기본 활동
  const activities = aiActivities ?? buildSmartDefaults({
    title, tags: tagArray, hook, summary, targetAge,
  });

  const result = INTELLIGENCE_TYPES.map(t => ({
    key:      t.key,
    name:     t.name,
    emoji:    t.emoji,
    desc:     t.desc,
    activity: activities[t.key] || "",
  }));

  return NextResponse.json({
    title,
    activities: result,
    engine: aiActivities ? "claude" : "smart-default",
  });
}
