import { useState, useEffect, useRef } from "react";
import { commentsApi } from "../../lib/apiClient.js";
import { useAuth } from "../../context/AuthContext.jsx";

interface Author {
  id: number;
  username: string;
  display_name?: string;
  avatar_url?: string;
  is_admin: boolean;
  is_owner: boolean;
}

interface Comment {
  id: number;
  parent_id: number | null;
  content: string;
  likes: number;
  liked_by_me: boolean;
  created_at: string;
  author: Author;
  replies: Comment[];
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "hozir";
  if (diff < 3600) return `${Math.floor(diff / 60)} daqiqa oldin`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} soat oldin`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} kun oldin`;
  return new Date(iso).toLocaleDateString("uz-UZ");
}

function Avatar({ author, size = 28 }: { author: Author; size?: number }) {
  if (author.avatar_url) {
    return (
      <img
        src={author.avatar_url}
        alt={author.username}
        style={{ width: size, height: size }}
        className="rounded-full object-cover flex-shrink-0"
      />
    );
  }
  const letter = (author.display_name || author.username)[0].toUpperCase();
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      className="rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold flex-shrink-0"
    >
      {letter}
    </div>
  );
}

function AuthorBadge({ author }: { author: Author }) {
  const name = author.display_name || author.username;
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[13px] font-semibold text-[var(--text-primary)]">{name}</span>
      {author.is_owner && (
        <span className="text-[9px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">
          Owner
        </span>
      )}
      {!author.is_owner && author.is_admin && (
        <span className="text-[9px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded-full">
          Admin
        </span>
      )}
    </span>
  );
}

function CommentInput({
  placeholder,
  onSubmit,
  onCancel,
  autoFocus = false,
}: {
  placeholder: string;
  onSubmit: (text: string) => Promise<void>;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    try {
      await onSubmit(trimmed);
      setText("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-none rounded-lg border border-[color:var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-indigo-500/60 transition-colors"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit();
        }}
      />
      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={!text.trim() || loading}
          className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[12px] font-semibold transition-colors"
        >
          {loading ? "Yuborilmoqda..." : "Yuborish"}
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Bekor
          </button>
        )}
        <span className="ml-auto text-[10px] text-[var(--text-muted)]">Ctrl+Enter</span>
      </div>
    </div>
  );
}

function CommentItem({
  comment,
  slug,
  currentUserId,
  isAdmin,
  onRefresh,
  depth = 0,
}: {
  comment: Comment;
  slug: string;
  currentUserId: number | null;
  isAdmin: boolean;
  onRefresh: () => void;
  depth?: number;
}) {
  const [replying, setReplying] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [localLiked, setLocalLiked] = useState(comment.liked_by_me);
  const [localLikes, setLocalLikes] = useState(comment.likes);

  const canDelete = currentUserId === comment.author.id || isAdmin;

  async function handleLike() {
    if (!currentUserId || likeLoading) return;
    setLikeLoading(true);
    try {
      const res = await commentsApi.toggleLike(comment.id);
      setLocalLiked(res.liked);
      setLocalLikes(res.likes);
    } catch {
      // ignore
    } finally {
      setLikeLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Bu fikrni o'chirishni tasdiqlaysizmi?")) return;
    try {
      await commentsApi.deleteComment(comment.id);
      onRefresh();
    } catch {
      // ignore
    }
  }

  async function handleReply(text: string) {
    await commentsApi.createComment(slug, text, comment.id);
    setReplying(false);
    onRefresh();
  }

  return (
    <div className={depth > 0 ? "ml-8 border-l border-[color:var(--border)] pl-4" : ""}>
      <div className="flex gap-2.5 py-3">
        <Avatar author={comment.author} size={depth > 0 ? 24 : 30} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <AuthorBadge author={comment.author} />
            <span className="text-[11px] text-[var(--text-muted)]">{timeAgo(comment.created_at)}</span>
          </div>
          <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap break-words">
            {comment.content}
          </p>
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={handleLike}
              disabled={!currentUserId || likeLoading}
              className={[
                "flex items-center gap-1 text-[11px] transition-colors",
                localLiked
                  ? "text-rose-400"
                  : "text-[var(--text-muted)] hover:text-rose-400 disabled:cursor-default",
              ].join(" ")}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill={localLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              <span>{localLikes}</span>
            </button>
            {depth === 0 && currentUserId && (
              <button
                onClick={() => setReplying((v) => !v)}
                className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                Javob berish
              </button>
            )}
            {canDelete && (
              <button
                onClick={handleDelete}
                className="text-[11px] text-[var(--text-muted)] hover:text-red-400 transition-colors ml-auto"
              >
                O'chirish
              </button>
            )}
          </div>
          {replying && (
            <div className="mt-3">
              <CommentInput
                placeholder={`@${comment.author.username} ga javob...`}
                onSubmit={handleReply}
                onCancel={() => setReplying(false)}
                autoFocus
              />
            </div>
          )}
        </div>
      </div>
      {comment.replies.map((reply) => (
        <CommentItem
          key={reply.id}
          comment={reply}
          slug={slug}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onRefresh={onRefresh}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

export default function DiscussionTab({ slug }: { slug: string }) {
  const { user, isAdmin } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentUserId = user?.id ?? null;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await commentsApi.getComments(slug);
      setComments(data);
    } catch {
      setError("Muhokamani yuklashda xato yuz berdi");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (slug) load();
  }, [slug]);

  async function handleNewComment(text: string) {
    await commentsApi.createComment(slug, text, null);
    load();
  }

  const total = comments.reduce((s, c) => s + 1 + c.replies.length, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--text-muted)] text-[13px]">
        Yuklanmoqda...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <p className="text-[13px] text-red-400">{error}</p>
        <button onClick={load} className="text-[12px] text-indigo-400 hover:text-indigo-300">
          Qayta urinish
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto px-4">
        {/* New comment box */}
        {user ? (
          <div className="py-4 border-b border-[color:var(--border)]">
            <div className="flex gap-2.5">
              <Avatar author={{ id: currentUserId!, username: user.username, display_name: user.display_name, avatar_url: user.avatar_url, is_admin: isAdmin, is_owner: false }} size={30} />
              <div className="flex-1">
                <CommentInput
                  placeholder="Fikringizni yozing... (kod, tahlil, savol)"
                  onSubmit={handleNewComment}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="py-4 border-b border-[color:var(--border)] text-center text-[13px] text-[var(--text-muted)]">
            Fikr qoldirish uchun{" "}
            <a href="/login" className="text-indigo-400 hover:text-indigo-300">
              kiring
            </a>
          </div>
        )}

        {/* Comment count */}
        <div className="py-3 text-[12px] text-[var(--text-muted)]">
          {total > 0 ? `${total} ta fikr` : "Hali fikr yo'q — birinchi bo'ling!"}
        </div>

        {/* Comments list */}
        <div className="divide-y divide-[color:var(--border)]">
          {comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              slug={slug}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              onRefresh={load}
            />
          ))}
        </div>

        <div className="h-6" />
      </div>
    </div>
  );
}
