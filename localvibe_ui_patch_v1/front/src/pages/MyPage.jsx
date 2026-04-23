import { useState } from 'react';

const FALLBACK_IMG =
  'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=400&q=60';

function getScraps() {
  try { return JSON.parse(localStorage.getItem('lv_scraps') || '[]'); }
  catch { return []; }
}
function saveScraps(arr) {
  localStorage.setItem('lv_scraps', JSON.stringify(arr));
}
function showToast(msg) {
  const el = document.createElement('div');
  el.className = 'add-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

export default function MyPage({ myTrips, onSaveTrips, regions, onGoGallery }) {
  const [tab, setTab] = useState('trips');
  const [showNewTrip, setShowNewTrip] = useState(false);
  const [newTripName, setNewTripName] = useState('');
  const [newTripDate, setNewTripDate] = useState('');
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [scraps, setScraps] = useState(getScraps);

  const scrappedRegions = regions.filter(r => scraps.includes(r.id));

  /* 스크랩 취소 */
  const handleUnscrap = (regionId) => {
    const next = scraps.filter(id => id !== regionId);
    saveScraps(next);
    setScraps(next);
    showToast('스크랩을 취소했어요');
  };

  /* 새 여행 생성 */
  const handleCreateTrip = () => {
    if (!newTripName.trim()) return;
    const trip = {
      id: Date.now(),
      name: newTripName.trim(),
      date: newTripDate || '날짜 미정',
      places: [],
      createdAt: new Date().toLocaleDateString('ko-KR'),
    };
    onSaveTrips([...myTrips, trip]);
    setNewTripName('');
    setNewTripDate('');
    setShowNewTrip(false);
  };

  /* 여행 삭제 */
  const handleDeleteTrip = (id) => {
    if (!window.confirm('이 여행을 삭제할까요?')) return;
    onSaveTrips(myTrips.filter(t => t.id !== id));
    if (selectedTrip?.id === id) setSelectedTrip(null);
  };

  /* 여행에서 장소 제거 */
  const handleRemovePlace = (tripId, placeId) => {
    const updated = myTrips.map(t =>
      t.id === tripId
        ? { ...t, places: t.places.filter(p => p.id !== placeId) }
        : t
    );
    onSaveTrips(updated);
    if (selectedTrip?.id === tripId) {
      setSelectedTrip(updated.find(t => t.id === tripId));
    }
  };

  return (
    <div className="mypage-root">
      {/* 프로필 헤더 */}
      <div className="mypage-profile">
        <div className="mypage-avatar">나</div>
        <div className="mypage-profile-info">
          <p className="mypage-username">여행자</p>
          <p className="mypage-usersub">광주·전남 로컬 탐험가</p>
          <div className="mypage-stats">
            <span><strong>{myTrips.length}</strong> 여행</span>
            <span><strong>{myTrips.reduce((a, t) => a + t.places.length, 0)}</strong> 담은 장소</span>
            <span><strong>{scrappedRegions.length}</strong> 스크랩</span>
          </div>
        </div>
      </div>

      {/* 탭 */}
      <div className="mypage-tabs">
        <button
          className={`mypage-tab ${tab === 'trips' ? 'active' : ''}`}
          onClick={() => setTab('trips')}
        >
          ✈️ 나의 여행 플랜
        </button>
        <button
          className={`mypage-tab ${tab === 'scraps' ? 'active' : ''}`}
          onClick={() => setTab('scraps')}
        >
          🤍 스크랩한 장소
        </button>
      </div>

      {/* ── 여행 플랜 탭 ── */}
      {tab === 'trips' && (
        <div className="mypage-content">
          {selectedTrip ? (
            /* 여행 상세 */
            <div className="trip-detail">
              <button className="trip-detail-back" onClick={() => setSelectedTrip(null)}>
                ← 목록으로
              </button>
              <div className="trip-detail-header">
                <div>
                  <h2 className="trip-detail-name">{selectedTrip.name}</h2>
                  <p className="trip-detail-date">{selectedTrip.date}</p>
                </div>
                <button
                  className="trip-delete-btn"
                  onClick={() => handleDeleteTrip(selectedTrip.id)}
                >
                  여행 삭제
                </button>
              </div>

              {selectedTrip.places.length === 0 ? (
                <div className="trip-empty">
                  <p>아직 담은 장소가 없어요</p>
                  <p className="trip-empty-sub">갤러리에서 장소 카드의 + 버튼을 눌러 담아보세요</p>
                  <button className="trip-go-gallery" onClick={onGoGallery}>
                    갤러리로 이동 →
                  </button>
                </div>
              ) : (
                <div className="trip-places">
                  {selectedTrip.places.map((place, idx) => (
                    <div key={place.id} className="trip-place-item">
                      <div className="trip-place-num">{idx + 1}</div>
                      <img
                        src={place.imageUrl || FALLBACK_IMG}
                        alt={place.name}
                        className="trip-place-img"
                        onError={e => { e.currentTarget.src = FALLBACK_IMG; }}
                      />
                      <div className="trip-place-info">
                        <p className="trip-place-name">{place.name}</p>
                        {place.summary && (
                          <p className="trip-place-summary">{place.summary}</p>
                        )}
                      </div>
                      <button
                        className="trip-place-remove"
                        onClick={() => handleRemovePlace(selectedTrip.id, place.id)}
                        title="장소 제거"
                      >×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* 여행 목록 */
            <>
              <div className="mypage-list-header">
                <h2 className="mypage-section-title">나의 여행 플랜</h2>
                <button className="new-trip-btn" onClick={() => setShowNewTrip(true)}>
                  + 새 여행 만들기
                </button>
              </div>

              {showNewTrip && (
                <div className="new-trip-form">
                  <input
                    className="new-trip-input"
                    placeholder="여행 이름 (예: 11월 광주 당일치기)"
                    value={newTripName}
                    onChange={e => setNewTripName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreateTrip()}
                    autoFocus
                  />
                  <input
                    className="new-trip-input"
                    placeholder="날짜 (예: 2026.11.01 ~ 11.02)"
                    value={newTripDate}
                    onChange={e => setNewTripDate(e.target.value)}
                  />
                  <div className="new-trip-actions">
                    <button className="new-trip-confirm" onClick={handleCreateTrip}>만들기</button>
                    <button className="new-trip-cancel" onClick={() => setShowNewTrip(false)}>취소</button>
                  </div>
                </div>
              )}

              {myTrips.length === 0 ? (
                <div className="trip-empty">
                  <p>아직 만든 여행이 없어요 ✈️</p>
                  <p className="trip-empty-sub">+ 새 여행 만들기로 첫 여행을 계획해보세요!</p>
                </div>
              ) : (
                <div className="trip-list">
                  {myTrips.map(trip => (
                    <div
                      key={trip.id}
                      className="trip-card"
                      onClick={() => setSelectedTrip(trip)}
                    >
                      <div className="trip-card-thumbs">
                        {trip.places.slice(0, 4).map((p, i) => (
                          <img
                            key={i}
                            src={p.imageUrl || FALLBACK_IMG}
                            alt={p.name}
                            onError={e => { e.currentTarget.src = FALLBACK_IMG; }}
                          />
                        ))}
                        {trip.places.length === 0 && (
                          <div className="trip-card-empty-thumb">📍</div>
                        )}
                      </div>
                      <div className="trip-card-info">
                        <p className="trip-card-name">{trip.name}</p>
                        <p className="trip-card-date">{trip.date}</p>
                        <p className="trip-card-count">
                          {trip.places.length}개 장소 · {trip.createdAt} 생성
                        </p>
                      </div>
                      <button
                        className="trip-card-delete"
                        onClick={e => { e.stopPropagation(); handleDeleteTrip(trip.id); }}
                        title="삭제"
                      >×</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── 스크랩 탭 ── */}
      {tab === 'scraps' && (
        <div className="mypage-content">
          <h2 className="mypage-section-title">
            스크랩한 장소
            {scrappedRegions.length > 0 && (
              <span className="mypage-section-count">{scrappedRegions.length}개</span>
            )}
          </h2>

          {scrappedRegions.length === 0 ? (
            <div className="trip-empty">
              <p>스크랩한 장소가 없어요 🤍</p>
              <p className="trip-empty-sub">갤러리에서 마음에 드는 장소를 스크랩해보세요</p>
              <button className="trip-go-gallery" onClick={onGoGallery}>
                갤러리로 이동 →
              </button>
            </div>
          ) : (
            <div className="scrap-grid">
              {scrappedRegions.map(r => (
                <div key={r.id} className="scrap-card">
                  <div className="scrap-img-wrap">
                    <img
                      src={r.imageUrl || FALLBACK_IMG}
                      alt={r.name}
                      className="scrap-img"
                      onError={e => { e.currentTarget.src = FALLBACK_IMG; }}
                    />
                    {/* 스크랩 취소 하트 버튼 */}
                    <button
                      className="scrap-heart-btn"
                      onClick={() => handleUnscrap(r.id)}
                      title="스크랩 취소"
                      aria-label="스크랩 취소"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                      </svg>
                    </button>
                  </div>
                  <div className="scrap-info">
                    <p className="scrap-name">{r.name}</p>
                    {r.summary && <p className="scrap-summary">{r.summary}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
