import { useMemo, useRef, useState } from 'react';
import { Reorder, motion, useDragControls } from 'framer-motion';
import { resolveBackendMediaUrl } from '../utils/apiMediaUrl';
import {
  displayPeriod,
  finalizeItineraryOrder,
  formatDayPeriodSummary,
  moveLocationToDay,
  shouldShowCardPeriod,
} from '../utils/tripSchedule';

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: index => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: index * 0.05,
      duration: 0.35,
      ease: 'easeOut',
    },
  }),
};

const wrapV = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const FALLBACK_ITEMS_PER_DAY = 6;

const TRAVEL_MODE_LABEL = {
  walk: '도보',
  public: '대중교통',
  car: '차량',
};

const DAY_DUO_PALETTE = [
  ['#c96a4a', '#7a3a26'],
  ['#3f7a72', '#1f423d'],
  ['#5a6b8c', '#2e3a52'],
  ['#8a7a4f', '#4a4020'],
];

// 실제 카드를 실시간으로 밀어내는(Trello류) 느낌을 내려고, 카드가 자리를 옮길 때는
// 스프링 대신 짧고 딱 멈추는 easeOut을 쓴다.
const LAYOUT_TRANSITION = { layout: { duration: 0.22, ease: [0.4, 0, 0.2, 1] } };

function daySummaryLabel(rawLocs) {
  const names = rawLocs.filter(Boolean).map(l => String(l?.name || '').trim()).filter(Boolean);
  if (names.length === 0) return '';
  if (names.length <= 2) return names.join(' · ');
  return `${names.slice(0, 2).join(' · ')} 외 ${names.length - 2}곳`;
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 6l12 12M18 6L6 18" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function DragHandleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="9" cy="7" r="1.5" fill="currentColor" />
      <circle cx="15" cy="7" r="1.5" fill="currentColor" />
      <circle cx="9" cy="12" r="1.5" fill="currentColor" />
      <circle cx="15" cy="12" r="1.5" fill="currentColor" />
      <circle cx="9" cy="17" r="1.5" fill="currentColor" />
      <circle cx="15" cy="17" r="1.5" fill="currentColor" />
    </svg>
  );
}

function kakaoMapLink(node) {
  const name = encodeURIComponent(node.name || '장소');
  if (Number.isFinite(node.lat) && Number.isFinite(node.lng)) {
    return `https://map.kakao.com/link/map/${name},${node.lat},${node.lng}`;
  }
  const query = encodeURIComponent(node.address || node.name || '');
  return query ? `https://map.kakao.com/link/search/${query}` : null;
}

function pickAddress(loc) {
  const address = String(loc?.address ?? '').trim();
  if (address) return address;
  const raw = String(loc?.summary ?? loc?.description ?? '');
  const matched = raw.match(/\(주소:\s*([^)]+)\)/);
  return matched ? matched[1].trim() : String(loc?.region ?? '').trim();
}

/** 카드 한 장. 드래그는 핸들(⠿)을 눌렀을 때만 시작되도록 dragControls를 직접 다룬다 —
 * 카드 전체가 드래그 대상이면 상세보기 클릭·삭제 버튼과 자꾸 부딪힌다. */
function PlaceCard({
  node,
  isFirstInDay,
  isSelected,
  isDraggingThis,
  dragEnabled,
  onNodeClick,
  onRemoveNode,
  onCardDrag,
  onCardDragStart,
  onCardDragEnd,
}) {
  const dragControls = useDragControls();
  const mapLink = kakaoMapLink(node);

  return (
    <Reorder.Item
      value={node.id}
      as="article"
      id={`roadmap-place-${node.clickId}`}
      layout="position"
      layoutRoot
      drag={dragEnabled ? 'y' : false}
      dragListener={false}
      dragControls={dragControls}
      dragElastic={0.06}
      dragMomentum={false}
      whileDrag={{
        boxShadow: '0 14px 30px rgba(0,0,0,0.18)',
        scale: 1.015,
      }}
      onDragStart={() => onCardDragStart(node)}
      onDrag={(event, info) => onCardDrag(info)}
      onDragEnd={(event, info) => onCardDragEnd(node, info)}
      transition={LAYOUT_TRANSITION}
      className={`sroadmap-item ${isSelected ? 'selected' : ''} ${
        isDraggingThis ? 'sroadmap-item--dragging' : ''
      }`}
      custom={node.renderIndex}
      variants={itemVariants}
    >
      {!isFirstInDay && Number.isFinite(node.travelMinutes) ? (
        <div className="sroadmap-travel-hint sroadmap-travel-hint--inline" aria-hidden="true">
          <span className="sroadmap-travel-label">
            {TRAVEL_MODE_LABEL[node.travelMode] || '이동'} {node.travelMinutes}분
          </span>
        </div>
      ) : null}

      <div className="sroadmap-marker">
        {dragEnabled ? (
          <span
            className="sroadmap-drag-handle"
            aria-hidden="true"
            title="드래그하여 이동"
            style={{ touchAction: 'none' }}
            onPointerDown={event => dragControls.start(event)}
          >
            <DragHandleIcon />
          </span>
        ) : (
          <span className="sroadmap-dot" />
        )}
        <div className="sroadmap-marker-actions" aria-label={`${node.name} 관리`}>
          {onRemoveNode ? (
            <button
              className="sroadmap-remove-btn"
              type="button"
              aria-label={`${node.name} 제거`}
              onClick={event => {
                event.stopPropagation();
                event.currentTarget.blur();
                onRemoveNode(node.clickId);
              }}
            >
              <DeleteIcon />
            </button>
          ) : null}
        </div>
      </div>

      {node.imageUrl ? (
        <button
          className="sroadmap-image-trigger"
          type="button"
          aria-label={`${node.name} 상세 보기`}
          onClick={() => onNodeClick?.(node.clickId)}
        >
          <div className="sroadmap-thumb-wrap">
            <img
              className="sroadmap-thumb"
              src={node.imageUrl}
              alt={node.name}
              loading="lazy"
              draggable={false}
              referrerPolicy="no-referrer"
              onError={event => {
                event.currentTarget.closest('.sroadmap-image-trigger').style.display = 'none';
              }}
            />
          </div>
        </button>
      ) : null}

      <div
        className="sroadmap-body"
        onClick={() => onNodeClick?.(node.clickId)}
        style={{ cursor: 'pointer' }}
      >
        <h4 className="sroadmap-title">
          {node.meal ? <span className="sroadmap-meal-chip">{node.meal}</span> : null}
          {node.name}
        </h4>
        {node.address && <p className="sroadmap-address">{node.address}</p>}
        {mapLink && (
          <a
            className="sroadmap-map-link"
            href={mapLink}
            target="_blank"
            rel="noreferrer"
            onClick={event => event.stopPropagation()}
          >
            지도에서 보기
          </a>
        )}
      </div>
    </Reorder.Item>
  );
}

export default function RoadMap({
  locations = [],
  tripDayCount = 1,
  itemsPerDay = 6,
  onItineraryChange,
  onNodeClick,
  onRemoveNode,
  selectedId = null,
  isModalOpen = false,
}) {
  const [draggingId, setDraggingId] = useState(null);
  const [crossDayHoverDay, setCrossDayHoverDay] = useState(null);
  const dayRefs = useRef({});
  const originDayRef = useRef(null);

  const nodes = useMemo(() => {
    return locations.map((loc, index) => ({
      index,
      id: loc?.id != null ? String(loc.id) : String(index),
      clickId: loc?.id != null ? loc.id : index,
      name: loc?.name ?? `장소 ${index + 1}`,
      address: pickAddress(loc),
      imageUrl: resolveBackendMediaUrl(loc?.imageUrl),
      tripDay: loc?.tripDay ?? null,
      period: displayPeriod(loc),
      travelMinutes: loc?.tripTravelMinutes ?? null,
      travelMode: loc?.tripTravelMode ?? null,
      meal: loc?.tripMeal ?? null,
      lat: loc?.tripLat ?? null,
      lng: loc?.tripLng ?? null,
    }));
  }, [locations]);

  const daySections = useMemo(() => {
    const hasScheduleDays = nodes.some(node => node.tripDay != null);
    const byDay = new Map();

    nodes.forEach((node, index) => {
      const dayNumber = hasScheduleDays
        ? Number(node.tripDay) || 1
        : Math.floor(index / FALLBACK_ITEMS_PER_DAY) + 1;
      if (!byDay.has(dayNumber)) {
        byDay.set(dayNumber, []);
      }
      byDay.get(dayNumber).push({
        ...node,
        renderIndex: index,
        orderInDay: byDay.get(dayNumber).length,
      });
    });

    const maxFromNodes = byDay.size ? Math.max(...byDay.keys()) : 0;
    const totalDays = Math.max(1, Number(tripDayCount) || maxFromNodes || 1, maxFromNodes);

    return Array.from({ length: totalDays }, (_, i) => {
      const dayNumber = i + 1;
      const items = byDay.get(dayNumber) || [];
      const rawLocs = items.map(it => locations.find((l, idx) => idx === it.renderIndex));
      const heroSourceRaw = rawLocs.find(l => l?.imageUrl);
      const totalTravelMinutes = items.reduce(
        (sum, it) => sum + (Number.isFinite(it.travelMinutes) ? it.travelMinutes : 0),
        0,
      );
      return {
        dayNumber,
        items,
        isEmpty: items.length === 0,
        periodSummary: formatDayPeriodSummary(rawLocs.filter(Boolean)),
        showCardPeriod: shouldShowCardPeriod(items.length),
        concept: daySummaryLabel(rawLocs),
        heroImage: heroSourceRaw ? resolveBackendMediaUrl(heroSourceRaw.imageUrl) : null,
        totalTravelMinutes,
      };
    });
  }, [nodes, locations, tripDayCount]);

  const effectiveDays = Math.max(
    1,
    Number(tripDayCount) || (daySections.length ? daySections[daySections.length - 1].dayNumber : 1),
  );

  const dayByNodeId = useMemo(() => {
    const map = new Map();
    daySections.forEach(section => {
      section.items.forEach(it => map.set(it.id, section.dayNumber));
    });
    return map;
  }, [daySections]);

  const dragEnabled = Boolean(onItineraryChange);

  // 포인터의 페이지 좌표가 어느 날짜 섹션 위에 있는지 찾는다. 다른 날로 드래그했을 때
  // 그 날로 옮기기 위한 판정에 쓴다.
  function findDayAtPoint(point) {
    for (const [dayKey, el] of Object.entries(dayRefs.current)) {
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const pageLeft = rect.left + window.scrollX;
      const pageRight = rect.right + window.scrollX;
      const pageTop = rect.top + window.scrollY;
      const pageBottom = rect.bottom + window.scrollY;
      if (point.x >= pageLeft && point.x <= pageRight && point.y >= pageTop && point.y <= pageBottom) {
        return Number(dayKey);
      }
    }
    return null;
  }

  function handleCardDragStart(node) {
    setDraggingId(node.id);
    originDayRef.current = dayByNodeId.get(node.id) ?? null;
  }

  function handleCardDrag(info) {
    const hoveredDay = findDayAtPoint(info.point);
    setCrossDayHoverDay(hoveredDay != null && hoveredDay !== originDayRef.current ? hoveredDay : null);
  }

  function handleCardDragEnd(node, info) {
    const originDay = originDayRef.current;
    setDraggingId(null);
    setCrossDayHoverDay(null);
    originDayRef.current = null;
    if (!dragEnabled) return;

    const targetDay = findDayAtPoint(info.point);
    if (targetDay == null || targetDay === originDay) {
      // 같은 날 안에서의 순서 변경은 Reorder.Group의 onReorder가 이미 실시간으로 반영했다.
      return;
    }
    const fromIndex = locations.findIndex(loc => String(loc?.id) === String(node.id));
    if (fromIndex === -1) return;
    onItineraryChange?.(moveLocationToDay(locations, fromIndex, targetDay, effectiveDays, itemsPerDay));
  }

  // 하루 안에서의 실시간 재정렬: Reorder.Group이 넘겨주는 "이 날의 새 id 순서"를
  // 전체 로드맵 배열에 그대로 반영한다. 다른 날짜 항목은 원래 순서를 그대로 둔다.
  function handleReorderWithinDay(dayNumber, newDayIdOrder) {
    if (!dragEnabled) return;
    const idToLocation = new Map(locations.map(loc => [String(loc?.id), loc]));
    let cursor = 0;
    const next = locations.map(loc => {
      if (dayByNodeId.get(String(loc?.id)) === dayNumber) {
        const id = newDayIdOrder[cursor];
        cursor += 1;
        return idToLocation.get(String(id)) ?? loc;
      }
      return loc;
    });
    onItineraryChange?.(finalizeItineraryOrder(next, effectiveDays));
  }

  return (
    <div className={`sroadmap-container sroadmap-timeline ${isModalOpen ? 'modal-open' : ''}`}>
      <motion.div className="sroadmap-timeline-list" initial="hidden" animate="visible" variants={wrapV}>
        {daySections.map(section => {
          const isCrossDayTarget = crossDayHoverDay === section.dayNumber;

          return (
            <section
              key={`day-${section.dayNumber}`}
              ref={el => {
                dayRefs.current[section.dayNumber] = el;
              }}
              className={`sroadmap-day-section ${section.isEmpty ? 'sroadmap-day-section--empty' : ''} ${
                isCrossDayTarget ? 'sroadmap-day-section--drop-target' : ''
              }`}
            >
              {!section.isEmpty ? (
                <div
                  className="sroadmap-day-hero"
                  style={
                    section.heroImage
                      ? {
                          backgroundImage: `linear-gradient(0deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.05) 60%), url(${section.heroImage})`,
                        }
                      : {
                          backgroundImage: `linear-gradient(155deg, ${
                            DAY_DUO_PALETTE[(section.dayNumber - 1) % DAY_DUO_PALETTE.length][0]
                          }, ${DAY_DUO_PALETTE[(section.dayNumber - 1) % DAY_DUO_PALETTE.length][1]})`,
                        }
                  }
                >
                  <span className="sroadmap-day-hero-day">
                    {section.dayNumber}일차 · {section.items.length}곳
                    {section.totalTravelMinutes > 0 ? ` · 이동 약 ${section.totalTravelMinutes}분` : ''}
                  </span>
                  <span className="sroadmap-day-hero-concept">{section.concept}</span>
                </div>
              ) : null}

              <div className="sroadmap-day-header-wrap">
                {section.isEmpty ? (
                  <h3 className="sroadmap-day-header">
                    {section.dayNumber}일차
                    <span className="sroadmap-day-count">비어 있음</span>
                  </h3>
                ) : null}
                {section.periodSummary ? (
                  <p className="sroadmap-day-period-summary">{section.periodSummary}</p>
                ) : null}
                {dragEnabled && isCrossDayTarget ? (
                  <span className="sroadmap-day-drop-label">놓으면 이 날로 이동</span>
                ) : null}
                {section.isEmpty && dragEnabled ? (
                  <p className="sroadmap-day-empty-hint">카드를 여기로 끌어오세요</p>
                ) : null}
              </div>

              {section.isEmpty ? (
                <div className="sroadmap-day-path" />
              ) : (
                <Reorder.Group
                  as="div"
                  axis="y"
                  layoutScroll={false}
                  className="sroadmap-day-path"
                  values={section.items.map(it => it.id)}
                  onReorder={newIds => handleReorderWithinDay(section.dayNumber, newIds)}
                >
                  {section.items.map((node, i) => (
                    <PlaceCard
                      key={node.id}
                      node={node}
                      isFirstInDay={i === 0}
                      isSelected={
                        selectedId != null &&
                        (selectedId === node.clickId || String(selectedId) === String(node.clickId))
                      }
                      isDraggingThis={draggingId === node.id}
                      dragEnabled={dragEnabled}
                      onNodeClick={onNodeClick}
                      onRemoveNode={onRemoveNode}
                      onCardDrag={handleCardDrag}
                      onCardDragStart={handleCardDragStart}
                      onCardDragEnd={handleCardDragEnd}
                    />
                  ))}
                </Reorder.Group>
              )}
            </section>
          );
        })}
      </motion.div>
    </div>
  );
}
