"use client";

import { useState } from "react";

interface ActivityItem {
  key: string;
  name: string;
  emoji: string;
  desc: string;
  activity: string;
}

interface ReadingActivityProps {
  title: string;
  author: string;
  summary?: string;
  tags?: string[];
  hook?: string;
  targetAge?: string;
}

export default function ReadingActivity({
  title,
  author,
  summary = "",
  tags = [],
  hook = "",
  targetAge = "",
}: ReadingActivityProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [engine, setEngine] = useState<"claude" | "default" | "">("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const fetchActivities = async () => {
    if (loaded) { setLoaded(false); setActivities([]); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        title,
        author,
        summary,
        tags: tags.join(", "),
        hook,
        targetAge,
      });
      const res = await fetch(`/api/reading-activity?${params}`);
      const data = await res.json();
      setActivities(data.activities || []);
      setEngine(data.engine || "");
      setLoaded(true);
    } catch (err) {
      console.error("독후활동 불러오기 실패:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4">
      {/* 독후활동 버튼 */}
      <button
        onClick={fetchActivities}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium
                   bg-amber-50 text-amber-700 border border-amber-200
                   hover:bg-amber-100 transition-colors disabled:opacity-60"
      >
        {loading ? (
          <>
            <span className="animate-spin">⏳</span> 독후활동 생성 중...
          </>
        ) : loaded ? (
          <>🎨 독후활동 닫기</>
        ) : (
          <>🎨 다중지능 독후활동 보기</>
        )}
      </button>

      {/* 활동 목록 */}
      {loaded && activities.length > 0 && (
        <div className="mt-3 p-4 bg-amber-50 rounded-xl border border-amber-100">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-amber-800">
              📚 《{title}》 다중지능 독후활동
            </h4>
            {engine === "claude" && (
              <span className="text-xs text-amber-500 bg-amber-100 px-2 py-0.5 rounded-full">
                AI 맞춤 생성
              </span>
            )}
          </div>

          {/* 지능 유형 탭 */}
          <div className="flex flex-wrap gap-2 mb-3">
            {activities.map((item) => (
              <button
                key={item.key}
                onClick={() =>
                  setSelectedKey(selectedKey === item.key ? null : item.key)
                }
                className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium
                            border transition-all
                            ${selectedKey === item.key
                              ? "bg-amber-600 text-white border-amber-600"
                              : "bg-white text-amber-700 border-amber-200 hover:bg-amber-100"
                            }`}
              >
                <span>{item.emoji}</span>
                <span>{item.name}</span>
              </button>
            ))}
          </div>

          {/* 선택된 활동 표시 */}
          {selectedKey && (() => {
            const item = activities.find(a => a.key === selectedKey);
            if (!item) return null;
            return (
              <div className="bg-white rounded-lg p-4 border border-amber-200">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{item.emoji}</span>
                  <div>
                    <div className="font-semibold text-amber-800 text-sm">{item.name}</div>
                    <div className="text-xs text-amber-500">{item.desc}</div>
                  </div>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{item.activity}</p>
              </div>
            );
          })()}

          {/* 선택 안내 */}
          {!selectedKey && (
            <p className="text-xs text-amber-500 text-center py-1">
              위 버튼을 눌러 원하는 지능 유형의 활동을 확인하세요
            </p>
          )}
        </div>
      )}
    </div>
  );
}
