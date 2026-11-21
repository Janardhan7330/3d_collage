import { lazy, Suspense, type ComponentProps } from "react";
import type { MapView } from "./MapView";
const View = lazy(() =>
  import("./MapView").then((module) => ({ default: module.MapView })),
);
export function LazyMapView(props: ComponentProps<typeof MapView>) {
  return (
    <Suspense
      fallback={
        <div className="map-view">
          <div className="map-empty">Loading your campus in 3D…</div>
        </div>
      }
    >
      <View {...props} />
    </Suspense>
  );
}
