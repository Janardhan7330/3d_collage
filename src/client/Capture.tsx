import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  MapPin,
  Pause,
  Play,
  Radio,
  CheckCircle2,
} from "lucide-react";
import { api } from "./api";

type Event = {
  id: string;
  timestamp: number;
  type: string;
  [key: string]: unknown;
};
type Stored = Event & { sessionId: string };
let dbPromise: Promise<IDBDatabase>;
function database() {
  return (dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open("campus-capture", 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore("events", { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}
async function writeEvents(events: Stored[], remove = false) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("events", "readwrite");
    for (const event of events) {
      if (remove) tx.objectStore("events").delete(event.id);
      else tx.objectStore("events").put(event);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
async function readEvents(sessionId: string): Promise<Stored[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const req = db.transaction("events").objectStore("events").getAll();
    req.onsuccess = () =>
      resolve(req.result.filter((e: Stored) => e.sessionId === sessionId));
    req.onerror = () => reject(req.error);
  });
}

export function Capture({ pairToken }: { pairToken?: string }) {
  const [session, setSession] = useState<any>(null),
    [error, setError] = useState(""),
    [recording, setRecording] = useState(false),
    [pending, setPending] = useState(0),
    [synced, setSynced] = useState(0),
    [floor, setFloor] = useState(0),
    [gps, setGps] = useState<GeolocationCoordinates | null>(null),
    [status, setStatus] = useState("Ready to record"),
    [done, setDone] = useState(false),
    [finishing, setFinishing] = useState(false);
  const recordingRef = useRef(false),
    sessionRef = useRef<any>(null),
    gpsRef = useRef<GeolocationCoordinates | null>(null),
    gpsTimestamp = useRef(0),
    floorRef = useRef(0),
    flushing = useRef(false),
    stop = useRef<() => void>(() => {});
  const enqueue = async (data: Omit<Event, "id" | "timestamp">) => {
    if (!sessionRef.current) return;
    try {
      const event = {
        ...data,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        sessionId: sessionRef.current.id,
      } as Stored;
      await writeEvents([event]);
      setPending((await readEvents(sessionRef.current.id)).length);
    } catch {
      setError(
        "Local storage failed. Pause mapping to avoid losing measurements.",
      );
      recordingRef.current = false;
      setRecording(false);
      stop.current();
    }
  };
  async function flush() {
    if (!sessionRef.current || flushing.current) return;
    flushing.current = true;
    try {
      const all = await readEvents(sessionRef.current.id);
      setPending(all.length);
      for (let i = 0; i < all.length; i += 100) {
        const batch = all.slice(i, i + 100);
        await api("/device/samples", "POST", {
          sessionId: sessionRef.current.id,
          events: batch.map(({ sessionId: _, ...e }) => e),
        });
        await writeEvents(batch, true);
        setSynced((n) => n + batch.length);
      }
      setPending((await readEvents(sessionRef.current.id)).length);
    } catch (e) {
      setStatus(
        navigator.onLine
          ? (e as Error).message
          : "Offline — measurements saved on this phone",
      );
    } finally {
      flushing.current = false;
    }
  }
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (pairToken) {
          await api("/pair/claim", "POST", { token: pairToken });
          history.replaceState(null, "", "/#capture");
        }
        const s = await api("/device");
        if (!active) return;
        setSession(s);
        sessionRef.current = s;
        localStorage.setItem("campus-capture-session", JSON.stringify(s));
        setPending((await readEvents(s.id)).length);
      } catch (e) {
        if (active) {
          setError((e as Error).message);
          if (!pairToken) {
            try {
              const cached = JSON.parse(
                localStorage.getItem("campus-capture-session") ?? "null",
              );
              if (cached?.id && cached?.project?.college) {
                setSession(cached);
                sessionRef.current = cached;
                setPending((await readEvents(cached.id)).length);
                setStatus(
                  "Saved session restored. Reconnect the same session in the studio if authorization has expired.",
                );
              }
            } catch {
              /* No readable local session. */
            }
          }
        }
      }
    })();
    const interval = setInterval(() => void flush(), 5000);
    return () => {
      active = false;
      clearInterval(interval);
      recordingRef.current = false;
      stop.current();
    };
  }, []);
  async function start() {
    if (!window.isSecureContext) {
      setError(
        "Phone sensors need HTTPS. Ask the project owner to use the secure deployment URL.",
      );
      return;
    }
    setError("");
    const removers: (() => void)[] = [];
    for (const [name, Constructor, eventName] of [
      ["motion", window.DeviceMotionEvent, "devicemotion"],
      ["orientation", window.DeviceOrientationEvent, "deviceorientation"],
    ] as const) {
      try {
        const permission = (
          Constructor as unknown as {
            requestPermission?: () => Promise<string>;
          }
        )?.requestPermission;
        if (permission && (await permission.call(Constructor)) !== "granted")
          continue;
        let last = 0;
        const listener = (raw: globalThis.Event) => {
          if (!recordingRef.current || Date.now() - last < 1000) return;
          last = Date.now();
          if (name === "motion") {
            const e = raw as DeviceMotionEvent;
            const a = e.accelerationIncludingGravity;
            if (a)
              void enqueue({
                type: "motion",
                x: a.x ?? 0,
                y: a.y ?? 0,
                z: a.z ?? 0,
              });
          } else {
            const e = raw as DeviceOrientationEvent;
            void enqueue({
              type: "orientation",
              x: e.alpha ?? 0,
              y: e.beta ?? 0,
              z: e.gamma ?? 0,
            });
          }
        };
        window.addEventListener(eventName, listener);
        removers.push(() => window.removeEventListener(eventName, listener));
      } catch {
        setStatus(`${name} unavailable; manual landmarks remain available.`);
      }
    }
    if (navigator.geolocation) {
      const watch = navigator.geolocation.watchPosition(
        (p) => {
          gpsRef.current = p.coords;
          gpsTimestamp.current = p.timestamp;
          setGps(p.coords);
          if (recordingRef.current)
            void enqueue({
              type: "gps",
              latitude: p.coords.latitude,
              longitude: p.coords.longitude,
              accuracy: p.coords.accuracy,
              floor: floorRef.current,
            });
        },
        () =>
          setStatus(
            "GPS unavailable. You can still record named landmarks and floors.",
          ),
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
      );
      removers.push(() => navigator.geolocation.clearWatch(watch));
    }
    stop.current = () => removers.forEach((f) => f());
    recordingRef.current = true;
    setRecording(true);
    setStatus("Recording while this screen is open");
    await enqueue({ type: "resume", floor: floorRef.current });
  }
  async function pause() {
    recordingRef.current = false;
    setRecording(false);
    stop.current();
    setStatus("Paused — progress is saved");
    await enqueue({ type: "pause", floor: floorRef.current });
    await flush();
  }
  async function finish() {
    if (finishing) return;
    setFinishing(true);
    try {
      await pause();
      if (flushing.current) {
        setError("Sync is still running. Try finishing again in a moment.");
        return;
      }
      const remaining = await readEvents(sessionRef.current.id);
      if (remaining.length) {
        setError("Wait for all measurements to sync before finishing.");
        return;
      }
      try {
        await api("/device/finish", "POST", {
          sessionId: sessionRef.current.id,
        });
        localStorage.removeItem("campus-capture-session");
        setDone(true);
      } catch (e) {
        setError((e as Error).message);
      }
    } finally {
      setFinishing(false);
    }
  }
  if (done)
    return (
      <main className="capture">
        <CheckCircle2 size={44} />
        <h1>Walk saved.</h1>
        <p>
          Your measurements are ready for review in the campus studio. They have
          not been converted into verified indoor positions.
        </p>
        <a href="/">Return to studio</a>
      </main>
    );
  return (
    <main className="capture">
      <a className="back" href="/">
        <ArrowLeft size={16} /> Campus studio
      </a>
      <div className="brand">
        <span className="brand-mark">◈</span> 3d_College
      </div>
      <span className="eyebrow">MOBILE MAPPING</span>
      <h1>{session?.project.college ?? "Connect your phone"}</h1>
      <p>Walk, mark a place, and keep going.</p>
      {error && (
        <div role="alert" className="notice error">
          {error}
        </div>
      )}
      {session && (
        <fieldset disabled={finishing} className="capture-controls">
          <div className="capture-status">
            <Radio className={recording ? "pulse" : ""} />
            <div>
              <strong>
                {recording ? "Recording your walk" : "Mapping paused"}
              </strong>
              <p>{status}</p>
            </div>
          </div>
          <div className="stats small">
            <div>
              <strong>{pending}</strong>
              <span>Waiting to sync</span>
            </div>
            <div>
              <strong>{synced}</strong>
              <span>Synced this visit</span>
            </div>
            <div>
              <strong>{gps ? `±${Math.round(gps.accuracy)} m` : "—"}</strong>
              <span>Reported GPS accuracy</span>
            </div>
          </div>
          <p className="notice">
            Keep this page open while walking. GPS accuracy is not room-level
            accuracy. Confirm indoor positions later in the editor.
          </p>
          <button
            className="primary wide"
            onClick={() => (recording ? void pause() : void start())}
          >
            {recording ? <Pause size={18} /> : <Play size={18} />}{" "}
            {recording ? "Pause mapping" : "Start mapping"}
          </button>
          <label>
            Current floor
            <input
              type="number"
              min="-10"
              max="150"
              value={floor}
              onChange={(e) => {
                const value = Math.max(
                  -10,
                  Math.min(150, Number(e.target.value)),
                );
                setFloor(value);
                floorRef.current = value;
                void enqueue({ type: "floor", floor: value });
              }}
            />
          </label>
          <form
            className="panel"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget,
                data = new FormData(form),
                p =
                  Date.now() - gpsTimestamp.current <= 10000
                    ? gpsRef.current
                    : null;
              void enqueue({
                type: "landmark",
                name: String(data.get("name")),
                nickname: String(data.get("nickname")),
                floor: floorRef.current,
                ...(p
                  ? {
                      latitude: p.latitude,
                      longitude: p.longitude,
                      accuracy: p.accuracy,
                    }
                  : {}),
              }).then(() => form.reset());
            }}
          >
            <h2>
              <MapPin size={20} /> Mark a location
            </h2>
            <label>
              Location name
              <input
                name="name"
                required
                maxLength={160}
                placeholder="e.g. Computer Science HOD Room"
              />
            </label>
            <label>
              Nickname <span>optional</span>
              <input
                name="nickname"
                maxLength={160}
                placeholder="e.g. CSE HOD"
              />
            </label>
            <button className="secondary wide">Save location</button>
          </form>
          <button className="text-button" onClick={() => void flush()}>
            Sync now
          </button>
          <button className="secondary wide" onClick={() => void finish()}>
            Finish and send for review
          </button>
        </fieldset>
      )}
    </main>
  );
}
