"use client";

/**
 * 도서관 지도 — 대출 가능 / 대출 중 / 작은도서관 3색 핀
 * - Leaflet은 CDN에서 처음 지도를 열 때만 불러옴 (번들 크기 0, npm 설치 불필요)
 * - 타일: OpenStreetMap (출처 표기 필수)
 */

import { useEffect, useRef, useState } from "react";

export interface MapPin {
  id: string;            // 목록 카드와 연결되는 키
  no: number;            // 핀/카드에 표시되는 번호
  name: string;
  lat: number;
  lng: number;
  kind: "public" | "small";
  loanAvailable: boolean;
  distance?: number;
  link?: string | null;
}

interface Props {
  pins: MapPin[];
  userLocation: { lat: number; lng: number } | null;
  activeId?: string | null;
  onPinClick?: (id: string) => void;
}

const LEAFLET_VER = "1.9.4";
const LEAFLET_CSS = `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET_VER}/dist/leaflet.css`;
const LEAFLET_JS  = `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET_VER}/dist/leaflet.js`;

export const PIN_COLORS = {
  available:   "#2d9e4f", // 대출 가능
  unavailable: "#9aa3ad", // 대출 중
  small:       "#d4880f", // 작은도서관
} as const;

/* eslint-disable @typescript-eslint/no-explicit-any */
type LeafletNS = any;

let leafletPromise: Promise<LeafletNS> | null = null;
function loadLeaflet(): Promise<LeafletNS> {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  const w = window as any;
  if (w.L) return Promise.resolve(w.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const css = document.createElement("link");
      css.rel = "stylesheet"; css.href = LEAFLET_CSS;
      document.head.appendChild(css);
    }
    const s = document.createElement("script");
    s.src = LEAFLET_JS; s.async = true;
    s.onload = () => (w.L ? resolve(w.L) : reject(new Error("leaflet missing")));
    s.onerror = () => { leafletPromise = null; reject(new Error("leaflet load failed")); };
    document.head.appendChild(s);
  });
  return leafletPromise;
}

function pinColor(p: MapPin) {
  if (p.kind === "small") return PIN_COLORS.small;
  return p.loanAvailable ? PIN_COLORS.available : PIN_COLORS.unavailable;
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function pinIcon(L: LeafletNS, p: MapPin, active: boolean) {
  const c = pinColor(p);
  const size = active ? 38 : 30;
  return L.divIcon({
    className: "lm-pin-wrap",
    html: `<div class="lm-pin${active ? " active" : ""}" style="--pin:${c};width:${size}px;height:${size}px"><span>${p.no}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size + 4],
  });
}

function popupHtml(p: MapPin) {
  const status = p.kind === "small"
    ? `작은도서관 · ${p.loanAvailable ? "대출 가능" : "대출 중"}`
    : (p.loanAvailable ? "대출 가능" : "대출 중");
  const dist = p.distance !== undefined ? ` · ${p.distance.toFixed(1)}km` : "";
  const link = p.link
    ? `<a href="${esc(p.link)}" target="_blank" rel="noopener noreferrer">${p.kind === "small" ? "작은도서관 바로가기" : "이 책 바로 검색"} →</a>`
    : "";
  return `<div class="lm-pop"><strong>${esc(p.name)}</strong><div class="lm-pop-st" style="color:${pinColor(p)}">${status}${dist}</div>${link}</div>`;
}

export default function LibraryMap({ pins, userLocation, activeId, onPinClick }: Props) {
  const boxRef    = useRef<HTMLDivElement>(null);
  const mapRef    = useRef<LeafletNS>(null);
  const layerRef  = useRef<LeafletNS>(null);
  const markerRef = useRef<Map<string, LeafletNS>>(new Map());
  const clickRef  = useRef(onPinClick);
  const [failed, setFailed] = useState(false);
  const [ready,  setReady]  = useState(false);

  useEffect(() => { clickRef.current = onPinClick; }, [onPinClick]);

  // 지도 생성 (1회)
  useEffect(() => {
    let cancelled = false;
    const markers = markerRef.current;
    loadLeaflet().then((L) => {
      if (cancelled || !boxRef.current || mapRef.current) return;
      const map = L.map(boxRef.current, { zoomControl: true, scrollWheelZoom: false, attributionControl: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, subdomains: "abc",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      }).addTo(map);
      map.attributionControl.setPrefix(false);
      map.setView([37.5665, 126.978], 12);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady(true);
      // 모달 애니메이션 뒤 크기 재계산
      setTimeout(() => map.invalidateSize(), 120);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      markers.clear();
    };
  }, []);

  // 핀 갱신
  useEffect(() => {
    const L = (window as any).L;
    const map = mapRef.current, layer = layerRef.current;
    if (!ready || !L || !map || !layer) return;
    layer.clearLayers();
    markerRef.current.clear();

    const pts: [number, number][] = [];
    if (userLocation) {
      L.marker([userLocation.lat, userLocation.lng], {
        icon: L.divIcon({ className: "lm-pin-wrap", html: '<div class="lm-me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
        zIndexOffset: -100, keyboard: false,
      }).bindTooltip("내 위치", { direction: "top", offset: [0, -8] }).addTo(layer);
      pts.push([userLocation.lat, userLocation.lng]);
    }
    // 번호 큰 것부터 그려서 1번이 위에 오도록
    [...pins].sort((a, b) => b.no - a.no).forEach((p) => {
      const m = L.marker([p.lat, p.lng], { icon: pinIcon(L, p, false), title: p.name })
        .bindPopup(popupHtml(p), { closeButton: false, maxWidth: 240 })
        .on("click", () => clickRef.current?.(p.id))
        .addTo(layer);
      markerRef.current.set(p.id, m);
      pts.push([p.lat, p.lng]);
    });

    if (pts.length === 1) map.setView(pts[0], 15);
    else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [28, 28], maxZoom: 16 });
  }, [pins, userLocation, ready]);

  // 활성 핀 강조 + 팝업
  useEffect(() => {
    const L = (window as any).L;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    pins.forEach((p) => {
      const m = markerRef.current.get(p.id);
      if (!m) return;
      const on = p.id === activeId;
      m.setIcon(pinIcon(L, p, on));
      m.setZIndexOffset(on ? 1000 : 0);
      if (on) { map.panTo(m.getLatLng(), { animate: true }); m.openPopup(); }
    });
  }, [activeId, pins, ready]);

  if (failed) {
    return <div className="lm-fail">지도를 불러오지 못했어요. 아래 목록으로 확인해 주세요.</div>;
  }

  const hasSmall = pins.some((p) => p.kind === "small");
  return (
    <div className="lm">
      <div ref={boxRef} className="lm-box" role="region" aria-label="소장 도서관 지도" />
      {!ready && <div className="lm-loading">지도 불러오는 중…</div>}
      <div className="lm-legend">
        <span><i style={{ background: PIN_COLORS.available }} />대출 가능</span>
        <span><i style={{ background: PIN_COLORS.unavailable }} />대출 중</span>
        {hasSmall && <span><i style={{ background: PIN_COLORS.small }} />작은도서관</span>}
        {userLocation && <span><i className="me" />내 위치</span>}
      </div>
    </div>
  );
}
