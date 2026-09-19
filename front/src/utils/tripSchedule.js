/** 백엔드 trip_planner_utils와 맞춘 일정 유틸 (표시는 오전/오후만) */

export const TRIP_ITEMS_PER_DAY_DEFAULT = 6;

export const PERIOD_LABELS = ['오전', '오후'];

const MORNING_SLOTS = new Set(['morning', 'lunch', 'cafe_am']);
const AFTERNOON_SLOTS = new Set(['afternoon', 'dinner', 'night']);

// 백엔드 planner.py의 _TRAVEL_SPEED_KMH_BY_MODE / _DEFAULT_TRANSPORT_MODE와 맞춘 값.
// 드래그로 순서를 바꾸면 서버 호출 없이 프론트에서 바로 이동시간을 다시 계산해야 해서 복제해둔다.
const TRAVEL_SPEED_KMH_BY_MODE = { walk: 4.5, public: 22.0, car: 32.0 };
const DEFAULT_TRAVEL_MODE = 'car';

function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** 이 날 기존 카드들이 쓰던 이동수단(가장 많이 쓰인 것) — 없으면 기본값(자동차) */
function dominantTravelMode(items) {
  const counts = {};
  for (const it of items) {
    if (it.tripTravelMode) counts[it.tripTravelMode] = (counts[it.tripTravelMode] || 0) + 1;
  }
  const entries = Object.entries(counts);
  if (!entries.length) return DEFAULT_TRAVEL_MODE;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

/** 드래그로 순서/일차를 바꾼 뒤, 그 날 안에서 이동시간을 좌표 기반으로 다시 계산한다.
 * 안 그러면 옮기기 전 이웃 기준 이동시간이 그대로 남거나(틀린 값) 사라진다. */
function recomputeTravelTimesForDay(items) {
  const mode = dominantTravelMode(items);
  const speedKmh = TRAVEL_SPEED_KMH_BY_MODE[mode] ?? TRAVEL_SPEED_KMH_BY_MODE[DEFAULT_TRAVEL_MODE];
  let prevCoord = null;
  return items.map(loc => {
    // tripLat/tripLng는 채팅 응답 직후에만 붙는 값이라, 새로고침으로 복원됐거나
    // 갤러리에서 직접 추가한 장소는 이게 없고 기본 latitude/longitude만 있다.
    // 좌표가 아예 없는 장소는 tripLat/latitude 둘 다 null인데, Number(null)은 NaN이 아니라
    // 0을 반환해서 "좌표 (0,0)"(대서양 한복판)으로 잘못 취급되어 버렸다 — 그 결과 실제
    // 좌표와의 haversine 거리가 수천 km로 튀면서 "이동 약 5만분" 같은 값이 나왔다.
    // null/undefined는 Number()에 넘기지 않고 먼저 NaN으로 처리해야 한다.
    const rawLat = loc.tripLat ?? loc.latitude;
    const rawLng = loc.tripLng ?? loc.longitude;
    const lat = rawLat == null ? NaN : Number(rawLat);
    const lng = rawLng == null ? NaN : Number(rawLng);
    const hasCoord = Number.isFinite(lat) && Number.isFinite(lng);
    let travelMinutes = null;
    if (prevCoord && hasCoord) {
      const distKm = haversineDistanceKm(prevCoord[0], prevCoord[1], lat, lng);
      travelMinutes = Math.max(1, Math.round((distKm / speedKmh) * 60));
    }
    if (hasCoord) {
      prevCoord = [lat, lng];
    }
    return {
      ...loc,
      tripTravelMinutes: travelMinutes,
      tripTravelMode: travelMinutes !== null ? mode : null,
    };
  });
}

export function periodForSlotIndex(indexInDay) {
  return PERIOD_LABELS[indexInDay % PERIOD_LABELS.length];
}

/** 맛집·카페 등만 느슨한 오전/오후 힌트 (확정 시각 아님). 없으면 순서만 표시 */
export function inferSoftPeriodHint(loc) {
  if (!loc) {
    return '';
  }
  const text = [
    loc.name,
    loc.summary,
    loc.category,
    ...(Array.isArray(loc.recommendedBusinesses) ? loc.recommendedBusinesses : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/맛집|식당|국밥|삼겹|회\b|음식|레스토랑|먹거리/.test(text)) {
    return '오후';
  }
  if (/카페|커피|디저트|베이커|브런치|빵집/.test(text)) {
    return '오전';
  }
  if (/야경|낮술|주점|바\b|펍/.test(text)) {
    return '오후';
  }
  return '';
}

/** 일차 내 오전/오후/순서만 구역으로 묶기 (타임라인 UI) */
export function groupDayItemsByPeriodBand(items, rawLocations) {
  const bands = [
    { key: 'morning', label: '오전', hint: '', items: [] },
    { key: 'afternoon', label: '오후', hint: '', items: [] },
    { key: 'flex', label: '순서', hint: '', items: [] },
  ];
  const bandByKey = Object.fromEntries(bands.map(b => [b.key, b]));

  items.forEach(node => {
    const loc = rawLocations[node.renderIndex];
    const period = displayPeriod(loc || { tripTime: node.period });
    if (period === '오전') {
      bandByKey.morning.items.push(node);
    } else if (period === '오후') {
      bandByKey.afternoon.items.push(node);
    } else {
      bandByKey.flex.items.push(node);
    }
  });

  return bands.filter(b => b.items.length > 0);
}

export function normalizePeriodLabel(time, slot) {
  const t = String(time || '').trim();
  if (t === '오전' || t === '오후') {
    return t;
  }
  if (slot && MORNING_SLOTS.has(slot)) {
    return '오전';
  }
  if (slot && AFTERNOON_SLOTS.has(slot)) {
    return '오후';
  }
  if (/^\d{2}:\d{2}/.test(t)) {
    const hour = parseInt(t.slice(0, 2), 10);
    if (!Number.isNaN(hour) && hour < 14) {
      return '오전';
    }
    return '오후';
  }
  return '오전';
}

export function displayPeriod(loc) {
  if (!loc) {
    return '';
  }
  const t = String(loc.tripTime || '').trim();
  if (t === '오전' || t === '오후') {
    return t;
  }
  return normalizePeriodLabel(t, loc.tripSlot);
}

/** 하루 3곳 이하면 카드 대신 일차 헤더에만 시간대 표시 */
export const TRIP_CARD_PERIOD_MAX = 3;

export function shouldShowCardPeriod(dayCount) {
  return Number(dayCount) > TRIP_CARD_PERIOD_MAX;
}

/** 카드에 표시할 순서 라벨 (하루 3곳 이하) */
export function displayOrderLabel(indexInDay) {
  return `${Number(indexInDay) + 1}번째`;
}

export function formatDayPeriodSummary(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return '';
  }
  if (items.length > TRIP_CARD_PERIOD_MAX) {
    return '';
  }
  return items
    .map((loc, i) => {
      const p = displayPeriod(loc);
      const name = loc?.name || `장소 ${i + 1}`;
      return p ? `${p} ${name}` : name;
    })
    .join(' · ');
}

export const TRIP_DAY_COLORS = [
  '#4f6ef7',
  '#e05b6f',
  '#0d9488',
  '#d97706',
  '#7c3aed',
  '#0891b2',
];

export function dayMarkerColor(dayNumber) {
  const d = Math.max(1, Number(dayNumber) || 1);
  return TRIP_DAY_COLORS[(d - 1) % TRIP_DAY_COLORS.length];
}

function collapsePeriodFlow(periods) {
  const out = [];
  for (const p of periods) {
    if (!p) {
      continue;
    }
    if (out.length === 0 || out[out.length - 1] !== p) {
      out.push(p);
    }
  }
  return out.join(' → ');
}

export function getMaxLocationsByDuration(days, itemsPerDay = TRIP_ITEMS_PER_DAY_DEFAULT) {
  return Math.max(1, Number(days) * itemsPerDay);
}

export function applyScheduleToRegions(regions, schedule) {
  if (!Array.isArray(schedule) || schedule.length === 0) {
    return regions;
  }
  const byId = new Map(schedule.map(entry => [Number(entry.placeId), entry]));
  return regions.map(region => {
    const meta = byId.get(Number(region.id));
    if (!meta) {
      return region;
    }
    return {
      ...region,
      tripDay: meta.day,
      tripTime: normalizePeriodLabel(meta.time, meta.slot),
      tripSlot: meta.slot,
      tripTravelMinutes: meta.travelMinutes ?? null,
      tripTravelMode: meta.travelMode ?? null,
      tripMeal: meta.meal ?? null,
      tripLat: meta.latitude ?? null,
      tripLng: meta.longitude ?? null,
    };
  });
}

export function finalizeItineraryOrder(locations, days) {
  const dayCount = Math.max(1, Number(days) || 1);
  const buckets = new Map();

  for (const loc of locations) {
    const d = Math.min(dayCount, Math.max(1, Number(loc.tripDay) || 1));
    if (!buckets.has(d)) {
      buckets.set(d, []);
    }
    buckets.get(d).push(loc);
  }

  const ordered = [];
  const appendDay = (day, bucket) => {
    const withTravel = recomputeTravelTimesForDay(bucket);
    withTravel.forEach((loc, slotIndex) => {
      const hint = inferSoftPeriodHint(loc);
      ordered.push({
        ...loc,
        tripDay: day,
        tripTime: hint || '',
        tripSlot: hint === '오전' ? 'morning' : hint === '오후' ? 'afternoon' : '',
        tripOrder: slotIndex + 1,
        scheduleAdjusted: true,
      });
    });
  };

  for (let day = 1; day <= dayCount; day += 1) {
    appendDay(day, buckets.get(day) || []);
  }

  for (const [day, bucket] of buckets.entries()) {
    if (day > dayCount) {
      appendDay(day, bucket);
    }
  }

  return ordered.length > 0 ? ordered : locations;
}

/** 순서·일차 반영 후 오전/오후 라벨 재부착 */
export function recomputeScheduleForOrderedLocations(
  locations,
  days = 1,
  itemsPerDay = TRIP_ITEMS_PER_DAY_DEFAULT,
) {
  if (!Array.isArray(locations) || locations.length === 0) {
    return [];
  }
  return finalizeItineraryOrder(locations, days);
}

export function moveLocationToIndex(
  locations,
  fromIndex,
  toIndex,
  days,
  itemsPerDay = TRIP_ITEMS_PER_DAY_DEFAULT,
) {
  if (
    !Array.isArray(locations) ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= locations.length ||
    fromIndex === toIndex
  ) {
    return locations;
  }
  const dayCount = Math.max(
    1,
    Number(days) || Math.ceil(locations.length / itemsPerDay) || 1,
  );
  const next = [...locations];
  const [moved] = next.splice(fromIndex, 1);
  const insertAt = toIndex > fromIndex ? toIndex - 1 : toIndex;
  const targetDay =
    next[insertAt]?.tripDay ?? next[insertAt - 1]?.tripDay ?? moved.tripDay ?? 1;
  next.splice(insertAt, 0, { ...moved, tripDay: targetDay });
  return finalizeItineraryOrder(next, dayCount);
}

/** 특정 N일차 맨 뒤로 이동 */
export function moveLocationToDay(
  locations,
  fromIndex,
  targetDay,
  days,
  itemsPerDay = TRIP_ITEMS_PER_DAY_DEFAULT,
) {
  if (!Array.isArray(locations) || fromIndex < 0 || fromIndex >= locations.length) {
    return locations;
  }
  const dayCount = Math.max(1, Number(days) || 1);
  const target = Math.min(dayCount, Math.max(1, Number(targetDay) || 1));
  const next = [...locations];
  const [moved] = next.splice(fromIndex, 1);

  let insertAt = next.length;
  for (let i = 0; i < next.length; i += 1) {
    const d = Number(next[i].tripDay) || 1;
    if (d > target) {
      insertAt = i;
      break;
    }
    if (d === target) {
      insertAt = i + 1;
    }
  }
  next.splice(insertAt, 0, { ...moved, tripDay: target });
  return finalizeItineraryOrder(next, dayCount);
}

export function buildDaySummaries(locations) {
  const byDay = new Map();
  for (const loc of locations) {
    const day = Number(loc.tripDay) || 1;
    if (!byDay.has(day)) {
      byDay.set(day, []);
    }
    byDay.get(day).push(loc);
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([dayNumber, items]) => {
      const periods = items.map(displayPeriod).filter(Boolean);
      const names = items.map(i => i.name).filter(Boolean);
      return {
        dayNumber,
        count: items.length,
        timeFlow: periods.length > 0 ? collapsePeriodFlow(periods) : null,
        preview: names.slice(0, 3).join(' · '),
      };
    });
}

export const TRIP_ACTION_LABELS = {
  replan: '전체 일정 새로 구성',
  recommend: '장소 추가',
  remove: '장소 삭제',
  replace: '장소 교체',
  add_preference: '조건만 반영',
  unsupported: '지원하지 않는 요청',
};

export function formatScheduleAsText(schedule) {
  if (!Array.isArray(schedule) || schedule.length === 0) {
    return '';
  }
  const byDay = new Map();
  for (const entry of schedule) {
    const day = Number(entry.day) || 1;
    if (!byDay.has(day)) {
      byDay.set(day, []);
    }
    byDay.get(day).push(entry);
  }
  const lines = ['', '📋 일정 요약'];
  [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .forEach(([day, items]) => {
      lines.push(`\n${day}일차 (${items.length}곳)`);
      items.forEach(item => {
        const period = normalizePeriodLabel(item.time, item.slot);
        const name = item.placeName || `장소 #${item.placeId}`;
        lines.push(`  · ${period} ${name}`);
      });
    });
  return lines.join('\n');
}

/** /api/chat/trip currentSchedule 페이로드 */
export function buildCurrentSchedulePayload(locations) {
  return (locations || [])
    .filter(loc => loc?.id != null)
    .map(loc => ({
      day: Number(loc.tripDay) || 1,
      placeId: Number(loc.id),
      placeName: String(loc.name || ''),
      time: String(loc.tripTime || ''),
      slot: String(loc.tripSlot || ''),
      category: String(loc.category || ''),
    }));
}

export const TRIP_LOADING_PHASES = [
  '질문을 이해하고 있어요…',
  '지역·분위기·제외 조건을 분석 중…',
  '추천 후보를 검색하고 있어요…',
  '일정·동선을 맞추는 중…',
];
