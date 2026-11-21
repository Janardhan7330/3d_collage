import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api } from "./api";
import { checkpointCode } from "../shared/checkpoints";
import type { CampusMap } from "../shared/map";

export function CheckpointPrint({
  projectId,
  revisionId,
}: {
  projectId: string;
  revisionId: string;
}) {
  const [campus, setCampus] = useState<{
      map: CampusMap;
      college: string;
      revision: number;
    } | null>(null),
    [selected, setSelected] = useState(""),
    [qr, setQr] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api(`/projects/${projectId}/export/${revisionId}`)
      .then((p) => {
        if (active) {
          setCampus(p);
          setSelected(p.map.nodes[0]?.id ?? "");
        }
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [projectId, revisionId]);
  useEffect(() => {
    let active = true;
    setQr("");
    if (campus && selected)
      QRCode.toDataURL(checkpointCode(projectId, campus.revision, selected), {
        width: 600,
        margin: 4,
        errorCorrectionLevel: "M",
      })
        .then((image) => active && setQr(image))
        .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [campus, selected, projectId]);
  const node = campus?.map.nodes.find((n) => n.id === selected);
  return (
    <>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {campus && (
        <>
          <p>
            Post each checkpoint at its verified physical location. These codes
            set a navigation starting point and do not grant mapping access.
          </p>
          <label>
            Checkpoint location
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {campus.map.nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name} · Floor {n.floor}
                </option>
              ))}
            </select>
          </label>
          {node && qr && (
            <>
              <div className="checkpoint-sheet">
                <span className="eyebrow">
                  {campus.college} · LOCATION CHECKPOINT
                </span>
                <h2>{node.name}</h2>
                <p>
                  Floor {node.floor} · Map revision {campus.revision}
                </p>
                <img
                  src={qr}
                  width="260"
                  height="260"
                  alt={`Navigation checkpoint for ${node.name}`}
                />
                <p>
                  Scan with your campus navigator to confirm your starting
                  location.
                </p>
                <code>
                  {checkpointCode(projectId, campus.revision, node.id)}
                </code>
              </div>
              <button className="primary" onClick={() => window.print()}>
                Print checkpoint
              </button>
              <a
                className="secondary"
                href={qr}
                download={`checkpoint-${node.id}-v${campus.revision}.png`}
              >
                Download QR image
              </a>
            </>
          )}
        </>
      )}
    </>
  );
}
