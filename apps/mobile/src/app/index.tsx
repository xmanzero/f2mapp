import { Redirect } from "expo-router";

/** Mở app → tab Máy của tôi */
export default function Index() {
  return <Redirect href="/may" />;
}
