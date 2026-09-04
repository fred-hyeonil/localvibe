import { useEffect, useMemo, useRef, useState } from 'react';
import {
  COMMUNITY_BOARDS,
  COMMUNITY_COMMENTS,
  COMMUNITY_POSTS,
  COMMUNITY_RULES,
  COMMUNITY_SORTS,
  COMMUNITY_TRENDING,
} from '../data/communityMock';

/**
 * 커뮤니티 — 광주·전남 장소 이야기를 쓰는 공간.
 * 현재는 UI 전용이며 모든 데이터는 communityMock.js 목업입니다.
 * (투표·글쓰기·댓글은 로컬 state에만 반영되고 서버로 전송되지 않습니다.)
 */

const boardName = id =>
  COMMUNITY_BOARDS.find(b => b.id === id)?.name || '전체';

/** 액션 줄 아이콘 — 선(stroke)만 쓰는 24px 그리드 기준. */
function Icon({ name }) {
  const paths = {
    comment: 'M21 11.5a8.4 8.4 0 0 1-9 8.4 9.6 9.6 0 0 1-2.6-.4L3 21l1.6-4.7A8.2 8.2 0 0 1 3.6 11.5a8.4 8.4 0 0 1 9-8.4 8.4 8.4 0 0 1 8.4 8.4z',
    share: 'M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 15V3m0 0L8 7m4-4 4 4',
    save: 'M6 4.5h12a1 1 0 0 1 1 1V20l-7-4-7 4V5.5a1 1 0 0 1 1-1z',
    report: 'M5 21V4.5m0 0h11l-2 3.5 2 3.5H5',
  };
  return (
    <svg
      className="cm-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

/** 하단 액션 줄에 들어가는 알약형 투표 버튼. */
function VotePill({ votes, myVote, onVote }) {
  const score = votes + (myVote === 1 ? 1 : 0) - (myVote === -1 ? 1 : 0);
  return (
    <div className="cm-vote">
      <button
        type="button"
        className={`cm-vote-btn${myVote === 1 ? ' up' : ''}`}
        onClick={e => {
          e.stopPropagation();
          onVote(myVote === 1 ? 0 : 1);
        }}
        aria-label="추천"
      >
        ▲
      </button>
      <span className={`cm-vote-score${myVote === 1 ? ' up' : ''}${myVote === -1 ? ' down' : ''}`}>
        {score}
      </span>
      <button
        type="button"
        className={`cm-vote-btn${myVote === -1 ? ' down' : ''}`}
        onClick={e => {
          e.stopPropagation();
          onVote(myVote === -1 ? 0 : -1);
        }}
        aria-label="비추천"
      >
        ▼
      </button>
    </div>
  );
}

/** 정렬 기준 드롭다운 — 바깥 클릭 시 닫힙니다. */
function SortDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handler = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const current = COMMUNITY_SORTS.find(s => s.id === value);

  return (
    <div className="cm-dropdown" ref={ref}>
      <button
        type="button"
        className={`cm-dropdown-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        {current?.label}
        <span className="cm-caret" aria-hidden="true">
          ⌄
        </span>
      </button>
      {open && (
        <ul className="cm-dropdown-menu">
          {COMMUNITY_SORTS.map(s => (
            <li key={s.id}>
              <button
                type="button"
                className={`cm-dropdown-item${value === s.id ? ' active' : ''}`}
                onClick={() => {
                  onChange(s.id);
                  setOpen(false);
                }}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PostCard({ post, onVote, onOpen }) {
  return (
    <article className="cm-post" onClick={() => onOpen(post)}>
      <div className="cm-post-body">
        <div className="cm-post-meta">
          <span className="cm-board-chip">{boardName(post.boardId)}</span>
          <span className="cm-dot">·</span>
          <span className="cm-post-author">u/{post.author}</span>
          <span className="cm-dot">·</span>
          <span>{post.createdAt}</span>
          {post.place && (
            <>
              <span className="cm-bar">|</span>
              <span className="cm-meta-place">{post.place}</span>
            </>
          )}
        </div>
        <h3 className="cm-post-title">{post.title}</h3>
        <p className="cm-post-excerpt">{post.body}</p>
        <div className="cm-post-actions">
          <VotePill
            votes={post.votes}
            myVote={post.myVote}
            onVote={v => onVote(post.id, v)}
          />
          <span className="cm-bar">|</span>
          <span className="cm-post-action">
            <Icon name="comment" /> 댓글 {post.comments}
          </span>
          <span className="cm-bar">|</span>
          <span className="cm-post-action">
            <Icon name="share" /> 공유
          </span>
          <span className="cm-bar">|</span>
          <span className="cm-post-action">
            <Icon name="save" /> 저장
          </span>
        </div>
      </div>
    </article>
  );
}

function Comment({ comment, depth = 0 }) {
  return (
    <li className="cm-comment" style={{ marginLeft: depth ? 24 : 0 }}>
      <div className="cm-comment-head">
        <span className="cm-comment-avatar" aria-hidden="true">
          {comment.author.slice(0, 1).toUpperCase()}
        </span>
        <span className="cm-post-author">u/{comment.author}</span>
        <span className="cm-dot">·</span>
        <span>{comment.createdAt}</span>
      </div>
      <p className="cm-comment-body">{comment.body}</p>
      <div className="cm-comment-actions">
        <span className="cm-post-action">▲ {comment.votes}</span>
        <span className="cm-post-action">답글</span>
        <span className="cm-post-action">공유</span>
      </div>
      {comment.replies?.length > 0 && (
        <ul className="cm-comment-list cm-comment-list--nested">
          {comment.replies.map(reply => (
            <Comment key={reply.id} comment={reply} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

function PostDetail({ post, onVote, onBack }) {
  const comments = COMMUNITY_COMMENTS[post.id] || [];
  return (
    <div className="cm-detail">
      <button type="button" className="cm-back-btn" onClick={onBack}>
        ← 목록으로
      </button>
      <article className="cm-post cm-post--detail">
        <div className="cm-post-body">
          <div className="cm-post-meta">
            <span className="cm-board-chip">{boardName(post.boardId)}</span>
            <span className="cm-dot">·</span>
            <span className="cm-post-author">u/{post.author}</span>
            <span className="cm-dot">·</span>
            <span>{post.createdAt}</span>
          </div>
          <h2 className="cm-detail-title">{post.title}</h2>
          {post.place && (
            <div className="cm-place-card">
              <span className="cm-place-pin" aria-hidden="true">📍</span>
              <div>
                <strong>{post.place}</strong>
                <span>{boardName(post.boardId)}</span>
              </div>
              <button type="button" className="cm-place-link">
                장소 보기
              </button>
            </div>
          )}
          <p className="cm-detail-text">{post.body}</p>
          <div className="cm-post-actions">
            <VotePill
              votes={post.votes}
              myVote={post.myVote}
              onVote={v => onVote(post.id, v)}
            />
            <span className="cm-bar">|</span>
            <span className="cm-post-action">
              <Icon name="comment" /> 댓글 {post.comments}
            </span>
            <span className="cm-bar">|</span>
            <span className="cm-post-action">
              <Icon name="share" /> 공유
            </span>
            <span className="cm-bar">|</span>
            <span className="cm-post-action">
              <Icon name="save" /> 저장
            </span>
            <span className="cm-bar">|</span>
            <span className="cm-post-action">
              <Icon name="report" /> 신고
            </span>
          </div>
        </div>
      </article>

      <section className="cm-comment-section">
        <textarea
          className="cm-comment-input"
          placeholder="댓글을 남겨보세요"
          rows={3}
        />
        <div className="cm-comment-input-actions">
          <button type="button" className="cm-btn cm-btn--primary">
            댓글 등록
          </button>
        </div>

        {comments.length === 0 ? (
          <p className="cm-empty">아직 댓글이 없습니다. 첫 댓글을 남겨보세요.</p>
        ) : (
          <ul className="cm-comment-list">
            {comments.map(c => (
              <Comment key={c.id} comment={c} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function WriteModal({ onClose, onSubmit }) {
  const [boardId, setBoardId] = useState('gwangju-dong');
  const [title, setTitle] = useState('');
  const [place, setPlace] = useState('');
  const [body, setBody] = useState('');

  const canSubmit = title.trim() && body.trim();

  return (
    <div className="cm-modal-backdrop" onClick={onClose}>
      <div className="cm-modal" onClick={e => e.stopPropagation()}>
        <div className="cm-modal-head">
          <h3>글 쓰기</h3>
          <button type="button" className="cm-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <label className="cm-field">
          <span>게시판</span>
          <select value={boardId} onChange={e => setBoardId(e.target.value)}>
            {COMMUNITY_BOARDS.filter(b => b.id !== 'all').map(b => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>

        <label className="cm-field">
          <span>제목</span>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="어떤 장소에 대한 이야기인가요?"
          />
        </label>

        <label className="cm-field">
          <span>장소 (선택)</span>
          <input
            value={place}
            onChange={e => setPlace(e.target.value)}
            placeholder="예: 무등산 국립공원"
          />
        </label>

        <label className="cm-field">
          <span>내용</span>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={8}
            placeholder="방문 시기, 가는 방법, 좋았던 점을 적어주세요."
          />
        </label>

        <div className="cm-modal-actions">
          <button type="button" className="cm-btn" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="cm-btn cm-btn--primary"
            disabled={!canSubmit}
            onClick={() => onSubmit({ boardId, title, place, body })}
          >
            등록
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CommunityPage() {
  const [posts, setPosts] = useState(COMMUNITY_POSTS);
  const [activeBoard, setActiveBoard] = useState('all');
  const [sort, setSort] = useState('hot');
  const [query, setQuery] = useState('');
  const [openPostId, setOpenPostId] = useState(null);
  const [isWriteOpen, setIsWriteOpen] = useState(false);

  const handleVote = (postId, myVote) => {
    setPosts(prev =>
      prev.map(p => (p.id === postId ? { ...p, myVote } : p)),
    );
  };

  const handleCreate = draft => {
    setPosts(prev => [
      {
        id: Date.now(),
        boardId: draft.boardId,
        title: draft.title.trim(),
        body: draft.body.trim(),
        place: draft.place.trim(),
        author: 'me',
        createdAt: '방금 전',
        votes: 1,
        comments: 0,
        myVote: 1,
      },
      ...prev,
    ]);
    setIsWriteOpen(false);
    setActiveBoard(draft.boardId);
    setSort('new');
  };

  const visiblePosts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = posts.filter(p => {
      if (activeBoard !== 'all' && p.boardId !== activeBoard) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.body.toLowerCase().includes(q) ||
        String(p.place || '').toLowerCase().includes(q)
      );
    });
    const sorted = [...filtered];
    if (sort === 'top') sorted.sort((a, b) => b.votes - a.votes);
    else if (sort === 'comments') sorted.sort((a, b) => b.comments - a.comments);
    else if (sort === 'hot')
      sorted.sort((a, b) => b.votes + b.comments * 2 - (a.votes + a.comments * 2));
    return sorted;
  }, [posts, activeBoard, sort, query]);

  const openPost = posts.find(p => p.id === openPostId) || null;

  return (
    <div className="cm-page">
      {/* ── 좌측: 게시판 목록 ── */}
      <aside className="cm-side cm-side--left">
        <ul className="cm-board-list">
          {COMMUNITY_BOARDS.map(b => (
            <li key={b.id}>
              <button
                type="button"
                className={`cm-board-item${activeBoard === b.id ? ' active' : ''}`}
                onClick={() => {
                  setActiveBoard(b.id);
                  setOpenPostId(null);
                }}
              >
                <span className="cm-board-name">{b.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* ── 중앙: 피드 ── */}
      <section className="cm-feed">
        {openPost ? (
          <PostDetail
            post={openPost}
            onVote={handleVote}
            onBack={() => setOpenPostId(null)}
          />
        ) : (
          <>
            <div className="cm-toolbar">
              <SortDropdown value={sort} onChange={setSort} />
              <input
                className="cm-search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="커뮤니티 검색"
              />
            </div>

            {visiblePosts.length === 0 ? (
              <p className="cm-empty">아직 글이 없습니다. 첫 글을 남겨보세요.</p>
            ) : (
              <div className="cm-post-list">
                {visiblePosts.map(post => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onVote={handleVote}
                    onOpen={p => setOpenPostId(p.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* ── 우측: 정보 사이드바 ── */}
      <aside className="cm-side cm-side--right">
        <div className="cm-card">
          <p className="cm-card-title">커뮤니티 소개</p>
          <p className="cm-card-text">
            광주광역시와 전라남도의 장소에 대한 후기·질문·추천을 나누는
            공간입니다.
          </p>
          <div className="cm-stats">
            <div>
              <strong>3,482</strong>
              <span>멤버</span>
            </div>
            <div>
              <strong>67</strong>
              <span>접속 중</span>
            </div>
          </div>
          <button
            type="button"
            className="cm-btn cm-btn--primary cm-btn--block"
            onClick={() => setIsWriteOpen(true)}
          >
            글 쓰기
          </button>
        </div>

        <div className="cm-card">
          <p className="cm-card-title">지금 많이 찾는 장소</p>
          <ul className="cm-trend-list">
            {COMMUNITY_TRENDING.map((t, i) => (
              <li key={t.id}>
                <span className="cm-trend-rank">{i + 1}</span>
                <span className="cm-trend-label">{t.label}</span>
                <span className="cm-trend-count">{t.count}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="cm-card">
          <p className="cm-card-title">커뮤니티 규칙</p>
          <ol className="cm-rule-list">
            {COMMUNITY_RULES.map((rule, i) => (
              <li key={i}>{rule}</li>
            ))}
          </ol>
        </div>
      </aside>

      {isWriteOpen && (
        <WriteModal
          onClose={() => setIsWriteOpen(false)}
          onSubmit={handleCreate}
        />
      )}
    </div>
  );
}
