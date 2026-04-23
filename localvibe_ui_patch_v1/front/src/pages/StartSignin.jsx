import StartNavbar from "../components/StartNavbar";

export default function StartSignin() {
  return (
    <div className="auth-root">
      <StartNavbar />
      <div className="auth-center">
        <div className="auth-card">
          <div className="auth-card-header">
            <p className="auth-brand">LocalVibe</p>
            <h2 className="auth-title">함께 시작해요</h2>
            <p className="auth-sub">새 계정을 만들어보세요</p>
          </div>

          <button className="auth-google-btn">
            <svg width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
              <path fill="#4285F4" d="M44.5 20H24v8.5h11.8C34.5 33.5 29.8 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6-6C34.5 5.1 29.5 3 24 3 12.4 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.6 20-21 0-1.3-.2-2.7-.5-4z"/>
              <path fill="#34A853" d="M6.3 14.7l7 5.1C15.1 16 19.2 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6-6C34.5 5.1 29.5 3 24 3c-7.5 0-14 4.1-17.7 10.7z"/>
              <path fill="#FBBC05" d="M24 45c5.6 0 10.5-1.9 14.3-5l-6.6-5.4C29.8 36 27 37 24 37c-5.8 0-10.5-3.5-11.8-8.5l-7 5.5C8.1 41 15.5 45 24 45z"/>
              <path fill="#EA4335" d="M44.5 20H24v8.5h11.8c-.7 2.8-2.4 5.1-4.8 6.6l6.6 5.4C41.5 37.3 45 31 45 24c0-1.3-.2-2.7-.5-4z"/>
            </svg>
            Google로 가입하기
          </button>

          <div className="auth-divider">
            <span>또는</span>
          </div>

          <div className="auth-form">
            <div className="auth-field">
              <label className="auth-label">이름</label>
              <input className="auth-input" type="text" placeholder="홍길동" />
            </div>
            <div className="auth-field">
              <label className="auth-label">이메일</label>
              <input className="auth-input" type="email" placeholder="name@example.com" />
            </div>
            <div className="auth-field">
              <label className="auth-label">비밀번호</label>
              <input className="auth-input" type="password" placeholder="8자 이상 입력" />
            </div>
            <button className="auth-submit-btn">회원가입</button>
          </div>

          <p className="auth-switch">
            이미 계정이 있으신가요?{" "}
            <a href="/login" className="auth-switch-link">로그인</a>
          </p>
        </div>
      </div>
    </div>
  );
}
