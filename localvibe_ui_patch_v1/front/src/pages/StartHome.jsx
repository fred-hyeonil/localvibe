import { useNavigate } from "react-router-dom";
import StartNavbar from "../components/StartNavbar";

export default function StartHome() {
  const navigate = useNavigate();

  const handleTagClick = (tag) => {
    navigate(`/main?query=${encodeURIComponent(tag)}`);
  };

  const vibeRows = [
    ["혼자 조용한 카페", "재즈 바", "노을 맛집", "힙한 골목", "로컬 술집", "야경 명소"],
    ["브런치 카페", "작은 갤러리", "감성 서점", "루프탑 바", "바다 근처 카페", "한적한 산책로"],
    ["디저트 맛집", "와인바", "라이브 공연", "사진 찍기 좋은 곳", "숨은 맛집", "레트로 감성"],
  ];

  const features = [
    {
      icon: "◈",
      title: "AI-Hub 데이터",
      desc: "방문 패턴 기반으로 숨어있는 지역 상권을 분석합니다",
    },
    {
      icon: "◎",
      title: "실시간 크롤링",
      desc: "트렌드 기반 최신 정보를 실시간으로 반영합니다",
    },
    {
      icon: "◆",
      title: "AI 맞춤 추천",
      desc: "입력한 분위기에 맞춰 최적의 명소를 추천합니다",
    },
  ];

  const feeds = [
    {
      image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80",
      location: "광주 · 양림동 뒷골목",
      desc: "북적이는 관광지를 벗어나면, 재즈가 흐르는 작은 바가 있다. 오늘 밤, 이 도시의 진짜 온도를 느껴보자.",
    },
    {
      image: "https://images.unsplash.com/photo-1492724441997-5dc865305da7?auto=format&fit=crop&w=800&q=80",
      location: "여수 · 이순신광장 골목",
      desc: "바다를 정면으로 보는 카페 말고, 골목 안쪽의 작은 공간. 커피 향과 파도 소리가 섞이는 곳.",
    },
  ];

  return (
    <div className="sh-root">
      <StartNavbar />

      {/* ── Hero ── */}
      <section className="sh-hero">
        <div className="sh-hero-inner">
          <div className="sh-hero-text">
            <p className="sh-hero-eyebrow">AI 기반 로컬 명소 탐색</p>
            <h1 className="sh-hero-title">
              진짜 그 동네의<br />분위기를 담다.
            </h1>
            <p className="sh-hero-desc">
              LocalVibe는 데이터 기반 추천으로<br />
              숨은 로컬 스팟을 빠르게 찾도록 도와줍니다.
            </p>
            <div className="sh-hero-actions">
              <button className="sh-btn-primary" onClick={() => navigate("/main")}>
                지금 시작하기
              </button>
            </div>
          </div>

          <div className="sh-hero-img-wrap">
            <img
              src="https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=720&q=80"
              alt="로컬 명소"
              className="sh-hero-img"
            />
            <div className="sh-hero-badge">
              <span className="sh-badge-dot" />
              AI 실시간 분석 중
            </div>
          </div>
        </div>
      </section>

      {/* ── Vibe Tags ── */}
      <section className="sh-section sh-vibe">
        <div className="sh-section-inner">
          <p className="sh-section-eyebrow">분위기 탐색</p>
          <h2 className="sh-section-title">지금 어떤 분위기를 찾고 있나요?</h2>
          <div className="sh-vibe-rows">
            {vibeRows.map((row, rowIdx) => (
              <div key={rowIdx} className="sh-vibe-row">
                {row.map((tag) => (
                  <button
                    key={tag}
                    className="sh-tag"
                    onClick={() => handleTagClick(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="sh-section sh-features">
        <div className="sh-section-inner">
          <p className="sh-section-eyebrow">기술 스택</p>
          <h2 className="sh-section-title">데이터가 만드는 로컬 경험</h2>
          <div className="sh-feature-grid">
            {features.map((f) => (
              <div key={f.title} className="sh-feature-card">
                <div className="sh-feature-icon">{f.icon}</div>
                <h3 className="sh-feature-name">{f.title}</h3>
                <p className="sh-feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Feed Preview ── */}
      <section className="sh-section sh-feed">
        <div className="sh-section-inner">
          <p className="sh-section-eyebrow">피드 미리보기</p>
          <h2 className="sh-section-title">AI가 만들어주는 로컬 피드</h2>

          <div className="sh-feed-list">
            {feeds.map((feed, i) => (
              <div
                key={i}
                className={`sh-feed-card ${i % 2 === 1 ? 'sh-feed-card--reverse' : ''}`}
              >
                <div className="sh-feed-img-wrap">
                  <img src={feed.image} alt={feed.location} className="sh-feed-img" />
                  <span className="sh-feed-location-badge">{feed.location}</span>
                </div>
                <div className="sh-feed-text">
                  <h3 className="sh-feed-title">{feed.location}</h3>
                  <p className="sh-feed-desc">{feed.desc}</p>
                  <button
                    className="sh-btn-primary sh-feed-cta"
                    onClick={() => navigate("/main")}
                  >
                    더 보러가기 →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="sh-cta-banner">
        <div className="sh-section-inner sh-cta-inner">
          <h2 className="sh-cta-title">지금 바로 탐색을 시작해보세요</h2>
          <p className="sh-cta-sub">AI가 나만의 로컬 여행 플랜을 만들어드립니다</p>
          <button className="sh-btn-white" onClick={() => navigate("/main")}>
            무료로 시작하기
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="sh-footer">
        <div className="sh-footer-inner">
          <div className="sh-footer-left">
            <p className="sh-footer-brand">LocalVibe</p>
            <p className="sh-footer-desc">
              Discover real local stories with AI and data-driven insights.
            </p>
          </div>
          <div className="sh-footer-right">
            <div className="sh-footer-col">
              <p className="sh-footer-col-title">Features</p>
              <a href="/main" className="sh-footer-link">Core Features</a>
              <a href="/main" className="sh-footer-link">Pro Experience</a>
            </div>
            <div className="sh-footer-col">
              <p className="sh-footer-col-title">Support</p>
              <a href="/login" className="sh-footer-link">로그인</a>
              <a href="/signin" className="sh-footer-link">회원가입</a>
            </div>
          </div>
        </div>
        <div className="sh-footer-bottom">
          © {new Date().getFullYear()} LocalVibe. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
