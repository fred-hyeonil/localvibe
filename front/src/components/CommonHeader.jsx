import { GoogleLogin, googleLogout } from '@react-oauth/google';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LineIcon from './ui/LineIcon';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

function readPictureFromToken(token) {
  try {
    const encoded = String(token || '').split('.')[1];
    if (!encoded) return '';
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(
      atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')),
    );
    return String(claims?.picture || '');
  } catch {
    return '';
  }
}

function readStoredUser() {
  try {
    const raw = localStorage.getItem('lv_user');
    const user = raw ? JSON.parse(raw) : null;
    if (!user) return null;
    const picture =
      user.picture ||
      user.profile_image ||
      user.profileImage ||
      readPictureFromToken(localStorage.getItem('lv_access_token'));
    return picture && !user.picture ? { ...user, picture } : user;
  } catch {
    return null;
  }
}

export default function CommonHeader({ onTabChange }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(readStoredUser);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const loginRef = useRef(null);

  useEffect(() => {
    const sync = () => {
      setUser(readStoredUser());
    };
    window.addEventListener('storage', sync);
    window.addEventListener('lv-auth-changed', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('lv-auth-changed', sync);
    };
  }, []);

  useEffect(() => {
    if (!isLoginOpen && !isProfileOpen) return;
    const handler = e => {
      if (loginRef.current && !loginRef.current.contains(e.target)) {
        setIsLoginOpen(false);
        setIsProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isLoginOpen, isProfileOpen]);

  const handleGoogleCredential = async credential => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: credential }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const token = String(data?.access_token || '');
      const responseUser = data?.user || null;
      const nextUser = responseUser
        ? {
            ...responseUser,
            picture:
              responseUser.picture ||
              responseUser.profile_image ||
              responseUser.profileImage ||
              readPictureFromToken(credential) ||
              readPictureFromToken(token),
          }
        : null;
      if (!token || !nextUser) throw new Error();
      localStorage.setItem('lv_access_token', token);
      localStorage.setItem('lv_user', JSON.stringify(nextUser));
      window.dispatchEvent(new Event('lv-auth-changed'));
      setIsLoginOpen(false);
    } catch {
      window.alert('구글 로그인에 실패했습니다.');
    }
  };

  const handleLogout = () => {
    googleLogout();
    localStorage.removeItem('lv_access_token');
    localStorage.removeItem('lv_user');
    window.dispatchEvent(new Event('lv-auth-changed'));
    navigate('/');
  };

  return (
    <div className="common-header-wrap">
      <div className="common-header-pill">
        {/* 로고 */}
        <button
          type="button"
          className="common-header-logo"
          onClick={() => navigate('/')}
        >
          <span className="common-header-logo-text">LocalVibe</span>
        </button>

        {/* 구분선 */}
        <div className="common-header-divider" />

        {/* 중앙 네비 */}
        <nav className="common-header-nav">
          <span
            className="common-header-nav-link"
            onClick={() =>
              onTabChange
                ? onTabChange('gallery')
                : navigate('/main', { state: { tab: 'gallery' } })
            }
          >
            갤러리
          </span>
          <span
            className="common-header-nav-link"
            onClick={() =>
              onTabChange
                ? onTabChange('planner')
                : navigate('/main', { state: { tab: 'planner' } })
            }
          >
            플래너
          </span>
          <span
            className="common-header-nav-link"
            onClick={() =>
              onTabChange
                ? onTabChange('community')
                : navigate('/main', { state: { tab: 'community' } })
            }
          >
            커뮤니티
          </span>
        </nav>

        {/* 구분선 */}
        <div className="common-header-divider" />

        {/* 우측 */}
        <div className="common-header-right" ref={loginRef}>
          {user ? (
            <div className="common-header-profile-wrap" ref={loginRef}>
              <button
                type="button"
                className="common-header-profile-trigger"
                onClick={() => setIsProfileOpen(o => !o)}
              >
                {user.picture ? (
                  <img
                    src={user.picture}
                    alt="profile"
                    className="common-header-avatar"
                  />
                ) : (
                  <div className="common-header-avatar-fallback">
                    {String(user.name || 'U')
                      .slice(0, 1)
                      .toUpperCase()}
                  </div>
                )}
                <span className="common-header-user-name">
                  {user.name || user.email}
                </span>
              </button>
              {isProfileOpen && (
                <div className="common-header-profile-dropdown">
                  <div className="common-header-profile-summary">
                    {user.picture ? (
                      <img
                        src={user.picture}
                        alt=""
                        className="common-header-profile-summary-avatar"
                      />
                    ) : (
                      <div className="common-header-profile-summary-avatar common-header-avatar-fallback">
                        {String(user.name || 'U')
                          .slice(0, 1)
                          .toUpperCase()}
                      </div>
                    )}
                    <div className="common-header-profile-summary-text">
                      <strong>{user.name || '사용자'}</strong>
                      <span>{user.email}</span>
                    </div>
                  </div>
                  <div className="common-header-profile-divider" />
                  <button
                    className="common-header-profile-item"
                    type="button"
                    onClick={() => {
                      setIsProfileOpen(false);
                      onTabChange
                        ? onTabChange('mypage')
                        : navigate('/main', { state: { tab: 'mypage' } });
                    }}
                  >
                    <LineIcon
                      name="user"
                      className="common-header-profile-menu-icon"
                    />
                    마이페이지
                  </button>
                  <button
                    className="common-header-profile-logout"
                    type="button"
                    onClick={handleLogout}
                  >
                    <LineIcon
                      name="logout"
                      className="common-header-profile-menu-icon"
                    />
                    로그아웃
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <button
                className="common-header-btn"
                onClick={() => setIsLoginOpen(open => !open)}
              >
                로그인
              </button>
            </>
          )}
          {isLoginOpen && (
            <div className="common-header-login-panel">
              <p className="common-header-login-title">Google로 계속하기</p>
              <GoogleLogin
                theme="filled_black"
                size="large"
                text="signin_with"
                onSuccess={cr => {
                  const c = cr?.credential || '';
                  if (c) handleGoogleCredential(c);
                }}
                onError={() =>
                  window.alert('Google 로그인 창을 불러오지 못했습니다.')
                }
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
