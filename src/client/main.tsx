import React, { useEffect, useState, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowLeft,
  Plus,
  Search,
  MapPin,
  Layers3,
  Route as RouteIcon,
  Smartphone,
  CheckCircle2,
  Download,
  LogOut,
  ChevronRight,
  Building2,
  Save,
  Users,
  Trash2,
  RefreshCw,
  X,
  Menu,
} from "lucide-react";
import QRCode from "qrcode";
import { api } from "./api";
import { LazyMapView as MapView } from "./LazyMapView";
import { Capture } from "./Capture";
import { CheckpointPrint } from "./CheckpointPrint";
import { draftOutdoorWalk, type ProcessingReport } from "../shared/processing";
import {
  emptyMap,
  sampleMap,
  mapSchema,
  route as findRoute,
  validateMap,
  localPosition,
  type CampusMap,
  type MapNode,
  type MapEdge,
} from "../shared/map";
import "./style.css";

type User = { id: string; name: string; email: string };
type Project = {
  id: string;
  name: string;
  college: string;
  location: string;
  version: number;
  map: CampusMap;
  role: string;
  updated_at: number;
};
function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">◈</span>
      <span>
        3d_College<small>CAMPUS STUDIO</small>
      </span>
    </div>
  );
}
function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
}) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const targets = () =>
      Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]",
        ) ?? [],
      );
    (
      dialog.current?.querySelector<HTMLElement>("input:not(:disabled)") ??
      targets()[0]
    )?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const elements = targets(),
        first = elements[0],
        last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      document.body.style.overflow = originalOverflow;
      previous?.focus();
    };
  }, []);
  return (
    <div className="modal-overlay" onClick={close}>
      <section
        ref={dialog}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
        }}
      >
        <div className="section-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={close}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function Auth({ onUser }: { onUser: (u: User) => void }) {
  const resetToken = new URLSearchParams(location.hash.slice(1)).get("reset");
  const [mode, setMode] = useState(resetToken ? "reset" : "login"),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="auth-layout">
      <div className="auth-story">
        <Brand />
        <div>
          <span className="eyebrow">EVERY PLACE. A CLEAR PATH.</span>
          <h1>
            A campus that
            <br />
            everyone can
            <br />
            <em>find their way in.</em>
          </h1>
          <p>
            Turn the places you know into a navigation experience everyone can
            use.
          </p>
          <div className="auth-path">
            <span>01 &nbsp; Map your campus</span>
            <span>02 &nbsp; Review in 3D</span>
            <span>03 &nbsp; Navigate offline</span>
          </div>
        </div>
        <small>Built for campuses of every shape and size.</small>
      </div>
      <main className="auth-form">
        <span className="eyebrow">WELCOME TO YOUR STUDIO</span>
        <h2>
          {mode === "register"
            ? "Make room for discovery."
            : mode === "recover"
              ? "Find your way back."
              : mode === "reset"
                ? "A fresh start."
                : "Good to see you again."}
        </h2>
        <p>
          {mode === "register"
            ? "Create an account to start mapping your college."
            : "Your campus projects, all in one place."}
        </p>
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        {message && (
          <div className="notice" role="status">
            {message}
          </div>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            setMessage("");
            const data = Object.fromEntries(new FormData(e.currentTarget));
            try {
              if (mode === "recover") {
                const r = await api("/auth/recover", "POST", data);
                setMessage(r.message);
              } else if (mode === "reset") {
                await api("/auth/reset", "POST", {
                  token: resetToken,
                  password: data.password,
                });
                history.replaceState(null, "", "/");
                setMode("login");
                setMessage("Password updated. Sign in with your new password.");
              } else onUser(await api(`/auth/${mode}`, "POST", data));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {mode === "register" && (
            <label>
              Your name
              <input
                name="name"
                required
                maxLength={160}
                autoComplete="name"
                placeholder="Full name"
              />
            </label>
          )}
          {mode !== "reset" && (
            <label>
              Email address
              <input
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                placeholder="you@college.edu"
              />
            </label>
          )}
          {mode !== "recover" && (
            <label>
              Password
              <input
                name="password"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                placeholder="At least 12 characters"
              />
            </label>
          )}
          <button className="primary wide" disabled={busy}>
            {busy
              ? "Please wait…"
              : mode === "register"
                ? "Create account"
                : mode === "recover"
                  ? "Send reset link"
                  : mode === "reset"
                    ? "Update password"
                    : "Sign in"}
            <ArrowUpRight size={18} />
          </button>
        </form>
        <div className="auth-links">
          <button
            onClick={() => {
              setError("");
              setMode(mode === "register" ? "login" : "register");
            }}
          >
            {mode === "register"
              ? "Already have an account? Sign in"
              : "New here? Create an account"}
          </button>
          {mode === "login" && (
            <button onClick={() => setMode("recover")}>Forgot password?</button>
          )}
        </div>
        <details>
          <summary>Connecting a phone?</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const value = String(
                new FormData(e.currentTarget).get("code"),
              ).trim();
              location.hash = `pair=${encodeURIComponent(value)}`;
              location.reload();
            }}
          >
            <label>
              Connection code
              <input name="code" required autoComplete="off" />
            </label>
            <button className="secondary">Connect to mapping session</button>
          </form>
        </details>
      </main>
    </div>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [projects, setProjects] = useState<Project[]>([]),
    [project, setProject] = useState<Project | null>(null),
    [projectDirty, setProjectDirty] = useState(false),
    [newProject, setNewProject] = useState(false),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [profile, setProfile] = useState(false);
  useEffect(() => {
    api("/auth/me")
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  const refresh = async () => setProjects(await api("/projects"));
  useEffect(() => {
    if (user) void refresh().catch((e) => setError(e.message));
  }, [user]);
  const perform = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (loading)
    return (
      <div className="loading">
        <Brand />
        <p>Opening your campus studio…</p>
      </div>
    );
  if (!user) return <Auth onUser={setUser} />;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">WORKSPACE</div>
        <button
          className={!project ? "nav-item active" : "nav-item"}
          onClick={() => {
            if (
              projectDirty &&
              !confirm(
                "Discard unsaved map changes and return to your campuses?",
              )
            )
              return;
            setProject(null);
            void perform(refresh);
          }}
        >
          <Layers3 size={18} /> My campuses <span>{projects.length}</span>
        </button>
        <div className="sidebar-note">
          <div className="mini-map">↗</div>
          <h3>
            From your first step
            <br />
            to their next discovery.
          </h3>
          <p>
            One connected map.
            <br />A more welcoming campus.
          </p>
        </div>
        <div className="account">
          <button
            className="avatar"
            aria-label="Edit profile"
            onClick={() => setProfile(true)}
          >
            {user.name[0].toUpperCase()}
          </button>
          <div>
            <strong>{user.name}</strong>
            <small>Campus creator</small>
          </div>
          <button
            className="icon-button"
            aria-label="Sign out"
            onClick={() =>
              void perform(async () => {
                await api("/auth/logout", "POST", {});
                setUser(null);
                setProject(null);
              })
            }
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <span>
            Workspace <ChevronRight size={14} />{" "}
            {project?.name ?? "My campuses"}
          </span>
          <span className="topbar-right">
            <span className="dot" />{" "}
            {project
              ? `Revision ${project.version} · ${project.role}`
              : "Your campus, connected"}
            <span className="avatar small-avatar">{user.name[0]}</span>
          </span>
        </header>
        {error && (
          <div role="alert" className="notice error global-error">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {project ? (
          <Studio
            key={project.id}
            initial={project}
            onProjectChange={setProject}
            onDirtyChange={setProjectDirty}
            busy={busy}
            perform={perform}
            onBack={() => {
              setProject(null);
              void perform(refresh);
            }}
          />
        ) : (
          <main className="dashboard">
            <div className="page-heading">
              <div>
                <span className="eyebrow">YOUR WORKSPACE</span>
                <h1>
                  Every campus starts
                  <br />
                  with a first step.
                </h1>
                <p>Create, map, and share a place worth exploring.</p>
              </div>
              <button className="primary" onClick={() => setNewProject(true)}>
                <Plus size={18} /> New campus
              </button>
            </div>
            <div className="welcome-banner">
              <div>
                <span className="eyebrow">A CLEARER WAY FORWARD</span>
                <h2>
                  Make your campus
                  <br />
                  feel familiar.
                </h2>
                <p>
                  Connect your phone. Walk your paths. Bring it all together in
                  3D.
                </p>
                <button
                  className="text-button"
                  onClick={() => setNewProject(true)}
                >
                  Start a campus project <ArrowUpRight size={17} />
                </button>
              </div>
              <div className="campus-illustration" aria-hidden="true">
                <div className="illus-ring" />
                <div className="illus-block a" />
                <div className="illus-block b" />
                <div className="illus-path" />
                <span className="illus-pin">
                  <MapPin size={22} />
                </span>
                <div className="illus-label">A place for every path.</div>
              </div>
            </div>
            <div className="section-heading">
              <div>
                <h2>
                  Your campuses <span className="count">{projects.length}</span>
                </h2>
                <p>Pick up where you left off.</p>
              </div>
              <label className="search">
                <Search size={17} />
                <input
                  aria-label="Search campuses"
                  placeholder="Search campuses…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            </div>
            <div className="project-grid">
              {projects
                .filter((p) =>
                  `${p.name} ${p.college}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((p) => (
                  <button
                    key={p.id}
                    className="project-card"
                    onClick={() =>
                      void perform(async () =>
                        setProject(await api(`/projects/${p.id}`)),
                      )
                    }
                  >
                    <div className="project-art">
                      <Building2 size={55} strokeWidth={1} />
                      <span className="pill">
                        {p.version ? `Revision ${p.version}` : "New project"}
                      </span>
                    </div>
                    <div className="project-info">
                      <span className="eyebrow">{p.college}</span>
                      <h3>
                        {p.name}
                        <ArrowUpRight size={18} />
                      </h3>
                      <p>
                        <MapPin size={14} />
                        {p.location || "Location not set"}
                      </p>
                      <footer>
                        Updated{" "}
                        {new Date(Number(p.updated_at)).toLocaleDateString()}{" "}
                        <span>{p.role}</span>
                      </footer>
                    </div>
                  </button>
                ))}
              <button
                className="new-project-card"
                onClick={() => setNewProject(true)}
              >
                <span className="plus-circle">
                  <Plus size={24} />
                </span>
                <h3>Your next campus</h3>
                <p>
                  Start with a name.
                  <br />
                  Build a world of directions.
                </p>
              </button>
            </div>
            <div className="workflow">
              <span className="eyebrow">FROM WALK TO WAYFINDING</span>
              <div>
                <span>01</span>
                <strong>Map on your phone</strong>
                <p>Capture paths and mark important places.</p>
              </div>
              <div>
                <span>02</span>
                <strong>Review every connection</strong>
                <p>Correct your map and explore it in 3D.</p>
              </div>
              <div>
                <span>03</span>
                <strong>Take your campus offline</strong>
                <p>Package verified maps for Android.</p>
              </div>
            </div>
          </main>
        )}
      </div>
      {newProject && (
        <Modal
          title="A new place to explore"
          close={() => setNewProject(false)}
        >
          <p>
            Create a dedicated space for this college’s map, team and navigation
            app.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const input = Object.fromEntries(new FormData(e.currentTarget));
              void perform(async () => {
                const p = await api("/projects", "POST", input);
                setProject(await api(`/projects/${p.id}`));
                setNewProject(false);
                await refresh();
              });
            }}
          >
            <label>
              College name
              <input
                name="college"
                required
                maxLength={160}
                placeholder="e.g. National Institute of Technology"
                autoFocus
              />
            </label>
            <label>
              Project name
              <input
                name="name"
                required
                maxLength={160}
                placeholder="e.g. Main campus"
              />
            </label>
            <label>
              Location
              <input
                name="location"
                maxLength={300}
                placeholder="City, state"
              />
            </label>
            <button className="primary wide" disabled={busy}>
              Create campus <ArrowUpRight size={18} />
            </button>
          </form>
        </Modal>
      )}
      {profile && (
        <Modal title="Your profile" close={() => setProfile(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = Object.fromEntries(new FormData(e.currentTarget));
              void perform(async () => {
                setUser(await api("/auth/profile", "PATCH", data));
                setProfile(false);
              });
            }}
          >
            <label>
              Name
              <input name="name" required defaultValue={user.name} />
            </label>
            <label>
              Email
              <input disabled value={user.email} />
            </label>
            <button className="primary" disabled={busy}>
              Save profile
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

type Performer = (fn: () => Promise<void>) => Promise<void>;
function Studio({
  initial,
  busy,
  perform,
  onBack,
  onProjectChange,
  onDirtyChange,
}: {
  initial: Project;
  busy: boolean;
  perform: Performer;
  onBack: () => void;
  onProjectChange: (project: Project) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [project, setProject] = useState(initial),
    [map, setMap] = useState(initial.map),
    [dirty, setDirty] = useState(false),
    [tab, setTab] = useState("map"),
    [floor, setFloor] = useState("all"),
    [editNode, setEditNode] = useState<MapNode | "new" | null>(null),
    [edgeModal, setEdgeModal] = useState<MapEdge | "new" | null>(null),
    [buildingModal, setBuildingModal] = useState<
      CampusMap["buildings"][number] | "new" | null
    >(null),
    [filter, setFilter] = useState(""),
    [pair, setPair] = useState<any>(null),
    [qr, setQr] = useState(""),
    [sessions, setSessions] = useState<any[]>([]),
    [revisions, setRevisions] = useState<any[]>([]),
    [builds, setBuilds] = useState<any[]>([]),
    [members, setMembers] = useState<any[]>([]),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [accessible, setAccessible] = useState(false),
    [showRoute, setShowRoute] = useState(false),
    [notice, setNotice] = useState(""),
    [samples, setSamples] = useState<any[] | null>(null),
    [loopCandidates, setLoopCandidates] = useState<
      ProcessingReport["loopCandidates"]
    >([]),
    [metadata, setMetadata] = useState(false);
  const [originModal, setOriginModal] = useState(false);
  const [checkpointRevision, setCheckpointRevision] = useState<string | null>(
    null,
  );
  const base = `/projects/${project.id}`,
    canEdit = ["owner", "editor"].includes(project.role),
    canMap = ["owner", "editor", "mapper"].includes(project.role),
    canReview = ["owner", "editor", "reviewer"].includes(project.role);
  const update = (next: CampusMap) => {
    setMap(next);
    setDirty(true);
    setShowRoute(false);
  };
  const currentMap = useRef(map);
  currentMap.current = map;
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  const issues = validateMap(map),
    errors = issues.filter((i) => i.severity === "error");
  const currentRoute = showRoute ? findRoute(map, from, to, accessible) : null;
  const refreshDetails = async () => {
    const [s, r, b, m] = await Promise.all([
      api(`${base}/mapping`),
      api(`${base}/revisions`),
      api(`${base}/builds`),
      api(`${base}/members`),
    ]);
    setSessions(s);
    setRevisions(r);
    setBuilds(b);
    setMembers(m);
  };
  useEffect(() => {
    void perform(refreshDetails);
  }, []);
  useEffect(() => {
    onProjectChange(project);
  }, [project, onProjectChange]);
  useEffect(() => {
    if (!dirty) return;
    const listener = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [dirty]);
  useEffect(() => {
    if (
      tab !== "review" ||
      !builds.some((b) => ["queued", "running"].includes(b.status))
    )
      return;
    const t = setInterval(
      () =>
        void api(`${base}/builds`)
          .then(setBuilds)
          .catch(() => {}),
      5000,
    );
    return () => clearInterval(t);
  }, [tab, builds]);
  const save = async () => {
    const result = await api(`${base}/map`, "PUT", {
      version: project.version,
      map,
    });
    setProject((p) => ({ ...p, map, version: result.version }));
    if (currentMap.current === map) setDirty(false);
    setNotice("Map saved. Review and publish when every path is verified.");
  };
  const selectNode = useCallback(
    (id: string) => {
      setFilter("");
      setTab("locations");
      setEditNode(map.nodes.find((n) => n.id === id) ?? null);
    },
    [map],
  );
  async function loadSamples(id: string) {
    let offset: number | null = 0;
    const all: any[] = [];
    while (offset !== null) {
      const page: { events: any[]; nextOffset: number | null } = await api(
        `${base}/mapping/${id}/samples?offset=${offset}`,
      );
      all.push(...page.events);
      offset = page.nextOffset;
    }
    setSamples(all);
  }
  return (
    <main className="studio">
      <div className="studio-heading">
        <div>
          <button
            className="back"
            onClick={() => {
              if (
                !dirty ||
                confirm("Leave this project and discard unsaved changes?")
              )
                onBack();
            }}
          >
            <ArrowLeft size={15} /> All campuses
          </button>
          <h1>{project.name}</h1>
          <p>
            {project.college} <span>·</span>{" "}
            {project.location || "Location not set"}{" "}
            {canEdit && (
              <button
                className="inline-button"
                onClick={() => setMetadata(true)}
              >
                Edit details
              </button>
            )}
          </p>
        </div>
        <div className="row">
          <span className={`save-status ${dirty ? "unsaved" : ""}`}>
            {dirty ? "Unsaved changes" : "All changes saved"}
          </span>
          {canEdit && (
            <button
              className="primary"
              disabled={!dirty || busy}
              onClick={() => void perform(save)}
            >
              <Save size={17} /> Save map
            </button>
          )}
        </div>
      </div>
      {notice && (
        <div className="notice success" role="status">
          {notice}
          <button aria-label="Dismiss message" onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}
      <nav className="tabs" aria-label="Project sections">
        {[
          ["map", "Campus map", Layers3],
          ["locations", "Locations & paths", MapPin],
          ["capture", "Mobile mapping", Smartphone],
          ["review", "Review & build", CheckCircle2],
          ["team", "Team", Users],
        ].map(([id, label, Icon]) => (
          <button
            key={String(id)}
            className={tab === id ? "selected" : ""}
            onClick={() => setTab(String(id))}
          >
            {React.createElement(Icon as typeof Layers3, { size: 17 })}
            {String(label)}
          </button>
        ))}
      </nav>
      {tab === "map" && (
        <>
          <div className="map-toolbar">
            <div className="row">
              <span className="pill">3D campus</span>
              <span className="muted">
                {map.nodes.length} locations · {map.edges.length} connections
              </span>
            </div>
            <div className="row">
              <label className="inline-label">
                Floor
                <select
                  value={floor}
                  onChange={(e) => setFloor(e.target.value)}
                >
                  <option value="all">All floors</option>
                  {Array.from(new Set([0, ...map.nodes.map((n) => n.floor)]))
                    .sort((a, b) => a - b)
                    .map((f) => (
                      <option key={f} value={f}>
                        {f === 0 ? "Ground floor" : `Floor ${f}`}
                      </option>
                    ))}
                </select>
              </label>
              {canEdit && (
                <button
                  className="secondary compact"
                  onClick={() => setBuildingModal("new")}
                >
                  <Building2 size={16} /> Add building
                </button>
              )}
            </div>
          </div>
          <MapView
            map={map}
            floor={floor}
            route={currentRoute}
            onSelect={selectNode}
          />
          <div className="map-bottom">
            <div>
              <span className="dot" />{" "}
              {map.buildings.some((b) => b.geometry === "simplified")
                ? "Simplified building geometry"
                : "User-defined campus geometry"}{" "}
              <span className="muted">
                · Positions require on-site confirmation
              </span>
            </div>
            {!map.nodes.length && canEdit && (
              <button
                className="text-button"
                onClick={() => {
                  update(sampleMap());
                  setNotice(
                    "Example campus loaded. This is fictional geometry; every location and path remains unconfirmed.",
                  );
                }}
              >
                Explore circular campus example <ArrowUpRight size={16} />
              </button>
            )}
          </div>
          <div className="row">
            {canEdit && (
              <button
                className="text-button"
                onClick={() => setOriginModal(true)}
              >
                {map.origin ? "Edit campus origin" : "Set campus origin"}
              </button>
            )}
            {map.origin && (
              <a
                className="text-button"
                target="_blank"
                rel="noopener noreferrer"
                href={`https://www.google.com/maps/@?api=1&map_action=map&center=${encodeURIComponent(`${map.origin.latitude},${map.origin.longitude}`)}&zoom=18&basemap=satellite`}
              >
                Open Google satellite reference <ArrowUpRight size={15} />
              </a>
            )}
            <span className="muted">
              Satellite reference stays online; it is not included in campus
              packages.
            </span>
          </div>
          <section className="panel route-panel">
            <div>
              <span className="eyebrow">TRY A JOURNEY</span>
              <h2>From here to anywhere.</h2>
              <p>
                Choose a known starting point. Live indoor positioning is not
                enabled.
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setShowRoute(true);
              }}
            >
              <label>
                Starting location
                <select
                  required
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setShowRoute(false);
                  }}
                >
                  <option value="">Choose where you are</option>
                  {map.nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Destination
                <select
                  required
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setShowRoute(false);
                  }}
                >
                  <option value="">Choose a destination</option>
                  {map.nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name}
                      {n.aliases.length ? ` (${n.aliases.join(", ")})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={accessible}
                  onChange={(e) => {
                    setAccessible(e.target.checked);
                    setShowRoute(false);
                  }}
                />{" "}
                Step-free route
              </label>
              <button className="primary">
                Find route <RouteIcon size={16} />
              </button>
            </form>
            {showRoute &&
              (currentRoute ? (
                <div className="directions">
                  <strong>
                    {Math.round(currentRoute.distance)} metres ·{" "}
                    {currentRoute.edges.length} connections
                  </strong>
                  {errors.length > 0 && (
                    <p className="warning-text">
                      Preview only — this map has not passed validation.
                    </p>
                  )}
                  <ol>
                    {currentRoute.instructions.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </div>
              ) : (
                <div className="notice error">
                  No {accessible ? "step-free " : ""}route connects these
                  locations.
                </div>
              ))}
          </section>
        </>
      )}
      {tab === "locations" && (
        <>
          <div className="section-heading">
            <div>
              <h2>Places that make your campus.</h2>
              <p>
                Coordinates are metres east and north of your campus origin.
              </p>
            </div>
            {canEdit && (
              <div className="row">
                <button
                  className="secondary"
                  onClick={() => setEdgeModal("new")}
                >
                  Connect locations
                </button>
                <button className="primary" onClick={() => setEditNode("new")}>
                  <Plus size={17} /> Add location
                </button>
              </div>
            )}
          </div>
          <label className="search full-search">
            <Search size={17} />
            <input
              placeholder="Search names or nicknames…"
              aria-label="Search locations"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </label>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Location</th>
                  <th>Building / floor</th>
                  <th>Position</th>
                  <th>Verification</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {map.nodes
                  .filter((n) =>
                    `${n.name} ${n.aliases.join(" ")}`
                      .toLowerCase()
                      .includes(filter.toLowerCase()),
                  )
                  .map((n) => (
                    <tr key={n.id}>
                      <td>
                        <strong>{n.name}</strong>
                        <small>{n.aliases.join(" · ") || n.category}</small>
                      </td>
                      <td>
                        {map.buildings.find((b) => b.id === n.buildingId)
                          ?.name ?? "Outdoors"}
                        <small>Floor {n.floor}</small>
                      </td>
                      <td>
                        {n.x.toFixed(1)}, {n.y.toFixed(1)} m
                      </td>
                      <td>
                        <span
                          className={`pill ${n.confirmed ? "verified" : "pending"}`}
                        >
                          {n.confirmed ? "Confirmed" : "Needs review"}
                        </span>
                      </td>
                      <td>
                        {canEdit && (
                          <button
                            className="inline-button"
                            onClick={() => setEditNode(n)}
                          >
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!map.nodes.length && (
              <div className="empty-state">
                <MapPin size={30} />
                <h3>Your first landmark is waiting.</h3>
                <p>Add a gate or entrance to begin your campus network.</p>
              </div>
            )}
          </div>
          <div className="section-heading">
            <div>
              <h2>Walking connections</h2>
              <p>
                Connect paths into loops, intersections and floor transitions.
              </p>
            </div>
          </div>
          <div className="connection-list">
            {map.edges.map((e) => (
              <div key={e.id}>
                <RouteIcon size={18} />
                <span>
                  <strong>
                    {map.nodes.find((n) => n.id === e.from)?.name ??
                      "Missing location"}{" "}
                    →{" "}
                    {map.nodes.find((n) => n.id === e.to)?.name ??
                      "Missing location"}
                  </strong>
                  <small>
                    {e.distance} m · {e.kind} ·{" "}
                    {e.bidirectional ? "Both directions" : "One way"} ·{" "}
                    {e.accessible ? "Step-free" : "Not step-free"}
                  </small>
                </span>
                {canEdit && (
                  <>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={e.confirmed}
                        onChange={(event) =>
                          update({
                            ...map,
                            edges: map.edges.map((edge) =>
                              edge.id === e.id
                                ? { ...edge, confirmed: event.target.checked }
                                : edge,
                            ),
                          })
                        }
                      />{" "}
                      Verified
                    </label>
                    <button
                      className="inline-button"
                      onClick={() => setEdgeModal(e)}
                    >
                      Edit
                    </button>
                    <button
                      className="icon-button danger"
                      aria-label="Delete connection"
                      onClick={() =>
                        update({
                          ...map,
                          edges: map.edges.filter((edge) => edge.id !== e.id),
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
          <section className="panel">
            <div className="section-heading">
              <h2>Buildings & floors</h2>
              {canEdit && (
                <button
                  className="secondary compact"
                  onClick={() => setBuildingModal("new")}
                >
                  Add building
                </button>
              )}
            </div>
            {map.buildings.map((b) => (
              <div className="sample-row" key={b.id}>
                <span>
                  <strong>{b.name}</strong>
                  <small>
                    {b.floors} floors · {b.floorHeight} m per floor ·{" "}
                    {b.geometry} geometry
                  </small>
                </span>
                {canEdit && (
                  <div className="row">
                    <button
                      className="inline-button"
                      onClick={() => setBuildingModal(b)}
                    >
                      Edit
                    </button>
                    <button
                      className="icon-button danger"
                      aria-label={`Delete ${b.name}`}
                      onClick={() =>
                        void perform(async () => {
                          if (map.nodes.some((n) => n.buildingId === b.id))
                            throw new Error(
                              "Move this building’s locations to another building before deleting it.",
                            );
                          update({
                            ...map,
                            buildings: map.buildings.filter(
                              (building) => building.id !== b.id,
                            ),
                          });
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </section>
        </>
      )}
      {tab === "capture" && (
        <>
          <div className="split-panel">
            <div className="panel">
              <span className="eyebrow">TAKE THE STUDIO WITH YOU</span>
              <h2>
                Your phone.
                <br />
                Your paths. Your campus.
              </h2>
              <p>
                Connect a phone’s browser with a single-use QR code. Record your
                outdoor position, available motion sensors, floor changes and
                named landmarks.
              </p>
              <ul className="check-list">
                <li>
                  <CheckCircle2 size={16} /> No mapping app installation
                </li>
                <li>
                  <CheckCircle2 size={16} /> Measurements saved on the phone
                  before upload
                </li>
                <li>
                  <CheckCircle2 size={16} /> Review and correct positions before
                  publishing
                </li>
              </ul>
              {canMap && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      const p = await api(`${base}/mapping`, "POST", {});
                      setPair(p);
                      setQr(
                        await QRCode.toDataURL(p.url, {
                          width: 240,
                          margin: 2,
                        }),
                      );
                      await refreshDetails();
                    })
                  }
                >
                  <Smartphone size={17} /> Connect a phone
                </button>
              )}
            </div>
            <div className="panel pairing">
              {pair ? (
                <>
                  <img
                    src={qr}
                    width="220"
                    height="220"
                    alt="QR code to connect a phone to this mapping session"
                  />
                  <h3>Scan to start your walk.</h3>
                  <p>
                    Single use · Expires at{" "}
                    {new Date(pair.expiresAt).toLocaleTimeString()}
                  </p>
                  <details>
                    <summary>Use a connection code instead</summary>
                    <code className="connection-code">{pair.token}</code>
                  </details>
                  <a className="text-button" href={pair.url}>
                    Open mapping on this device <ArrowUpRight size={15} />
                  </a>
                  <p className="fine-print">
                    A phone needs a reachable HTTPS address. A localhost link
                    works only on this computer.
                  </p>
                </>
              ) : (
                <>
                  <div className="pair-placeholder">
                    <Smartphone size={58} strokeWidth={1} />
                  </div>
                  <h3>Ready when you are.</h3>
                  <p>Generate a QR code to connect your phone.</p>
                </>
              )}
            </div>
          </div>
          <div className="section-heading">
            <h2>Mapping sessions</h2>
            <button
              className="secondary compact"
              onClick={() => void perform(refreshDetails)}
            >
              <RefreshCw size={15} /> Refresh
            </button>
          </div>
          <div className="connection-list">
            {sessions.map((s) => (
              <div key={s.id}>
                <Smartphone size={20} />
                <span>
                  <strong>
                    {new Date(Number(s.created_at)).toLocaleString()}
                  </strong>
                  <small>
                    {s.sample_count} measurements · {s.status}
                  </small>
                </span>
                <button
                  className="inline-button"
                  onClick={() => void perform(() => loadSamples(s.id))}
                >
                  Review measurements
                </button>
                {canMap && s.status !== "finished" && (
                  <button
                    className="inline-button"
                    onClick={() =>
                      void perform(async () => {
                        const next = await api(
                          `${base}/mapping/${s.id}/reconnect`,
                          "POST",
                          {},
                        );
                        setPair(next);
                        setQr(
                          await QRCode.toDataURL(next.url, {
                            width: 240,
                            margin: 2,
                          }),
                        );
                        await refreshDetails();
                        setNotice(
                          "Reconnect this same phone to resume its saved measurement queue. The previous device connection has been revoked.",
                        );
                      })
                    }
                  >
                    Reconnect
                  </button>
                )}
                {canEdit && s.status !== "finished" && (
                  <button
                    className="inline-button danger"
                    onClick={() =>
                      void perform(async () => {
                        await api(`${base}/mapping/${s.id}/revoke`, "POST", {});
                        await refreshDetails();
                      })
                    }
                  >
                    End session
                  </button>
                )}
              </div>
            ))}
          </div>
          {samples && (
            <section className="panel">
              <h2>Captured landmarks</h2>
              {canEdit && (
                <button
                  className="secondary"
                  onClick={() =>
                    void perform(async () => {
                      if (
                        !confirm(
                          "Draft paths only from outdoor GPS? Indoor and low-accuracy measurements will require manual placement. No positions or connections will be marked verified.",
                        )
                      )
                        return;
                      const result = draftOutdoorWalk(map, samples);
                      update(mapSchema.parse(result.map));
                      setLoopCandidates(result.loopCandidates);
                      setNotice(
                        `Drafted ${result.accepted} outdoor locations. ${result.rejected} measurements excluded; ${result.landmarksNeedingPlacement} landmarks need manual placement. ${result.loopCandidates.length} possible loop closures need review in Locations & paths. Every drafted path remains unverified and not marked step-free.`,
                      );
                    })
                  }
                >
                  Draft paths from outdoor GPS
                </button>
              )}
              {!!loopCandidates.length && (
                <details>
                  <summary>
                    {loopCandidates.length} possible loop closures — inspect
                    before connecting
                  </summary>
                  {loopCandidates.slice(0, 30).map((candidate, i) => (
                    <div className="sample-row" key={i}>
                      <span>
                        {map.nodes.find((n) => n.id === candidate.from)?.name} ↔{" "}
                        {map.nodes.find((n) => n.id === candidate.to)?.name}
                        <small>
                          {candidate.separation.toFixed(1)} m apart; GPS
                          uncertainty may exceed this distance.
                        </small>
                      </span>
                      <button
                        className="secondary compact"
                        disabled={map.edges.some(
                          (e) =>
                            (e.from === candidate.from &&
                              e.to === candidate.to) ||
                            (e.to === candidate.from &&
                              e.from === candidate.to),
                        )}
                        onClick={() =>
                          update({
                            ...map,
                            edges: [
                              ...map.edges,
                              {
                                id: crypto.randomUUID(),
                                from: candidate.from,
                                to: candidate.to,
                                kind: "path",
                                distance: Math.max(0.1, candidate.separation),
                                points: [],
                                accessible: false,
                                bidirectional: true,
                                confirmed: false,
                              },
                            ],
                          })
                        }
                      >
                        Add unverified connection
                      </button>
                    </div>
                  ))}
                </details>
              )}
              <p>
                GPS positions are estimates. Import them as unconfirmed
                locations, then check building, floor and position. Sensor
                samples are retained for later processing.
              </p>
              <p>
                {samples.length} measurements ·{" "}
                {samples.filter((s) => s.type === "landmark").length} landmarks
              </p>
              {samples
                .filter((s) => s.type === "landmark")
                .map((s) => (
                  <div className="sample-row" key={s.id}>
                    <span>
                      <strong>{s.name}</strong> · Floor {s.floor ?? 0}
                      <small>
                        {s.latitude === undefined
                          ? "No GPS position — place this landmark manually"
                          : `GPS ±${Math.round(s.accuracy ?? 0)} m`}
                      </small>
                    </span>
                    {canEdit && (
                      <button
                        className="secondary compact"
                        disabled={map.nodes.some((n) => n.id === s.id)}
                        onClick={() => {
                          if (s.latitude === undefined) {
                            setEditNode({
                              id: s.id,
                              name: s.name,
                              aliases: s.nickname ? [s.nickname] : [],
                              category: "Landmark",
                              x: 0,
                              y: 0,
                              buildingId: null,
                              floor: s.floor ?? 0,
                              confirmed: false,
                            });
                            return;
                          }
                          const origin = map.origin ?? {
                            latitude: s.latitude,
                            longitude: s.longitude,
                          };
                          const p = localPosition(
                            s.latitude,
                            s.longitude,
                            origin,
                          );
                          update({
                            ...map,
                            origin,
                            nodes: [
                              ...map.nodes,
                              {
                                id: s.id,
                                name: s.name,
                                aliases: s.nickname ? [s.nickname] : [],
                                category: "Landmark",
                                ...p,
                                buildingId: null,
                                floor: s.floor ?? 0,
                                confirmed: false,
                              },
                            ],
                          });
                        }}
                      >
                        Import for review
                      </button>
                    )}
                  </div>
                ))}
            </section>
          )}
        </>
      )}
      {tab === "review" && (
        <>
          <div className="stats">
            <div>
              <strong>{map.nodes.length}</strong>
              <span>Mapped locations</span>
            </div>
            <div>
              <strong>{map.edges.length}</strong>
              <span>Walking connections</span>
            </div>
            <div>
              <strong>{errors.length}</strong>
              <span>Items to resolve</span>
            </div>
            <div>
              <strong>{revisions.length}</strong>
              <span>Published revisions</span>
            </div>
          </div>
          <section className="panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">MAP READINESS</span>
                <h2>
                  {errors.length
                    ? "A few connections to make."
                    : "Ready for your final review."}
                </h2>
                <p>
                  Only publish a map after checking the locations and walking
                  routes on site.
                </p>
              </div>
              {canReview && (
                <button
                  className="primary"
                  disabled={busy || dirty || !!errors.length}
                  onClick={() =>
                    void perform(async () => {
                      await api(`${base}/revisions`, "POST", {
                        version: project.version,
                      });
                      await refreshDetails();
                      setNotice(
                        "Verified revision published. You can now export its campus data.",
                      );
                    })
                  }
                >
                  <CheckCircle2 size={17} /> Publish verified revision
                </button>
              )}
            </div>
            {dirty && (
              <p className="notice">Save your changes before publishing.</p>
            )}
            <div className="issue-list">
              {issues.map((i, index) => (
                <div key={index} className={i.severity}>
                  <span className="dot" />
                  {i.message}
                </div>
              ))}
              {!issues.length && (
                <div className="success">
                  <CheckCircle2 size={18} /> Structural checks passed. This does
                  not replace on-site accuracy testing.
                </div>
              )}
            </div>
          </section>
          <section className="panel">
            <h2>Published campus packages</h2>
            <p>
              Each package contains a fixed map revision for offline routing and
              3D rendering.
            </p>
            {revisions.map((r) => (
              <div className="sample-row" key={r.id}>
                <span>
                  <strong>Revision {r.version}</strong>
                  <small>
                    {new Date(Number(r.created_at)).toLocaleString()}
                  </small>
                </span>
                <div className="row">
                  <a
                    className="secondary compact"
                    href={`/api${base}/export/${r.id}`}
                  >
                    <Download size={15} /> Campus JSON
                  </a>
                  <button
                    className="secondary compact"
                    onClick={() => setCheckpointRevision(r.id)}
                  >
                    Location checkpoints
                  </button>
                  {canEdit && (
                    <>
                      <button
                        className="secondary compact"
                        disabled={busy}
                        onClick={() =>
                          void perform(async () => {
                            if (
                              !confirm(
                                "Restore this revision? Unsaved changes will be discarded.",
                              )
                            )
                              return;
                            await api(`${base}/restore`, "POST", {
                              revisionId: r.id,
                              version: project.version,
                            });
                            const p = await api(base);
                            setProject(p);
                            setMap(p.map);
                            setDirty(false);
                          })
                        }
                      >
                        Restore
                      </button>
                      <button
                        className="primary compact"
                        disabled={busy}
                        onClick={() =>
                          void perform(async () => {
                            await api(`${base}/builds`, "POST", {
                              revisionId: r.id,
                            });
                            await refreshDetails();
                          })
                        }
                      >
                        Build APK <ArrowUpRight size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {!revisions.length && (
              <p className="muted">No published revisions yet.</p>
            )}
          </section>
          <section className="panel">
            <h2>Android builds</h2>
            <p>
              Builds require an Android worker and configured release signing.
              Successful builds appear here for download.
            </p>
            {builds.map((b) => (
              <div className="sample-row" key={b.id}>
                <span>
                  <strong className="capitalize">{b.status}</strong>
                  <small>
                    {new Date(Number(b.created_at)).toLocaleString()}
                  </small>
                  {b.error && <p className="warning-text">{b.error}</p>}
                </span>
                {b.status === "succeeded" && (
                  <a
                    className="primary compact"
                    href={`/api${base}/builds/${b.id}/download`}
                  >
                    <Download size={15} /> Download APK
                  </a>
                )}
              </div>
            ))}
            {!builds.length && (
              <p className="muted">No APK builds have been requested.</p>
            )}
          </section>
          {canEdit && (
            <section className="panel">
              <h2>Import campus data</h2>
              <p>
                Import a map JSON or an exported campus package. Changes stay in
                your draft until saved.
              </p>
              <input
                type="file"
                aria-label="Import campus JSON"
                accept="application/json,.json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  void perform(async () => {
                    if (file.size > 8 * 1024 * 1024)
                      throw new Error("Map file is larger than 8 MB.");
                    const json = JSON.parse(await file.text());
                    const parsed = mapSchema.parse(json.map ?? json);
                    update(parsed);
                    setNotice(
                      "Map imported into your draft. Review the data before saving.",
                    );
                  });
                }}
              />
            </section>
          )}
        </>
      )}
      {tab === "team" && (
        <section className="panel">
          <span className="eyebrow">BETTER MAPS, TOGETHER</span>
          <h2>Your campus team</h2>
          <p>
            Owners manage access. Editors change maps. Mappers collect
            measurements. Reviewers publish verified revisions.
          </p>
          <div className="connection-list">
            {members.map((m) => (
              <div key={m.id}>
                <div className="avatar">{m.name[0]}</div>
                <span>
                  <strong>{m.name}</strong>
                  <small>{m.email}</small>
                </span>
                <span className="pill">{m.role}</span>
                {project.role === "owner" && m.role !== "owner" && (
                  <button
                    className="icon-button danger"
                    aria-label={`Remove ${m.name}`}
                    onClick={() =>
                      void perform(async () => {
                        await api(`${base}/members/${m.id}`, "DELETE", {});
                        await refreshDetails();
                      })
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {project.role === "owner" && (
            <form
              className="team-form"
              onSubmit={(e) => {
                e.preventDefault();
                const data = Object.fromEntries(new FormData(e.currentTarget));
                void perform(async () => {
                  await api(`${base}/members`, "POST", data);
                  await refreshDetails();
                  setNotice("Team access updated.");
                });
              }}
            >
              <label>
                Team member’s email
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="They must have a registered account"
                />
              </label>
              <label>
                Role
                <select name="role">
                  <option value="editor">Editor</option>
                  <option value="mapper">Mapper</option>
                  <option value="reviewer">Reviewer</option>
                </select>
              </label>
              <button className="primary" disabled={busy}>
                Add or update access
              </button>
            </form>
          )}
        </section>
      )}
      {editNode && canEdit && (
        <Modal
          title={editNode === "new" ? "Add a location" : "Edit location"}
          close={() => setEditNode(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              const n: MapNode = {
                id: editNode === "new" ? crypto.randomUUID() : editNode.id,
                name: String(d.get("name")),
                aliases: String(d.get("aliases"))
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
                category: String(d.get("category")),
                buildingId: String(d.get("buildingId")) || null,
                floor: Number(d.get("floor")),
                x: Number(d.get("x")),
                y: Number(d.get("y")),
                confirmed: d.get("confirmed") === "on",
              };
              update({
                ...map,
                nodes: [...map.nodes.filter((old) => old.id !== n.id), n],
              });
              setEditNode(null);
            }}
          >
            <label>
              Name
              <input
                name="name"
                required
                maxLength={160}
                defaultValue={editNode === "new" ? "" : editNode.name}
              />
            </label>
            <label>
              Nicknames <span>comma-separated</span>
              <input
                name="aliases"
                defaultValue={
                  editNode === "new" ? "" : editNode.aliases.join(", ")
                }
              />
            </label>
            <div className="form-grid">
              <label>
                Category
                <input
                  name="category"
                  list="categories"
                  required
                  defaultValue={editNode === "new" ? "Room" : editNode.category}
                />
                <datalist id="categories">
                  {[
                    "Gate",
                    "Entrance",
                    "Classroom",
                    "Laboratory",
                    "Office",
                    "Department",
                    "Canteen",
                    "Hostel",
                    "Shop",
                    "Staircase",
                    "Elevator",
                    "Corridor",
                    "Landmark",
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </datalist>
              </label>
              <label>
                Building
                <select
                  name="buildingId"
                  defaultValue={
                    editNode === "new" ? "" : (editNode.buildingId ?? "")
                  }
                >
                  <option value="">Outdoors</option>
                  {map.buildings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                East (m)
                <input
                  name="x"
                  type="number"
                  step="any"
                  required
                  min="-100000"
                  max="100000"
                  defaultValue={editNode === "new" ? "" : editNode.x}
                />
              </label>
              <label>
                North (m)
                <input
                  name="y"
                  type="number"
                  step="any"
                  required
                  min="-100000"
                  max="100000"
                  defaultValue={editNode === "new" ? "" : editNode.y}
                />
              </label>
              <label>
                Floor
                <input
                  name="floor"
                  type="number"
                  min="-10"
                  max="150"
                  required
                  defaultValue={editNode === "new" ? 0 : editNode.floor}
                />
              </label>
            </div>
            <label className="checkbox">
              <input
                name="confirmed"
                type="checkbox"
                defaultChecked={editNode !== "new" && editNode.confirmed}
              />{" "}
              I verified this location and its floor on site.
            </label>
            <div className="row">
              <button className="primary">Save location</button>
              {editNode !== "new" && (
                <button
                  type="button"
                  className="text-button danger"
                  onClick={() => {
                    update({
                      ...map,
                      nodes: map.nodes.filter((n) => n.id !== editNode.id),
                      edges: map.edges.filter(
                        (e) => e.from !== editNode.id && e.to !== editNode.id,
                      ),
                    });
                    setEditNode(null);
                  }}
                >
                  Delete location and its connections
                </button>
              )}
            </div>
          </form>
        </Modal>
      )}
      {edgeModal && (
        <Modal title="Connect two locations" close={() => setEdgeModal(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              void perform(async () => {
                const edge: MapEdge = {
                  id: edgeModal === "new" ? crypto.randomUUID() : edgeModal.id,
                  from: String(d.get("from")),
                  to: String(d.get("to")),
                  kind: String(d.get("kind")) as MapEdge["kind"],
                  distance: Number(d.get("distance")),
                  accessible: d.get("accessible") === "on",
                  bidirectional: d.get("bidirectional") === "on",
                  confirmed: d.get("confirmed") === "on",
                  points: String(d.get("points")).trim()
                    ? String(d.get("points"))
                        .trim()
                        .split("\n")
                        .map((line) => {
                          const [x, y] = line.split(",").map(Number);
                          return { x, y };
                        })
                    : [],
                };
                update(
                  mapSchema.parse({
                    ...map,
                    edges: [...map.edges.filter((e) => e.id !== edge.id), edge],
                  }),
                );
                setEdgeModal(null);
              });
            }}
          >
            <div className="form-grid">
              {["from", "to"].map((field) => (
                <label key={field} className="capitalize">
                  {field}
                  <select
                    name={field}
                    required
                    defaultValue={
                      edgeModal === "new"
                        ? ""
                        : edgeModal[field as "from" | "to"]
                    }
                  >
                    <option value="">Choose a location</option>
                    {map.nodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name} · Floor {n.floor}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <label>
                Connection type
                <select
                  name="kind"
                  defaultValue={edgeModal === "new" ? "path" : edgeModal.kind}
                >
                  <option value="path">Walking path</option>
                  <option value="stairs">Stairs</option>
                  <option value="elevator">Lift</option>
                  <option value="ramp">Ramp</option>
                </select>
              </label>
              <label>
                Measured distance (m)
                <input
                  name="distance"
                  defaultValue={edgeModal === "new" ? "" : edgeModal.distance}
                  type="number"
                  step="any"
                  min="0.1"
                  max="100000"
                  required
                />
              </label>
            </div>
            <label className="checkbox">
              <input
                name="bidirectional"
                type="checkbox"
                defaultChecked={edgeModal === "new" || edgeModal.bidirectional}
              />{" "}
              Walkable in both directions
            </label>
            <label className="checkbox">
              <input
                name="accessible"
                type="checkbox"
                defaultChecked={edgeModal !== "new" && edgeModal.accessible}
              />{" "}
              Step-free and accessible
            </label>
            <label className="checkbox">
              <input
                name="confirmed"
                type="checkbox"
                defaultChecked={edgeModal !== "new" && edgeModal.confirmed}
              />{" "}
              I checked this connection on site.
            </label>
            <p className="fine-print">
              Intermediate points follow the path from the first location to the
              second. Leave empty for a straight connection.
            </p>
            <label>
              Intermediate path points{" "}
              <span>east,north — one pair per line</span>
              <textarea
                name="points"
                rows={3}
                defaultValue={
                  edgeModal === "new"
                    ? ""
                    : edgeModal.points.map((p) => `${p.x},${p.y}`).join("\n")
                }
              />
            </label>
            <button className="primary">Save connection</button>
          </form>
        </Modal>
      )}
      {buildingModal && (
        <Modal
          title={
            buildingModal === "new"
              ? "Add a building footprint"
              : "Edit building footprint"
          }
          close={() => setBuildingModal(null)}
        >
          <p>
            Enter measured or reference coordinates. Simplified geometry is
            always labelled in the map.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              void perform(async () => {
                const footprint = String(d.get("footprint"))
                  .trim()
                  .split("\n")
                  .map((line) => {
                    const [x, y] = line.split(",").map(Number);
                    return { x, y };
                  });
                const next = mapSchema.parse({
                  ...map,
                  buildings: [
                    ...map.buildings.filter(
                      (b) =>
                        buildingModal === "new" || b.id !== buildingModal.id,
                    ),
                    {
                      id:
                        buildingModal === "new"
                          ? crypto.randomUUID()
                          : buildingModal.id,
                      name: d.get("name"),
                      footprint,
                      floors: Number(d.get("floors")),
                      floorHeight: Number(d.get("floorHeight")),
                      geometry: d.get("geometry"),
                    },
                  ],
                });
                update(next);
                setBuildingModal(null);
              });
            }}
          >
            <label>
              Building name
              <input
                name="name"
                required
                defaultValue={buildingModal === "new" ? "" : buildingModal.name}
              />
            </label>
            <div className="form-grid">
              <label>
                Number of floors
                <input
                  name="floors"
                  type="number"
                  min="1"
                  max="150"
                  defaultValue={
                    buildingModal === "new" ? 1 : buildingModal.floors
                  }
                  required
                />
              </label>
              <label>
                Floor height (m)
                <input
                  name="floorHeight"
                  type="number"
                  min="2"
                  max="10"
                  step="0.1"
                  defaultValue={
                    buildingModal === "new" ? 3.5 : buildingModal.floorHeight
                  }
                  required
                />
              </label>
            </div>
            <label>
              Geometry source
              <select
                name="geometry"
                defaultValue={
                  buildingModal === "new"
                    ? "simplified"
                    : buildingModal.geometry
                }
              >
                <option value="simplified">Simplified reference</option>
                <option value="measured">
                  Measured on site / surveyed plan
                </option>
              </select>
            </label>
            <label>
              Footprint vertices <span>east,north — one pair per line</span>
              <textarea
                name="footprint"
                defaultValue={
                  buildingModal === "new"
                    ? ""
                    : buildingModal.footprint
                        .map((p) => `${p.x},${p.y}`)
                        .join("\n")
                }
                rows={5}
                placeholder={"0,0\n30,0\n30,20\n0,20"}
                required
              />
            </label>
            <button className="primary">Save building</button>
          </form>
        </Modal>
      )}
      {metadata && (
        <Modal title="Campus details" close={() => setMetadata(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = Object.fromEntries(new FormData(e.currentTarget));
              void perform(async () => {
                await api(base, "PATCH", data);
                setProject((p) => ({ ...p, ...data }) as Project);
                setMetadata(false);
              });
            }}
          >
            <label>
              College
              <input name="college" required defaultValue={project.college} />
            </label>
            <label>
              Project name
              <input name="name" required defaultValue={project.name} />
            </label>
            <label>
              Location
              <input name="location" defaultValue={project.location} />
            </label>
            <button className="primary">Save details</button>
          </form>
        </Modal>
      )}
      {checkpointRevision && (
        <Modal
          title="Print location checkpoints"
          close={() => setCheckpointRevision(null)}
        >
          <CheckpointPrint
            projectId={project.id}
            revisionId={checkpointRevision}
          />
        </Modal>
      )}
      {originModal && (
        <Modal
          title="Campus coordinate origin"
          close={() => setOriginModal(false)}
        >
          <p>
            Set the geographic location of local coordinates (0, 0). Updating
            this reference does not move your existing local geometry.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              update({
                ...map,
                origin: {
                  latitude: Number(data.get("latitude")),
                  longitude: Number(data.get("longitude")),
                },
              });
              setOriginModal(false);
            }}
          >
            <label>
              Latitude
              <input
                name="latitude"
                type="number"
                step="any"
                min="-90"
                max="90"
                required
                defaultValue={map.origin?.latitude}
              />
            </label>
            <label>
              Longitude
              <input
                name="longitude"
                type="number"
                step="any"
                min="-180"
                max="180"
                required
                defaultValue={map.origin?.longitude}
              />
            </label>
            <button className="primary">Save origin</button>
          </form>
        </Modal>
      )}
    </main>
  );
}

const hashParams = new URLSearchParams(location.hash.slice(1));
createRoot(document.getElementById("root")!).render(
  hashParams.has("pair") || location.hash === "#capture" ? (
    <Capture pairToken={hashParams.get("pair") ?? undefined} />
  ) : (
    <App />
  ),
);
