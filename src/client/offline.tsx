import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { MapPin, Route as RouteIcon, Search } from "lucide-react";
import { route, type MapNode } from "../shared/map";
import { parseCampusPackage, type CampusPackage } from "../shared/package";
import { readCheckpoint } from "../shared/checkpoints";
import { LazyMapView as MapView } from "./LazyMapView";
import "./style.css";
const CheckpointScanner = lazy(() => import("./CheckpointScanner"));
function Navigator() {
  const [campus, setCampus] = useState<CampusPackage | null>(null),
    [error, setError] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [query, setQuery] = useState(""),
    [accessible, setAccessible] = useState(false),
    [floor, setFloor] = useState("all");
  const [scanner, setScanner] = useState(false),
    [checkpoint, setCheckpoint] = useState<MapNode | null>(null);
  useEffect(() => {
    fetch("./campus.json")
      .then((r) => {
        if (!r.ok) throw new Error("Campus package is missing.");
        return r.json();
      })
      .then((p) => setCampus(parseCampusPackage(p)))
      .catch((e) => setError(e.message));
  }, []);
  const result = useMemo(
    () =>
      campus && from && to ? route(campus.map, from, to, accessible) : null,
    [campus, from, to, accessible],
  );
  function scan(code: string) {
    setScanner(false);
    setCheckpoint(null);
    setError("");
    if (!campus) return;
    try {
      setCheckpoint(
        readCheckpoint(code, campus.projectId, campus.revision, campus.map),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <main className="offline-app">
      <div className="brand">
        <span className="brand-mark">◈</span>{" "}
        <span>{campus?.college ?? "Campus navigator"}</span>
      </div>
      <span className="eyebrow">YOUR CAMPUS · AVAILABLE OFFLINE</span>
      <h1>Where would you like to go?</h1>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {campus && (
        <>
          <p className="notice">
            Select your known starting location. This app does not automatically
            track your indoor position.
          </p>
          {campus.demonstration && (
            <p className="notice error">
              Demonstration campus — fictional locations, not for real-world
              navigation.
            </p>
          )}
          <details className="checkpoint-entry">
            <summary>Use a location checkpoint</summary>
            <p>
              Scan a posted checkpoint or enter its printed code. Confirm that
              you are physically at that location.
            </p>
            <button
              className="secondary"
              onClick={() => {
                setScanner(true);
                setError("");
              }}
            >
              Scan checkpoint QR
            </button>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                scan(String(new FormData(e.currentTarget).get("checkpoint")));
              }}
            >
              <label>
                Printed checkpoint code
                <input
                  name="checkpoint"
                  required
                  autoComplete="off"
                  placeholder="campus-location:1:…"
                />
              </label>
              <button className="secondary">Read checkpoint code</button>
            </form>
          </details>
          {scanner && (
            <Suspense fallback={<p>Opening scanner…</p>}>
              <CheckpointScanner
                onCode={scan}
                onClose={() => setScanner(false)}
              />
            </Suspense>
          )}
          {checkpoint && (
            <section className="notice">
              <span>
                Checkpoint: <strong>{checkpoint.name}</strong> · Floor{" "}
                {checkpoint.floor}
              </span>
              <button
                className="primary compact"
                onClick={() => {
                  setFrom(checkpoint.id);
                  setFloor(String(checkpoint.floor));
                  setCheckpoint(null);
                }}
              >
                I am at this location
              </button>
            </section>
          )}
          <label>
            <MapPin size={16} /> I am at
            <select value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="">Choose your current location</option>
              {campus.map.nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name} · Floor {n.floor}
                </option>
              ))}
            </select>
          </label>
          <label className="search">
            <Search size={17} />
            <input
              aria-label="Search destination"
              placeholder="Search rooms, nicknames, departments…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label>
            Destination
            <select value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">Choose a destination</option>
              {campus.map.nodes
                .filter((n) =>
                  `${n.name} ${n.aliases.join(" ")}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name} · Floor {n.floor}
                  </option>
                ))}
            </select>
          </label>
          <div className="row">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={accessible}
                onChange={(e) => setAccessible(e.target.checked)}
              />{" "}
              Step-free route
            </label>
            <label className="inline-label">
              View
              <select value={floor} onChange={(e) => setFloor(e.target.value)}>
                <option value="all">All floors</option>
                {Array.from(new Set(campus.map.nodes.map((n) => n.floor)))
                  .sort((a, b) => a - b)
                  .map((f) => (
                    <option key={f} value={f}>
                      Floor {f}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <MapView map={campus.map} route={result} floor={floor} />
          {from &&
            to &&
            (result ? (
              <section className="panel">
                <h2>
                  <RouteIcon size={20} /> {Math.round(result.distance)} metres
                  to your destination
                </h2>
                <ol className="directions">
                  {result.instructions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
                {"speechSynthesis" in window && (
                  <button
                    className="primary"
                    onClick={() => {
                      speechSynthesis.cancel();
                      speechSynthesis.speak(
                        new SpeechSynthesisUtterance(
                          result.instructions.join(" "),
                        ),
                      );
                    }}
                  >
                    Read directions aloud
                  </button>
                )}
              </section>
            ) : (
              <p className="notice error">
                No {accessible ? "step-free " : ""}route is available between
                these locations.
              </p>
            ))}
        </>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Navigator />);
