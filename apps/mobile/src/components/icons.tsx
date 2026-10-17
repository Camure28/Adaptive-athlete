/**
 * Tab icons drawn with plain views (no icon font or native module to install).
 * Each fits a 24×24 box and takes one colour.
 */
import { View } from "react-native";

const box = { width: 24, height: 24, alignItems: "center" as const, justifyContent: "center" as const };

export function HomeIcon({ tint, filled = false }: { tint: string; filled?: boolean }) {
  return (
    <View style={box}>
      {/* roof: two sides of a rotated square */}
      <View style={{ position: "absolute", top: 4, width: 13, height: 13, borderLeftWidth: 2, borderTopWidth: 2, borderColor: tint, borderTopLeftRadius: 2, transform: [{ rotate: "45deg" }] }} />
      {/* walls */}
      <View style={{ position: "absolute", bottom: 3, width: 14, height: 10, borderWidth: 2, borderTopWidth: 0, borderColor: tint, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: filled ? tint : "transparent" }} />
    </View>
  );
}

export function TrainingIcon({ tint, filled = false }: { tint: string; filled?: boolean }) {
  return (
    <View style={box}>
      <View style={{ width: 19, height: 17, marginTop: 3, borderWidth: 2, borderTopWidth: 5, borderColor: tint, borderRadius: 4, flexDirection: "row", flexWrap: "wrap", padding: 2, gap: 2 }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ width: 4, height: 3, borderRadius: 1, backgroundColor: filled ? tint : i === 0 ? tint : "transparent" }} />
        ))}
      </View>
      <View style={{ position: "absolute", top: 1, left: 7, width: 2, height: 5, borderRadius: 1, backgroundColor: tint }} />
      <View style={{ position: "absolute", top: 1, right: 7, width: 2, height: 5, borderRadius: 1, backgroundColor: tint }} />
    </View>
  );
}

export function ProfileIcon({ tint, filled = false }: { tint: string; filled?: boolean }) {
  return (
    <View style={box}>
      <View style={{ position: "absolute", top: 2, width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: tint, backgroundColor: filled ? tint : "transparent" }} />
      <View style={{ position: "absolute", bottom: 2, width: 17, height: 9, borderWidth: 2, borderBottomWidth: 0, borderColor: tint, borderTopLeftRadius: 9, borderTopRightRadius: 9, backgroundColor: filled ? tint : "transparent" }} />
    </View>
  );
}
