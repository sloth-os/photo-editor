import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Globe,
  Heart,
  MessageCircle,
  Upload,
  Download,
  Search,
  LogOut,
  WifiOff,
  Trash2,
  ArrowUpRight,
  LoaderCircle,
} from "lucide-react";
import { Modal } from "./ui";
import { download, validateRecipe, type Recipe } from "../lib/files";
import { loadCommunity, saveCommunity } from "../lib/storage";

type Look = {
  id: number | string;
  name: string;
  username: string;
  description: string;
  tags: string[];
  recipe: Recipe;
  thumbnail?: string;
  likes: number;
  liked?: boolean;
  comments?: number;
  user_id?: number;
};
type Settings = {
  url: string;
  token?: string;
  user?: { id: number; username: string };
};
type Queued = {
  clientId: string;
  owner: number;
  name: string;
  description: string;
  tags: string[];
  recipe: Recipe;
  thumbnail: string;
};
type Comment = {
  id: number;
  text: string;
  username: string;
  created_at: number;
};
function normalizeService(value: string) {
  const url = new URL(value.trim());
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  )
    throw new Error(
      "Use an HTTPS community address, or a local development server.",
    );
  if (url.username || url.password || url.search || url.hash)
    throw new Error(
      "Use the community base address without credentials, query, or fragment.",
    );
  return url.href.replace(/\/$/, "");
}

export default function CommunityStudio({
  onClose,
  onApply,
  current,
  getPreview,
  fallback,
}: {
  onClose: () => void;
  onApply: (recipe: Recipe) => void;
  current: Recipe;
  getPreview: () => string;
  fallback: string;
}) {
  const [settings, setSettings] = useState<Settings>({ url: "" }),
    [address, setAddress] = useState(""),
    [feed, setFeed] = useState<Look[]>([]),
    [bundled, setBundled] = useState<Look[]>([]),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState(""),
    [account, setAccount] = useState(false),
    [register, setRegister] = useState(false),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [publishing, setPublishing] = useState(false),
    [name, setName] = useState(current.name || "My new look"),
    [description, setDescription] = useState(""),
    [tags, setTags] = useState(""),
    [outbox, setOutbox] = useState<Queued[]>([]),
    [comments, setComments] = useState<{ look: Look; items: Comment[] } | null>(
      null,
    ),
    [comment, setComment] = useState("");
  const latest = useRef(settings);
  latest.current = settings;
  const pending = useRef(outbox);
  pending.current = outbox;
  const initialized = useRef(false);
  async function api(
    path: string,
    options: RequestInit = {},
    config = latest.current,
  ) {
    if (!config.url) throw new Error("Connect a community service first.");
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const res = await fetch(config.url + path, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
        },
      });
      const body = await res.json();
      if (!res.ok)
        throw new Error(
          body.error ||
            "The community service could not complete this request.",
        );
      return body;
    } finally {
      clearTimeout(timer);
    }
  }
  async function storeSettings(next: Settings) {
    await saveCommunity("settings", next);
    setSettings(next);
    latest.current = next;
    setAddress(next.url);
  }
  async function refresh(config = latest.current) {
    setBusy("Finding new perspectives…");
    try {
      const data = await api(
        `/api/looks?q=${encodeURIComponent(query)}`,
        {},
        config,
      );
      const looks: Look[] = data.looks.map((item: Look) => ({
        ...item,
        recipe: validateRecipe(item.recipe),
      }));
      setFeed(looks);
      await saveCommunity("feed", looks);
      setMessage("Community collection updated.");
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "The community is unavailable. Your cached collection is still here.",
      );
    } finally {
      setBusy("");
    }
  }
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [config, cached, queued, response] = await Promise.all([
          loadCommunity<Settings>("settings"),
          loadCommunity<Look[]>("feed"),
          loadCommunity<Queued[]>("outbox"),
          fetch(`${import.meta.env.BASE_URL}discover.json`),
        ]);
        if (cancelled) return;
        if (config) {
          setSettings(config);
          latest.current = config;
          setAddress(config.url);
        }
        if (cached)
          setFeed(
            cached.map((item) => ({
              ...item,
              recipe: validateRecipe(item.recipe),
            })),
          );
        if (queued) setOutbox(queued);
        if (response.ok) {
          const catalog = await response.json();
          if (!cancelled)
            setBundled(
              catalog.looks.map((item: Look) => ({
                ...item,
                recipe: validateRecipe(item.recipe),
              })),
            );
        }
      } catch {
        if (!cancelled)
          setMessage("Some saved community data could not be loaded.");
      }
      initialized.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  async function flush() {
    if (!latest.current.user || !navigator.onLine) return;
    const remaining = [...pending.current];
    let sent = 0;
    for (const item of pending.current) {
      if (item.owner !== latest.current.user.id) continue;
      try {
        await api("/api/looks", { method: "POST", body: JSON.stringify(item) });
        remaining.splice(
          remaining.findIndex((q) => q.clientId === item.clientId),
          1,
        );
        sent++;
      } catch {
        break;
      }
    }
    await saveCommunity("outbox", remaining);
    setOutbox(remaining);
    pending.current = remaining;
    if (sent) {
      setMessage(`${sent} queued look${sent > 1 ? "s" : ""} shared.`);
      await refresh();
    }
  }
  useEffect(() => {
    const online = () => void flush();
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, []);
  async function connect() {
    setBusy("Connecting…");
    setMessage("");
    try {
      const url = normalizeService(address),
        next: Settings = url === settings.url ? { ...settings } : { url };
      await api("/api/health", {}, next);
      if (url !== settings.url) {
        delete next.token;
        delete next.user;
      }
      await storeSettings(next);
      await refresh(next);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not connect.");
    } finally {
      setBusy("");
    }
  }
  async function authenticate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(register ? "Creating your account…" : "Signing in…");
    try {
      const auth = await api(`/api/auth/${register ? "register" : "login"}`, {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      await storeSettings({ ...settings, ...auth });
      setPassword("");
      setAccount(false);
      setMessage(`Welcome, ${auth.user.username}.`);
      await refresh({ ...settings, ...auth });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy("");
    }
  }
  async function publish(e: React.FormEvent) {
    e.preventDefault();
    if (!settings.user) return;
    setBusy("Sharing your look…");
    const item: Queued = {
      clientId: crypto.randomUUID(),
      owner: settings.user.id,
      name: name.trim(),
      description,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      recipe: { ...current, name: name.trim() },
      thumbnail: getPreview(),
    };
    try {
      if (!navigator.onLine) {
        const next = [...outbox, item];
        await saveCommunity("outbox", next);
        setOutbox(next);
        pending.current = next;
        setMessage(
          "Saved to your outbox. This reviewed look will share when you reconnect.",
        );
      } else {
        await api("/api/looks", { method: "POST", body: JSON.stringify(item) });
        await refresh();
        setMessage("Your look is now part of the community.");
      }
      setPublishing(false);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not share this look.");
    } finally {
      setBusy("");
    }
  }
  const visible = (settings.url ? feed : bundled).filter((look) =>
    `${look.name} ${look.username} ${look.description} ${look.tags.join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  async function like(look: Look) {
    if (!settings.user) {
      setAccount(true);
      return;
    }
    try {
      const result = await api(`/api/looks/${look.id}/like`, {
        method: "POST",
      });
      setFeed((items) =>
        items.map((item) =>
          item.id === look.id ? { ...item, ...result } : item,
        ),
      );
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Could not update this like.",
      );
    }
  }
  async function openComments(look: Look) {
    try {
      const result = await api(`/api/looks/${look.id}/comments`);
      setComments({ look, items: result.comments });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Comments are unavailable.");
    }
  }
  return (
    <Modal
      title="A fresh perspective, together."
      eyebrow="DISCOVER LOOKS"
      onClose={onClose}
      className="community-modal"
    >
      <div className="community-connection">
        <Globe size={18} />
        <div>
          <strong>
            {settings.url
              ? "Your community collection"
              : "The Still collection"}
          </strong>
          <p>
            {settings.url
              ? settings.url
              : "A curated collection, available offline. Connect your own community to share more."}
          </p>
        </div>
        {settings.user ? (
          <button
            className="text-button"
            onClick={async () => {
              try {
                await api("/api/auth/logout", { method: "POST" });
              } catch {}
              await storeSettings({ url: settings.url });
              setMessage("Signed out.");
            }}
          >
            <LogOut size={14} /> {settings.user.username}
          </button>
        ) : (
          settings.url && (
            <button
              className="secondary-button"
              onClick={() => setAccount((v) => !v)}
            >
              Sign in
            </button>
          )
        )}
      </div>
      <details className="community-settings">
        <summary>Connect a community service</summary>
        <div className="community-service">
          <label className="field-label" htmlFor="community-url">
            Community address
          </label>
          <div>
            <input
              id="community-url"
              className="text-input"
              type="url"
              value={address}
              placeholder="https://community.example.com"
              onChange={(e) => setAddress(e.target.value)}
            />
            <button
              className="secondary-button"
              disabled={!!busy}
              onClick={() => void connect()}
            >
              Connect
            </button>
          </div>
          <p>
            The optional community server is included with Still. Your original
            photo stays on-device; sharing publishes the look and a small
            preview.
          </p>
          {settings.url && (
            <button
              className="text-button"
              onClick={() => {
                void storeSettings({ url: "" });
                setFeed([]);
              }}
            >
              Use the offline collection
            </button>
          )}
        </div>
      </details>
      {message && (
        <div className="community-message" role="status">
          {message}
        </div>
      )}
      {account && (
        <form className="community-form" onSubmit={authenticate}>
          <h3>
            {register ? "Make a little place for yourself." : "Welcome back."}
          </h3>
          <label className="field-label" htmlFor="community-user">
            Username
          </label>
          <input
            id="community-user"
            className="text-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
            maxLength={32}
            autoComplete="username"
          />
          <label className="field-label" htmlFor="community-password">
            Password
          </label>
          <input
            id="community-password"
            className="text-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={10}
            maxLength={128}
            autoComplete={register ? "new-password" : "current-password"}
          />
          <div className="dialog-actions">
            <button
              type="button"
              className="text-button"
              onClick={() => setRegister((v) => !v)}
            >
              {register ? "Already have an account?" : "Create an account"}
            </button>
            <button className="primary-button" disabled={!!busy}>
              {register ? "Create account" : "Sign in"}
            </button>
          </div>
        </form>
      )}
      <div className="community-toolbar">
        <div className="search-field">
          <Search size={15} />
          <input
            aria-label="Search community looks"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a feeling…"
          />
        </div>
        {settings.url && (
          <button
            className="secondary-button"
            disabled={!!busy}
            onClick={() => void refresh()}
          >
            Refresh
          </button>
        )}
        <button
          className="primary-button"
          disabled={!current.edits.length || !settings.url}
          onClick={() => {
            if (!settings.user) setAccount(true);
            else setPublishing((v) => !v);
          }}
        >
          <Upload size={15} /> Share look
        </button>
      </div>
      {outbox.length > 0 && (
        <div className="community-outbox">
          <WifiOff size={15} />
          {outbox.length} look{outbox.length > 1 ? "s" : ""} waiting to share.
          <button className="text-button" onClick={() => void flush()}>
            Retry
          </button>
          <button
            className="text-button"
            onClick={async () => {
              await saveCommunity("outbox", []);
              setOutbox([]);
              pending.current = [];
            }}
          >
            Clear outbox
          </button>
        </div>
      )}
      {publishing && (
        <form className="community-form" onSubmit={publish}>
          <h3>Share a little of your style.</h3>
          <label className="field-label" htmlFor="community-name">
            Look name
          </label>
          <input
            id="community-name"
            className="text-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
          />
          <label className="field-label" htmlFor="community-description">
            A few words about it
          </label>
          <textarea
            id="community-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
          />
          <label className="field-label" htmlFor="community-tags">
            Tags, separated by commas
          </label>
          <input
            id="community-tags"
            className="text-input"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            maxLength={200}
          />
          <p className="analysis-note">
            Publishes the edit recipe and a small preview of your photo to the
            connected service.
          </p>
          <button className="primary-button full" disabled={!!busy}>
            <Upload size={15} /> Publish this look
          </button>
        </form>
      )}
      {busy && (
        <div className="community-loading" role="status">
          <LoaderCircle className="spin" size={15} />
          {busy}
        </div>
      )}
      <div className="community-grid">
        {visible.map((look) => (
          <article key={look.id} className="community-look">
            <div className="community-look-image">
              <img
                src={look.thumbnail || fallback}
                alt={`${look.name} preview`}
              />
              <button
                className="primary-button"
                onClick={() => onApply(validateRecipe(look.recipe))}
              >
                Try this look <ArrowUpRight size={14} />
              </button>
            </div>
            <div className="community-look-copy">
              <strong>{look.name}</strong>
              <span>by {look.username}</span>
              <p>{look.description}</p>
              <div className="community-tags">
                {look.tags.map((tag) => (
                  <small key={tag}>{tag}</small>
                ))}
              </div>
              <div className="community-look-actions">
                <button
                  aria-label={`Like ${look.name}`}
                  aria-pressed={!!look.liked}
                  disabled={!settings.url}
                  onClick={() => void like(look)}
                >
                  <Heart
                    size={14}
                    fill={look.liked ? "currentColor" : "none"}
                  />
                  {look.likes || 0}
                </button>
                <button
                  aria-label={`Comments on ${look.name}`}
                  disabled={!settings.url}
                  onClick={() => void openComments(look)}
                >
                  <MessageCircle size={14} />
                  {look.comments || 0}
                </button>
                <button
                  aria-label={`Download ${look.name}`}
                  onClick={() =>
                    download(
                      new Blob([JSON.stringify(look.recipe, null, 2)], {
                        type: "application/json",
                      }),
                      `${look.name.replace(/[^\w-]/g, "-")}.still.json`,
                    )
                  }
                >
                  <Download size={14} />
                </button>
                {look.user_id === settings.user?.id && (
                  <button
                    aria-label={`Remove shared ${look.name}`}
                    onClick={async () => {
                      try {
                        await api(`/api/looks/${look.id}`, {
                          method: "DELETE",
                        });
                        await refresh();
                      } catch (e) {
                        setMessage(
                          e instanceof Error
                            ? e.message
                            : "Could not remove this look.",
                        );
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
      {!visible.length && !busy && (
        <div className="empty-state">
          <Sparkles size={30} />
          <p>A fresh collection starts with you.</p>
          <span>Try a different search or share the first look.</span>
        </div>
      )}
      {comments && (
        <section className="community-comments">
          <div className="saved-looks-title">
            <h3>On {comments.look.name}</h3>
            <button className="text-button" onClick={() => setComments(null)}>
              Close comments
            </button>
          </div>
          {settings.user && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await api(`/api/looks/${comments.look.id}/comments`, {
                    method: "POST",
                    body: JSON.stringify({ text: comment }),
                  });
                  setComment("");
                  await openComments(comments.look);
                } catch (error) {
                  setMessage(
                    error instanceof Error
                      ? error.message
                      : "Could not post this comment.",
                  );
                }
              }}
            >
              <label className="field-label" htmlFor="community-comment">
                Your comment
              </label>
              <textarea
                id="community-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                required
                maxLength={2000}
              />
              <button className="secondary-button">Post comment</button>
            </form>
          )}
          {comments.items.map((c) => (
            <div key={c.id}>
              <strong>{c.username}</strong>
              <p>{c.text}</p>
            </div>
          ))}
        </section>
      )}
      <div className="modal-footnote">
        <Globe size={14} />
        {settings.url
          ? "Connected community · Original photos stay on your device."
          : "The Still collection is bundled for offline exploration."}
      </div>
    </Modal>
  );
}
