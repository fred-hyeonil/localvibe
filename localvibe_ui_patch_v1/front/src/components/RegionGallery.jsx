import { useState, useEffect } from 'react';

const CARD_IMAGE_FALLBACK =
  'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80';

const PAGE_SIZE = 12;

const CATEGORIES = [
  { id: 'all',    label: '전체',    icon: '🗺️' },
  { id: 'cafe',   label: '카페',    icon: '☕' },
  { id: 'food',   label: '맛집',    icon: '🍽️' },
  { id: 'tour',   label: '관광명소', icon: '🏛️' },
  { id: 'nature', label: '자연',    icon: '🌿' },
  { id: 'night',  label: '야경·바', icon: '🌙' },
];

function inferCategory(region) {
  const text = (region.name || '') + (region.summary || '');
  if (/카페|커피|브런치/.test(text)) return 'cafe';
  if (/맛집|식당|음식|밥|국밥|고기/.test(text)) return 'food';
  if (/공원|산|바다|강|자연|숲|녹원|죽녹원/.test(text)) return 'nature';
  if (/야경|야간|밤|루프탑|바|재즈|클럽/.test(text)) return 'night';
  return 'tour';
}

function getScraps() {
  try { return JSON.parse(localStorage.getItem('lv_scraps') || '[]'); }
  catch { return []; }
}
function saveScraps(arr) {
  localStorage.setItem('lv_scraps', JSON.stringify(arr));
  // 모달과 동일한 이벤트 발행
  window.dispatchEvent(new CustomEvent('lv_scraps_changed', { detail: arr }));
}

function showToast(msg) {
  const el = document.createElement('div');
  el.className = 'add-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

export default function RegionGallery({
  regions,
  totalRegions = [],
  onSelect,
  myTrips = [],
  onSaveTrips,
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [activeCategory, setActiveCategory] = useState('all');
  const [addPopup, setAddPopup] = useState(null);
  // 스크랩 state — 커스텀 이벤트로 실시간 동기화
  const [scraps, setScraps] = useState(getScraps);

  useEffect(() => {
    setCurrentPage(1);
    setActiveCategory('all');
  }, [regions]);

  // 모달에서 스크랩 변경 시 즉시 반영
  useEffect(() => {
    const handleScrapChange = (e) => {
      setScraps(e.detail || getScraps());
    };
    window.addEventListener('lv_scraps_changed', handleScrapChange);
    return () => window.removeEventListener('lv_scraps_changed', handleScrapChange);
  }, []);

  // 팝업 외부 클릭 시 닫기
  useEffect(() => {
    if (!addPopup) return;
    const close = () => setAddPopup(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [addPopup]);

  const allItems = regions.length > 0 ? regions : totalRegions;
  const filtered =
    activeCategory === 'all'
      ? allItems
      : allItems.filter(r => inferCategory(r) === activeCategory);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const handleCategory = (id) => { setActiveCategory(id); setCurrentPage(1); };

  const handlePage = (page) => {
    setCurrentPage(page);
    document.querySelector('.gallery-scroll-area')?.scrollIntoView({ behavior: 'smooth' });
  };

  const getCatInfo = (region) =>
    CATEGORIES.find(c => c.id === inferCategory(region)) || CATEGORIES[3];

  // 하트 스크랩 토글
  const handleScrap = (e, region) => {
    e.stopPropagation();
    const cur = getScraps();
    const isScrapped = cur.includes(region.id);
    const next = isScrapped
      ? cur.filter(x => x !== region.id)
      : [...cur, region.id];
    saveScraps(next);
    setScraps(next);
    showToast(isScrapped ? '스크랩을 취소했어요' : '스크랩했어요 🤍');
  };

  // + 버튼 → 여행 선택 팝업
  const handleAddClick = (e, region) => {
    e.stopPropagation();
    setAddPopup(prev => prev?.region?.id === region.id ? null : { region });
  };

  // 여행에 장소 추가
  const handleAddToTrip = (e, trip, region) => {
    e.stopPropagation();
    if (trip.places.some(p => p.id === region.id)) {
      showToast(`이미 "${trip.name}"에 담긴 장소예요`);
      setAddPopup(null);
      return;
    }
    const updated = myTrips.map(t =>
      t.id === trip.id
        ? {
            ...t,
            places: [...t.places, {
              id: region.id,
              name: region.name,
              imageUrl: region.imageUrl,
              summary: region.summary,
            }],
          }
        : t
    );
    onSaveTrips(updated);
    setAddPopup(null);
    showToast(`"${trip.name}"에 담았어요 ✓`);
  };

  return (
    <section className="gallery-scroll-area">
      {/* 카테고리 필터 */}
      <div className="category-filter">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            className={`category-btn ${activeCategory === cat.id ? 'active' : ''}`}
            onClick={() => handleCategory(cat.id)}
          >
            <span className="category-icon">{cat.icon}</span>
            <span className="category-label">{cat.label}</span>
          </button>
        ))}
      </div>

      {/* 툴바 */}
      <div className="gallery-toolbar">
        <span className="gallery-count">
          <strong>{filtered.length}</strong>개 지역
        </span>
        <span className="gallery-page-info">{currentPage} / {totalPages} 페이지</span>
      </div>

      {/* 카드 그리드 */}
      <div className="region-grid">
        {pageItems.map((region) => {
          const catInfo = getCatInfo(region);
          const isScrapped = scraps.includes(region.id);
          return (
            <article
              key={region.id}
              className="region-card"
              onClick={() => onSelect(region)}
            >
              {/* 우상단 하트 스크랩 버튼 */}
              <button
                className={`card-heart-btn ${isScrapped ? 'scrapped' : ''}`}
                onClick={(e) => handleScrap(e, region)}
                title={isScrapped ? '스크랩 취소' : '스크랩'}
                aria-label={isScrapped ? '스크랩 취소' : '스크랩'}
              >
                {isScrapped ? (
                  <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                  </svg>
                )}
              </button>

              {/* AI 추천 배지 */}
              <span className="region-card-badge">AI 추천</span>

              <div className="region-preview">
                <img
                  src={region.imageUrl}
                  alt={region.name}
                  className="region-image"
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = CARD_IMAGE_FALLBACK;
                  }}
                />
                <div className="region-card-overlay">
                  <span className="region-overlay-name">{region.name}</span>
                  {region.summary && (
                    <p className="region-overlay-summary">{region.summary}</p>
                  )}
                  <div className="region-overlay-bottom">
                    <div className="region-overlay-tags">
                      <span className="region-overlay-tag">
                        {catInfo.icon} {catInfo.label}
                      </span>
                      <span className="region-overlay-tag">광주·전남</span>
                    </div>
                    {/* 여행에 담기 + 버튼 */}
                    <button
                      className="card-add-btn"
                      onClick={(e) => handleAddClick(e, region)}
                      title="여행에 담기"
                      aria-label="여행에 담기"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* 여행 선택 팝업 */}
              {addPopup?.region?.id === region.id && (
                <div
                  className="trip-popup"
                  onClick={e => e.stopPropagation()}
                >
                  <p className="trip-popup-title">여행에 담기</p>
                  {myTrips.length === 0 ? (
                    <p className="trip-popup-empty">
                      마이페이지에서 먼저<br />여행을 만들어주세요
                    </p>
                  ) : (
                    <ul className="trip-popup-list">
                      {myTrips.map(trip => (
                        <li key={trip.id}>
                          <button
                            className="trip-popup-item"
                            onClick={(e) => handleAddToTrip(e, trip, region)}
                          >
                            <span className="trip-popup-icon">✈️</span>
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
            </article>
          );
        })}
      </div>

      {/* 결과 없음 */}
      {pageItems.length === 0 && (
        <div className="gallery-empty">
          <p>해당 카테고리의 지역이 없어요 😅</p>
          <button className="gallery-empty-reset" onClick={() => handleCategory('all')}>
            전체 보기
          </button>
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <nav className="pagination" aria-label="페이지 이동">
          <button
            className="pagination-btn pagination-arrow"
            onClick={() => handlePage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
          >‹</button>

          {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
            <button
              key={page}
              className={`pagination-btn ${currentPage === page ? 'active' : ''}`}
              onClick={() => handlePage(page)}
              aria-current={currentPage === page ? 'page' : undefined}
            >{page}</button>
          ))}

          <button
            className="pagination-btn pagination-arrow"
            onClick={() => handlePage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
          >›</button>
        </nav>
      )}
    </section>
  );
}
