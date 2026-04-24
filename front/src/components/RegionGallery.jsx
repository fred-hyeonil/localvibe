import { useEffect, useState } from 'react';

const CARD_IMAGE_FALLBACK =
  'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80';
const PAGE_SIZE = 12;
const CATEGORIES = [
  { id: 'all', label: '전체', icon: '🗺️' },
  { id: 'cafe', label: '카페', icon: '☕' },
  { id: 'food', label: '맛집', icon: '🍽️' },
  { id: 'tour', label: '관광명소', icon: '🏛️' },
  { id: 'nature', label: '자연', icon: '🌿' },
  { id: 'night', label: '야경·바', icon: '🌙' },
];

function inferCategory(region) {
  const text = `${region.name || ''}${region.summary || ''}`;
  if (/카페|커피|브런치/.test(text)) return 'cafe';
  if (/맛집|식당|음식|밥|국밥|고기/.test(text)) return 'food';
  if (/공원|산|바다|강|자연|숲|녹원|죽녹원/.test(text)) return 'nature';
  if (/야경|야간|밤|루프탑|바|재즈|클럽/.test(text)) return 'night';
  return 'tour';
}

function getScraps() {
  try {
    return JSON.parse(localStorage.getItem('lv_scraps') || '[]');
  } catch {
    return [];
  }
}

function saveScraps(items) {
  localStorage.setItem('lv_scraps', JSON.stringify(items));
  window.dispatchEvent(new CustomEvent('lv_scraps_changed', { detail: items }));
}

function showToast(message) {
  const node = document.createElement('div');
  node.className = 'add-toast';
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 2200);
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
  const [scraps, setScraps] = useState(getScraps);

  useEffect(() => {
    setCurrentPage(1);
    setActiveCategory('all');
  }, [regions]);

  useEffect(() => {
    const handleScrapChanged = event => {
      setScraps(event.detail || getScraps());
    };
    window.addEventListener('lv_scraps_changed', handleScrapChanged);
    return () => window.removeEventListener('lv_scraps_changed', handleScrapChanged);
  }, []);

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
      : allItems.filter(region => inferCategory(region) === activeCategory);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const handlePage = page => {
    setCurrentPage(page);
    document
      .querySelector('.gallery-scroll-area')
      ?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleScrap = (event, region) => {
    event.stopPropagation();
    const current = getScraps();
    const isScrapped = current.includes(region.id);
    const next = isScrapped
      ? current.filter(id => id !== region.id)
      : [...current, region.id];
    saveScraps(next);
    setScraps(next);
    showToast(isScrapped ? '스크랩을 취소했어요' : '스크랩했어요');
  };

  const handleAddClick = (event, region) => {
    event.stopPropagation();
    setAddPopup(prev =>
      prev?.region?.id === region.id ? null : { region },
    );
  };

  const handleAddToTrip = (event, trip, region) => {
    event.stopPropagation();
    if (!onSaveTrips) return;
    if (trip.places.some(place => place.id === region.id)) {
      showToast(`이미 "${trip.name}"에 담긴 장소예요`);
      setAddPopup(null);
      return;
    }
    const updatedTrips = myTrips.map(item =>
      item.id === trip.id
        ? {
            ...item,
            places: [
              ...item.places,
              {
                id: region.id,
                name: region.name,
                imageUrl: region.imageUrl,
                summary: region.summary,
              },
            ],
          }
        : item,
    );
    onSaveTrips(updatedTrips);
    setAddPopup(null);
    showToast(`"${trip.name}"에 담았어요`);
  };

  return (
    <section className="gallery-scroll-area">
      <div className="category-filter">
        {CATEGORIES.map(category => (
          <button
            key={category.id}
            className={`category-btn ${activeCategory === category.id ? 'active' : ''}`}
            onClick={() => {
              setActiveCategory(category.id);
              setCurrentPage(1);
            }}
          >
            <span className="category-icon">{category.icon}</span>
            <span className="category-label">{category.label}</span>
          </button>
        ))}
      </div>

      <div className="gallery-toolbar">
        <span className="gallery-count">
          <strong>{filtered.length}</strong>개 지역
        </span>
        <span className="gallery-page-info">
          {currentPage} / {totalPages} 페이지
        </span>
      </div>

      <div className="region-grid">
        {pageItems.map(region => {
          const category =
            CATEGORIES.find(item => item.id === inferCategory(region)) ||
            CATEGORIES[3];
          const isScrapped = scraps.includes(region.id);
          return (
            <article
              key={region.id}
              className="region-card interactive"
              onClick={() => onSelect(region)}
            >
              <button
                className={`card-heart-btn ${isScrapped ? 'scrapped' : ''}`}
                onClick={event => handleScrap(event, region)}
                title={isScrapped ? '스크랩 취소' : '스크랩'}
                aria-label={isScrapped ? '스크랩 취소' : '스크랩'}
              >
                {isScrapped ? '❤' : '♡'}
              </button>
              <span className="region-card-badge">AI 추천</span>

              <div className="region-preview">
                <img
                  src={region.imageUrl}
                  alt={region.name}
                  className="region-image"
                  loading="lazy"
                  onError={event => {
                    event.currentTarget.onerror = null;
                    event.currentTarget.src = CARD_IMAGE_FALLBACK;
                  }}
                />
                <div className="region-card-overlay">
                  <span className="region-overlay-name">{region.name}</span>
                  {!!region.summary && (
                    <p className="region-overlay-summary">{region.summary}</p>
                  )}
                  <div className="region-overlay-bottom">
                    <div className="region-overlay-tags">
                      <span className="region-overlay-tag">
                        {category.icon} {category.label}
                      </span>
                      <span className="region-overlay-tag">광주·전남</span>
                    </div>
                    <button
                      className="card-add-btn"
                      onClick={event => handleAddClick(event, region)}
                      title="여행에 담기"
                      aria-label="여행에 담기"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {addPopup?.region?.id === region.id && (
                <div
                  className="trip-popup"
                  onClick={event => event.stopPropagation()}
                >
                  <p className="trip-popup-title">여행에 담기</p>
                  {myTrips.length === 0 ? (
                    <p className="trip-popup-empty">
                      마이페이지에서 먼저 여행을 만들어주세요
                    </p>
                  ) : (
                    <ul className="trip-popup-list">
                      {myTrips.map(trip => (
                        <li key={trip.id}>
                          <button
                            className="trip-popup-item"
                            onClick={event =>
                              handleAddToTrip(event, trip, region)
                            }
                          >
                            {trip.name}
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

      {pageItems.length === 0 && (
        <div className="gallery-empty">
          <p>해당 카테고리의 지역이 없어요.</p>
          <button
            className="gallery-empty-reset"
            onClick={() => {
              setActiveCategory('all');
              setCurrentPage(1);
            }}
          >
            전체 보기
          </button>
        </div>
      )}

      {totalPages > 1 && (
        <nav className="pagination" aria-label="페이지 이동">
          <button
            className="pagination-btn pagination-arrow"
            onClick={() => handlePage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
          >
            {'<'}
          </button>
          {Array.from({ length: totalPages }, (_, index) => index + 1).map(
            page => (
              <button
                key={page}
                className={`pagination-btn ${currentPage === page ? 'active' : ''}`}
                onClick={() => handlePage(page)}
              >
                {page}
              </button>
            ),
          )}
          <button
            className="pagination-btn pagination-arrow"
            onClick={() => handlePage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
          >
            {'>'}
          </button>
        </nav>
      )}
    </section>
  );
}
