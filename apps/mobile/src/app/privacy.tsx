/** The privacy policy, readable before and after signing in (Profile → Privacy policy). */
import { router } from "expo-router";
import { Text, View } from "react-native";
import { Button, Heading, Screen } from "@/components/ui";
import { PRIVACY_SECTIONS, PRIVACY_UPDATED } from "@/lib/privacy";
import { space, type } from "@/lib/theme";

export default function PrivacyScreen() {
  return (
    <Screen footer={<Button kind="soft" title="Done" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />}>
      <Heading title="Privacy policy" detail={`Last updated ${PRIVACY_UPDATED}`} />
      {PRIVACY_SECTIONS.map((section) => (
        <View key={section.title} style={{ marginBottom: space.xl, gap: space.sm }}>
          <Text style={type.strong} accessibilityRole="header">{section.title}</Text>
          {section.body.map((p) => (
            <Text key={p} style={type.body}>{p}</Text>
          ))}
        </View>
      ))}
    </Screen>
  );
}
