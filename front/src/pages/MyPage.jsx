import { useState } from 'react';

const FALLBACK_IMG =
  'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=400&q=60';

function getScraps() {
  try {
    return JSON.parse(localStorage.getItem('lv_scraps') || '[]');
  } catch {
    return [];
  }
}

function saveScraps(items) {
  localStorage.setItem('lv_scraps', JSON.stringify(items));
}

function showToast(message) {
  const node = document.createElement('div');
  node.className = 'add-toast';
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 2200);
}

export default function MyPage({ myTrips, onSaveTrips, regions, onGoGallery }) {
  const [tab, setTab] = useState('trips');
  const [showNewTrip, setShowNewTrip] = useState(false);
  const [newTripName, setNewTripName] = useState('');
  const [newTripDate, setNewTripDate] = useState('');
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [scraps, setScraps] = useState(getScraps);

  const scrappedRegions = regions.filter(region => scraps.includes(region.id));

  const handleUnscrap = regionId => {
    const next = scraps.filter(id => id !== regionId);
    saveScraps(next);
    setScraps(next);
    showToast('스크랩을 취소했어요');
  };

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

  const handleDeleteTrip = id => {
    if (!window.confirm('이 여행을 삭제할까요?')) return;
    onSaveTrips(myTrips.filter(item => item.id !== id));
    if (selectedTrip?.id === id) setSelectedTrip(null);
  };

  const handleRemovePlace = (tripId, placeId) => {
    const updated = myTrips.map(item =>
      item.id === tripId
        ? { ...item, places: item.places.filter(place => place.id !== placeId) }
        : item,
    );
    onSaveTrips(updated);
    if (selectedTrip?.id === tripId) {
      setSelectedTrip(updated.find(item => item.id === tripId));
    }
  };

  return (
    <div className="mypage-root">
      <div className="mypage-profile">
        <div className="mypage-avatar">나</div>
        <div className="mypage-profile-info">
          <p className="mypage-username">여행자</p>
          <p className="mypage-usersub">광주·전남 로컬 탐험가</p>
          <div className="mypage-stats">
            <span>
              <strong>{myTrips.length}</strong> 여행
            </span>
            <span>
              <strong>{myTrips.reduce((sum, trip) => sum + trip.places.length, 0)}</strong>{' '}
              담은 장소
            </span>
            <span>
              <strong>{scrappedRegions.length}</strong> 스크랩
            </span>
          </div>
        </div>
      </div>

      <div className="mypage-tabs">
        <button
          className={`mypage-tab ${tab === 'trips' ? 'active' : ''}`}
          onClick={() => setTab('trips')}
        >
          나의 여행 플랜
        </button>
        <button
          className={`mypage-tab ${tab === 'scraps' ? 'active' : ''}`}
          onClick={() => setTab('scraps')}
        >
          스크랩한 장소
        </button>
      </div>

      {tab === 'trips' && (
        <div className="mypage-content">
          {selectedTrip ? (
            <div className="trip-detail">
              <button className="trip-detail-back" onClick={() => setSelectedTrip(null)}>
                {'<'} 목록으로
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
                  <p>아직 담은 장소가 없어요.</p>
                  <button className="trip-go-gallery" onClick={onGoGallery}>
                    갤러리로 이동
                  </button>
                </div>
              ) : (
                <div className="trip-places">
                  {selectedTrip.places.map((place, index) => (
                    <div key={place.id} className="trip-place-item">
                      <div className="trip-place-num">{index + 1}</div>
                      <img
                        src={place.imageUrl || FALLBACK_IMG}
                        alt={place.name}
                        className="trip-place-img"
                        onError={event => {
                          event.currentTarget.src = FALLBACK_IMG;
                        }}
                      />
                      <div className="trip-place-info">
                        <p className="trip-place-name">{place.name}</p>
                        {!!place.summary && (
                          <p className="trip-place-summary">{place.summary}</p>
                        )}
                      </div>
                      <button
                        className="trip-place-remove"
                        onClick={() => handleRemovePlace(selectedTrip.id, place.id)}
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
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
                    placeholder="여행 이름"
                    value={newTripName}
                    onChange={event => setNewTripName(event.target.value)}
                    onKeyDown={event => event.key === 'Enter' && handleCreateTrip()}
                  />
                  <input
                    className="new-trip-input"
                    placeholder="날짜"
                    value={newTripDate}
                    onChange={event => setNewTripDate(event.target.value)}
                  />
                  <div className="new-trip-actions">
                    <button className="new-trip-confirm" onClick={handleCreateTrip}>
                      만들기
                    </button>
                    <button className="new-trip-cancel" onClick={() => setShowNewTrip(false)}>
                      취소
                    </button>
                  </div>
                </div>
              )}

              {myTrips.length === 0 ? (
                <div className="trip-empty">
                  <p>아직 만든 여행이 없어요.</p>
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
                        {trip.places.slice(0, 4).map(place => (
                          <img
                            key={place.id}
                            src={place.imageUrl || FALLBACK_IMG}
                            alt={place.name}
                            onError={event => {
                              event.currentTarget.src = FALLBACK_IMG;
                            }}
                          />
                        ))}
                        {trip.places.length === 0 && (
                          <div className="trip-card-empty-thumb">📍</div>
                        )}
                      </div>
                      <div className="trip-card-info">
                        <p className="trip-card-name">{trip.name}</p>
                        <p className="trip-card-date">{trip.date}</p>
                        <p className="trip-card-count">{trip.places.length}개 장소</p>
                      </div>
                      <button
                        className="trip-card-delete"
                        onClick={event => {
                          event.stopPropagation();
                          handleDeleteTrip(trip.id);
                        }}
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'scraps' && (
        <div className="mypage-content">
          <h2 className="mypage-section-title">스크랩한 장소</h2>
          {scrappedRegions.length === 0 ? (
            <div className="trip-empty">
              <p>스크랩한 장소가 없어요.</p>
            </div>
          ) : (
            <div className="scrap-grid">
              {scrappedRegions.map(region => (
                <div key={region.id} className="scrap-card">
                  <div className="scrap-img-wrap">
                    <img
                      src={region.imageUrl || FALLBACK_IMG}
                      alt={region.name}
                      className="scrap-img"
                    />
                    <button
                      className="scrap-heart-btn"
                      onClick={() => handleUnscrap(region.id)}
                    >
                      ❤
                    </button>
                  </div>
                  <div className="scrap-info">
                    <p className="scrap-name">{region.name}</p>
                    {!!region.summary && (
                      <p className="scrap-summary">{region.summary}</p>
                    )}
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
