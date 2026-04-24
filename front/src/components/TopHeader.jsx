export default function TopHeader({ sidebarOpen, onToggleSidebar }) {
  return (
    <header className="top-header">
      <div className="top-header-left">
        <button
          className="sidebar-toggle-btn"
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? '사이드바 닫기' : '사이드바 열기'}
        >
          <span className="toggle-bar" />
          <span className="toggle-bar" />
          <span className="toggle-bar" />
        </button>
        <span className="top-header-logo">LocalVibe</span>
      </div>

      <nav className="top-header-nav">
        <a className="top-header-link" href="#">
          갤러리
        </a>
        <a className="top-header-link" href="#">
          플래너
        </a>
        <a className="top-header-link" href="#">
          소개
        </a>
      </nav>

      <div className="top-header-right">
        <button className="top-header-btn outline">로그인</button>
        <button className="top-header-btn filled">시작하기</button>
      </div>
    </header>
  );
}
