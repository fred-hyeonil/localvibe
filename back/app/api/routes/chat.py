import logging

from fastapi import APIRouter

from app.schemas import ChatRequest, ChatResponse, TripChatRequest, TripChatResponse
from app.modules.chat.service import get_chat_result, get_trip_chat_result

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
def chat(payload: ChatRequest):
    return get_chat_result(
        payload.message,
        relation=payload.relation,
        mood=payload.mood,
        transport=payload.transport,
        duration=payload.duration,
    )


@router.post("/trip", response_model=TripChatResponse)
def trip_chat(payload: TripChatRequest):
    duration = {"nights": payload.tripDuration.nights, "days": payload.tripDuration.days} if payload.tripDuration else {"nights": 0, "days": 1}
    recent = None
    if payload.recentMessages:
        recent = [
            {"role": t.role, "text": t.text}
            for t in payload.recentMessages[-10:]
            if t.role in ("user", "assistant") and (t.text or "").strip()
        ]
    try:
        return get_trip_chat_result(
            payload.message,
            duration,
            payload.currentLocationIds or [],
            payload.excludeLocationId,
            replan=bool(payload.replan),
            recent_messages=recent,
            current_schedule=(
                [e.model_dump() for e in payload.currentSchedule]
                if payload.currentSchedule
                else None
            ),
        )
    except Exception:
        # get_trip_chat_result 내부의 자체 예외처리(각 GPT/Pinecone/DSPy 호출)를 다 빠져나온
        # 예상 밖 오류까지 여기서 한 번 더 잡아서, 로드맵을 통째로 비우는 500 대신
        # 기존 로드맵을 그대로 유지한 채 안내 메시지만 보여준다.
        logger.exception("[CHAT] /api/chat/trip 처리 중 처리되지 않은 예외 발생")
        return TripChatResponse(
            answer="추천을 처리하는 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.",
            recommendedRegionIds=payload.currentLocationIds or [],
            schedule=payload.currentSchedule,
            detectedAction=None,
            excludedLocationId=None,
            detectedDuration=None,
        )
