import { useEffect, useMemo, useState } from 'react';
import TopHeader from './components/TopHeader';
import ChatbotPanel from './components/ChatbotPanel';
import RegionGallery from './components/RegionGallery';
import RegionModal from './components/RegionModal';
import { defaultRegions } from './data/defaultRegions';
import TripPlannerPage from './pages/TripPlannerPage';
import MyPage from './pages/MyPage';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
const FEED_SIZE = 9;
const NAV_ITEMS = [
  {
    section: '메인',
    items: [
      { id: 'home', label: '🏠 홈으로', tab: 'home' },
      { id: 'gallery', label: '🗺️ 지역 갤러리', tab: 'gallery' },
      { id: 'planner', label: '✈️ 여행 플래너', tab: 'planner' },
      { id: 'mypage', label: '👤 마이페이지', tab: 'mypage' },
    ],
  },
  {
    section: '지역',
    items: [
      { id: 'gwangju', label: '📍 광주', tab: 'gallery' },
      { id: 'jeonnam', label: '📍 전남', tab: 'gallery' },
    ],
  },
];

function normalizeTextKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .trim();
}

function normalizeImageKey(imageUrl) {
  const value = String(imageUrl || '')
    .trim()
    .toLowerCase();
  if (!value) {
    return '';
  }
  return value.replace(/^https?:/, '');
}

function pickFeedItems(items, size = FEED_SIZE) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const shuffled = [...items].sort(() => Math.random() - 0.5);
  const picked = [];
  const usedImageKeys = new Set();
  const usedNameKeys = new Set();

  for (const item of shuffled) {
    const nameKey = normalizeTextKey(item?.name);
    const imageKey = normalizeImageKey(item?.imageUrl);
    if (!nameKey || usedNameKeys.has(nameKey)) {
      continue;
    }
    if (imageKey && usedImageKeys.has(imageKey)) {
      continue;
    }
    picked.push(item);
    usedNameKeys.add(nameKey);
    if (imageKey) {
      usedImageKeys.add(imageKey);
    }
    if (picked.length >= size) {
      return picked;
    }
  }

  // 후보가 부족할 때는 이름 중복만 막고 채웁니다.
  for (const item of shuffled) {
    const nameKey = normalizeTextKey(item?.name);
    if (!nameKey || usedNameKeys.has(nameKey)) {
      continue;
    }
    picked.push(item);
    usedNameKeys.add(nameKey);
    if (picked.length >= size) {
      break;
    }
  }

  return picked.slice(0, size);
}

export default function App() {
  const [regions, setRegions] = useState(defaultRegions);
  const [displayedRegions, setDisplayedRegions] = useState(defaultRegions);
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [insightRegion, setInsightRegion] = useState(null);
  const [isInsightLoading, setIsInsightLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('gallery'); // "gallery" or "planner"
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [myTrips, setMyTrips] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('lv_mytrips') || '[]');
    } catch {
      return [];
    }
  });

  const saveTrips = trips => {
    setMyTrips(trips);
    localStorage.setItem('lv_mytrips', JSON.stringify(trips));
  };

  useEffect(() => {
    let isMounted = true;

    async function fetchRegions() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/regions`);
        if (!response.ok) {
          return;
        }

        const data = await response.json();
        if (
          isMounted &&
          Array.isArray(data?.regions) &&
          data.regions.length > 0
        ) {
          setRegions(data.regions);
          setDisplayedRegions(pickFeedItems(data.regions));
        }
      } catch {
        // 백엔드 미실행 상태에서도 UI 초안이 보이도록 기본 데이터를 유지합니다.
        setDisplayedRegions(pickFeedItems(defaultRegions));
      }
    }

    fetchRegions();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function fetchRegionInsight() {
      if (!selectedRegion?.id) {
        setInsightRegion(null);
        return;
      }

      setIsInsightLoading(true);
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/regions/${selectedRegion.id}/insight`,
        );
        if (!response.ok) {
          return;
        }

        const data = await response.json();
        if (isMounted && data?.region) {
          setInsightRegion(data.region);
        }
      } catch {
        // 상세 API 실패 시에도 선택한 기본 카드 정보는 유지합니다.
      } finally {
        if (isMounted) {
          setIsInsightLoading(false);
        }
      }
    }

    fetchRegionInsight();

    return () => {
      isMounted = false;
    };
  }, [selectedRegion]);

  const regionMap = useMemo(() => {
    return new Map(regions.map(region => [region.id, region]));
  }, [regions]);

  const handleRecommendFeed = recommendedIds => {
    if (!Array.isArray(recommendedIds) || recommendedIds.length === 0) {
      return;
    }

    const selected = recommendedIds
      .map(id => regionMap.get(Number(id)))
      .filter(Boolean);
    if (selected.length === 0) {
      return;
    }
    const uniqueSelected = [];
    const selectedIdSet = new Set();
    for (const item of selected) {
      if (selectedIdSet.has(item.id)) {
        continue;
      }
      uniqueSelected.push(item);
      selectedIdSet.add(item.id);
      if (uniqueSelected.length >= FEED_SIZE) {
        break;
      }
    }

    if (uniqueSelected.length >= FEED_SIZE) {
      setDisplayedRegions(uniqueSelected.slice(0, FEED_SIZE));
      return;
    }

    const remaining = regions.filter(item => !selectedIdSet.has(item.id));
    const fillCount = FEED_SIZE - uniqueSelected.length;
    const filler = pickFeedItems(remaining, fillCount);
    setDisplayedRegions([...uniqueSelected, ...filler].slice(0, FEED_SIZE));
  };

  const handleNavClick = item => {
    if (item.tab === 'home') {
      window.location.href = '/';
      return;
    }
    setActiveTab(item.tab);
  };

  return (
    <div className="app-root">
      <TopHeader
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(prev => !prev)}
      />
      <div className="app-body">
        <aside className={`app-sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
          <div className="sidebar-inner">
            {NAV_ITEMS.map(group => (
              <div key={group.section} className="sidebar-group">
                <p className="sidebar-section-label">{group.section}</p>
                <ul className="sidebar-list">
                  {group.items.map(item => (
                    <li key={item.id}>
                      <button
                        className={`sidebar-item ${activeTab === item.tab ? 'active' : ''}`}
                        onClick={() => handleNavClick(item)}
                      >
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </aside>

        <main className="app-main app-shell">
          {activeTab === 'gallery' ? (
            <>
              <ChatbotPanel onRecommendFeed={handleRecommendFeed} />
              <RegionGallery
                regions={displayedRegions}
                totalRegions={regions}
                onSelect={region => {
                  setSelectedRegion(region);
                  setInsightRegion(null);
                }}
                myTrips={myTrips}
                onSaveTrips={saveTrips}
              />
            </>
          ) : activeTab === 'planner' ? (
            <TripPlannerPage regions={regions} />
          ) : (
            <MyPage
              myTrips={myTrips}
              onSaveTrips={saveTrips}
              regions={regions}
              onGoGallery={() => setActiveTab('gallery')}
            />
          )}

          <footer className="main-footer">
            <div className="main-footer-top">
              <div>
                <div className="main-footer-brand">LocalVibe</div>
                <div className="main-footer-desc">
                  Discover real local stories with AI and data-driven insights.
                </div>
              </div>
              <div className="main-footer-links">
                <span>Core Features</span>
                <span>Pro Experience</span>
                <span>Contact</span>
                <span>Join</span>
              </div>
            </div>
            <div className="main-footer-bottom">
              © 2026 LocalVibe. All rights reserved.
            </div>
          </footer>
        </main>
      </div>
      <RegionModal
        region={insightRegion || selectedRegion}
        isLoading={isInsightLoading}
        onClose={() => {
          setSelectedRegion(null);
          setInsightRegion(null);
        }}
      />
    </div>
  );
}
