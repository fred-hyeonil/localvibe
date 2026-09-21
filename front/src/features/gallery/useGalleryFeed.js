import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeRegionMediaFields } from '../../utils/apiMediaUrl';
import { filterRegionsBySidebarLocation } from '../../utils/sidebarLocationFilter';
import { API_BASE_URL } from '../../shared/api/client';
import { defaultRegions } from '../../data/defaultRegions';

const FEED_SIZE = 30;
const PAGE_SIZE = 30;
const VECTOR_ACTIVE_KEY = 'lv_gallery_vector_active';
const SEARCH_RESULTS_KEY = 'lv_gallery_search_results';

const DEFAULT_REGIONS_NORMALIZED = defaultRegions.map(r =>
  normalizeRegionMediaFields({ ...r }),
);

function normalizeTextKey(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .trim();
}
function normalizeImageKey(u) {
  const v = String(u || '')
    .trim()
    .toLowerCase();
  return v ? v.replace(/^https?:/, '') : '';
}

function dedupeFeedPick(source, picked, usedName, usedImg, size) {
  for (const item of source) {
    const nk = normalizeTextKey(item?.name);
    const ik = normalizeImageKey(item?.imageUrl);
    if (!nk || usedName.has(nk) || (ik && usedImg.has(ik))) continue;
    picked.push(item);
    usedName.add(nk);
    if (ik) usedImg.add(ik);
    if (picked.length >= size) return picked;
  }
  for (const item of source) {
    const nk = normalizeTextKey(item?.name);
    if (!nk || usedName.has(nk)) continue;
    picked.push(item);
    usedName.add(nk);
    if (picked.length >= size) break;
  }
  return picked.slice(0, size);
}

export function pickFeedItems(items, size = FEED_SIZE) {
  if (!Array.isArray(items) || !items.length) return [];
  const withImg = items.filter(r => String(r?.imageUrl || '').trim());
  const pool = withImg.length >= size ? withImg : items;
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return dedupeFeedPick(shuffled, [], new Set(), new Set(), size);
}

export function pickOrderedFeedItems(items, size = 0) {
  if (!Array.isArray(items) || !items.length) return [];
  if (size > 0) return dedupeFeedPick(items, [], new Set(), new Set(), size);
  return dedupeFeedPick(items, [], new Set(), new Set(), items.length);
}

export function feedHasDisplayImages(list) {
  return (
    Array.isArray(list) && list.some(r => String(r?.imageUrl || '').trim())
  );
}

function isVectorLocked() {
  try {
    return sessionStorage.getItem(VECTOR_ACTIVE_KEY) === '1';
  } catch {
    return false;
  }
}

function clearPersistedResultsOnReload() {
  try {
    const navigation = performance.getEntriesByType('navigation')[0];
    if (navigation?.type !== 'reload') return;
    sessionStorage.removeItem(VECTOR_ACTIVE_KEY);
    sessionStorage.removeItem(SEARCH_RESULTS_KEY);
  } catch {}
}

function readPersistedResults() {
  try {
    if (sessionStorage.getItem(VECTOR_ACTIVE_KEY) !== '1') return null;
    const raw = sessionStorage.getItem(SEARCH_RESULTS_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return pickOrderedFeedItems(arr.map(r => normalizeRegionMediaFields({ ...r })));
  } catch {
    return null;
  }
}

function persistVectorResults(feed) {
  try {
    sessionStorage.setItem(VECTOR_ACTIVE_KEY, '1');
    sessionStorage.setItem(SEARCH_RESULTS_KEY, JSON.stringify(feed));
  } catch {}
}

function clearVectorLock(lockRef) {
  try {
    sessionStorage.removeItem(VECTOR_ACTIVE_KEY);
    sessionStorage.removeItem(SEARCH_RESULTS_KEY);
  } catch {}
  if (lockRef) lockRef.current = false;
}

function shuffleArray(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function mapSearchHitToRegion(row, regionMap) {
  const id = Number(row.place_id);
  const base = regionMap.get(id);
  const sim =
    row.pinecone_similarity != null
      ? `유사도 ${Number(row.pinecone_similarity).toFixed(3)}`
      : '';
  return {
    id,
    name: row.name || base?.name || '이름 없음',
    imageUrl: String(row.imageUrl || base?.imageUrl || '').trim(),
    summary:
      base?.summary ||
      [row.category, row.region, sim].filter(Boolean).join(' · ') ||
      '상세 설명이 없습니다.',
    summaryShort: sim || base?.summaryShort,
    address: base?.address,
    latitude: base?.latitude,
    longitude: base?.longitude,
    region: row.region || base?.region,
    province: row.province || base?.province,
    dataSource: base?.dataSource,
    sourceId: base?.sourceId,
    recommendedBusinesses:
      base?.recommendedBusinesses?.length > 0
        ? base.recommendedBusinesses
        : row.category
          ? [row.category]
          : [],
    busyHours: base?.busyHours || [],
    targetCustomers: base?.targetCustomers || [],
  };
}

/**
 * 갤러리 피드 상태 및 검색 로직을 캡슐화하는 훅.
 * regions (전체 목록), regionMap (id→region), 피드 상태, 검색 핸들러를 반환.
 */
export function useGalleryFeed() {
  clearPersistedResultsOnReload();

  const [regions, setRegions] = useState(DEFAULT_REGIONS_NORMALIZED);
  // 초기 피드 또는 검색 결과 (infinite scroll 이전 표시용)
  const [displayedRegions, setDisplayedRegions] = useState(() =>
    isVectorLocked() ? (readPersistedResults() ?? []) : [],
  );
  // 전체 regions를 셔플한 풀 — 무한 스크롤 페이지네이션 소스
  const [shuffledAll, setShuffledAll] = useState([]);
  // 기본 피드에서 현재 몇 개까지 보여줄지
  const [displayedCount, setDisplayedCount] = useState(FEED_SIZE);
  // 검색 결과를 보여주는 모드인지 (반응형 상태)
  const [vectorMode, setVectorMode] = useState(isVectorLocked());

  const [feedLoading, setFeedLoading] = useState(() => !isVectorLocked());
  const [searchBusy, setSearchBusy] = useState(false);

  const vectorActiveRef = useRef(isVectorLocked());
  const searchSeqRef = useRef(0);

  const regionMap = useMemo(() => {
    const map = new Map();
    for (const r of regions) {
      const id = Number(r?.id);
      if (Number.isFinite(id)) map.set(id, r);
    }
    return map;
  }, [regions]);

  // 초기 피드 + 전체 regions 로드
  useEffect(() => {
    let m = true;

    if (isVectorLocked()) {
      try {
        const raw = sessionStorage.getItem(SEARCH_RESULTS_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        if (
          Array.isArray(arr) &&
          arr.length > 0 &&
          !arr.some(r => String(r?.imageUrl || '').trim())
        ) {
          clearVectorLock(vectorActiveRef);
          if (m) setVectorMode(false);
        }
      } catch {
        clearVectorLock(vectorActiveRef);
        if (m) setVectorMode(false);
      }
    }
    const locked = isVectorLocked();
    vectorActiveRef.current = locked;

    const loadFeed = async () => {
      if (locked) {
        if (m) setFeedLoading(false);
        return;
      }
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/regions/feed?limit=${FEED_SIZE}`,
        );
        const data = res.ok ? await res.json() : null;
        if (!m || !Array.isArray(data?.regions) || !data.regions.length) return;
        setDisplayedRegions(
          data.regions
            .map(r => normalizeRegionMediaFields({ ...r }))
            .slice(0, FEED_SIZE),
        );
      } catch {
      } finally {
        if (m) setFeedLoading(false);
      }
    };

    const loadAll = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/regions`);
        const data = res.ok ? await res.json() : null;
        if (!m || !Array.isArray(data?.regions) || !data.regions.length) return;
        const normalized = data.regions.map(r =>
          normalizeRegionMediaFields({ ...r }),
        );
        setRegions(normalized);

        // 무한 스크롤을 위한 안정적인 셔플 풀 생성
        const shuffled = shuffleArray(normalized);
        if (m) setShuffledAll(shuffled);

        if (!vectorActiveRef.current && !isVectorLocked()) {
          setDisplayedRegions(prev =>
            feedHasDisplayImages(prev)
              ? prev
              : shuffled.slice(0, FEED_SIZE),
          );
        }
      } catch {
        if (!m || vectorActiveRef.current || isVectorLocked()) return;
        setDisplayedRegions(prev =>
          feedHasDisplayImages(prev)
            ? prev
            : pickFeedItems(DEFAULT_REGIONS_NORMALIZED, FEED_SIZE),
        );
      }
    };

    loadFeed();
    loadAll();
    return () => {
      m = false;
    };
  }, []);

  // regionMap 로드 후 displayedRegions의 imageUrl 보강
  useEffect(() => {
    if (!regions.length || !displayedRegions.length) return;
    setDisplayedRegions(prev => {
      let changed = false;
      const next = prev.map(r => {
        const id = Number(r?.id);
        if (!Number.isFinite(id)) return r;
        const base = regionMap.get(id);
        const imageUrl = String(r.imageUrl || base?.imageUrl || '').trim();
        if (imageUrl === String(r.imageUrl || '').trim()) return r;
        changed = true;
        return { ...r, imageUrl };
      });
      return changed ? next : prev;
    });
  }, [regions, regionMap, displayedRegions.length]);

  const applySidebarFeed = useCallback(list => {
    const normalized = (Array.isArray(list) ? list : [])
      .map(r => normalizeRegionMediaFields(r))
      .filter(Boolean);
    if (!normalized.length) return false;
    clearVectorLock(vectorActiveRef);
    setVectorMode(false);
    setDisplayedCount(FEED_SIZE);
    setDisplayedRegions(normalized);
    return true;
  }, []);

  const handleVectorSearch = useCallback(
    async q => {
      const trimmed = String(q || '').trim();
      if (!trimmed) return false;
      const seq = ++searchSeqRef.current;
      setSearchBusy(true);
      try {
        const url = new URL(`${API_BASE_URL}/api/search`);
        url.searchParams.set('q', trimmed);
        const res = await fetch(url.toString());
        if (seq !== searchSeqRef.current) return false;
        if (!res.ok) {
          window.alert('검색 요청에 실패했습니다.');
          return false;
        }
        const data = await res.json();
        const mapped = (Array.isArray(data?.results) ? data.results : []).map(
          row =>
            normalizeRegionMediaFields(mapSearchHitToRegion(row, regionMap)),
        );
        if (seq !== searchSeqRef.current) return false;
        if (mapped.length > 0) {
          // 검색 결과는 전체 표시 (size 제한 없음)
          const feed = pickOrderedFeedItems(mapped);
          vectorActiveRef.current = true;
          persistVectorResults(feed);
          setVectorMode(true);
          setDisplayedRegions(feed);
          return true;
        }
        window.alert('검색 결과가 없습니다.');
        return false;
      } catch {
        if (seq === searchSeqRef.current) window.alert('네트워크 오류입니다.');
        return false;
      } finally {
        if (seq === searchSeqRef.current) setSearchBusy(false);
      }
    },
    [regionMap],
  );

  const handleSidebarRegionClick = useCallback(
    async label => {
      const key = String(label || '').trim();
      if (!key) return;
      clearVectorLock(vectorActiveRef);
      setVectorMode(false);
      setDisplayedCount(FEED_SIZE);
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/regions?place_in=${encodeURIComponent(key)}`,
        );
        if (res.ok) {
          const data = await res.json();
          if (applySidebarFeed(data?.regions)) return;
        }
      } catch {}
      const local = filterRegionsBySidebarLocation(regions, key);
      if (applySidebarFeed(local)) return;
      window.alert(`"${key}" 지역(주소 기준)에 맞는 장소를 찾지 못했습니다.`);
    },
    [regions, applySidebarFeed],
  );

  // 무한 스크롤: 다음 PAGE_SIZE개 로드
  const loadMore = useCallback(() => {
    if (vectorMode || shuffledAll.length === 0) return;
    setDisplayedCount(c => Math.min(c + PAGE_SIZE, shuffledAll.length));
  }, [vectorMode, shuffledAll.length]);

  const hasMore = !vectorMode && shuffledAll.length > displayedCount;

  // 표시용 regions (regionMap으로 필드 보강)
  const galleryDisplayRegions = useMemo(() => {
    // 검색 모드: 검색 결과 전체 표시
    // 기본 모드: 먼저 도착한 피드를 앞에 두고, 전체 목록(shuffledAll)을 뒤에 이어 붙인다.
    //
    // 예전에는 shuffledAll이 채워지는 순간 그쪽으로 통째로 갈아탔다. 두 요청(/regions/feed와
    // /regions)의 도착 시간이 다르면 먼저 뜬 카드 30장이 전혀 다른 카드로 바뀌어 보였다.
    // 로컬에서는 둘이 거의 동시에 와서 티가 안 났고, 배포 환경에서만 드러났다.
    let source;
    if (vectorMode) {
      source = displayedRegions;
    } else if (shuffledAll.length > 0) {
      const seen = new Set(
        displayedRegions.map(r => Number(r?.id)).filter(Number.isFinite),
      );
      source = [...displayedRegions];
      for (const item of shuffledAll) {
        if (source.length >= displayedCount) break;
        const id = Number(item?.id);
        if (Number.isFinite(id) && seen.has(id)) continue;
        if (Number.isFinite(id)) seen.add(id);
        source.push(item);
      }
      source = source.slice(0, displayedCount);
    } else {
      source = displayedRegions;
    }

    return source.map(r => {
      const id = Number(r?.id);
      if (!Number.isFinite(id)) return r;
      const base = regionMap.get(id);
      if (!base) return r;
      const s =
        r.summary &&
        String(r.summary).trim() &&
        r.summary !== '상세 설명이 없습니다.'
          ? r.summary
          : base.summary || r.summary;
      return {
        ...r,
        imageUrl: base.imageUrl || r.imageUrl || '',
        summary: s,
        address: r.address || base.address,
        latitude: r.latitude ?? base.latitude,
        longitude: r.longitude ?? base.longitude,
        province: r.province || base.province,
      };
    });
  }, [vectorMode, displayedRegions, shuffledAll, displayedCount, regionMap]);

  return {
    regions,
    regionMap,
    galleryDisplayRegions,
    feedLoading,
    searchBusy,
    isDefaultFeed: !vectorMode,
    hasMore,
    loadMore,
    handleVectorSearch,
    handleSidebarRegionClick,
  };
}
