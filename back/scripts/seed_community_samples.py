"""커뮤니티 게시판에 샘플(더미) 글 10개를 채워 넣는 1회성 스크립트.

전부 별도의 'LocalVibe 샘플' 계정으로 익명(anonymous) 작성되며, 실제 방문 후기를
가장한 1인칭 경험담이 아니라 장소 정보/팁 위주로 작성했다. 이미 이 계정으로
만든 글이 있으면 중복 실행하지 않는다(총 개수로 판단).

실행: back/ 디렉터리에서
    ./.venv/bin/python -m scripts.seed_community_samples
"""

from __future__ import annotations

from dotenv import load_dotenv

load_dotenv()

from app.repositories.community_store import CommunityPost, create_post
from app.repositories.db import session_scope
from app.repositories.users_store import upsert_user_from_google

SEED_GOOGLE_ID = "localvibe-sample-seed"
SEED_EMAIL = "sample-seed@localvibe.internal"
SEED_NAME = "LocalVibe 샘플"

# (board_id, place_name, place_id, title, body)
SAMPLE_POSTS: list[tuple[str, str, int, str, str]] = [
    (
        "gwangju-nam",
        "양림동 펭귄마을공예거리",
        134,
        "양림동 펭귄마을, 사진 찍기 좋은 골목 포인트 정리",
        "골목 전체가 재활용품으로 만든 소품이랑 벽화로 꾸며져 있어서 구경하는 재미가 있는 곳이에요. "
        "이름 그대로 펭귄 모양 장식이 곳곳에 숨어 있어서 찾아다니는 재미도 있습니다. "
        "규모가 크지 않아서 근처 양림동 역사문화마을이랑 같이 묶어서 도는 코스로 많이들 잡더라고요. "
        "계단이랑 좁은 골목이 많으니 편한 신발 신고 가시는 걸 추천합니다.",
    ),
    (
        "other",
        "섬진강 기차마을",
        2229029883,
        "섬진강 기차마을 증기기관차, 예매 미리 하는 게 좋아요",
        "실제 예전에 다니던 증기기관차 모습 그대로 복원해서 운행하는 곳인데, "
        "편도로 도는데 대략 1시간 정도(약 10km 구간) 걸린다고 해요. "
        "승차권은 인터넷 예매 아니면 현장 매표소에서 살 수 있는데, 주말이나 성수기엔 현장에서 매진되는 "
        "경우가 많다고 하니 미리 예매하고 가시는 걸 추천드려요. "
        "기차 타는 것 말고도 주변에 장미공원이랑 레일바이크도 같이 있어서 반나절 코스로 잡기 좋습니다.",
    ),
    (
        "wando",
        "완도 정도리 구계등",
        2015,
        "완도 구계등, 몽돌 밟는 소리 들으러 가기 좋은 곳",
        "파도에 몽돌들이 부딪히면서 나는 소리가 은근 중독성 있다고들 하는 곳이에요. "
        "천연기념물로 지정될 만큼 특이한 지형이라 그냥 지나치기 아까운 곳입니다. "
        "해변이 자갈로 되어 있어서 맨발로 걷기엔 조금 아플 수 있으니 참고하시고, "
        "근처 완도타워랑 같이 묶어서 일정 짜면 동선이 괜찮더라고요.",
    ),
    (
        "other",
        "정다산유적지(다산초당)",
        169094432,
        "다산초당, 강진 여행에서 은근 놓치기 쉬운 곳",
        "정약용 선생이 유배 시절 10여 년을 지내면서 목민심서 같은 책들을 집필한 곳이라고 해요. "
        "강진만이 내려다보이는 자리라 풍경도 괜찮고, 역사에 관심 있으면 더 재미있게 볼 수 있는 곳입니다. "
        "산길을 좀 올라가야 해서 편한 신발 필수고, 근처에 백련사까지 이어지는 숲길도 있어서 "
        "시간 여유 있으면 같이 걸어보기 좋아요.",
    ),
    (
        "suncheon",
        "선암사",
        3292279601,
        "선암사, 승선교부터 보고 들어가는 게 국룰이더라고요",
        "조계산 자락에 있는 절인데 절 앞에 있는 승선교(무지개다리)가 특히 유명해서 "
        "그것만 보러 오는 분들도 많다고 해요. 경내 매화나무들이 오래돼서 봄에 매화 필 때 특히 "
        "사진 찍기 좋다고 하고요. 순천 송광사랑 조계산을 사이에 두고 등산로로 이어져 있어서, "
        "시간 되면 두 절을 같이 도는 코스로 짜는 사람들도 많더라고요.",
    ),
    (
        "gwangju-dong",
        "광주극장",
        1747,
        "광주극장, 아직도 필름 영화관 감성 남아있는 곳",
        "1935년부터 있었던, 국내에 몇 안 남은 오래된 단관 극장이라고 해요. "
        "요즘 멀티플렉스랑은 완전히 다른 분위기라 영화 보러 간다기보다 그 공간 자체를 구경하러 가는 "
        "느낌이 강합니다. 충장로 바로 근처라 근처 상영시간표 확인하고 가면 충장로 구경이랑 같이 묶기 좋아요.",
    ),
    (
        "wando",
        "완도 청해포구촬영장",
        839,
        "완도 청해포구촬영장, 사극 세트장 구경하기 좋아요",
        "주몽이나 해신 같은 사극 촬영했던 세트장이 그대로 남아있는 곳이에요. "
        "성벽이랑 포구, 저잣거리까지 재현이 잘 돼있어서 사진 찍기 좋습니다. "
        "야외라 여름엔 그늘이 별로 없으니 모자나 양산 챙겨가는 걸 추천드리고, "
        "근처 완도수목원이랑 묶어서 코스 짜는 분들도 많더라고요.",
    ),
    (
        "other",
        "홍길동테마파크오토캠핑장",
        326,
        "장성 홍길동테마파크, 캠핑하면서 아이들이랑 가기 좋은 곳",
        "홍길동 생가터 근처에 조성된 테마파크인데, 오토캠핑장이 같이 있어서 캠핑하면서 하루 이틀 "
        "묵기 좋은 곳이에요. 활쏘기 체험 같은 전통 놀이 체험도 있어서 아이들 데리고 가면 좋아하는 "
        "편이라고 하고요. 근처 축령산 편백숲이랑 같이 묶으면 자연 여행 코스로 잡기 좋습니다.",
    ),
    (
        "gwangju-dong",
        "충장로",
        7,
        "충장로, 먹거리 골목 위주로 돌면 동선 이렇게",
        "예전엔 쇼핑 골목으로 유명했는데 요즘은 먹자골목 느낌이 더 강해진 것 같아요. "
        "우체국 사거리 쪽부터 훑으면서 내려가면 분식이랑 디저트 가게들이 골목골목 많이 숨어있습니다. "
        "바로 옆이 예술의 거리라 벽화랑 갤러리 구경까지 같이 하면 반나절 코스로 딱 좋아요.",
    ),
    (
        "gwangju-dong",
        "무등산 주상절리대",
        6,
        "무등산 주상절리대, 어느 전망대에서 보는 게 제일 잘 보일까요",
        "서석대, 입석대, 광석대 이렇게 세 군데가 유명한데, 각각 가는 난이도랑 소요 시간이 꽤 차이 "
        "난다고 하더라고요. 서석대까지는 상대적으로 접근이 쉬운 편이고, 입석대·광석대까지 가려면 "
        "좀 더 걸어야 한다고 해요. 국내에서 몇 안 되는 주상절리 지형이라 지질에 관심 있으면 더 "
        "흥미롭게 볼 수 있는 곳입니다.",
    ),
]


def main() -> None:
    with session_scope() as session:
        user = upsert_user_from_google(
            session,
            google_id=SEED_GOOGLE_ID,
            email=SEED_EMAIL,
            name=SEED_NAME,
            profile_image="",
        )

        existing = (
            session.query(CommunityPost)
            .filter(CommunityPost.user_id == user.user_id, CommunityPost.deleted_at.is_(None))
            .count()
        )
        if existing >= len(SAMPLE_POSTS):
            print(f"이미 샘플 글 {existing}개가 있어 건너뜁니다.")
            return

        created = 0
        for board_id, place_name, place_id, title, body in SAMPLE_POSTS:
            create_post(
                session,
                user_id=user.user_id,
                board_id=board_id,
                title=title,
                body=body,
                place_name=place_name,
                place_id=place_id,
                is_anonymous=True,
            )
            created += 1
        print(f"샘플 글 {created}개 생성 완료 (user_id={user.user_id}).")


if __name__ == "__main__":
    main()
