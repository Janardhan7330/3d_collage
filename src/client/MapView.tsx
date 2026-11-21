import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { CampusMap, Route } from "../shared/map";

export function MapView({
  map,
  floor = "all",
  route,
  onSelect,
}: {
  map: CampusMap;
  floor?: string;
  route?: Route | null;
  onSelect?: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed(true);
      return;
    }
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#e9eee7");
    const group = new THREE.Group();
    scene.add(group);
    const points = [...map.nodes, ...map.buildings.flatMap((b) => b.footprint)];
    const bounds = points.reduce(
      (b, p) => ({
        minX: Math.min(b.minX, p.x),
        maxX: Math.max(b.maxX, p.x),
        minY: Math.min(b.minY, p.y),
        maxY: Math.max(b.maxY, p.y),
      }),
      { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
    );
    const centerX = points.length ? (bounds.minX + bounds.maxX) / 2 : 0;
    const centerY = points.length ? (bounds.minY + bounds.maxY) / 2 : 0;
    const span = points.reduce(
      (s, p) =>
        Math.max(
          s,
          Math.max(Math.abs(p.x - centerX), Math.abs(p.y - centerY)) * 2.5,
        ),
      50,
    );
    const camera = new THREE.PerspectiveCamera(
      40,
      1,
      0.1,
      Math.max(5000, span * 10),
    );
    camera.position.set(
      centerX + span * 0.65,
      span * 0.8,
      -centerY + span * 0.8,
    );
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(centerX, 0, -centerY);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2.05;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    element.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight("#ffffff", "#9aa78e", 2.8));
    const light = new THREE.DirectionalLight("#fff6df", 3);
    light.position.set(30, 80, 20);
    scene.add(light);
    const grid = new THREE.GridHelper(span * 2, 40, "#c4cebd", "#d8e0d2");
    grid.position.set(centerX, -0.1, -centerY);
    scene.add(grid);
    const visibleNodes = map.nodes.filter(
      (n) => floor === "all" || String(n.floor) === floor,
    );
    const nodeById = new Map(map.nodes.map((n) => [n.id, n]));
    const height = (n: (typeof map.nodes)[number]) =>
      n.floor *
      (map.buildings.find((b) => b.id === n.buildingId)?.floorHeight ?? 3.5);
    map.buildings.forEach((b) => {
      const shape = new THREE.Shape(
        b.footprint.map((p) => new THREE.Vector2(p.x, p.y)),
      );
      const h =
        (floor === "all"
          ? b.floors
          : Math.min(b.floors, Math.max(1, Number(floor) + 1))) * b.floorHeight;
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: h,
        bevelEnabled: false,
      });
      geometry.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: "#b1c5ac",
          transparent: true,
          opacity: 0.23,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      group.add(mesh);
      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({
          color: "#8b9e83",
          transparent: true,
          opacity: 0.6,
        }),
      );
      group.add(outline);
    });
    map.edges.forEach((e) => {
      const a = nodeById.get(e.from),
        b = nodeById.get(e.to);
      if (
        !a ||
        !b ||
        (floor !== "all" &&
          String(a.floor) !== floor &&
          String(b.floor) !== floor)
      )
        return;
      const positions = [
        new THREE.Vector3(a.x, height(a) + 0.3, -a.y),
        ...e.points.map(
          (p, i) =>
            new THREE.Vector3(
              p.x,
              height(a) +
                ((height(b) - height(a)) * (i + 1)) / (e.points.length + 1) +
                0.3,
              -p.y,
            ),
        ),
        new THREE.Vector3(b.x, height(b) + 0.3, -b.y),
      ];
      const active = route?.edges.some((r) => r.id === e.id);
      const curve = new THREE.CurvePath<THREE.Vector3>();
      for (let i = 1; i < positions.length; i++)
        curve.add(new THREE.LineCurve3(positions[i - 1], positions[i]));
      group.add(
        new THREE.Mesh(
          new THREE.TubeGeometry(
            curve,
            Math.max(2, positions.length * 8),
            active ? 0.65 : 0.32,
            6,
            false,
          ),
          new THREE.MeshStandardMaterial({
            color: active
              ? "#eb9b39"
              : e.kind === "stairs"
                ? "#9c7458"
                : "#4b8069",
          }),
        ),
      );
    });
    const clickable: THREE.Object3D[] = [];
    visibleNodes.forEach((n) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.9, 12, 8),
        new THREE.MeshStandardMaterial({
          color: route?.nodes.some((r) => r.id === n.id)
            ? "#e9a044"
            : "#244e42",
        }),
      );
      mesh.position.set(n.x, height(n) + 0.7, -n.y);
      mesh.userData.id = n.id;
      group.add(mesh);
      clickable.push(mesh);
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 64;
      const ctx = canvas.getContext("2d")!;
      ctx.font = "500 25px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#244437";
      ctx.fillText(n.name, 256, 40, 490);
      const texture = new THREE.CanvasTexture(canvas);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: texture, depthTest: false }),
      );
      sprite.position.set(n.x, height(n) + 3, -n.y);
      sprite.scale.set(25, 3.125, 1);
      group.add(sprite);
    });
    const raycaster = new THREE.Raycaster();
    const click = (event: MouseEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((event.clientX - r.left) / r.width) * 2 - 1,
          -((event.clientY - r.top) / r.height) * 2 + 1,
        ),
        camera,
      );
      const hit = raycaster.intersectObjects(clickable)[0];
      if (hit) onSelect?.(hit.object.userData.id);
    };
    renderer.domElement.addEventListener("click", click);
    const resize = new ResizeObserver(() => {
      const w = element.clientWidth,
        h = element.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    });
    resize.observe(element);
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("click", click);
      scene.traverse((obj) => {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose();
        const materials = Array.isArray(m.material)
          ? m.material
          : m.material
            ? [m.material]
            : [];
        materials.forEach((material) => {
          (material as THREE.SpriteMaterial).map?.dispose();
          material.dispose();
        });
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [map, floor, route, onSelect]);
  return (
    <div
      className="map-view"
      ref={host}
      role="img"
      aria-label="Interactive 3D campus map. Drag to rotate and scroll to zoom. Locations are also listed in the location panel."
    >
      {failed && (
        <div className="map-empty">
          3D rendering is unavailable on this device. Use the location list and
          text directions.
        </div>
      )}
      {!map.nodes.length && (
        <div className="map-empty">
          <span className="eyebrow">YOUR CAMPUS STARTS HERE</span>
          <h3>A place for every path.</h3>
          <p>
            Add your first location, or explore the circular campus example.
          </p>
        </div>
      )}
      <div className="map-caption">
        METRES · LOCAL CAMPUS COORDINATES{" "}
        <span>Drag to orbit · Scroll to zoom</span>
      </div>
    </div>
  );
}
