/** Image assets imported by path; Metro turns them into image sources. */
declare module "*.png" {
  import type { ImageSourcePropType } from "react-native";
  const source: ImageSourcePropType;
  export default source;
}
