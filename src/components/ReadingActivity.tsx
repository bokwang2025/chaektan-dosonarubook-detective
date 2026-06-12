"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, Palette } from "lucide-react";

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
  /** 카드의 '독후활동' 버튼으로 진입 시 자동 펼침 */
  autoOpen?: boolean;
}

export default function ReadingActivity({
  title,
  author,
  summary = "",
  tags = [],
  hook = "",
  targetAge = "",
  autoOpen = false,
}: ReadingActivityProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [engine, setEngine] = useState<"claude" | "default" | "">("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const cacheKey = `reading-activity:${title}`;
  const autoOpened = useRef(false);

  const fetchActivities = async () => {
    if (loaded) { setLoaded(false); setActivities([]); return; }
    setLoading(true);
    try {
      // 캐시 확인
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { activities: cachedActivities, engine: cachedEngine } = JSON.parse(cached);
        setActivities(cachedActivities || []);
        setEngine(cachedEngine || "");
        setLoaded(true);
        return;
      }

      // API 호출
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
      const newActivities = data.activities || [];
      const newEngine = data.engine || "";

      // 캐시 저장
      localStorage.setItem(cacheKey, JSON.stringify({
        activities: newActivities,
        engine: newEngine,
      }));

      setActivities(newActivities);
      setEngine(newEngine);
      setLoaded(true);
    } catch (err) {
      console.error("독후활동 불러오기 실패:", err);
    } finally {
      setLoading(false);
    }
  };

  // 자동 펼침 (마운트 시 1회)
  useEffect(() => {
    if (autoOpen && !autoOpened.current && !loaded && !loading) {
      autoOpened.current = true;
      fetchActivities();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);

  return (
    <div className="mi-section">
      <button className="mi-toggle-btn" onClick={fetchActivities} disabled={loading}>
        {loading ? (
          <><Loader2 size={14} className="spin" /> 독후활동 생성 중…</>
        ) : loaded ? (
          <><Palette size={14} /> 다중지능 독후활동 닫기</>
        ) : (
          <><Palette size={14} /> 다중지능 독후활동 보기</>
        )}
      </button>

      {loaded && activities.length > 0 && (
        <div className="mi-panel">
          <div className="mi-panel-header">
            <span className="mi-panel-title">《{title}》 다중지능 독후활동</span>
            {engine === "claude" && <span className="mi-engine-badge">AI 맞춤 생성</span>}
          </div>

          <div className="mi-tabs">
            {activities.map((item) => (
              <button
                key={item.key}
                className={`mi-tab ${selectedKey === item.key ? "on" : ""}`}
                onClick={() => setSelectedKey(selectedKey === item.key ? null : item.key)}
              >
                <span>{item.emoji}</span>
                <span>{item.name}</span>
              </button>
            ))}
          </div>

          {selectedKey ? (() => {
            const item = activities.find((a) => a.key === selectedKey);
            if (!item) return null;
            return (
              <div className="mi-detail">
                <div className="mi-detail-head">
                  <span className="mi-detail-emoji">{item.emoji}</span>
                  <div>
                    <div className="mi-detail-name">{item.name}</div>
                    <div className="mi-detail-desc">{item.desc}</div>
                  </div>
                </div>
                <p className="mi-detail-activity">{item.activity}</p>
              </div>
            );
          })() : (
            <p className="mi-hint">지능 유형을 누르면 맞춤 활동이 나와요</p>
          )}
        </div>
      )}
    </div>
  );
}
