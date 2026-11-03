import Svg, {
  Circle,
  Ellipse,
  Line,
  Path,
  Polygon,
  Polyline,
  Rect,
} from "react-native-svg";
import { iconPaths } from "./iconPaths";
import { Platform } from "react-native";
export type IconName = keyof typeof iconPaths;
export function Icon({
  name,
  color,
  size = 24,
  filled = false,
}: {
  name: IconName;
  color: string;
  size?: number;
  filled?: boolean;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? color : "none"}
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(Platform.OS === "web" ? { "aria-hidden": true as const } : { accessibilityElementsHidden: true, importantForAccessibility: "no" as const })}
    >
      {iconPaths[name].map(([tag, attrs]) => {
        switch (tag as string) {
          case "circle":
            return <Circle {...attrs} key={attrs.key} />;
          case "ellipse":
            return <Ellipse {...attrs} key={attrs.key} />;
          case "line":
            return <Line {...attrs} key={attrs.key} />;
          case "path":
            return <Path {...attrs} key={attrs.key} />;
          case "polygon":
            return <Polygon {...attrs} key={attrs.key} />;
          case "polyline":
            return <Polyline {...attrs} key={attrs.key} />;
          case "rect":
            return <Rect {...attrs} key={attrs.key} />;
          default:
            return null;
        }
      })}
    </Svg>
  );
}
