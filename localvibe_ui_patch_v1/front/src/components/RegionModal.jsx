import { useState, useEffect } from "react";
import KakaoMap from "./KakaoMap";

function toCardItems(region) {
  const noInfo = ["정보를 제공 받을 수 없습니다."];
  return [
    {
      title: "추천 업종",
      values:
        Array.isArray(region.recommendedBusinesses) &&
        region.recommendedBusinesses.length > 0
          ? region.recommendedBusinesses
          : noInfo,
    },
    {
      title: "혼잡 시간대",
      values:
        Array.isArray(region.busyHours) && region.busyHours.length > 0
          ? region.busyHours
          : noInfo,
    },
    {
      title: "예상 고객층",
      values:
        Array.isArray(region.targetCustomers) &&
        region.targetCustomers.length > 0
          ? region.targetCustomers
          : noInfo,
    },
  ];
}

/* localStorage 헬퍼 */
function getScraps() {
  try { return JSON.parse(localStorage.getItem("lv_scraps") || "[]"); }
  catch { return []; }
}
function saveScraps(arr) {
  localStorage.setItem("lv_scraps", JSON.stringify(arr));
  // 커스텀 이벤트 발행 → RegionGallery 하트 즉시 갱신
  window.dispatchEvent(new CustomEvent("lv_scraps_changed", { detail: arr }));
}

function getTrips() {
  try { return JSON.parse(localStorage.getItem("lv_mytrips") || "[]"); }
  catch { return []; }
}
function saveTripsStorage(arr) {
  localStorage.setItem("lv_mytrips", JSON.stringify(arr));
}

function showToast(msg) {
  const el = document.createElement("div");
  el.className = "add-toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

const MODAL_IMAGE_FALLBACK =
  "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80";

export default function RegionModal({
  region,
  isLoading,
  onClose,
  onSaveTrips,
}) {
  const [scrapped, setScrapped] = useState(false);
  const [showTripPicker, setShowTripPicker] = useState(false);
  const [localTrips, setLocalTrips] = useState([]);

  useEffect(() => {
    if (!region) return;
    setScrapped(getScraps().includes(region.id));
    setShowTripPicker(false);
    setLocalTrips(getTrips());
  }, [region]);

  if (!region) return null;

  const cards = toCardItems(region);
  const shortSummary =
    region.summaryShort || region.summary || "정보를 제공 받을 수 없습니다.";
  const longSummary = region.summary || "";
  const showOriginal = longSummary && shortSummary && longSummary !== shortSummary;

  /* 스크랩 토글 — saveScraps가 커스텀 이벤트 발행 */
  const handleScrap = () => {
    const cur = getScraps();
    const isScrapped = cur.includes(region.id);
    const next = isScrapped
      ? cur.filter(id => id !== region.id)
      : [...cur, region.id];
    saveScraps(next);
    setScrapped(!isScrapped);
    showToast(isScrapped ? "스크랩을 취소했어요" : "스크랩했어요 🤍");
  };

  /* 여행에 담기 */
  const handleAddToTrip = (trip) => {
    if (trip.places.some(p => p.id === region.id)) {
      showToast(`이미 "${trip.name}"에 담긴 장소예요`);
      setShowTripPicker(false);
      return;
    }
    const updated = localTrips.map(t =>
      t.id === trip.id
        ? {
            ...t,
            places: [
              ...t.places,
              {
                id: region.id,
                name: region.name,
                imageUrl: region.imageUrl,
                summary: region.summary,
              },
            ],
          }
        : t
    );
    saveTripsStorage(updated);
    setLocalTrips(updated);
    onSaveTrips?.(updated);
    showToast(`"${trip.name}"에 담았어요 ✓`);
    setShowTripPicker(false);
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <article
        className="modal-content"
        role="dialog"
        onClick={e => e.stopPropagation()}
      >
        {/* X 닫기 버튼 */}
        <button className="modal-close-x" type="button" onClick={onClose} aria-label="닫기">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        {/* 이미지 */}
        <div className="modal-image-wrap">
          <img
            src={region.imageUrl}
            alt={region.name}
            className="modal-image"
            onError={e => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = MODAL_IMAGE_FALLBACK;
            }}
          />
        </div>

        {/* 본문 */}
        <div className="modal-body">
          <h2 className="modal-region-name">{region.name}</h2>
          <p className="modal-region-summary">{shortSummary}</p>

          {showOriginal && (
            <details className="modal-summary-details">
              <summary>원문 보기</summary>
              <p>{longSummary}</p>
            </details>
          )}
          {region.dataSource && (
            <p className="modal-source">출처: {region.dataSource}</p>
          )}

          {/* 지도 */}
          {isLoading ? (
            <p className="kakao-map-error">지도 좌표를 준비하는 중입니다...</p>
          ) : (
            <KakaoMap
              address={region.address}
              latitude={region.latitude}
              longitude={region.longitude}
            />
          )}
          {isLoading && <p className="modal-loading">상세 데이터를 불러오는 중...</p>}

          {/* 인사이트 카드 */}
          <section className="insight-grid">
            {cards.map(card => (
              <article key={card.title} className="insight-card">
                <h3>{card.title}</h3>
                <ul>
                  {card.values.map(value => (
                    <li key={value}>{value}</li>
                  ))}
                </ul>
              </article>
            ))}
          </section>

          {/* 하단 액션 버튼 2개 */}
          <div className="modal-actions">

            {/* 스크랩 버튼 */}
            <button
              className={`modal-action-btn modal-scrap-btn ${scrapped ? "scrapped" : ""}`}
              onClick={handleScrap}
            >
              {scrapped ? (
                <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="17" height="17">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
              )}
              {scrapped ? "스크랩됨" : "스크랩"}
            </button>

            {/* 여행에 담기 버튼 + 드롭다운 */}
            <div className="modal-trip-wrap">
              <button
                className="modal-action-btn modal-add-trip-btn"
                onClick={() => setShowTripPicker(v => !v)}
              >
                {/* 지도핀 아이콘 */}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="17" height="17">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                여행에 담기
              </button>

              {showTripPicker && (
                <div className="modal-trip-picker">
                  <p className="modal-trip-picker-title">어떤 여행에 담을까요?</p>
                  {localTrips.length === 0 ? (
                    <p className="modal-trip-picker-empty">
                      마이페이지에서 먼저 여행을 만들어주세요
                    </p>
                  ) : (
                    <ul className="modal-trip-picker-list">
                      {localTrips.map(trip => (
                        <li key={trip.id}>
                          <button
                            className="modal-trip-picker-item"
                            onClick={() => handleAddToTrip(trip)}
                          >
                            <span className="modal-trip-picker-icon">✈️</span>
                            <span>
                              <strong>{trip.name}</strong>
                              <br />
                              <small>{trip.date} · {trip.places.length}개 장소</small>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>
      </article>
    </div>
  );
}
