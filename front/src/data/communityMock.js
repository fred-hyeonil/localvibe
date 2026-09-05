/**
 * 커뮤니티 UI용 목업 데이터.
 * 백엔드 연동 전까지만 사용하며, API가 붙으면 이 파일은 삭제 대상입니다.
 */

export const COMMUNITY_BOARDS = [
  { id: 'all', name: '전체', desc: '광주·전남 모든 글' },
  { id: 'gwangju-dong', name: '광주 동구', desc: '충장로·양림동·국립아시아문화전당' },
  { id: 'gwangju-seo', name: '광주 서구', desc: '상무지구·풍암' },
  { id: 'gwangju-nam', name: '광주 남구', desc: '양림역사문화마을·백운동' },
  { id: 'gwangju-buk', name: '광주 북구', desc: '전남대·용봉동·무등산' },
  { id: 'gwangju-gwangsan', name: '광주 광산구', desc: '수완지구·첨단·송정' },
  { id: 'yeosu', name: '여수', desc: '돌산·오동도·낭만포차' },
  { id: 'suncheon', name: '순천', desc: '순천만·드라마촬영장' },
  { id: 'mokpo', name: '목포', desc: '근대역사거리·유달산' },
  { id: 'damyang', name: '담양', desc: '죽녹원·메타세쿼이아길' },
  { id: 'boseong', name: '보성', desc: '녹차밭·율포해수욕장' },
  { id: 'wando', name: '완도', desc: '청산도·신지명사십리' },
];

export const COMMUNITY_SORTS = [
  { id: 'hot', label: '인기', icon: '△' },
  { id: 'new', label: '최신', icon: '✦' },
  { id: 'top', label: '베스트', icon: '↑' },
  { id: 'comments', label: '댓글순', icon: '○' },
];

export const COMMUNITY_POSTS = [
  {
    id: 1,
    boardId: 'gwangju-dong',
    title: '양림동 펭귄마을 골목, 평일 오전이 진짜 좋습니다',
    body: '주말에 두 번 갔다가 사람에 치여서 포기했는데 평일 10시쯤 가니까 완전 다른 동네더라고요. 골목 하나하나가 전시장 같고, 근처 카페에서 커피 한 잔 하고 나오면 두 시간이 딱 맞습니다. 근처 이장우 가옥까지 묶어서 걸으면 반나절 코스로 충분해요.',
    place: '펭귄마을',
    author: 'namdo_walker',
    createdAt: '3시간 전',
    votes: 218,
    comments: 34,
    myVote: 1,
  },
  {
    id: 2,
    boardId: 'yeosu',
    title: '여수 1박 2일인데 돌산공원 야경 vs 오동도 중 하나만 고른다면?',
    body: '토요일 오후에 도착해서 일요일 점심에 출발합니다. 저녁 시간이 애매해서 둘 중 하나만 갈 수 있을 것 같은데 뭘 추천하시나요? 일행은 사진 찍는 걸 좋아합니다.',
    place: '돌산공원',
    author: 'seoul_to_south',
    createdAt: '5시간 전',
    votes: 96,
    comments: 61,
    myVote: 0,
  },
  {
    id: 3,
    boardId: 'damyang',
    title: '메타세쿼이아길 초여름 색감 미쳤습니다 (사진 몇 장)',
    body: '해질녘 한 시간 전쯤이 제일 예뻐요. 입구 쪽보다 중간 지점에서 뒤돌아 찍는 구도를 추천합니다. 자전거 대여해서 왕복하면 40분 정도 걸립니다.',
    place: '메타세쿼이아 랜드',
    author: 'film_daily',
    createdAt: '9시간 전',
    votes: 412,
    comments: 27,
    myVote: 0,
  },
  {
    id: 4,
    boardId: 'gwangju-buk',
    title: '무등산 첫 등산이면 증심사 코스로 가세요',
    body: '원효사 쪽은 초행에 은근히 힘듭니다. 증심사에서 중머리재까지만 다녀와도 충분히 만족스럽고 왕복 3시간 정도예요. 내려와서 학동 쪽에서 국밥 한 그릇이면 완벽합니다.',
    place: '무등산 국립공원',
    author: 'mudeung_local',
    createdAt: '14시간 전',
    votes: 187,
    comments: 45,
    myVote: -1,
  },
  {
    id: 5,
    boardId: 'suncheon',
    title: '순천만 습지 갈대밭 탐방로 일부 보수공사 중입니다',
    body: '지난주에 갔는데 무진교 건너편 데크 일부가 통제되어 있었습니다. 전망대까지는 정상적으로 올라갈 수 있으니 참고하세요. 주차장은 오전 11시 넘으면 꽉 찹니다.',
    place: '순천만 국가정원',
    author: 'wetland_notes',
    createdAt: '1일 전',
    votes: 305,
    comments: 18,
    myVote: 0,
  },
  {
    id: 6,
    boardId: 'mokpo',
    title: '목포 근대역사거리 야간 조명 켜진 뒤가 훨씬 낫습니다',
    body: '낮에는 그냥 오래된 거리인데 조명 들어오면 분위기가 확 달라져요. 근대역사관 1관 앞에서 시작해서 유달산 노적봉까지 천천히 걸었습니다.',
    place: '목포 근대역사관',
    author: 'yudal_night',
    createdAt: '1일 전',
    votes: 143,
    comments: 22,
    myVote: 0,
  },
  {
    id: 7,
    boardId: 'boseong',
    title: '이번 주 토요일 보성 녹차밭 같이 가실 분 구합니다',
    body: '광주에서 출발 예정이고 차 있습니다. 2명 정도 더 함께 가면 좋을 것 같아요. 오전에 녹차밭 보고 오후에 율포 쪽으로 넘어갈 계획입니다.',
    place: '대한다원',
    author: 'green_tea_run',
    createdAt: '2일 전',
    votes: 58,
    comments: 39,
    myVote: 0,
  },
  {
    id: 8,
    boardId: 'gwangju-seo',
    title: '상무지구 근처에 조용히 작업할 만한 카페 있을까요',
    body: '노트북 켜고 두세 시간 있어도 눈치 안 보이는 곳을 찾고 있습니다. 콘센트 있는 자리면 더 좋고요.',
    place: '상무지구',
    author: 'remote_worker_gj',
    createdAt: '2일 전',
    votes: 74,
    comments: 51,
    myVote: 0,
  },
  // 아래 두 건은 로그인 사용자('me')가 쓴 글 — 마이페이지 '작성글'에서 필터로 뽑아 씁니다.
  {
    id: 9,
    boardId: 'gwangju-nam',
    title: '양림동 카페 골목, 주차는 어디에 하면 좋을까요',
    body: '주말에 갔다가 주차 자리를 못 찾아서 20분을 돌았습니다. 근처에 공영주차장이 있다고 들었는데 어디가 제일 가까운지 아시는 분 계실까요?',
    place: '양림동',
    author: 'me',
    createdAt: '2일 전',
    votes: 12,
    comments: 5,
    myVote: 0,
    anonymous: false,
  },
  {
    id: 10,
    boardId: 'damyang',
    title: '죽녹원 평일 오후에 다녀왔습니다',
    body: '사람이 거의 없어서 대나무 소리만 들렸어요. 입구에서 정상까지 천천히 걸어 한 시간 정도 걸렸습니다.',
    place: '죽녹원',
    author: 'me',
    createdAt: '1주 전',
    votes: 34,
    comments: 8,
    myVote: 0,
    anonymous: true,
  },
];

export const COMMUNITY_COMMENTS = {
  1: [
    {
      id: 101,
      author: 'gwangju_native',
      createdAt: '2시간 전',
      votes: 42,
      body: '평일 오전 동의합니다. 그리고 골목 안쪽 주민분들 사시는 곳이라 사진 찍을 때 조심하는 게 좋아요.',
      replies: [
        {
          id: 102,
          author: 'namdo_walker',
          createdAt: '1시간 전',
          votes: 15,
          body: '맞아요, 이건 꼭 적었어야 했는데 빠뜨렸네요. 감사합니다.',
          replies: [],
        },
      ],
    },
    {
      id: 103,
      author: 'coffee_map',
      createdAt: '1시간 전',
      votes: 12,
      body: '근처 카페 어디 가셨나요? 양림동 쪽은 선택지가 많아서 매번 고민됩니다.',
      replies: [],
    },
  ],
  2: [
    {
      id: 201,
      author: 'yeosu_resident',
      createdAt: '4시간 전',
      votes: 88,
      body: '사진 좋아하시면 무조건 돌산공원입니다. 오동도는 낮에 가야 값어치를 하고, 야경은 돌산 쪽이 압도적이에요.',
      replies: [],
    },
    {
      id: 202,
      author: 'travel_light',
      createdAt: '3시간 전',
      votes: 21,
      body: '케이블카 타고 올라가서 내려올 때 걸어오는 것도 괜찮습니다. 다만 바람 많이 부니 겉옷 챙기세요.',
      replies: [],
    },
  ],
};

export const COMMUNITY_TRENDING = [
  { id: 't1', label: '무등산 등산코스', count: 128 },
  { id: 't2', label: '여수 밤바다', count: 96 },
  { id: 't3', label: '순천만 일몰', count: 74 },
  { id: 't4', label: '담양 죽녹원', count: 61 },
  { id: 't5', label: '광주 충장로 맛집', count: 55 },
];

export const COMMUNITY_RULES = [
  '광주·전남 지역의 장소에 대한 글만 올려주세요.',
  '방문한 날짜와 장소 이름을 함께 적으면 도움이 됩니다.',
  '광고·홍보성 글과 반복 게시는 삭제됩니다.',
  '사진 속 타인의 얼굴은 가려주세요.',
  '서로의 취향을 존중하는 댓글을 부탁드립니다.',
];

/**
 * 마이페이지 '내 활동'용 목업.
 * 로그인 사용자가 쓴 글·댓글이며, 백엔드가 붙으면 /api/me/... 응답으로 대체됩니다.
 */
export const COMMUNITY_MY_POSTS = COMMUNITY_POSTS.filter(
  post => post.author === 'me',
);

export const COMMUNITY_MY_COMMENTS = [
  {
    id: 951,
    postId: 2,
    postTitle: '여수 1박 2일인데 돌산공원 야경 vs 오동도 중 하나만 고른다면?',
    body: '저도 돌산공원에 한 표요. 케이블카는 줄이 길 수 있으니 해 지기 전에 미리 올라가세요.',
    createdAt: '4시간 전',
    votes: 7,
    anonymous: false,
  },
  {
    id: 952,
    postId: 5,
    postTitle: '순천만 습지 갈대밭 탐방로 일부 보수공사 중입니다',
    body: '지난 주말에도 같은 구간이 막혀 있었어요. 정보 감사합니다.',
    createdAt: '1일 전',
    votes: 3,
    anonymous: true,
  },
  {
    id: 953,
    postId: 4,
    postTitle: '무등산 첫 등산이면 증심사 코스로 가세요',
    body: '증심사 코스 동의합니다. 다만 여름엔 물을 넉넉히 챙기세요.',
    createdAt: '3일 전',
    votes: 15,
    anonymous: false,
  },
];

/** 마이페이지 '저장한 글' — 글 본문은 원본에서 찾아 쓰고 저장 시점만 따로 둡니다. */
const SAVED_POST_META = [
  { id: 3, savedAt: '어제 저장' },
  { id: 5, savedAt: '3일 전 저장' },
];

export const COMMUNITY_SAVED_POSTS = SAVED_POST_META.map(meta => {
  const post = COMMUNITY_POSTS.find(p => p.id === meta.id);
  return post ? { ...post, savedAt: meta.savedAt } : null;
}).filter(Boolean);
